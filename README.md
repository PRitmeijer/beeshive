# De Bee's Hive: Website

Eetcafé website built with **Next.js 15** and **Payload CMS 3** (self-hosted, PostgreSQL, media on Cloudflare R2).

## Features

- **CMS Admin Panel** at `/admin`: manage blog posts, gallery, menu, notifications, and mailing list
- **Immersive frontend** with parallax scrolling, hexagon animations, and smooth transitions
- **Mailing list** subscription with API endpoint
- **Notification banners** managed via CMS (info, offers, events, important)
- **Gallery** with category filtering and lightbox
- **Menu/Kaart** with dietary labels and category filtering
- **Blog** with rich text content
- **Contact** form

## Getting Started

```bash
cp .env.example .env
npm install
docker compose up -d postgres     # or any PostgreSQL you like
npm run dev
```

Visit `http://localhost:3000` for the site, `http://localhost:3000/admin` for the CMS.

On first visit to `/admin`, you'll create your admin account.

The one thing that is no longer optional is a database: Payload talks to
PostgreSQL now, and `DATABASE_URI` has to point at one. Nothing else does —
without SMTP credentials mail goes to the console, and without the R2 variables
uploads go to `./media`, both of which are the right behaviour on a laptop.

## Mail

Two forms send mail, both to the address in Site Instellingen → Contact, which
defaults to `info@debeeshive.nl`, and both with `Reply-To` set to the sender so
replying reaches them rather than the website.

- **A reservation request** is stored in the `reservations` collection *and*
  emailed, with every field the guest filled in and a link straight to the
  request in `/admin`. The send is deliberately not allowed to fail a booking:
  the request is written to the database first, and a mail server having a bad
  afternoon is logged and swallowed rather than shown to the guest as an error
  they would retry.
- **A contact message** is only emailed — there is nothing to store — so here a
  failed send *is* reported. Anything else would tell the visitor a message had
  been delivered that never left the building.

### When the login is rejected

`535 Authentication failed` with `Error verifying Nodemailer transport` is
logged at startup and is **not** fatal: the site serves normally and
reservations are still stored, only the mail does not go out.

Check what the container actually received before re-reading the password:

```bash
docker compose exec beeshive printenv SMTP_USER SMTP_PASS
```

Compose interpolates `.env`, so a `$` in the password is read as the start of a
variable name and quietly eaten — `abc$def` arrives as `abc`. Double it:
`abc$$def`. `SMTP_USER` has to be the full address, and on Strato it is the
mailbox's own password, not the account login.

Sending needs SMTP credentials in the environment (`SMTP_HOST` and friends, see
`.env.example`). Without them Payload writes mail to the console instead —
correct for local work, and worth knowing about before the first deploy, since
the site will otherwise take bookings silently.

## Opening hours drive the booking form

The times the reservation form offers are read from Site Instellingen →
Openingstijden, per weekday, rather than hard-coded. Change the hours in the
admin and the form follows: a closed day offers nothing and says so, and the
last table on offer is one hour before closing. `/api/reserve` checks the same
rows, so the rule holds for anything posting to it directly as well.

Free text is fine — `11:00 – 21:00`, `11.00-21.00`, `Gesloten`, `Closed`, or a
split service such as `12:00-16:00, 17:00-22:00` are all read correctly. A cell
with no times in it counts as closed. The rows are matched **by position**,
Monday first, so keep them in weekday order.

## Importing the old newsletter subscribers

The previous site kept subscribers in a MySQL table called `subscriptions` on
IONOS shared hosting. That database cannot be reached from outside IONOS's own
network — `database-*.webspace-host.com` has no public DNS record — so the only
way to it is phpMyAdmin in the IONOS control panel, or a script running on the
old webspace.

Check whether there is anything worth moving first:

```sql
SELECT COUNT(*) FROM subscriptions;
SHOW COLUMNS FROM subscriptions;
```

There may well be nothing. The `subscribe.php` that was actually deployed opens
a database connection and never inserts anything — it only mails
`info@debeeshive.nl` — so unless an earlier version wrote to the table, that
inbox is the only record of who signed up.

If there are rows, export the table as CSV and run:

```bash
npm run import:subscribers -- subscriptions.csv --dry-run   # reports, writes nothing
npm run import:subscribers -- subscriptions.csv
```

It needs a header row with an `email` column; `name` and a date column are used
if present and everything else is ignored. Addresses are matched
case-insensitively and an address already on the list is left alone, so running
it twice is safe.

## The gallery's categories

Gallery categories are their own collection (Inhoud → Galerij Categorieën), so
the owners add or rename one in the admin instead of asking for a deploy. Each
carries a name per language and a sort order, and an image points at one. The
filter bar on /galerij is built from the categories actually in use, in that
order, so an unused category never shows up as an empty button.

A fresh install starts with none. Make a few before uploading photographs, or
the category field has nothing to choose from.

## Database schema and migrations

The schema lives in `src/migrations/`, generated from the collections and the
`localization` block in `src/payload.config.ts`.

Development still pushes the schema straight from the collection definitions,
which is what keeps local iteration quick. Production does not: `push` is off
whenever `NODE_ENV=production`. PostgreSQL is less brutal about a push than
SQLite was — it alters a table rather than rebuilding it — but the dangerous
case is unchanged: drizzle compares the collections to the live tables and
drops a column it can no longer account for, which is exactly what a field
newly marked `localized: true` looks like before its values have moved into the
`_locales` side table.

In production the adapter is given `prodMigrations`, so Payload applies anything
outstanding itself when it connects. Nothing has to be run by hand on deploy,
and the container logs which migration it applied. That matters here because the
image is a standalone Next build with no Payload CLI inside it.

**Run `npm run dev` in a real terminal.** The dev push asks for confirmation
whenever it spots a change it considers risky, and `prompts` treats a missing
TTY as a cancel — whose handler is `process.exit(0)`. Started under `nohup`, in
CI, or inside a build worker, the push therefore dies silently with a success
code and the schema is quietly left behind, which is very hard to tell apart
from "nothing needed doing". If the CMS suddenly serves stock copy, look for
`site settings unavailable, serving defaults` in the log: that is this.

Locally, after changing a collection:

```bash
npm run migrate:create   # record the change as a migration
npm run generate:types   # refresh src/payload-types.ts
npm run migrate:status   # what has and has not been applied
npm run migrate          # apply outstanding migrations by hand
```

Always run a new migration against an empty database before trusting it. It is
one command and it has caught every broken migration this project has produced:

```bash
createdb beeshive_probe
DATABASE_URI=postgresql://beeshive:beeshive@localhost:5433/beeshive_probe \
  PAYLOAD_SECRET=x npm run migrate
```

For a database that already exists and was built by dev push: it already has
these tables, so the first migration would fail on `CREATE TABLE`. Mark it as
applied rather than running it — insert a row into `payload_migrations` with
the migration's `name` and `batch` 1. A fresh database, such as a new Docker
volume, simply runs it.

## Moving from SQLite

The site was on SQLite until this release. The move is two commands, both of
which go through the Local API and therefore care about the collections rather
than about the tables:

```bash
npm run db:export -- content-export.json   # against the old database
npm run db:import -- content-export.json   # against the new one
```

`scripts/README.md` has the details, including what happens to ids (they are
remapped), to files (re-uploaded from `./media`) and to passwords (they cannot
be imported; every account is listed at the end and has to be reset once).

One leftover: `next.config.mjs` still carries an `outputFileTracingIncludes`
entry for libsql, which was there so the SQLite driver's native binary reached
the standalone build. Nothing loads it any more and it can be deleted once the
`@payloadcms/db-sqlite` dependency goes with it.

## Search-engine metadata

`@payloadcms/plugin-seo` adds an **SEO** tab to blog posts and events with a
title, description, share image and keywords, per language. Each field has a
*generate* button that suggests a value from the document — the title trimmed
to fit Google's cut-off with `| De Bee's Hive` still attached, the summary
trimmed to about 160 characters, the featured image, and the canonical URL for
the language being edited. All of them are suggestions; whatever the owners
type wins.

The generated URL is built from a small map in `src/payload.config.ts`. If a
public route is ever renamed, that map is the place to change.

## Media on Cloudflare R2

With `R2_BUCKET`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`
set, uploads go to the bucket and the container stores nothing itself. With any
of them missing, uploads are written to `MEDIA_DIR` exactly as before — so a
laptop, or a test host without a bucket, needs no configuration at all.

Every generated size (`thumbnail`, `card`, `hero` and the 1200x630 `og` used
for share cards) is re-encoded as WebP at quality 78; the original the owners
uploaded is kept untouched.

`ops/README.md` covers creating the bucket and the API token.

## Backups

The database is backed up to a second R2 bucket by pgBackRest, running as its
own container: a full copy every Sunday night, a differential every other
night, and every write-ahead-log segment in between, encrypted before it leaves
the machine. That last part is what allows a restore to land on any moment
rather than only on a backup.

```bash
ops/backup.sh full                              # take one now
docker compose exec pgbackrest pgbackrest --stanza=beeshive info
ops/restore.sh                                  # prints the plan, changes nothing
ops/restore.sh --time "2026-08-01 12:00:00" --yes-really
```

Two things to know before you need them, both spelled out in `ops/README.md`:
`PGBACKREST_CIPHER_PASS` is not recoverable and a lost passphrase makes every
backup unreadable, and a restore to a point in time discards everything written
after it.

## Docker

```bash
docker compose up -d --build
```

Everything runs on **3100** — inside the container, on the host, and in Nginx
Proxy Manager — from the single `HOST_PORT` in `.env`, so the two sides cannot
drift apart. 3000 is occupied on this host, which is why it is not 3000.

The container is both published on the host *and* joined to the external
`reverse-proxy` network, so NPM works either way:

| | Forward hostname | Forward port |
|---|---|---|
| NPM on this Docker engine | `beeshive` (the container) | `3100` |
| NPM anywhere else | this host's LAN IP | `3100` |

Scheme `http`, Websockets Support on. If the network does not exist on a host,
`docker network create reverse-proxy` before the first `up`.

Two ways this has already gone wrong, both of which look identical from
outside — the Proxy Host still reads correctly and the site is simply gone:

- the published port was dropped in favour of container-name routing, on a
  host where NPM was not joined to that network;
- **`PAYLOAD_SECRET` was empty.** This one is the nastiest: the container
  starts, logs `✓ Ready`, and never restarts, so `docker compose ps` shows it
  healthy — and every single request returns 500, because the config throws
  lazily on first use rather than at boot. `docker compose logs beeshive` is
  the only place it shows. Keep the secret in `.env`; a pull cannot revert it.

Check the container itself before touching NPM — this bypasses the proxy
entirely, so a 200 here means the fault is in NPM and not in the app:

```bash
curl -I http://localhost:3100
```

The stack is three containers now: `beeshive`, `postgres` and `pgbackrest`. The
app waits for the database's healthcheck before it starts, because Payload
applies migrations the moment it connects and a container that starts first
fails its first request while looking perfectly healthy.

`docker compose down` is safe; **`down -v` deletes the database and the
uploads**, which live in the `pg-data` and `media-uploads` volumes. That is
survivable now — the backups in R2 are exactly for this — but only if the
restore in `ops/README.md` is something you have actually done once.

`.dockerignore` keeps the local `.next`, `node_modules`, `.env` and
`database.db` out of the build context. Leaving `.next` in it is not a tidiness
matter: `COPY . .` drops a dev-server build tree into the image and the
production `next build` then runs on top of manifests that describe a different
router. `npm run build` also clears `.next` first (the `prebuild` script), for
the same reason.

## Deploy to Vercel

Possible, and not how this site runs. Vercel gives the app no disk and no
database, so it needs a PostgreSQL somewhere reachable and R2 configured for
the uploads — the local-disk fallback cannot work there.

1. Push to GitHub
2. Import to Vercel
3. Set environment variables: `DATABASE_URI`, `PAYLOAD_SECRET`,
   `NEXT_PUBLIC_SITE_URL`, and the four `R2_*`

## Tech Stack

- Next.js 15 (App Router)
- Payload CMS 3 (embedded, PostgreSQL 16)
- Cloudflare R2 for uploads, pgBackRest for database backups
- Tailwind CSS
- Framer Motion
- TypeScript
