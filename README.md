# De Bee's Hive: Website

Eetcafé website built with **Next.js 15** and **Payload CMS 3** (self-hosted, PostgreSQL, with the database and the photographs both backed up to Cloudflare R2).

**Deploying, or moving the live site onto this stack? Read
[`DEPLOY.md`](DEPLOY.md).** It is the runbook for the cutover from the old
SQLite production, in the order the steps have to happen, and it covers the two
things that are easy to get wrong and expensive to discover afterwards: the
backup encryption passphrase, and the migration marker that makes a container
come up healthy while serving nothing from the CMS.

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
docker run -d --name beeshive-pg -p 5433:5432 \
  -e POSTGRES_USER=beeshive -e POSTGRES_PASSWORD=beeshive -e POSTGRES_DB=beeshive \
  postgres:16-alpine
npm run dev
```

A plain container rather than `docker compose up -d postgres`, and the
difference matters: the Postgres in `docker-compose.yml` belongs to the
deployed stack, publishes no port at all, and is only reachable from inside
that stack's own network. That is deliberate — see the comments there — and it
means it cannot serve a `npm run dev` running on the host. Any PostgreSQL 16 on
5433 will do; `DATABASE_URI` in `.env.example` already points at this one.

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

## Linting

```bash
npm run lint          # eslint .
npm run lint:fix
```

`eslint.config.mjs` is flat config for ESLint 9, extending `next/core-web-vitals`
through `FlatCompat` because `eslint-config-next` at 15.1 is still written in
the old shareable shape. Before it existed, `next lint` dropped into its
interactive *Strict / Base / Cancel* setup prompt — which hangs forever in a
pipeline with no terminal — and `next build` printed "No ESLint configuration
detected" and linted nothing at all.

One rule is turned off, `@next/next/no-img-element`, with the reasoning written
out in the config beside it: this site uses `next/image` nowhere on purpose,
and every remaining `<img>` renders a photograph Payload has already re-encoded
and Cloudflare is already serving. The generated files —
`src/payload-types.ts` and `src/app/(payload)/admin/importMap.js` — are
ignored, since a complaint about either is a complaint about a generator.

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

The push is also off whenever `DATABASE_URI` names a database that is not on
this machine, whatever `NODE_ENV` says. `localhost`, `127.0.0.1`, `::1` and
`host.docker.internal` count as local and nothing else does, so ordinary local
development is untouched; point it at a remote host and the push is skipped
with a warning that says which host and why. `ALLOW_REMOTE_SCHEMA_PUSH=true` is
the way through if you mean it. The reason is the next section — `npm run dev`
against the production database is the most common way to break a deployment
that this repository has.

In production the adapter is given `prodMigrations`, so Payload applies anything
outstanding itself when it connects. Nothing has to be run by hand on deploy,
and the container logs which migration it applied. That matters here because the
image is a standalone Next build with no Payload CLI inside it.

### The `dev` row, and the container that comes up healthy and serves nothing

A push leaves a row named `dev`, batch `-1`, in `payload_migrations`, and
**every one of the `npm run db:*` scripts pushes**, because none of them sets
`NODE_ENV=production`. A production container that then connects to that
database sees the row, decides it is being asked to migrate over a dev-pushed
schema, and stops on an interactive prompt. There is no terminal in a
container, so nothing answers it — and because Next has already bound the port
by then, every prerendered page goes on answering `200` from the HTML built
into the image while everything that needs the CMS hangs. `docker compose ps`
says healthy throughout, and the site takes no bookings.

Three things stand between that row and a deployment, in the order they run:

- **`ops/preflight.mjs`** runs before `node server.js` in the container's
  `CMD`. It looks for the row and, if it is there, prints what it is and what
  to do about it and exits non-zero, so the server never starts. A container
  that visibly will not come up gets fixed; one that is up and useless does
  not. Only that one outcome exits non-zero — an unreachable database, a
  missing table, no `DATABASE_URI` all print a line and get out of the way.
  `PREFLIGHT=off` skips it.
- **`src/payload.config.ts`** wraps the adapter's own `migrate` and refuses the
  same row *when there is no TTY*, which is the condition that makes the prompt
  fatal. In a real terminal Payload asks its question as it always has. This is
  the belt for the run that went around the preflight. There is no supported
  flag for it: `migrate` in payload 3.10.0 takes `{ migrations }` and nothing
  else, and `forceAcceptWarning` is only on `migrateFresh` and
  `createMigration`.
- **`ops/warm-up.sh`** checks the symptom after the start and says so in the
  log, which still catches a Payload stuck for a reason nobody predicted.

To look for it yourself:

```bash
docker compose exec postgres psql -U beeshive -d beeshive -c \
  "SELECT id, name, batch FROM payload_migrations ORDER BY id;"
```

If there is a `dev` row on a database whose schema came from `npm run migrate`,
delete it. `DEPLOY.md` has the command and, more usefully, the reasoning about
when deleting it is *not* safe.

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

The site was on SQLite until this release. The content crosses over through the
Local API, so it follows the collections rather than the tables:

```bash
npm run db:export -- content-export.json   # against the old database
npm run db:import -- content-export.json   # against the new one
npm run db:verify -- content-export.json   # prove it landed
```

`scripts/README.md` has the details, including what happens to ids (they are
remapped), to files (re-uploaded from `MEDIA_IMPORT_DIR`) and to passwords
(they cannot be imported; every account is listed at the end and has to be
reset once).

**[`DEPLOY.md`](DEPLOY.md) is the version of this with the order, the
timings and the traps in it**, and is what to follow when you are actually
doing it rather than reading about it. In particular, this branch can no longer
read SQLite at all — `@payloadcms/db-sqlite` has been removed along with the
eighteen megabytes of libsql it dragged into every image — so the export has to
be run from the last commit that could. DEPLOY.md says which one and what to
copy into it.

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

## Media: where the photographs live

By default they are written to the `media-uploads` volume and served from this
origin, and the backup container takes an encrypted snapshot of that volume
every night. That is the recommended arrangement, and it needs no configuration
at all.

With `R2_BUCKET`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`
set, uploads go to a Cloudflare R2 bucket instead and the container stores
nothing itself. Whether that is worth doing depends on where visitors would then
load the images from, which depends on whether the domain's DNS is at
Cloudflare: `docs/media-hosting.md` sets out the three options, what each costs,
and why none of them affects search.

Every generated size (`thumbnail`, `card`, `hero` and the 1200x630 `og` used
for share cards) is re-encoded as WebP at quality 78; the original the owners
uploaded is kept untouched.

`ops/README.md` covers creating the bucket and the API token.

## Backups

One container backs up both halves of what the site cannot regenerate, into one
private R2 bucket, encrypted before anything leaves the machine.

The database goes through pgBackRest: a full copy every Sunday night, a
differential every other night, and every write-ahead-log segment in between.
That last part is what allows a restore to land on any moment rather than only
on a backup.

```bash
ops/backup.sh full                              # take one now
docker compose exec pgbackrest pgbackrest --stanza=beeshive info
ops/restore.sh                                  # prints the plan, changes nothing
ops/restore.sh --time "2026-08-01 12:00:00" --yes-really
```

The photographs go through restic, one snapshot a night, with old snapshots
expired on a policy rather than kept forever.

```bash
ops/backup-media.sh                             # take one now
docker compose exec pgbackrest restic snapshots
ops/restore-media.sh                            # prints the plan, changes nothing
ops/restore-media.sh --yes-really
```

Three things to know before you need them, all spelled out in `ops/README.md`
and `docs/backups.md`: `PGBACKREST_CIPHER_PASS` is not recoverable and a lost
passphrase makes both repositories unreadable; a database restore to a point in
time discards everything written after it; and the photographs have snapshots
rather than point-in-time recovery, which is a property of files and not a gap
in the tooling.

## Docker

```bash
docker compose up -d --build
```

### Running the whole stack on a laptop

To look at the real thing rather than `npm run dev`, name the local override as
well:

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
```

It changes exactly two things, and it cannot be picked up by accident on the
server because it has to be named on the command line. It publishes PostgreSQL
on `127.0.0.1:5433`, which is what lets `npm run db:import`, `npm run db:verify`
and `npm run dev` on the host talk to the same database the container is using;
and it keeps the backup scheduler out of `up`, because that container refuses to
start without all five Cloudflare R2 variables and otherwise restart-loops
through the logs you are trying to read.

The first start comes up empty. Migrations are applied automatically the moment
Payload connects, so the schema is there, but there is no content and no login:

```bash
npm run db:import -- ./content-export.json   # a dump from `npm run db:export`
```

Then open `http://localhost:3100`, and `http://localhost:3100/admin` to create
the first account. Imported accounts arrive with a random password (the hashes
cannot be carried across; the import prints whose), so the first login is either
a fresh account or a password reset.

Content imported after the container started is not visible until the pages
regenerate. Give it a nudge rather than waiting out the revalidate window:

```bash
docker compose exec beeshive /app/ops/warm-up.sh
```

`docker compose down` leaves the data; `down -v` removes it.

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
uploads**, which live in the `pg-data` and `media-uploads` volumes. Both are in
the bucket, and `ops/restore.sh` and `ops/restore-media.sh` are how they come
back, but only if that is something you have actually done once.

`.dockerignore` keeps the local `.next`, `node_modules`, `.env` and
`database.db` out of the build context. Leaving `.next` in it is not a tidiness
matter: `COPY . .` drops a dev-server build tree into the image and the
production `next build` then runs on top of manifests that describe a different
router. `npm run build` also clears `.next` first (the `prebuild` script), for
the same reason.

### The image can be built with no database, and that is the problem

Every frontend page declares `export const revalidate`, so `next build`
prerenders all of them and reads the CMS while it does — and every one of those
reads falls back to the defaults in `src/lib/payload.ts` if it cannot connect.
A build with no `DATABASE_URI` therefore does not fail. It succeeds, with stock
opening hours compiled into the image, and after a deploy the first visitor to
each URL is served that HTML while Next regenerates the page behind them.

Two things answer that, and `DEPLOY.md` says which one this deployment relies
on and what to check after each `up`.

- **`BUILD_DATABASE_URI` in `.env`** is passed to the builder stage as the
  `DATABASE_URI` build argument, so a build that *can* reach a database
  prerenders the real content. Empty by default, and safe to point at
  production: Payload turns both the dev push and `prodMigrations` off during
  `next build`, so the build only reads.
- **`ops/warm-up.sh`** runs in the background from the container's `CMD`. As
  soon as the server answers it requests all seventeen public URLs twice, so
  the stale first request is made by the container rather than by a customer,
  and it reads `x-nextjs-cache` on the way past so that it can tell a page that
  was just rendered from one that is still the copy built into the image. It
  exits 0 whatever happens and cannot fail the container.

```bash
docker compose logs beeshive | grep warm-up     # after every deploy
docker compose exec beeshive /app/ops/warm-up.sh   # by hand, e.g. after an import
```

`WARMUP=off` in `.env` turns it off, which is only ever right while you are
deliberately looking at the prerendered output.

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
- pgBackRest for the database and restic for the photographs, both encrypted to
  Cloudflare R2; R2 optionally for serving the uploads as well
- Tailwind CSS
- Framer Motion
- TypeScript
