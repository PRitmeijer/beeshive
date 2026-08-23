# scripts/

One-off jobs, all of them run through the Local API rather than against the
database directly, so they follow the collections instead of the tables.

| Script | npm | What it is for |
|---|---|---|
| `export-content.ts` | `npm run db:export` | Dump every document and global to JSON, one entry per locale. |
| `import-content.ts` | `npm run db:import` | Read that dump back into whatever database Payload is pointed at. |
| `verify-import.ts` | `npm run db:verify` | Re-export and compare, field by field and locale by locale, against the dump. |
| `seed.ts` / `seed-en.ts` | `npm run seed`, `npm run seed:en` | Fill an empty install with example content. |
| `import-subscribers.ts` | `npm run import:subscribers` | The old site's newsletter table, from CSV. See the main README. |
| `backfill-nl-locale.ts` | — | One-time repair from the move to two languages. Kept for reference. |

## Moving the content to another database

This is how the site crossed from SQLite to PostgreSQL, and the same three
steps move it anywhere else. Do them in order and read the output of each one
before starting the next; the whole point of the third is that the second can
fail without looking like it did.

### 1. Dump the old database

```bash
# DATABASE_URI still points at the database you are leaving
npm run db:export -- content-export.json
```

The file it writes holds guest data — reservations, contact messages,
newsletter addresses — so `/content-export*.json` is in `.gitignore` and must
stay there. Copy it between machines the way you would copy a database backup,
not by committing it.

Copy the uploaded files across as well: the dump names them, it does not
contain them. Put that copy **somewhere other than `./media`** and point
`MEDIA_IMPORT_DIR` at it. `./media` is where Payload writes its own uploads
when the site is not on R2, and a directory that is both the source and the
destination goes wrong in two ways at once: the import has to move each file
aside so Payload does not save it as `Lm08h01-1.svg`, and `--wipe` deletes the
old files along with the documents that named them, leaving nothing to import
on the next attempt. A separate directory has neither problem.

### 2. Import into the new one

```bash
# DATABASE_URI now points at the new database, and Payload has created its
# schema there (`npm run migrate`, or a first run in development)
MEDIA_IMPORT_DIR=/path/to/old-media npm run db:import -- content-export.json
```

Add `--wipe` to empty every collection first — every collection in the config,
not only the ones the dump mentions, and the globals' lists and links with
them, so that a rehearsal really does start from nothing. That is right for a
rehearsal on a scratch database and wrong on anything live: it deletes
reservations, contact messages and subscribers that were never in the dump,
which on a restaurant's site is somebody's table for Saturday.

One thing `--wipe` does not reset is a plain field on a global that the dump
has no value for; clearing those means fighting Payload's validation over
required fields, so they keep whatever they held. `db:verify` lists them at the
end of its run under "fields exist in the config but not in the dump", which is
where you would notice.

### 3. Prove it landed

```bash
npm run db:verify -- content-export.json
```

It re-exports the database it is pointed at and compares that against the dump,
per document, per locale, per field. Ids are expected to differ and are matched
through instead — a relationship is compared as the document it points at, not
as the number it stores. It writes nothing and exits non-zero if anything did
not survive.

A clean run ends with "Everything in the dump came back out of the database
unchanged". Anything else names the collection, the locale, the document and
the path, and is worth reading rather than re-running.

Two kinds of output are expected rather than alarming:

- **values that belong to no field in the current config.** A dump older than
  the schema carries fields nobody defines any more. The verifier lists them
  and skips them; the only question is whether you recognise one as content
  somebody still wants.
- **media that could not be re-uploaded.** The import warns about those; the
  verifier will then report the documents as missing, because they are.

## What the import does, and what it cannot

- **Ids are not preserved.** Postgres assigns them from a sequence, and asking
  it not to is worse than letting it: Payload takes the requested id for the
  rows it writes into the side tables while the document itself gets the one
  the sequence handed out, which fails on a foreign key if you are lucky. The
  script keeps a map of old to new instead and rewrites every relationship and
  upload field with it, so the links hold. Collections are imported in
  dependency order, and anything left over is filled in on a second pass.
- **Both languages, in two writes.** Every document is created in Dutch and
  then updated with its English values. Between those two writes the document
  is read back so that the second one can name the array rows the first one
  created — see `spliceRowIds` in `import-content.ts` for why that matters and
  what it cost. This is the part `db:verify` exists to check, because when it
  goes wrong nothing visibly breaks: the site keeps serving the hard-coded
  defaults in `src/lib/payload.ts` and the first anyone hears of it is an owner
  editing the opening hours and seeing nothing change.
- **Files are re-uploaded** from `MEDIA_IMPORT_DIR`, or from `./media` if that
  is not set. A media document whose file is not there cannot be created at all
  — Payload refuses an upload document without a file — so it is named in a
  warning at the end, and anything that pointed at it lost the link.
- **Nothing is mailed.** Reservations and contact messages carry an
  afterChange hook that notifies the owners, and a dump of the old database is
  history rather than news — importing it unguarded sends one
  "Reserveringsaanvraag: …" per historical booking, all at once, none of them
  true. Every write the script makes carries the `skipOutboundEmail` flag in
  `req.context` (see `src/lib/outboundEmail.ts`), and each imported row is then
  settled at verzendstatus "Niet verstuurd" so that opening it in the admin and
  saving does not send it either. A dump that already says `sent` keeps saying
  so. The script prints how many rows it settled at the end.
- **Passwords cannot be imported.** Only hashes exist in the dump and the Local
  API takes plaintext. Every account is created with a random password and
  listed at the end; each one uses "Wachtwoord vergeten" once.
- **Run it twice and you get everything twice.** Nothing in a dumped document
  identifies it again once the ids have moved. Re-run with `--wipe`, or start
  from an empty database.
