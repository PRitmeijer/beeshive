import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "users_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "payload_kv" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"data" jsonb NOT NULL
  );
  
  DROP INDEX IF EXISTS "blog_posts_texts_order_parent_idx";
  DROP INDEX IF EXISTS "site_settings_recurring_openings_locales_locale_parent_id_unique";
  DROP INDEX IF EXISTS "site_settings_guest_pass_drinks_locales_locale_parent_id_unique";
  DROP INDEX IF EXISTS "site_settings_guest_pass_dietary_locales_locale_parent_id_unique";
  ALTER TABLE "site_settings" ALTER COLUMN "site_name" SET DEFAULT 'De Bee''s Hive';
  ALTER TABLE "users_sessions" ADD CONSTRAINT "users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "users_sessions_order_idx" ON "users_sessions" USING btree ("_order");
  CREATE INDEX "users_sessions_parent_id_idx" ON "users_sessions" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload_kv" USING btree ("key");
  CREATE INDEX "blog_posts_texts_order_parent" ON "blog_posts_texts" USING btree ("order","parent_id");
  CREATE UNIQUE INDEX "site_settings_recurring_openings_locales_locale_parent_id_un" ON "site_settings_recurring_openings_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "site_settings_guest_pass_drinks_locales_locale_parent_id_uni" ON "site_settings_guest_pass_drinks_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "site_settings_guest_pass_dietary_locales_locale_parent_id_un" ON "site_settings_guest_pass_dietary_locales" USING btree ("_locale","_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "users_sessions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload_kv" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "users_sessions" CASCADE;
  DROP TABLE "payload_kv" CASCADE;
  DROP INDEX IF EXISTS "blog_posts_texts_order_parent";
  DROP INDEX IF EXISTS "site_settings_recurring_openings_locales_locale_parent_id_un";
  DROP INDEX IF EXISTS "site_settings_guest_pass_drinks_locales_locale_parent_id_uni";
  DROP INDEX IF EXISTS "site_settings_guest_pass_dietary_locales_locale_parent_id_un";
  ALTER TABLE "site_settings" ALTER COLUMN "site_name" SET DEFAULT 'De Bee''''s Hive';
  CREATE INDEX "blog_posts_texts_order_parent_idx" ON "blog_posts_texts" USING btree ("order","parent_id");
  CREATE UNIQUE INDEX "site_settings_recurring_openings_locales_locale_parent_id_unique" ON "site_settings_recurring_openings_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "site_settings_guest_pass_drinks_locales_locale_parent_id_unique" ON "site_settings_guest_pass_drinks_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "site_settings_guest_pass_dietary_locales_locale_parent_id_unique" ON "site_settings_guest_pass_dietary_locales" USING btree ("_locale","_parent_id");`)
}
