# Backups and restoring

This note is for whoever maintains the site. The owners see one page,
**Backups** in the admin sidebar, which is written for them in Dutch and which
says the same things this file says, more slowly.

`ops/README.md` is the reference for the machinery — the Cloudflare setup, the
environment variables, the container layout. This file is the runbook: what is
protected, how to tell whether it is working, and what to type when it is not.

## What is backed up, and what is not

| | Where it lives | How it survives the server dying |
|---|---|---|
| The database (menu, blog, events, reservations, contact messages, users, settings) | PostgreSQL 16 in the `pg-data` volume | pgBackRest, encrypted, to a private Cloudflare R2 bucket |
| Uploaded photographs, **with R2 configured** | Cloudflare R2 (`R2_BUCKET`) | R2's own durability. Nothing on this server holds them, so nothing on this server can lose them |
| Uploaded photographs, **without R2** | the `media-uploads` Docker volume | **nothing.** See below |
| The CMS schema | `src/migrations/` | git |
| Everything else (code, config) | git | git |

The photographs are deliberately *not* in the database backup. With a bucket
configured they are already in object storage that is not on this server, and
copying them nightly into a second bucket would double the bill to protect
against a failure Cloudflare does not really have.

**Without a bucket, the photographs are not backed up at all.** pgBackRest backs
up the PostgreSQL data directory and nothing else; the `media-uploads` volume is
not in its scope and never will be. That is the state the site ships in, because
R2 is optional, and it is the single strongest argument for turning R2 on: not
speed, which turned out to be marginal (see `docs/media-hosting.md`), but the
fact that a volume nobody copies is a volume that eventually gets wiped.

## If the media volume is wiped

This is the question worth thinking through before it happens, because the
answer is completely different in the two configurations.

**With R2 configured, there is nothing to restore.** `disableLocalStorage` is
switched on the moment all four R2 variables are present
(`src/collections/Media.ts`), which means Payload writes no files to the
container at all. The `media-uploads` volume is vestigial. Delete it, rebuild
the container, restore the database from pgBackRest, and the site is whole: the
database rows carry the filenames and the alt text, the objects are still in the
bucket, and the two find each other again with no step in between. That is the
recovery path, and it is why the two halves are stored apart rather than
together.

**Without R2, a wiped volume is unrecoverable.** The database restore brings
back every media row, so the admin looks correct and the pages reference every
photograph by name, and every one of them is a 404. There is no copy anywhere.
Re-uploading by hand is the only way back, and the alt text and the captions
survive while the pictures do not, which is a peculiarly annoying place to be.

### The one gap R2 does not close

A photograph deleted through the admin is deleted from the bucket too, and
**R2 has no object versioning**: Cloudflare's documentation is explicit that
deleting objects "is irreversible" and that removed objects "cannot be
recovered". So restoring the database to yesterday brings the row back and not
the file.

The tool for that is a **bucket lock**, which R2 does have: "Bucket locks
prevent the deletion and overwriting of objects in an R2 bucket for a specified
period, or indefinitely." A retention rule of thirty or ninety days on the media
bucket means an accidental delete in the admin cannot actually remove the
object, and the row can be restored onto a file that is still there.

The reason this works as a safety net rather than as a formality is the token.
The website's R2 credentials are scoped to Object Read and Write on that bucket
alone, so the application can neither remove the lock rule nor shorten it. Only
somebody logged into the Cloudflare dashboard can, deliberately.

### Restoring the database to an earlier point, with a live bucket

Worth knowing, because the two halves have different clocks. pgBackRest can put
the database back to any moment; the bucket is always now. Restore the database
to last Tuesday and the bucket will hold objects uploaded since, which no row
references any more. Those are orphans, they cost a few cents, and nothing goes
wrong. The reverse is the one to watch: a photograph uploaded *and* deleted
since last Tuesday is gone from the bucket, while the restored row expects it.
A retention rule covers that too.

**The encryption passphrase (`PGBACKREST_CIPHER_PASS`) is not recoverable.**
Lose it and every backup in the bucket is noise. Keep a copy somewhere that is
not this server and not this repository.

## How often

From `ops/pgbackrest/entrypoint.sh` and the environment in `docker-compose.yml`:

- **03:15 every night**, Europe/Amsterdam.
- **Sunday** is a *full* backup — a complete copy of the cluster.
- **Monday to Saturday** is a *differential* — only what changed since Sunday.
- **Continuously**, every write-ahead-log segment is shipped to the bucket as it
  is filled, and at least every five minutes whether it is full or not
  (`archive_timeout` in `ops/postgres/postgresql.conf`).

That third line is what makes point-in-time recovery possible. Without it a
restore can only land on 03:15 of some night; with it, it can land on any minute
inside the retention window. Four full backups are kept, so that window is
roughly a month.

## Checking that it is healthy

The admin page answers this at a glance and is the right place to look first:
**laatste geslaagde backup: 3 uur geleden**, green, and no warnings. It turns
red when the newest *full* backup is older than nine days, which means at least
one Sunday was missed entirely.

The page can only read the repository if the website's container has been given
a pgbackrest binary and the bucket credentials, which by default it has not —
see `ops/pgbackrest-api.md` for why that is a real decision and not just a
missing step. When it cannot, it says so, and the checks below are the fallback.

From the host, in the directory with `docker-compose.yml`:

```bash
# What is actually in the bucket
docker compose exec pgbackrest pgbackrest --stanza=beeshive info

# Whether WAL is still getting through — this fails independently of the backups
docker compose exec postgres psql -U beeshive -c \
  "SELECT archived_count, failed_count, last_failed_time FROM pg_stat_archiver;"
```

A `failed_count` that is climbing is an emergency in slow motion. PostgreSQL
keeps every segment it could not archive and refuses to recycle them, `pg_wal`
grows, and when the volume fills the database stops accepting writes and will
not restart. The site goes down some days after the actual fault, which is what
makes it worth watching for. The usual causes are an expired R2 token, a
renamed bucket, and a missing `PGBACKREST_CIPHER_PASS`.

## Restoring

Three situations, in the order you are likely to meet them.

### Something was deleted this morning

```bash
ops/restore.sh --time "2026-08-01 12:00:00" --yes-really
```

Everything after that moment is discarded: reservations taken since, contact
messages received since, edits made since. Export first if any of that might
matter — `npm run db:export` writes `content-export.json`.

### The newest backup, as it was taken

Pick the label out of the table on the admin page (they look like
`20260801-031500F`) and:

```bash
ops/restore.sh --set 20260801-031500F --yes-really
```

Or, for "put it back exactly as it was a moment ago", with all archived WAL
replayed:

```bash
ops/restore.sh --yes-really
```

Run it once without `--yes-really` first. It prints the repository contents and
the plan and changes nothing, and reading that output is the entire safety
mechanism.

### The server is gone, or the database is empty

This is the case the owners asked about, and it is the one that has to be
findable at two in the morning: a rebuilt container comes up, Payload runs its
migrations against an empty cluster, and the admin greets whoever finds it with
a create-your-first-user screen — as though the restaurant had never had a
website. Nothing is gone. It is all in the bucket.

The admin page detects this: no users, or a settings record that has never been
written, and it puts **"Er staat een backup in de cloud"** at the top of the
page with the commands below already filled in. That block is the reason the
page exists.

One wrinkle worth knowing before you rely on it. A database with *no users at
all* cannot be looked at: Payload sends every admin request to the
create-first-user screen and there is nobody to log in as, so the warning cannot
be shown there. What happens in practice is that whoever found the empty site
makes an account — and at that instant there is one user, the settings have
still never been written, and the warning is on the first page they see. Making
that account is harmless; the restore below throws it away with everything else.

If it is worth closing that gap properly, the place to do it is a
`admin.components.beforeLogin` entry that runs the same check. It was left out
here because a component on the login screen runs for every anonymous visitor
and would leak the fact that the database is empty to anyone who asks.

1. New host with Docker, `git clone` this repository.
2. Copy `.env` across. `PGBACKREST_CIPHER_PASS` above all — without it the
   bucket is unreadable — and `PAYLOAD_SECRET`, without which every existing
   admin session is invalid (not fatal; everyone logs in again).
3. Build, and create an empty cluster without letting the site write to it:

   ```bash
   docker compose build
   docker compose up -d postgres
   docker compose stop postgres
   ```

   The first `up` runs `initdb` so the volume holds a cluster; the `stop` is so
   the restore is not fighting a running server.

4. Restore into it:

   ```bash
   docker compose run --rm --no-deps --entrypoint pgbackrest pgbackrest \
     --stanza=beeshive --delta --target-action=promote restore
   docker compose up -d
   ```

5. The photographs are already in R2 and need nothing.
6. `ops/backup.sh full`, so the new cluster has a backup of its own.

**Do this once on a spare machine before you need it.** A backup that has never
been restored is a hypothesis.

## What the admin page does, and does not, do

Does:

- read the repository and list every backup, newest first, with its label, its
  type, when it was taken and what it costs in the bucket;
- say in one sentence how long ago the last good backup was, and turn red when
  that is too long ago;
- warn separately when WAL archiving has stopped, because that fails on its own
  and is the failure that ends with a full disk;
- take a backup out of turn — online, with nobody locked out;
- detect an empty install and point at the bucket;
- produce a restore command, pre-filled, with a copy button, behind a
  confirmation that makes you type `HERSTELLEN`.

Does not, and will not:

- **restore anything.** A restore stops the website, stops the database,
  replaces the entire data directory and replays WAL. An HTTP endpoint that can
  do that is an HTTP endpoint that can destroy the restaurant's data, sitting
  behind a session cookie on a machine that also answers requests from the
  public internet. The convenience is not worth the blast radius. There is a
  second, quieter reason: the restore has to stop the container the request is
  running in, so the handler could not report on its own work anyway.
- delete a backup, expire one early, or change the retention.
- show anything to somebody who is not logged in. Both `/api/admin/backups` and
  the page itself require a Payload session.

The reasoning is written out at length in the block comment at the top of
`src/lib/backups.ts`, which is the place to argue with it.

---

# Translations: the two-save problem

Filed here because it is the other half of the same round of work, and because
the registration snippet below covers both.

## Why some fields need saving twice

A field marked `localized: true` in Payload stores one value per locale, in a
`_locales` side table. There is genuinely no English value until something
writes one, and only the editor knows what it should be — so Payload asks once
per language, which is two saves. A field that is *not* localized (an uploaded
file, a date, a checkbox, a number, a slug) is a single shared column and is
written once, from whichever language tab happens to be open.

So the complaint — *"I add media, I have to save it, then go to the English tab,
click it again, and save it again"* — is not a bug in the admin. It is the price
of every text field on the document being translatable. The fix is not to make
Payload save twice more cleverly; it is to do the second save for the editor.

`src/components/admin/CopyToLocale.tsx` is a `ui` field that does exactly that.
It shows which language you are editing and offers one button — *"Neem de
Nederlandse tekst over in het Engels"* — which copies the other locale's values
into this one. By default it fills only fields that are **empty** here, so a
half-finished translation survives; a checkbox behind a confirmation switches it
to overwriting.

`src/components/admin/LocaleAssist.tsx` puts a **Vertalingen** section in the
sidebar counting, per collection, how many documents still have no English text
at all. Payload's `fallback` deliberately hides that — the English site serves
the Dutch sentence and looks finished either way — which is right for visitors
and useless for whoever is keeping track.

## Fields that are localized and arguably should not be

Audited against every collection and every Site Instellingen tab. **No upload,
number, date, boolean or slug field in `src/collections/` or
`src/globals/` is marked `localized`** — every one of the 44 is `text`,
`textarea` or `richText`. The two-save cost is therefore real work in almost
every case. The exceptions worth revisiting, none of which were changed here:

| File | Field | Why it is questionable |
|---|---|---|
| `@payloadcms/plugin-seo` (on `blog-posts` and `events`) | `meta.image` | **An `upload` field, forced `localized: true` by the plugin.** This is the actual field behind the complaint: a share image has no language, and the plugin makes you pick it once per locale. |
| `src/globals/settings/contact.ts` | `openingHours.hours` | `11:00 – 21:00`. Required, localized, and inside an array of seven rows. |
| `src/globals/settings/contact.ts` | `openingHoursExceptions.hours` | Same, and there is already a separate `closed` checkbox carrying the only word that translates. |
| `src/collections/OpeningExceptions.ts` | `hours` | Same again. |
| `src/globals/settings/homepage.ts` | `heroTitle` | The name of the business. Defaults to `De Bee's Hive` in both languages. |
| `src/collections/Events.ts` | `price` | Usually `7,50`. Only `Gratis` translates. |

Un-marking a field that already has data is **not** a config edit: drizzle
compares the collections to the live tables and drops the column it can no
longer account for, values first. Each of these needs a migration that copies
the Dutch value back into the shared column before the locale rows go.

## Registering all of it

**This is all applied.** It is written out below because Payload 3 resolves
admin components by *path* through the import map — every entry is a string,
nothing is imported at the top of the file — which means a rename that TypeScript
is perfectly happy with will break the admin at runtime, and this is the list of
places to look when it does.

`admin.components` in `src/payload.config.ts` now reads:

```ts
    components: {
      beforeNavLinks: ["@/components/admin/AgendaView#AgendaNavLink"],
      // Under the collections rather than above them: this page is quiet
      // until it is the only thing that matters.
      afterNavLinks: [
        "@/components/admin/BackupsView#BackupsNavLink",
        "@/components/admin/LocaleAssist#LocaleAssist",
      ],
      views: {
        agenda: {
          Component: "@/components/admin/AgendaView#AgendaView",
          path: "/agenda",
          exact: true,
          meta: { title: "Agenda" },
        },
        backups: {
          Component: "@/components/admin/BackupsView#BackupsView",
          path: "/backups",
          // Only /admin/backups itself; a prefix match would swallow anything
          // below it, and nothing below it exists.
          exact: true,
          meta: { title: "Backups" },
        },
      },
    },
```

`src/app/(payload)/admin/importMap.js` carries the matching entries, written by
hand in the generator's own shape (identifier = `<export>_md5(componentPath)`).
Re-run

```bash
npm run generate:importmap
```

whenever one of these paths or export names changes, and commit the result. The
four entries beyond the agenda's two:

```
"@/components/admin/BackupsView#BackupsView"
"@/components/admin/BackupsView#BackupsNavLink"
"@/components/admin/LocaleAssist#LocaleAssist"
"@/components/admin/CopyToLocale#CopyToLocale"
```

The translation panel is a `ui` field. It is on `media`, `menu-items`,
`blog-posts` and `events` — the four the owners touch daily — first in each
`fields` array:

```ts
{
  name: "vertalingen",
  type: "ui",
  admin: {
    components: {
      Field: "@/components/admin/CopyToLocale#CopyToLocale",
    },
  },
},
```

A `ui` field holds no data and needs no migration, which is why it could be
added to four collections without one. It sits first so it is above the fields
it is talking about.
