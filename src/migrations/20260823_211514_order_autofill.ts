import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "gallery_images" ALTER COLUMN "order" DROP DEFAULT;
  ALTER TABLE "gallery_categories" ALTER COLUMN "order" DROP DEFAULT;
  ALTER TABLE "menu_items" ALTER COLUMN "order" DROP DEFAULT;
  ALTER TABLE "menu_categories" ALTER COLUMN "order" DROP DEFAULT;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "gallery_images" ALTER COLUMN "order" SET DEFAULT 0;
  ALTER TABLE "gallery_categories" ALTER COLUMN "order" SET DEFAULT 0;
  ALTER TABLE "menu_items" ALTER COLUMN "order" SET DEFAULT 0;
  ALTER TABLE "menu_categories" ALTER COLUMN "order" SET DEFAULT 0;`)
}
