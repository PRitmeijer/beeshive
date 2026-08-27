import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/*
 * "Tijdstippen om de" in Site Instellingen: how far apart the sittings sit,
 * turned from a constant in the code into a value the owners can change.
 *
 * The DEFAULT on the column is the load-bearing word, exactly as it was on
 * reservation_confirmation_mode one migration back. Postgres fills existing
 * rows in when a column is added WITH a default, so the single site_settings
 * row this table will ever hold comes out of this migration set to '15' — the
 * quarter-hour grid the owners asked for, and the same value written on the
 * field in src/globals/settings/reservations.ts and in both fallback settings
 * objects in src/lib/payload.ts, so a global nobody has pressed save on answers
 * the question the same way this column does.
 *
 * Nothing in the reservations table is touched, and nothing needs to be. Thirty
 * is a multiple of fifteen, so every booking already stored at :00 or :30 sits
 * exactly on the quarter-hour grid as well; the whole change is which times the
 * form offers next, not where the ones already taken sit. Rolling back is
 * likewise safe in itself — but a :15 booking taken while this was applied
 * stays a :15 booking, and the half-hour grid the code falls back to will not
 * offer that time again. The rows remain readable and the owners can still see
 * them in the agenda; only the picker gets narrower.
 */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_site_settings_reservation_slot_minutes" AS ENUM('15', '30');
  ALTER TABLE "site_settings" ADD COLUMN "reservation_slot_minutes" "enum_site_settings_reservation_slot_minutes" DEFAULT '15';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "reservation_slot_minutes";
  DROP TYPE "public"."enum_site_settings_reservation_slot_minutes";`)
}
