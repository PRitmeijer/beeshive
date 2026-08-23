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
| Uploads | Cloudflare R2 (or the `media-uploads` volume without R2) | R2 keeps its own copies; the volume does not |
| CMS schema | `src/migrations/` | in git |

The backup is a **full copy every Sunday night, a differential every other
night, and every write-ahead-log segment in between**, which means a restore
can land on any moment in the retention window rather than only on a backup.

---

## 1. Cloudflare: two buckets and one token

You need an R2 bucket for the uploads and, ideally, a second for the backups.
Two, not one: the uploads bucket is read by the public internet, and database
backups have no business sharing a permission boundary with it.

1. Cloudflare dashboard → R2 → **Create bucket**, twice:
   - `beeshive-media` — the photographs. Give it a public custom domain
     (`media.debeeshive.nl`) or enable the r2.dev subdomain, and put that
     address in `R2_PUBLIC_URL`.
   - `beeshive-backups` — the database. **Public access off.** Nothing should
     ever be able to read this over HTTP.
2. R2 → **Manage API tokens** → *Create API token*, with **Object Read &
   Write**, scoped to those buckets. You are shown the access key id and the
   secret exactly once.
3. The endpoint is on the same page and looks like
   `https://<account-id>.r2.cloudflarestorage.com`. pgBackRest wants it
   **without** the scheme; the website's `R2_ENDPOINT` wants it **with**.

Generate an encryption passphrase for the backups and store it somewhere that
is not this server:

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

R2_BUCKET=beeshive-media
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_PUBLIC_URL=https://media.debeeshive.nl

PGBACKREST_S3_BUCKET=beeshive-backups
PGBACKREST_S3_ENDPOINT=<account-id>.r2.cloudflarestorage.com
PGBACKREST_S3_KEY=...
PGBACKREST_S3_KEY_SECRET=...
PGBACKREST_CIPHER_PASS=<the passphrase from above>
```

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

Take the first backup immediately rather than waiting for the scheduler:

```bash
ops/backup.sh full
```

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

5. The media is already in R2 and needs nothing. If this install predates R2,
   copy the old `media` directory into the `media-uploads` volume instead.
6. `ops/backup.sh full`, so that the new cluster has a backup of its own.

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
- **The backups do not include the uploads.** R2 holds those, and R2's own
  durability is the plan. If that is not enough, enable object versioning on
  the media bucket.
