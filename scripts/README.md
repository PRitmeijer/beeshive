# scripts/

One-off jobs, all of them run through the Local API rather than against the
database directly, so they follow the collections instead of the tables.

| Script | npm | What it is for |
|---|---|---|
| `export-content.ts` | `npm run db:export` | Dump every document and global to JSON, one entry per locale. |
| `import-content.ts` | `npm run db:import` | Read that dump back into whatever database Payload is pointed at. |
| `seed.ts` / `seed-en.ts` | `npm run seed`, `npm run seed:en` | Fill an empty install with example content. |
| `import-subscribers.ts` | `npm run import:subscribers` | The old site's newsletter table, from CSV. See the main README. |
| `backfill-nl-locale.ts` | — | One-time repair from the move to two languages. Kept for reference. |

## Moving the content to another database

This is how the site crossed from SQLite to PostgreSQL, and the same two steps
move it anywhere else.

```bash
# 1. against the old database
npm run db:export -- content-export.json

# 2. point DATABASE_URI at the new one, let Payload create the schema, then
npm run db:import -- content-export.json
```

Three things worth knowing before you run the import:

- **Ids are not preserved.** Postgres assigns them from a sequence, and asking
  it not to is worse than letting it: Payload takes the requested id for the
  rows it writes into the side tables while the document itself gets the one
  the sequence handed out, which fails on a foreign key if you are lucky. The
  script keeps a map of old to new instead and rewrites every relationship and
  upload field with it, so the links hold. Collections are imported in
  dependency order, and anything left over is filled in on a second pass.
- **Files are re-uploaded from `./media`.** A media document whose file is not
  there is created without one and named in a warning at the end.
- **Passwords cannot be imported**, only hashes exist in the dump and the Local
  API takes plaintext. Every account is created with a random password and
  listed at the end; they use "Wachtwoord vergeten" once.

`--wipe` empties each collection first. It is off by default, and on a live
database it deletes reservations and subscribers that were never in the dump.
