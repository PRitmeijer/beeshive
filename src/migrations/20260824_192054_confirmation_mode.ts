import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/*
 * "Bevestigingsmail aan de gast" in Site Instellingen: when the guest's
 * confirmation goes out, turned from a behaviour a developer chose into a value
 * the owners can change.
 *
 * The DEFAULT on the column is the load-bearing word, the same way it was on
 * confirmation_email_status one migration back. Postgres fills existing rows in
 * when a column is added WITH a default, so the single site_settings row this
 * table will ever hold comes out of this migration set to 'approval' — the mode
 * that waits for a human, which is how the café already works, so running this
 * changes nobody's Tuesday. 'auto' here would have meant that the deploy itself
 * started confirming bookings and mailing guests about them, with nobody having
 * asked for it.
 *
 * That same default is written in two other places on purpose: on the field in
 * src/globals/settings/reservations.ts, and in both fallback settings objects in
 * src/lib/payload.ts, so that a global nobody has ever pressed save on answers
 * the question the same way this column does.
 */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_site_settings_reservation_confirmation_mode" AS ENUM('approval', 'auto', 'off');
  ALTER TABLE "site_settings" ADD COLUMN "reservation_confirmation_mode" "enum_site_settings_reservation_confirmation_mode" DEFAULT 'approval';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "reservation_confirmation_mode";
  DROP TYPE "public"."enum_site_settings_reservation_confirmation_mode";`)
}
