import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/*
 * "Laatste reservering vóór sluitingstijd" in Site Instellingen: the gap
 * between the last table a guest can book and the moment the doors close,
 * turned from a constant of sixty in src/lib/openingHours.ts into a number the
 * owners set. The café asked for it in one sentence — closing at nine, they
 * want ninety minutes, and the hour they were being given was the answer to a
 * different question.
 *
 * The DEFAULT on the column is the load-bearing word, exactly as it was on
 * reservation_slot_minutes two migrations back. Postgres fills existing rows in
 * when a column is added WITH a default, so the single site_settings row this
 * table will ever hold comes out of this migration set to 60 — the same hour
 * the code has always used, the same number written on the field itself and in
 * both fallback settings objects in src/lib/payload.ts. Nothing about the
 * booking form changes on the day this ships; the owners simply gain a field
 * they can now move.
 *
 * Nothing in the reservations table is touched, and nothing needs to be. This
 * decides which times the form offers next, not where the ones already taken
 * sit — a booking stored at 20:00 on a day that closes at nine stays exactly
 * where it is whatever number goes in here afterwards. Rolling back is safe in
 * the same way: the column goes and every reader falls back to the hour, so a
 * café that had widened the gap to ninety would start offering half past eight
 * again, and any booking taken at eight while the wider gap was in force
 * remains readable and remains in the agenda.
 */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "site_settings" ADD COLUMN "reservation_last_sitting_minutes" numeric DEFAULT 60;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "reservation_last_sitting_minutes";`)
}
