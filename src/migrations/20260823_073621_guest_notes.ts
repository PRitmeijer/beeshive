import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "reservations_guest_responses" ADD COLUMN "note" varchar;
  ALTER TABLE "reservations" ADD COLUMN "guest_note" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "reservations_guest_responses" DROP COLUMN IF EXISTS "note";
  ALTER TABLE "reservations" DROP COLUMN IF EXISTS "guest_note";`)
}
