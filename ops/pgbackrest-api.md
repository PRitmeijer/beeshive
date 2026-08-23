# Letting the admin panel see the backups

The website has a page at `/admin/backups`. It reads the backup repository,
says in plain Dutch how old the newest copy is, offers a button that takes a
backup out of turn, and — for a restore — writes out the exact command for a
person to run on the server. What it *cannot* do out of the box is talk to
pgBackRest at all, and this file is about why, and what to do about it.

Nothing here is required. With none of it done, the page still works: it shows
"pgBackRest is niet beschikbaar op de server waar de website draait", still
detects an empty install, and still produces the restore commands. Those are
the two things it exists for. Everything below is about the inventory table and
the backup button.

## Why the web container cannot see pgbackrest

Three containers, three jobs (see `docker-compose.yml`):

| container | has pgbackrest | why |
|---|---|---|
| `beeshive` | **no** | a standalone Next build; it serves the site |
| `beeshive-postgres` | yes | it runs `archive_command` itself |
| `beeshive-pgbackrest` | yes | it takes the scheduled backups |

The website's container has no pgbackrest binary, no repository configuration,
no bucket credentials and no access to the cluster's data directory. That is
not an oversight. It is the container that answers requests from the public
internet, and it is the last one that should be holding the encryption
passphrase for the backups.

`src/lib/backups.ts` runs `pgbackrest` through `execFile` with an argument
array — never a shell, never any value from a request body on the command
line — and when the binary is missing it reports that as a configuration fact
rather than as a failure.

## Option A — the inventory table, read-only

`pgbackrest info` talks to the bucket and not to the database. It needs no
cluster, no socket and no data directory, which is exactly why it is the one
pgBackRest command worth reaching from a web process. Giving the website that
much means three additions:

1. **The binary.** In the `Dockerfile`'s runtime stage:

   ```dockerfile
   RUN apk add --no-cache pgbackrest
   ```

   (or `apt-get install -y pgbackrest` if the base is Debian).

2. **The configuration**, read-only, in the `beeshive` service:

   ```yaml
   volumes:
     - media-uploads:/app/media
     - ./ops/pgbackrest/pgbackrest.conf:/etc/pgbackrest/pgbackrest.conf:ro
   ```

3. **The bucket credentials**, in the same service's `environment:`

   ```yaml
   - PGBACKREST_STANZA=${PGBACKREST_STANZA:-beeshive}
   - PGBACKREST_REPO1_S3_BUCKET=${PGBACKREST_S3_BUCKET:-}
   - PGBACKREST_REPO1_S3_ENDPOINT=${PGBACKREST_S3_ENDPOINT:-}
   - PGBACKREST_REPO1_S3_KEY=${PGBACKREST_S3_KEY:-}
   - PGBACKREST_REPO1_S3_KEY_SECRET=${PGBACKREST_S3_KEY_SECRET:-}
   - PGBACKREST_REPO1_CIPHER_PASS=${PGBACKREST_CIPHER_PASS:-}
   ```

Weigh the third one honestly. It puts a read-write R2 key and the passphrase in
the environment of the internet-facing process, and anything that can read that
environment can read — and delete — every backup. If the answer is no, stop
here: the page degrades to the message and the restore commands, which is the
half that matters at two in the morning.

A middle road, if Cloudflare's token scoping allows it: a **second, read-only**
R2 token for the same bucket, used only by the website. `info` never writes.

`PGBACKREST_BIN` overrides the binary's name if it is somewhere unusual.

## Option B — the "Maak nu een backup" button

Do **not** solve this by mounting `pg-data` and `pg-run` into the web
container. A backup needs to read the cluster's files directly, so that mount
would have to be read-write on the PostgreSQL data directory, and a web process
with write access to the data directory is a worse risk than never having the
button.

The container that should take the backup is the one that already does. Its
scheduler (`ops/pgbackrest/entrypoint.sh`) wakes every thirty seconds anyway,
so it can look for a request while it is up:

1. Give both containers a shared directory. In `docker-compose.yml`, add to
   **both** the `beeshive` and the `pgbackrest` services:

   ```yaml
   volumes:
     - backup-requests:/var/lib/beeshive/backup-requests
   ```

   and declare `backup-requests:` under the top-level `volumes:`.

2. In `ops/pgbackrest/entrypoint.sh`, inside the `while true` loop, before the
   `sleep 30`:

   ```sh
   # An out-of-turn backup asked for from the admin panel. The file's name is
   # the type and nothing else is read out of it, so the worst a corrupted
   # request can do is take a backup nobody asked for.
   for request in "$REQUEST_DIR"/full "$REQUEST_DIR"/diff; do
     [ -e "$request" ] || continue
     type=$(basename "$request")
     rm -f "$request"
     log "starting $type backup (op verzoek uit het beheerpaneel)"
     if pgbackrest --stanza="$STANZA" --type="$type" backup; then
       log "$type backup finished"
     else
       log "$type backup FAILED"
     fi
   done
   ```

   with `REQUEST_DIR="${BACKUP_REQUEST_DIR:-/var/lib/beeshive/backup-requests}"`
   near the top, and `mkdir -p "$REQUEST_DIR"` beside it.

3. In `src/lib/backups.ts`, `takeBackup` would then write the marker file
   instead of spawning `pgbackrest`, and report "de backup is aangevraagd"
   rather than "de backup is gemaakt" — the panel would learn the outcome from
   the next `info`.

Only the first two steps are outside this repository's application code, and
neither has been applied: `ops/` was written by hand and is left as it was
found. Until it is done, the button reports that the backup has to be started
with `ops/backup.sh full` on the server, which is true and is the honest thing
for it to say.

## Checking that it worked

From the host:

```bash
docker compose exec beeshive pgbackrest --stanza=beeshive --output=json info
```

An array with one object in it, whose `status.code` is `0`, is what the panel
parses. `[]` means the stanza does not exist in that repository; an error about
credentials means step 3 of Option A did not land.
