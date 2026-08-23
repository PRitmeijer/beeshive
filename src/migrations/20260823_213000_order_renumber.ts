import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Give the rows that already exist real sequence numbers.
 *
 * Everything created before the previous migration carries `order = 0`, from
 * the default the four ordered collections used to share. Zero for every row
 * means the sort key distinguishes nothing, so the card fell back to its
 * tiebreaker and came out alphabetical — which is not an order anybody chose.
 *
 * Left alone it would also split in two: the rows already here stuck at zero
 * and sorting first, and everything added from now on numbered from ten up and
 * sorting after them, whatever the owners actually wanted.
 *
 * So: ten, twenty, thirty, in the sequence they are in now — by `order` where
 * somebody did set one, and by id otherwise, which is the sequence they were
 * added in. Not alphabetical: the order things were entered is a decision
 * somebody made, and the alphabet is not.
 */

const TABLES = [
  'menu_categories',
  'menu_items',
  'gallery_categories',
  'gallery_images',
] as const

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const table of TABLES) {
    await db.execute(sql`
      WITH ranked AS (
        SELECT id, (ROW_NUMBER() OVER (ORDER BY "order" NULLS LAST, id)) * 10 AS new_order
        FROM ${sql.identifier(table)}
      )
      UPDATE ${sql.identifier(table)} AS t
      SET "order" = ranked.new_order
      FROM ranked
      WHERE t.id = ranked.id;
    `)
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Nothing to undo that would be honest. Putting every row back to zero would
  // restore the bug rather than the data, and the numbers this wrote are the
  // sequence the rows were already in.
}
