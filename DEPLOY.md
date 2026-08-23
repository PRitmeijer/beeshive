# Taking the site from SQLite to the new stack

This is written for one person, on the evening they are actually doing it. It
assumes you have the repository checked out on the production host, Docker
running, and half an hour when the restaurant is closed.

Three other documents carry the parts this one leans on, and none of it is
repeated here:

- `ops/README.md` — the Cloudflare buckets, the API token, the environment,
  and what each container is for.
- `docs/backups.md` — what is backed up, how to tell whether it is working,
  and the three ways to restore.
- `scripts/README.md` — what the export, import and verify scripts do to ids,
  to files and to passwords, and what they cannot do.
- `docs/rate-limiting.md` — which endpoints are throttled, and the one
  environment variable (`TRUSTED_PROXY_HOPS`) that has to match the number of
  proxies in front of the container for the throttle to mean anything.

Read the two paragraphs under **Before you touch anything** now rather than
later. The rest can be followed in order.

---

## Before you touch anything

**`PGBACKREST_CIPHER_PASS` is the one value in this entire procedure that
cannot be recreated.** Everything else — the database password, the R2 keys,
`PAYLOAD_SECRET` — can be reissued by somebody with an account somewhere. The
cipher passphrase cannot: it is the key the backups are encrypted with before
they leave the machine, it exists nowhere but in your `.env` and wherever you
put it, and a backup repository whose passphrase is gone is a bucket of noise
that you still pay to store. Generate it once, with

```bash
openssl rand -base64 48
```

and put a copy somewhere that is neither this server nor this repository — a
password manager the owners also have access to is the right answer, an email
to yourself is not. If you are reading this because you are rebuilding a
server that already had backups, then the passphrase already exists and you
must use the same one; a new one does not re-encrypt anything, it simply
stops the old repository from opening.

The other trap is smaller and much more common. Compose interpolates `.env`,
so **a `$` in any password is read as the start of a variable name and eaten**:
`abc$def` arrives in the container as `abc`. Double it — `abc$$def` — for
`POSTGRES_PASSWORD`, `SMTP_PASS`, the R2 keys and the cipher passphrase alike.
`openssl rand -base64` can produce a `+` or a `/` and never a `$`, so a freshly
generated passphrase is safe; a password somebody chose by hand is where this
bites. Check what actually arrived rather than trusting the file:

```bash
docker compose exec pgbackrest printenv | grep PGBACKREST_
```

## 1. The write window

The export is a snapshot. Anything written to the old site after you take it —
a reservation, a contact message, a newsletter signup, an edit in the admin —
is not in the dump and will not be in the new database.

You have two honest choices and no third one. Either put the old site behind a
maintenance page for the duration, which is about twenty minutes and is the
right call if you are doing this at a time when someone might book a table; or
accept the window, do it late, and know that you are accepting it. What you
must not do is take the export in the afternoon and cut over at midnight,
because the several hours in between will look exactly like a working site to
anyone using it and every one of those bookings will vanish.

If you take the site down, do it at the proxy rather than by stopping the old
application: a maintenance page answers, and a dead upstream gives a browser a
502 that some phones cache with more enthusiasm than you would like.

## 2. Export the old database

Here is the wrinkle, and it is worth knowing before you are standing in it:
**this branch cannot read SQLite any more.** `src/payload.config.ts` names only
`postgresAdapter`, and `@payloadcms/db-sqlite` has been removed from
`package.json` — it had been sitting there unused, pulling eighteen megabytes
of libsql and six platform binaries into every image. So the export cannot be
run from this checkout.

The last commit that still speaks SQLite is `eb67009`, immediately before
`c53693f` ("Foundation: PostgreSQL, R2 media, …"). That commit has the SQLite
adapter and its `node_modules`, and it does *not* have `export-content.ts`,
which was written afterwards. The two halves have to be put together by hand,
which is one `cp`:

```bash
# On the old host, in the old checkout — the one that is actually serving
# debeeshive.nl right now, with its own node_modules already installed.
cd /path/to/the/old/checkout
git rev-parse HEAD            # sanity: this should be eb67009 or an ancestor

cp /path/to/this/checkout/scripts/export-content.ts scripts/
npx tsx scripts/export-content.ts content-export.json
```

It prints a line per collection with a document count. Read them. A collection
you know has content and that reports `0 docs` is the whole reason this step
prints anything at all.

The file it writes holds reservations, contact messages and newsletter
addresses. It is guest data. `/content-export*.json` is in `.gitignore` and
must stay there; move the file the way you would move a database backup, not
by committing it and not through a chat app.

## 3. Copy the media across

The dump names the uploaded files. It does not contain them.

```bash
rsync -av /path/to/the/old/checkout/media/ /srv/beeshive-old-media/
```

Put that copy **somewhere other than the new checkout's `./media`**, and
remember where — the import wants it as `MEDIA_IMPORT_DIR`. `scripts/README.md`
explains at length why a directory that is both the source and the destination
goes wrong in two different ways at once; the short version is that Payload
writes its own uploads into `./media`, so using it as the source has the import
reading files it is in the middle of writing.

## 4. Bring up PostgreSQL

On the new host, with `.env` filled in from `ops/README.md`:

```bash
docker compose build
docker compose up -d postgres
docker compose logs -f postgres      # wait for "database system is ready"
```

The first start runs `initdb`, which is why the healthcheck has a thirty-second
grace period. You will also see a handful of `archive command failed` lines:
that is pgBackRest complaining that the stanza does not exist yet, it clears in
step 9, and it is the reason `init: true` is set on this service — the long
comment in `docker-compose.yml` explains what happens without it.

**The database has no published port, on purpose.** It is only on the stack's
`internal` network, so nothing outside the stack can reach it — including the
migrate and import scripts, which run from the host. For the length of this
procedure, and only for that, publish it on the loopback address:

```bash
cat > docker-compose.override.yml <<'YAML'
# TEMPORARY — for the migration only. Delete this file before you finish.
services:
  postgres:
    ports:
      - "127.0.0.1:5433:5432"
YAML

docker compose up -d postgres
```

Bound to `127.0.0.1` rather than to `0.0.0.0`, so it is reachable from a shell
on this machine and from nowhere else. Deleting this file again is step 10, and
it is on the checklist because it is exactly the kind of thing that stays
behind for a year.

## 5. Create the schema

```bash
export DATABASE_URI=postgresql://beeshive:<the password>@127.0.0.1:5433/beeshive
export PAYLOAD_SECRET=<the one from .env>

npm run migrate
npm run migrate:status
```

`migrate:status` should show one row, `Ran: Yes`. In normal running nothing has
to do this by hand — the container carries `prodMigrations` and Payload applies
anything outstanding the moment it connects — but the import in the next step
needs the tables to exist first, and doing it explicitly here means you find
out about a broken migration now rather than from a container that will not
start.

## 6. Import the content

```bash
MEDIA_IMPORT_DIR=/srv/beeshive-old-media npm run db:import -- content-export.json
```

This takes a few minutes, most of it re-uploading photographs. It ends with two
lists, both of which need reading rather than scrolling past:

- **media that could not be re-uploaded.** A media document whose file was not
  in `MEDIA_IMPORT_DIR` cannot be created at all, and everything that pointed
  at it has lost the link. If this list is not empty, the media copy in step 3
  was incomplete; fix it and start the import again from an empty database
  rather than patching around it.
- **every user account, with a new random password.** Keep this. Step 8 is
  about it.

Do not run the import twice against the same database. Nothing in a dumped
document identifies it again once the ids have been remapped, so a second run
gives you two of everything. Start from an empty database instead — drop it and
go back to step 5.

## 7. Prove it landed

```bash
npm run db:verify -- content-export.json
```

It re-exports the database and compares that against the dump, per document,
per locale, per field, and exits non-zero if anything did not survive. A clean
run ends with *"Everything in the dump came back out of the database
unchanged"*.

This step exists because the failure it catches is invisible. The English half
of every document is written by a second update after the Dutch one, and when
that goes wrong nothing breaks: the site serves the Dutch text under `/en`
because Payload's locale fallback is doing its job, the pages render, and the
first anyone hears of it is an owner editing something months later and seeing
nothing change. `scripts/README.md` describes the two kinds of output that are
expected rather than alarming.

One thing follows immediately from having run the import and the verify at all,
and it has to be done before the container goes into service: both scripts
leave a marker in `payload_migrations` that stops Payload dead on start-up.
**Read *When the container comes up healthy and serves nothing new*, below, and
do what it says, now.** It is one `DELETE` and it takes a second.

Skipping it no longer produces a site that answers every request and serves
nothing from the CMS — `ops/preflight.mjs` refuses to start the container while
that marker is there, and prints what to do about it. But it does produce a
container that will not come up until you have done this, so you may as well do
it here rather than in the middle of step 12.

## 8. Where the photographs ended up

If the four `R2_*` variables are set in `.env` before step 6, the import
uploaded every photograph straight into the bucket and the container is holding
no files of its own. That is the arrangement `ops/README.md` describes and the
one to aim for.

If they are not set, the import wrote the files to the `media-uploads` volume
instead, which works and is what a test host should do — but **turning R2 on
afterwards does not move them.** Payload writes new uploads to the bucket from
that moment and goes on serving the old ones from a disk the new configuration
no longer believes in, and the result is a gallery that half loads. If you are
going to use a bucket, configure it before the import. If you have already
imported without one, the honest fix is to set the variables and run the import
again from an empty database, with the same `MEDIA_IMPORT_DIR`.

Either way, look at `/galerij` in a browser before you call it done. A missing
photograph is obvious there and nowhere else.

## 9. Reset the admin passwords

Password hashes cannot cross over — the dump holds hashes and the Local API
takes plaintext — so every account was created with a random password, and the
import printed the list.

The kind thing is not to hand those passwords out. Send each of the two owners
to the login screen and have them use **Wachtwoord vergeten** once, which needs
SMTP to be working; if it is not, that is a good reason to find out now rather
than when the first reservation email fails to arrive. If mail is not ready,
give them the random password from the import log over something that is not
email and have them change it at the first login.

Once the stack is up in the next step, log in yourself before you tell anyone
else it is ready, and look at Site Instellingen. If the opening hours are `11:00 – 21:00` on Monday and `Gesloten`
on Tuesday, look closely: those are also the values in `src/lib/payload.ts`
that the site falls back to when it cannot read the CMS at all. The two are
identical today and that is a coincidence, not a check.

## 10. Backups, before you open the doors

Not after. A cutover is the single most likely moment for the database to end
up in a state somebody wants undone, and until there is one full backup in the
bucket there is nothing to go back to.

```bash
docker compose up -d
docker compose logs pgbackrest
```

The backup container creates the stanza itself on first start and runs a check,
and you are looking for these two lines:

```
pgbackrest-scheduler: creating stanza beeshive
pgbackrest-scheduler: check passed
```

By hand, if it did not, or after changing the repository:

```bash
docker compose exec pgbackrest pgbackrest --stanza=beeshive stanza-create
docker compose exec pgbackrest pgbackrest --stanza=beeshive check
```

Then take the first full backup rather than waiting for 03:15:

```bash
ops/backup.sh full
docker compose exec pgbackrest pgbackrest --stanza=beeshive info
```

`info` has to show a `full backup` entry with a recent timestamp, a
`wal start/stop` range and a non-zero size. An empty list means the backups are
failing silently, which is the state `docs/backups.md` was written about.

While you are here, confirm that WAL archiving has started working now that the
stanza exists — it fails independently of the backups, and it is the failure
that ends with a full disk and a database that will not restart:

```bash
docker compose exec postgres psql -U beeshive -c \
  "SELECT archived_count, failed_count, last_failed_time FROM pg_stat_archiver;"
```

`failed_count` will be non-zero from the minutes before the stanza existed.
What matters is that `archived_count` is now climbing and `last_failed_time` is
in the past.

## 11. Tidy up, then let people in

```bash
rm docker-compose.override.yml
docker compose up -d
```

The override was the only thing publishing the database port. Removing it and
bringing the stack up again puts Postgres back where it belongs, on the
internal network and nowhere else. Check:

```bash
docker compose ps                    # no 5433 against beeshive-postgres
curl -I http://localhost:3100        # 200, straight from the container
```

Then point Nginx Proxy Manager at it, as the README's table describes, and take
the maintenance page down.

## 12. The warm-up, and which belt is doing the work

Every frontend page carries `export const revalidate`, so `next build`
prerenders all of them and reads the CMS while it does. Every one of those
reads is wrapped in a try/catch falling back to the defaults in
`src/lib/payload.ts`. Together that means **a build with no database in reach
does not fail — it succeeds and bakes stock content into the image**, and after
a deploy the first visitor to each URL gets that HTML while Next regenerates
the page behind them. The second visitor gets the truth. The first one gets a
restaurant that closes at a time it does not close at.

There are two ways to deal with that and both are in the repository.

**The build argument** (`DATABASE_URI`, in the Dockerfile's builder stage, wired
to `BUILD_DATABASE_URI` in `docker-compose.yml`) lets the build reach a real
database and prerender real pages, so the image is correct from its first byte.
It is safe to point at production: Payload sets `NEXT_PHASE` during
`next build`, and `src/payload.config.ts` turns both the dev schema push and
`prodMigrations` off for that phase, so the build only ever reads.

**The warm-up** (`ops/warm-up.sh`, started in the background by the container's
`CMD`) asks the site for all seventeen public URLs twice, a few seconds apart,
as soon as it starts listening — so that the stale first request is made by the
container and not by a customer.

**On this deployment it is the warm-up that is doing the work, and the build
argument is left empty.** The reason is the one in step 4: the production
cluster is deliberately not reachable from outside the stack's internal
network, and a `docker compose build` on this host runs on a different network
again, so there is no route from the build to the real content that does not
involve opening the database up. That trade is not worth making for a second of
first-render latency. The build argument is there for a CI pipeline with a
database service beside it, or for a build against a restored copy, and if you
ever set one up, `BUILD_DATABASE_URI` in `.env` is where it goes.

So, after every `docker compose up -d`, read this:

```bash
docker compose logs beeshive | grep -E 'preflight|warm-up'
```

A healthy start looks like this — the preflight passes in one line before the
server starts at all, the first pass finds the pages stale, which is the whole
point, and the second finds nothing left:

```
preflight: geen dev-push-markering in payload_migrations. Doorstarten.
warm-up: server answering after 11s
warm-up: pass 1 (triggering): 17 requested, 0 did not answer 2xx/3xx, 16 still stale
warm-up: pass 2 (verifying): 17 requested, 0 did not answer 2xx/3xx, 0 still stale
warm-up: every page rendered against the live database. Nothing left stale.
```

Anything else is worth stopping for. Pages still stale after pass two mean the
regeneration is not completing, and an `ALARM` line means the CMS never
answered at all — see the next section, which is the fault that produces it.
A `preflight: STOP` line means the container did not start, and the next
section is that too.

You can run either script again by hand at any time, and the warm-up is worth
running after an import or after a large edit in the admin:

```bash
docker compose exec beeshive node /app/ops/preflight.mjs
docker compose exec beeshive /app/ops/warm-up.sh
```

## When the container comes up healthy and serves nothing new

This one has its own heading because for a long time everything about it looked
fine. It cannot any more — `ops/preflight.mjs` now stops the container instead
— but the fault is worth understanding, because the preflight's message assumes
you know what it is talking about.

Payload records a row named `dev` with batch `-1` in `payload_migrations`
whenever it pushes the schema straight from the collections instead of running
a migration — which is what it does whenever `NODE_ENV` is not `production`.
**Every one of the `npm run db:*` scripts does this**, including the import in
step 6 and the verify in step 7, because none of them sets `NODE_ENV`. So a
database that has just been through this runbook has that row in it.

What that row does to the production container is unpleasant. Payload sees it
on connect, decides it is being asked to run migrations over a dev-pushed
schema, and **stops on an interactive prompt**:

```
? It looks like you've run Payload in dev mode, meaning you've dynamically
  pushed changes to your database.
  If you'd like to run migrations, data loss will occur. Would you like to
  proceed? › (y/N)
```

There is no terminal in a container, so nothing ever answers it. Next has
already started, so the port is open and every prerendered page answers `200`
from the HTML built into the image, forever. `docker compose ps` says healthy.
The site looks up. Meanwhile every request that actually needs the CMS —
`/api/availability`, `/api/reserve`, `/api/active-notifications`, the admin —
hangs until the client gives up. The site takes no bookings and nothing in the
log says so.

### What stops it

Three things, and they are worth telling apart.

**`ops/preflight.mjs`, before the server starts.** It is the first thing the
container's `CMD` runs. It connects to `DATABASE_URI`, looks for a row with
batch `-1`, and if there is one it prints the explanation below in Dutch and
exits non-zero — so the shell never reaches `node server.js`, the container
goes down, and Docker restarts it into the same message. That is the point: a
container that visibly will not start is a fault somebody fixes in five
minutes. A container that is up and useless is one that goes unnoticed until an
owner asks why the phone has stopped ringing.

What you will see in `docker compose logs beeshive`:

```
preflight: STOP — deze database draagt een dev-push-markering ('dev').
...
```

It is the *only* thing about that script allowed to keep the container down.
A database it cannot reach, a `payload_migrations` table that does not exist
yet, no `DATABASE_URI`, no `pg` in the image — every one of those prints its
reason and exits 0. Refusing to start over a check that could not run would
invent an outage rather than prevent one, and the application has its own
reconnect loop besides. `PREFLIGHT=off` in `.env` skips it altogether.

**`src/payload.config.ts`, if the preflight was skipped.** The adapter's own
`migrate` is wrapped there, and refuses the same row with a one-paragraph Dutch
message *when there is no TTY* — which is exactly the condition that makes the
prompt fatal. Run `npm run migrate` in a real terminal and Payload asks its
question as it always has. Run anything without one and this stops it in
seconds rather than hanging forever. It exists for the run that went around the
preflight: `PREFLIGHT=off`, a bare `node server.js`, `npm start` on a laptop.

There is no supported flag for any of this, and it is worth writing down that
we looked. In payload 3.10.0 `migrate` takes `{ migrations }` and nothing else
(`payload/dist/database/types.d.ts`) and reads no environment variable;
`forceAcceptWarning` exists but only on `migrateFresh` and `createMigration`,
neither of which is on the `prodMigrations` path. Wrapping the adapter is what
there is.

**`ops/warm-up.sh`, after the server starts.** Unchanged, and still worth
having. Its `ALARM` line is this fault seen from outside, and it is why it asks
for `/api/active-notifications` before it asks for any page: the pages can all
answer `200` without the CMS having been reached at all, and that one route
cannot. It catches a Payload that is stuck for a reason nobody predicted, which
is the half the preflight cannot cover.

### Getting past it

Delete the row, once, after the import and verify are finished and before you
open the doors:

```bash
docker compose exec postgres psql -U beeshive -d beeshive -c \
  "SELECT id, name, batch FROM payload_migrations ORDER BY id;"

docker compose exec postgres psql -U beeshive -d beeshive -c \
  "DELETE FROM payload_migrations WHERE batch = -1;"

docker compose up -d beeshive
```

Keyed on the batch rather than on the name, because that is what Payload keys
on — `migrationsInDB.find((m) => m.batch === -1)`. The row is called `dev` in
practice, but a row with that batch under any other name stops the site just as
dead and a `DELETE` written against the name would leave it sitting there.

`restart: unless-stopped` means Docker is already restarting the container over
and over while the row is there, backing off a little further each time, so the
next attempt after the `DELETE` would eventually succeed on its own. `up -d` is
how you stop waiting for it.

Deleting it is safe in exactly this situation and not in general: it is safe
here because the schema came from `npm run migrate` in step 5 and the migration
row is still sitting above it, so the migrations and the tables genuinely do
agree. If you ever find this row on a database whose schema you cannot account
for, do not delete it — work out what pushed it first. The other way out is to
accept the push and run `npm run migrate` by hand, from a checkout with the
Payload CLI in it, in a terminal that can answer the question.

You can ask the question without deploying anything:

```bash
docker compose exec beeshive node /app/ops/preflight.mjs
```

### Not creating it in the first place

`npm run dev` against the production database is how this row gets written, so
the config refuses that too: the dev schema push is now allowed only when
`DATABASE_URI` names a database on this machine. Point it anywhere else and the
push is skipped with a warning saying so. `ALLOW_REMOTE_SCHEMA_PUSH=true` is
the way through for the developer who genuinely means it.

That does not cover the `npm run db:*` scripts — they connect through Payload
the same way and still push — which is why the runbook still ends with a
`DELETE` and why the preflight exists.

## If it goes wrong

Nothing here is one-way until you point the proxy at the new host, so the
rollback depends on how far you got.

**Before step 11** — the old site is still there and still serving. Stop the
new stack and think about it in the morning:

```bash
docker compose down
```

`down` on its own keeps the volumes. **`down -v` deletes the `pg-data` volume,
which is the entire database**, and at this point in the procedure that is
everything you have just imported.

**After step 11, and the new site is wrong** — put the proxy back to the old
host. That is one field in one Proxy Host, it takes ten seconds, and the old
SQLite site has been running untouched all along. Anything written to the new
site in the interval is stranded, which is a real cost and an argument for not
announcing the cutover the moment it is done.

**After step 11, and the database is wrong** — this is what step 10 was for.
`docs/backups.md` has the three cases in the order you are likely to meet them;
the shortest is

```bash
ops/restore.sh                                  # prints the plan, changes nothing
ops/restore.sh --time "2026-08-01 12:00:00" --yes-really
```

Run it once without `--yes-really` and read what it prints. That output is the
entire safety mechanism, and a restore to a point in time discards everything
written after it — including, on a restaurant's site, somebody's table for
Saturday.

**Do a dry run of the restore on a spare machine before you need it.** A backup
that has never been restored is a hypothesis, and this is the paragraph that
whoever wrote `docs/backups.md` would most like you to have read.

## The list, without the prose

For the second time you do this, or for reading over somebody's shoulder.

| | |
|---|---|
| 1 | `.env` complete — R2 set *before* the import, cipher passphrase stored off this server |
| 2 | Maintenance page up, or accept the write window |
| 3 | `npx tsx scripts/export-content.ts content-export.json` on the old checkout |
| 4 | `rsync` the old `media/` somewhere that is not the new `./media` |
| 5 | `docker compose up -d postgres`, plus the temporary port override |
| 6 | `npm run migrate` && `npm run migrate:status` |
| 7 | `MEDIA_IMPORT_DIR=… npm run db:import -- content-export.json`, keep the password list |
| 8 | `npm run db:verify -- content-export.json` |
| 9 | `DELETE FROM payload_migrations WHERE batch = -1` — see the section on it; skipped, the preflight keeps the container down until you do |
| 10 | `/galerij` in a browser: every photograph loads |
| 11 | Owners reset their passwords through *Wachtwoord vergeten* |
| 12 | `docker compose up -d`, stanza created, `ops/backup.sh full`, `info` shows it |
| 13 | `rm docker-compose.override.yml`, `docker compose up -d`, proxy over, page down |
| 14 | `docker compose logs beeshive \| grep -E 'preflight\|warm-up'` — preflight clean, pass 2 clean, no ALARM |
