# De Bee's Hive: Website

Eetcafé website built with **Next.js 15** and **Payload CMS 3** (self-hosted, SQLite).

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
npm run dev
```

Visit `http://localhost:3000` for the site, `http://localhost:3000/admin` for the CMS.

On first visit to `/admin`, you'll create your admin account.

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
whenever `NODE_ENV=production`. A push on SQLite rewrites tables in place, and
for a field that has just been marked `localized: true` that means dropping the
column before its values have moved into the `_locales` side table — which is
exactly the change this project made when it went bilingual, and exactly the
data it would have cost.

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

Two caveats. `migrate:create` generates the SQL with drizzle-kit, and its
SQLite table-rebuild strategy emits an `INSERT ... SELECT` naming columns that
the *old* table does not have yet, so an incremental migration on this adapter
can be born broken. Always run a new migration against an empty database before
trusting it:

```bash
DATABASE_URI=file:/tmp/probe.db PAYLOAD_SECRET=x npm run migrate
```

And for a database that already exists and was built by dev push: it
already has these tables, so the first migration would fail on `CREATE TABLE`.
Mark it as applied rather than running it — insert a row into
`payload_migrations` with the migration's `name` and `batch` 1. A fresh
database, such as a new Docker volume, simply runs it.

## Docker

```bash
docker compose up -d --build
```

The container listens on 3000 and is published on host port **3100** (3000 was
already taken); set `HOST_PORT` to move it. In Nginx Proxy Manager, point the
Proxy Host at:

| | |
|---|---|
| Forward hostname | the host's LAN IP, e.g. `192.168.1.10` |
| Forward port | `3100` |
| Scheme | `http` |
| Websockets Support | on |

Not `127.0.0.1` or `localhost`: NPM runs in a container of its own, where those
mean NPM. The container name only works as a hostname if NPM shares a Docker
network with this stack, which it does not here.

Then on the SSL tab request a Let's Encrypt certificate and turn on Force SSL —
`NEXT_PUBLIC_SITE_URL` is baked in as `https://…`, so the canonical URLs,
hreflang tags and sitemap all assume the site answers on HTTPS.

If uploading photographs in the admin returns **413**, put
`client_max_body_size 100M;` in the Proxy Host's Advanced tab.

`docker compose down` is safe; **`down -v` deletes the database and the
uploads**, which live in the `db-data` and `media-uploads` volumes.

`.dockerignore` keeps the local `.next`, `node_modules`, `.env` and
`database.db` out of the build context. Leaving `.next` in it is not a tidiness
matter: `COPY . .` drops a dev-server build tree into the image and the
production `next build` then runs on top of manifests that describe a different
router. `npm run build` also clears `.next` first (the `prebuild` script), for
the same reason.

## Deploy to Vercel

1. Push to GitHub
2. Import to Vercel
3. Set environment variables: `DATABASE_URI`, `PAYLOAD_SECRET`, `NEXT_PUBLIC_SITE_URL`

## Tech Stack

- Next.js 15 (App Router)
- Payload CMS 3 (embedded, SQLite)
- Tailwind CSS
- Framer Motion
- TypeScript
