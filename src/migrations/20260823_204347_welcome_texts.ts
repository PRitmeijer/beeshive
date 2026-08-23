import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "notifications_locales" ALTER COLUMN "message" DROP NOT NULL;
  ALTER TABLE "site_settings_locales" ADD COLUMN "welcome_text" varchar;
  ALTER TABLE "site_settings_locales" ADD COLUMN "guest_pass_welcome" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "notifications_locales" ALTER COLUMN "message" SET NOT NULL;
  ALTER TABLE "site_settings_locales" DROP COLUMN IF EXISTS "welcome_text";
  ALTER TABLE "site_settings_locales" DROP COLUMN IF EXISTS "guest_pass_welcome";`)
}
