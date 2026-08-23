import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";

/**
 * The list Payload applies on connect in production (`prodMigrations` in
 * src/payload.config.ts). It is empty on purpose, and only for the moment.
 *
 * The two migrations that used to live here were SQLite DDL — table rebuilds,
 * `INSERT ... SELECT`, the lot — generated against the old adapter. None of it
 * runs on PostgreSQL, and a half-translated version of it would be worse than
 * none: it would appear to apply and leave the schema subtly wrong. They were
 * deleted rather than ported, and nothing here is hand-written.
 *
 * The real initial migration is generated once the collections have settled,
 * against an empty database:
 *
 *     npm run migrate:create
 *
 * which writes a new file beside this one and rewrites this list to import it.
 * That is the last step of the current sweep and is run centrally, after every
 * collection change has landed — generating it earlier only produces a
 * migration that has to be thrown away again.
 *
 * Until then, an empty list means production would connect to a database with
 * no tables in it. Do not deploy from this commit.
 */
export const migrations: {
  up: (args: MigrateUpArgs) => Promise<void>;
  down: (args: MigrateDownArgs) => Promise<void>;
  name: string;
}[] = [];
