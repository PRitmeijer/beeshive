# Operations: PostgreSQL, Cloudflare R2 and backups

Most of this directory is about the two things the website cannot regenerate if
they are lost: the database and the uploaded photographs. Two files are the
exception and belong to the application container rather than to the database.
Both are described in `DEPLOY.md`; the short versions are:

- `preflight.mjs` runs before the server and refuses to start it when the
  database still carries a dev-push marker — the row that would otherwise leave
  Payload waiting on a prompt nothing can answer, with the site up and serving
  the content its image was built with.
- `warm-up.sh` runs beside the server and asks the site for every public page
  once after a start, so that Next renders them against this database instead
  of serving the content the image was built with.

**Doing the cutover from the old SQLite site, rather than reading about the
machinery? [`DEPLOY.md`](../DEPLOY.md) is the runbook.** This file is the
reference it points back at.

| | Where it lives | How it survives a dead server |
|---|---|---|
| Database | `pg-data` volume, PostgreSQL 16 | pgBackRest, encrypted, to an R2 bucket |
| Uploads | the `media-uploads` volume (or Cloudflare R2, if a bucket is configured) | restic, encrypted, to the same R2 bucket under its own prefix |
| CMS schema | `src/migrations/` | in git |

The database backup is a **full copy every Sunday night, a differential every
other night, and every write-ahead-log segment in between**, which means a
restore can land on any moment in the retention window rather than only on a
backup. The photographs get **one snapshot a night** and no such minute, which
is a property of files rather than a gap in the tooling; `docs/backups.md` says
why, and why it is enough.

Four scripts drive it, and none of them does anything you cannot do by hand:

| | |
|---|---|
| `backup.sh [full\|diff\|incr]` | a database backup now, out of turn |
| `restore.sh` | put the database back |
| `backup-media.sh` | a snapshot of the photographs now, out of turn |
| `restore-media.sh` | list the media snapshots, and put one back |

`restore.sh` and `restore-media.sh` both print their whole plan and stop unless
`--yes-really` is on the command line. Neither one touches the other's half.

---

## 1. Cloudflare: one bucket, and a second only if you want it

You need one private R2 bucket for the backups. A second, public one for the
photographs is optional and is now recommended against until the domain's DNS
is at Cloudflare; if you do create it, keep it separate from the first. The
uploads bucket is read by the public internet, and the backups have no business
sharing a permission boundary with it.

1. Cloudflare dashboard → R2 → **Create bucket**:
   - `beeshive-backups`, the backups, and the only one you actually need.
     **Public access off.** Nothing should ever be able to read this over HTTP.
     It holds the database under `/beeshive` and the photograph snapshots under
     `/media`, which are two tools writing two repositories that cannot see
     each other.
   - `beeshive-media`, optional, and only if the photographs are to be *served*
     from R2 rather than from our own origin. `docs/media-hosting.md` recommends
     against it until the domain's DNS is at Cloudflare, and explains why. If
     you do create it, give it a public custom domain and put that address in
     `R2_PUBLIC_URL`.
2. R2 → **Manage API tokens** → *Create API token*, with **Object Read &
   Write**, scoped to those buckets. You are shown the access key id and the
   secret exactly once.
3. The endpoint is on the same page and looks like
   `https://<account-id>.r2.cloudflarestorage.com`. pgBackRest wants it
   **without** the scheme; the website's `R2_ENDPOINT` wants it **with**.

Generate an encryption passphrase for the backups and store it somewhere that
is not this server. One passphrase covers both repositories, deliberately: two
would mean the one nobody wrote down is the one you need.

```bash
openssl rand -base64 48
```

Losing it makes every backup in the bucket permanently unreadable. There is no
recovery, no support ticket, nothing.

## 2. The environment

In `.env` beside `docker-compose.yml` (see `.env.example` for the full list):

```dotenv
POSTGRES_USER=beeshive
POSTGRES_PASSWORD=<something long>
POSTGRES_DB=beeshive

PGBACKREST_S3_BUCKET=beeshive-backups
PGBACKREST_S3_ENDPOINT=<account-id>.r2.cloudflarestorage.com
PGBACKREST_S3_KEY=...
PGBACKREST_S3_KEY_SECRET=...
PGBACKREST_CIPHER_PASS=<the passphrase from above>

# Optional, and only for serving the photographs from R2 rather than from our
# own origin. See docs/media-hosting.md before setting these.
R2_BUCKET=beeshive-media
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_PUBLIC_URL=https://media.debeeshive.nl
```

The photographs need nothing beyond the five pgBackRest values: the media
snapshot repository is built out of the same endpoint, bucket and passphrase,
under a prefix of its own. `.env.example` lists the handful of variables that
change the schedule and the retention.

A `$` in any of these has to be doubled — Compose interpolates this file, so
`ab$cd` arrives as `ab`. Check what actually landed:

```bash
docker compose exec pgbackrest printenv | grep PGBACKREST_
```

## 3. First start

```bash
docker compose up -d --build
```

The backup container refuses to start with any of its five variables unset,
and says which. Once it is up it creates the stanza itself — the repository's
record of this particular cluster — and runs a check:

```
pgbackrest-scheduler: creating stanza beeshive
pgbackrest-scheduler: check passed
```

To do it by hand, or after changing the repository:

```bash
docker compose exec pgbackrest pgbackrest --stanza=beeshive stanza-create
docker compose exec pgbackrest pgbackrest --stanza=beeshive check
```

Take the first backups immediately rather than waiting for the scheduler:

```bash
ops/backup.sh full
ops/backup-media.sh
```

The second one prints `0 files` on a host where nobody has uploaded anything
yet, and with a media bucket configured the volume is empty by design and the
scheduler says so once in its log instead of snapshotting nothing every night.

## 4. Verifying that backups exist

This is the part people skip, and it is the only part that matters.

```bash
docker compose exec pgbackrest pgbackrest --stanza=beeshive info
```

You are looking for a `full backup` entry with a recent timestamp, a `wal
start/stop` range, and a non-zero size. An empty list, or a newest entry from
three weeks ago, means the backups have been failing silently.

The other half is WAL archiving, which fails independently of the backups:

```bash
docker compose exec postgres psql -U beeshive -c \
  "SELECT archived_count, failed_count, last_failed_time FROM pg_stat_archiver;"
```

`failed_count` climbing is an emergency in slow motion: Postgres keeps every
segment it could not archive, `pg_wal` grows, and when the volume fills the
database stops. See the long comment in `ops/postgres/postgresql.conf`.

The photographs answer separately, in the same container:

```bash
docker compose exec pgbackrest restic snapshots   # one per night
docker compose exec pgbackrest restic check       # reads it all through, slower
```

## 5. Restoring

### Onto the same server

```bash
ops/restore.sh                                  # prints the plan, changes nothing
ops/restore.sh --yes-really                     # newest backup + all WAL
ops/restore.sh --time "2026-08-01 12:00:00" --yes-really
```

It stops the website, stops the database, replaces the data directory, brings
both back and waits for the cluster to finish replaying. Read what it prints
before typing `--yes-really`.

The photographs, which are a separate command and a separate decision:

```bash
ops/restore-media.sh                            # the snapshots, and the plan
ops/restore-media.sh --yes-really               # put missing files back, keep the rest
ops/restore-media.sh --exact --yes-really       # make the volume match the snapshot
```

`docs/backups.md` has the three cases and, more importantly, the note on
restoring both halves at moments that fit each other.

### Onto a brand-new, empty install

This is the case that matters if the server is gone entirely, and it works
because the repository in R2 is self-contained.

1. New host, Docker installed, `git clone` this repository.
2. Copy `.env` across — in particular `PGBACKREST_CIPHER_PASS`, without which
   the bucket is noise, and `PAYLOAD_SECRET`, without which every existing
   admin session is invalid (not fatal, everyone simply logs in again).
3. Build, but do **not** let the site start and create an empty schema:

   ```bash
   docker compose build
   docker compose up -d postgres
   docker compose stop postgres
   ```

   The first `up` runs initdb so the volume has a cluster in it; the stop is so
   the restore is not fighting a running server.
4. Restore into it:

   ```bash
   docker compose run --rm --no-deps --entrypoint pgbackrest pgbackrest \
     --stanza=beeshive --delta --target-action=promote restore
   docker compose up -d
   ```

5. Put the photographs back:

   ```bash
   ops/restore-media.sh --exact --yes-really
   ```

   With a media bucket configured this step is unnecessary: the objects are
   still in the bucket and the restored database rows find them again.
6. `ops/backup.sh full` and `ops/backup-media.sh`, so the new install has
   backups of its own.

Do a dry run of this on a spare machine once, before you need it. A backup
that has never been restored is a hypothesis.

One step that is easy to miss on a rebuild: after the restore, look at
`payload_migrations` for a row with batch `-1`, named `dev` in practice. A
database that was ever touched by one of the `npm run db:*` scripts has one,
and it stops the application container on an interactive prompt that nothing in
a container can answer.

You will not have to go looking, in fact — `ops/preflight.mjs` runs before the
server on every start and refuses to bring the container up while that row is
there, with the explanation and the two ways out in the log:

```bash
docker compose logs beeshive | grep preflight
```

That is deliberate. Before it existed, this fault produced a container compose
called healthy that served the pages baked into its image forever and took no
bookings, which is a far worse thing to hand back after a restore than a
container that will not start. `DEPLOY.md` has the section on it, including
when deleting the row is *not* safe.

## 6. Umami, the visitor statistics

`beeshive-umami` is one more container on this stack, from
`docker.umami.is/umami-software/umami:postgresql-latest`. It counts visits to
the public site and shows them on a dashboard of its own; the owners never open
that dashboard, they read the figures in **Instellingen → Statistieken** in the
Payload admin, which fetches them from here.

It is on its own subdomain, **stats.debeeshive.nl**, and that is forced rather
than chosen. `docker-compose.yml` has the paragraph, and `docs/analytics.md` has
the whole walk-through including the two things to paste into the admin. What
belongs in *this* file is the database and the proxy.

### Its database is inside the cluster you are already backing up

Umami keeps its tables in a database called `umami`, in the same PostgreSQL
cluster as the website, under the same role. That is deliberate: one cluster is
one thing to run and one thing to back up, and pgBackRest copies the whole
cluster rather than a database at a time, so the visitor figures ride along in
the backups that already exist and in the restores that already work. A second
PostgreSQL would have meant a second stanza, a second schedule and a second
thing to notice had stopped.

There is nothing to do about it on a **fresh** cluster.
`ops/postgres/initdb/10-umami-database.sh` is mounted into the image's
`/docker-entrypoint-initdb.d`, and the official entrypoint runs it once, between
`initdb` and the first real start.

On an **existing** cluster, which is what production is and has been since the
site went live, initdb scripts are never looked at again. Create it by hand,
once:

```bash
docker compose exec postgres psql -U beeshive -d beeshive -c 'CREATE DATABASE umami'
```

Then `docker compose up -d umami`. Umami creates its own tables the first time
it starts, so an empty database is the whole requirement. If you skip this step
the container restart-loops with `database "umami" does not exist`, which is at
least an honest failure.

### Putting it on stats.debeeshive.nl

Two steps, neither of them in this repository.

1. **DNS.** An `A` record for `stats` in the `debeeshive.nl` zone, pointing at
   the same address as `www`. `AAAA` as well if the host has an IPv6 address.
2. **Nginx Proxy Manager** → *Proxy Hosts* → *Add Proxy Host*:

   | | |
   |---|---|
   | Domain Names | `stats.debeeshive.nl` |
   | Scheme | `http` |
   | Forward Hostname | `beeshive-umami` |
   | Forward Port | `3000` |
   | Websockets Support | **on** |
   | Block Common Exploits | on |

   Then the **SSL** tab: *Request a new SSL Certificate* with Let's Encrypt,
   *Force SSL* on, *HTTP/2* on.

   Forwarding to `beeshive-umami:3000` works because NPM and this container are
   both on the `reverse-proxy` network. If your NPM is not, forward to the host
   instead: hostname `beeshive`, port `3101`. That is `UMAMI_PORT`, and it is
   published for exactly this reason. Do not use both, pick the one your proxy
   can actually reach.

Websockets on is not optional decoration. The dashboard is a Next.js
application and its live updates go over a websocket; with the setting off the
pages load and then quietly stop refreshing.

### First sign-in

Umami ships with **`admin` / `umami`**, published, identical on every
installation in the world. Change it before you do anything else, including
before you point DNS at it if you can manage the order:

1. Open `https://stats.debeeshive.nl` and sign in as `admin` / `umami`.
2. Top right, the user icon → **Profile** → **Change password**.
3. Put the new password in `.env` as `UMAMI_PASSWORD` (and `UMAMI_USERNAME=admin`),
   then `docker compose up -d beeshive` so the admin panel can read the figures
   back. A `$` in the password has to be doubled, same as everywhere else in
   that file.

Also set `UMAMI_APP_SECRET` in `.env` before the first start,
`openssl rand -hex 32`. Left unset Umami derives its cookie signing key from the
database URL, which is written down in several places this password is not.

### Creating the website entry

**Settings → Websites → Add website**. Name it anything, `De Bee's Hive`; the
domain is `debeeshive.nl`. Save, then open it and copy the **Website ID**, the
long string with dashes. `docs/analytics.md` says where the owners paste it.

---

## Warnings, collected

- **`docker compose down -v` deletes the `pg-data` volume**, which is the
  entire database. The backups in R2 are what make that survivable, and only
  if step 4 above is something you have actually done.
- **The cipher passphrase is not recoverable.** Not from the bucket, not from
  Cloudflare, not from pgBackRest.
- **Rotating the R2 token silently breaks archiving.** Update the environment
  and `docker compose up -d` both `postgres` and `pgbackrest`; the database
  container has its own copy of the credentials because it is the one that runs
  `archive_command`.
- **A restore to a point in time discards everything after it.** Reservations
  taken this morning are gone if you restore to last night. Export them first
  if there is any chance of that mattering: `npm run db:export`.
- **The database backup does not include the uploads**, and never will:
  pgBackRest copies the PostgreSQL data directory and nothing else. The
  photographs have their own nightly restic snapshot in the same bucket, and
  their own restore command. Two halves, two tools, one passphrase.
- **Restoring onto an empty install brings the visitor figures back with
  everything else**, because they are in the same cluster, so do *not* run the
  `CREATE DATABASE umami` line above on a host you are about to restore onto.
  The restore replaces the whole data directory and a database you created
  first is thrown away with it.
- **A media snapshot is not point-in-time recovery.** The database can be put
  back to any minute; the photographs can be put back to a night.
  `docs/backups.md` says why that is a property of files rather than a
  shortcoming.
