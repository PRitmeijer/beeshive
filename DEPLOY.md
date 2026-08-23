# Taking the site from SQLite to PostgreSQL

This is not a normal redeploy. Every release before this one was: push, hit
redeploy, done. This one moves the site off the SQLite file in the `db-data`
volume and onto PostgreSQL, and nothing in the new stack reads that file. The
content has to be carried across by hand, in the order below.

Allow an hour, with the restaurant closed. Most of it is the first image build
and the import.

**Two prerequisites.**

1. **SSH to the host, once.** Portainer CE has no volume browser and no file
   transfer, so nothing in the interface can get the old database out of
   `db-data` or the export back into PostgreSQL. Portainer does the stack, the
   shell does the data. After this release, redeploys go back to being
   redeploys. The host also needs `git`, Node 20 and `npm`.
2. **The stack must be deployed from the Git repository**, not pasted into
   Portainer's web editor. The trap at the end says what breaks if it is.

Three reference documents carry detail this one only summarises:
`ops/README.md` (the containers, the buckets, the environment),
`scripts/README.md` (what the export, import and verify do to ids, to files and
to passwords) and `docs/backups.md` (what is backed up, and how to put it back).

---

## Before you start

- **Write down the commit currently in production.** Portainer shows it on the
  stack page under the Git settings. This is the rollback target: ten seconds
  to record, a bad evening to reconstruct.
- **Have the environment variables ready**, from the table below. Portainer
  does not read `.env` from the repository and `.env` is gitignored anyway, so
  nothing you have locally comes across. They go in the stack's own
  **Environment variables** panel.
- **Have the R2 bucket and its API token.** One bucket holds both halves of the
  backup: pgBackRest under `/beeshive`, the photographs under `/media`.
- **Have `PGBACKREST_CIPHER_PASS`.** It is the one value here that cannot be
  reissued. It encrypts both backup repositories before anything leaves the
  machine, and **losing it makes every backup in the bucket permanently
  unreadable**. Generate it with `openssl rand -base64 48` and keep a copy
  somewhere that is neither this server nor this repository. If this server
  already had backups, use the same passphrase: a new one does not re-encrypt
  anything, it only stops the old repository opening.

A `$` in any value is eaten by Compose interpolation, so `abc$def` arrives as
`abc`. Double it: `abc$$def`.

### The variables

Required. The stack does not work without these.

| | |
|---|---|
| `PAYLOAD_SECRET` | Sessions are signed with it. Use the value production already has, or every logged-in session is invalidated. |
| `NEXT_PUBLIC_SITE_URL` | `https://debeeshive.nl`. Baked into the build, so changing it later means rebuilding. |
| `HOST_PORT` | `3100`, and it has to match the Forward Port on the Nginx Proxy Manager entry. |
| `POSTGRES_PASSWORD` | Set it now. `initdb` uses it on the very first start, and editing this variable afterwards does not change the cluster. |
| `PGBACKREST_S3_BUCKET`, `PGBACKREST_S3_ENDPOINT`, `PGBACKREST_S3_KEY`, `PGBACKREST_S3_KEY_SECRET`, `PGBACKREST_CIPHER_PASS` | All five, or the backup container refuses to start and says so. A stack that silently takes no backups is worse than one that complains. |

Worth setting: `TRUSTED_PROXY_HOPS=1`, correct behind one Nginx Proxy Manager
(`docs/rate-limiting.md` says why the number matters); `POSTGRES_USER` and
`POSTGRES_DB`, both defaulting to `beeshive`; the `SMTP_*` and `EMAIL_FROM`
values when the credentials arrive.

Leave empty: every `R2_*` variable. Uploads stay on the `media-uploads` volume
and are snapshotted off it nightly. `docs/media-hosting.md` is why.

Optional, all with sensible defaults: `BACKUP_HOUR`, `BACKUP_MINUTE`,
`FULL_BACKUP_DOW`, `MEDIA_BACKUP_HOUR`, `MEDIA_BACKUP_MINUTE`, the four
`MEDIA_KEEP_*` numbers, `PGBACKREST_STANZA`, `UMAMI_API_KEY`, `PREFLIGHT`,
`WARMUP`, `BUILD_DATABASE_URI`.

---

## The steps

Export before deploy. If the stack goes first, the app comes up against an
empty PostgreSQL and starts taking bookings into a database with no menu in it,
while the real data sits in `db-data` where nothing reads it any more.

### 1. Record the rollback target (Portainer)

Write down the commit the stack is deployed from. Confirm under **Networks**
that `reverse-proxy` exists: it is external to this stack and the deploy fails
without it.

### 2. Take the site out of service (Nginx Proxy Manager)

Point the `debeeshive.nl` Proxy Host at a maintenance page for the duration.
Do it at the proxy rather than by stopping the container: a dead upstream gives
a 502 that some phones cache with more enthusiasm than you would like. Anything
written to the old site after step 3 is lost.

### 3. Export the content and copy the photographs out (shell)

```bash
sudo mkdir -p /srv/beeshive-cutover && cd /srv/beeshive-cutover
mkdir -p old-db old-media
docker cp beeshive:/app/data/. ./old-db/
docker cp beeshive:/app/media/. ./old-media/

git clone <the repository url> export-checkout
cd export-checkout
git checkout c2ece7b
npm ci

DATABASE_URI=file:/srv/beeshive-cutover/old-db/database.db \
  npx tsx scripts/export-content.ts /srv/beeshive-cutover/content-export.json
```

`c2ece7b` is the only commit carrying both the SQLite adapter and the export
script, which is why this runs from a checkout of its own. The export prints a
document count per collection: read them, and stop if something you know has
content reports `0 docs`.

`content-export.json` holds reservations, contact messages and newsletter
addresses. Move it the way you would move a database backup.

### 4. Set the environment variables (Portainer)

Fill in the stack's **Environment variables** panel from the table above.

### 5. Deploy the stack from the Git repository (Portainer)

**Stacks -> Add stack -> Repository**, pointed at the repository and the branch,
compose path `docker-compose.yml`. If the stack already exists, keep its name
and redeploy it rather than creating a second one: the name is what keeps the
photographs.

```bash
docker logs -f beeshive
```

The first deploy builds three images, and a Next build is the memory-hungriest
thing that will happen on a small VPS all year, so if it is killed, that is why.
You want the preflight passing, three migrations applied, and the warm-up
finishing. The site is serving an empty database at this point, which is why
the maintenance page is still up.

### 6. Import the content (shell)

The database has no published port on purpose: it is only on the stack's
internal network, so reach it by its address on that network.

```bash
cd /srv/beeshive-cutover
git clone <the repository url> import-checkout
cd import-checkout
git checkout <the branch you deployed>
npm ci

PG_IP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' beeshive-postgres)
export DATABASE_URI="postgresql://beeshive:<POSTGRES_PASSWORD>@${PG_IP}:5432/beeshive"
export PAYLOAD_SECRET=<the same one the stack has>

npm run migrate:status
```

`migrate:status` must list the three migrations with `Ran: Yes`. That proves
the address works and the container has already built the schema, and it is
where a broken migration shows up rather than in the middle of the import.

```bash
MEDIA_IMPORT_DIR=/srv/beeshive-cutover/old-media \
  npm run db:import -- /srv/beeshive-cutover/content-export.json
```

A few minutes, most of it re-uploading photographs. It ends with two lists that
need reading: **media that could not be re-uploaded** (a non-empty list means
the copy in step 3 was incomplete, so fix it and import again from an empty
database) and **every user account with a new random password** (keep it, step
10 is about it).

Do not run the import twice against the same database. Ids are remapped on the
way in, so nothing identifies a document again and a second run gives you two
of everything.

### 7. Verify the import (shell)

```bash
npm run db:verify -- /srv/beeshive-cutover/content-export.json
```

It re-exports the database and compares it against the dump per document, per
locale, per field, and exits non-zero if anything did not survive. A clean run
ends with *"Everything in the dump came back out of the database unchanged"*.
This exists because the failure it catches is invisible: a missing English half
is served as Dutch by Payload's locale fallback, and the first anyone hears of
it is an owner editing something months later and seeing nothing change.

### 8. Put the photographs into the media volume (shell)

The import ran on the host, so Payload wrote the files into this checkout's own
`media/` directory rather than into the container's volume.

```bash
docker cp /srv/beeshive-cutover/import-checkout/media/. beeshive:/app/media/
```

### 9. Clear the dev-push marker, then restart and warm up (shell)

```bash
docker exec beeshive-postgres psql -U beeshive -d beeshive -c \
  "SELECT id, name, batch FROM payload_migrations ORDER BY id;"

docker exec beeshive-postgres psql -U beeshive -d beeshive -c \
  "DELETE FROM payload_migrations WHERE batch = -1;"

docker restart beeshive
docker exec beeshive /app/ops/warm-up.sh
```

A row with batch `-1` stops the container dead, and *When the container comes
up healthy and serves nothing new*, below, says why and when deleting it is
safe. The warm-up has to run again whether or not there was a row, because the
content arrived after the pages were rendered.

### 10. Reset the owners' passwords, and look at the site (browser)

Password hashes cannot cross over, so every account was created with a random
password and the import printed the list. Do not hand those out: send each
owner to the login screen and have them use **Wachtwoord vergeten** once, which
needs SMTP to be working. If mail is not ready, give them the random password
over something that is not email and have them change it at first login.

Log in yourself first and open `/galerij`. A missing photograph is obvious
there and nowhere else.

### 11. Take the first backups, before anyone is let in (shell)

Not after. A cutover is the most likely moment for the database to end up in a
state somebody wants undone, and until there is one full backup in the bucket
there is nothing to go back to.

```bash
docker logs beeshive-pgbackrest | grep pgbackrest-scheduler

docker exec beeshive-pgbackrest pgbackrest --stanza=beeshive --type=full backup
docker exec beeshive-pgbackrest pgbackrest --stanza=beeshive info

docker exec beeshive-pgbackrest restic backup /uploads
docker exec beeshive-pgbackrest restic snapshots
```

The scheduler creates the stanza itself on first start. If it did not, or after
changing the repository:

```bash
docker exec beeshive-pgbackrest pgbackrest --stanza=beeshive stanza-create
docker exec beeshive-pgbackrest pgbackrest --stanza=beeshive check
```

### 12. Let people in (Nginx Proxy Manager)

Put the `debeeshive.nl` Proxy Host back, forwarding to the host on `3100`, and
take the maintenance page down. Leave `db-data` where it is for a week or two:
it still holds the SQLite database and it is the only copy of the old site
there is.

---

## How to tell it worked

- `docker logs beeshive | grep -E 'preflight|warm-up'` ends with
  `preflight: geen dev-push-markering in payload_migrations. Doorstarten.` and
  `warm-up: every page rendered against the live database. Nothing left stale.`
  A page still stale after pass two means the regeneration is not completing;
  an `ALARM` line means the CMS never answered at all.
- `docker exec beeshive-pgbackrest pgbackrest --stanza=beeshive info` shows a
  `full backup` entry with a recent timestamp, a WAL start/stop range and a
  non-zero size. An empty list means the backups are failing silently.
- `docker exec beeshive-pgbackrest restic snapshots` lists one snapshot, with a
  file count matching what step 6 imported.
- `docker exec beeshive-postgres psql -U beeshive -c "SELECT archived_count, failed_count, last_failed_time FROM pg_stat_archiver;"`
  shows `archived_count` climbing. `failed_count` is non-zero from the minutes
  before the stanza existed; what matters is that `last_failed_time` is in the
  past.
- `curl -I http://localhost:3100` answers 200 straight from the container.
- `/galerij` in a browser: every photograph loads. Site Instellingen holds the
  real opening hours, not the fallbacks in `src/lib/payload.ts`.

## Rollback

Nothing is one-way until step 12. Portainer redeploys whatever the stack's Git
reference points at, so the rollback is to make that reference point at the
commit from step 1 again (move the branch, or tag the commit and change the
reference), then pull and redeploy, and put the Proxy Host back at the same
time. `db-data` still holds the SQLite database and `media-uploads` is the same
volume it always was, so the old site comes back as it left.

Do not run `docker compose down -v` and do not delete `pg-data`: that is the
entire new database. If the site is up and the data is wrong, that is what step
11 was for, and `docs/backups.md` has the restore in the order you will meet it.

---

## The traps

### When the container comes up healthy and serves nothing new

Payload writes a row named `dev` with batch `-1` into `payload_migrations`
whenever it pushes the schema straight from the collections instead of running
a migration, which is what it does whenever `NODE_ENV` is not `production`. The
`npm run db:*` scripts all qualify. On the next connect Payload sees the row and
stops on an interactive prompt asking whether to migrate anyway, and nothing in
a container answers it. Next has already bound the port, so every prerendered
page goes on answering 200 with the HTML built into the image and `docker ps`
says healthy, while reservations, the contact form, the notification bar and
the admin all hang. The site looks up and takes no bookings.

`ops/preflight.mjs` runs before the server and refuses to start it while that
row is there, so the fault is now a container that visibly will not start.
Deleting the row is safe when the schema came from the migrations and the
migration rows are still above it, which is the case in step 9. It is not safe
on a database whose schema you cannot account for: work out what pushed it
first. `ops/warm-up.sh` is the second belt, and its `ALARM` line is this fault
seen from outside.

### A stack pasted into the web editor

The compose file builds two images out of the repository (`./ops/postgres`,
`./ops/pgbackrest`) and bind-mounts two config files from it
(`ops/postgres/postgresql.conf`, `ops/pgbackrest/pgbackrest.conf`). A stack
pasted into Portainer's editor is written to a directory holding the compose
file and nothing else, so those paths resolve to nothing: the builds fail, or
Docker creates empty directories where the config files should be and
PostgreSQL starts without WAL archiving. Deploy from **Repository**.

### `PAYLOAD_SECRET` unset

The container starts, logs `Ready`, and returns 500 for every request, because
the config throws on first use rather than at boot. It looks like a healthy
container in front of a broken site.

### The media volume is only reused if the stack name is unchanged

Portainer prefixes volumes with the stack name, so `media-uploads` is really
`beeshive_media-uploads`. The photographs are in that volume and the new stack
uses the same name, so they carry across as long as you redeploy the existing
stack. A new stack with a new name gets new, empty volumes and the site loses
every uploaded image.

### The export only runs from `c2ece7b`

The branch you are deploying cannot read SQLite: `src/payload.config.ts` names
only `postgresAdapter` and `@payloadcms/db-sqlite` has been removed from
`package.json`. `c2ece7b` is the one commit carrying both the SQLite adapter and
`scripts/export-content.ts`.

### The volume and R2 cannot be swapped afterwards

With the four `R2_*` variables unset, which is what this deployment does, the
import wrote every photograph to the `media-uploads` volume. Setting them later
does not move what is already there, and the result is a gallery that half
loads. `docs/media-hosting.md` has the argument and the fix.

---

## The longer reasoning

None of this changes what you type, which is why it is down here.

**Why the warm-up exists.** Every frontend page carries
`export const revalidate`, so `next build` prerenders all of them and reads the
CMS while it does, and every one of those reads falls back to the defaults in
`src/lib/payload.ts`. A build with no database in reach therefore does not fail:
it succeeds and bakes stock content into the image, and the first visitor to
each URL after a deploy gets that HTML while Next regenerates the page behind
them. `ops/warm-up.sh` makes the container be that first visitor, asking for all
seventeen public URLs twice. The alternative belt is `BUILD_DATABASE_URI`, which
lets the build prerender the real thing; it is empty here because the production
cluster is deliberately unreachable from the build network, and opening it up is
not worth a second of first-render latency. README.md has the fuller version.

**Why step 6 uses a container address.** The database is only on the stack's
`internal` network. A side effect worth knowing: because that address is not
local, `src/payload.config.ts` refuses the dev schema push and prints a warning
saying so. The warning is expected, and it is why step 9 usually finds no marker
to delete.

**Why one passphrase and not two.** Both repositories, the database's and the
photographs', are encrypted with `PGBACKREST_CIPHER_PASS`. Two passphrases means
the one nobody wrote down is the one you need at two in the morning.

**Do a dry run of the restore on a spare machine before you need it.** A backup
that has never been restored is a hypothesis. `docs/backups.md` is the document
that would most like you to have read this sentence.
