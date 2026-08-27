import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/*
 * The guest's confirmation mail: its own three bookkeeping columns, plus the
 * language the guest booked in.
 *
 * The line to read twice is the DEFAULT on "confirmation_email_status". It
 * says 'skipped' and it must never say 'pending'. The owners' own notification
 * column next to it defaults to 'pending' because every reservation owes them
 * a mail the moment it arrives; a confirmation is owed to nobody until they
 * have confirmed something, so a 'pending' default would hand every row in
 * this table — the hundreds already sitting there, and every new booking
 * afterwards — a confirmation the owners never agreed to send.
 *
 * Postgres fills existing rows in when a column is added WITH a default, so
 * the backfill is already done by the ADD COLUMN above; the two UPDATEs are
 * there for the row that somehow arrives NULL anyway, because a NULL in either
 * column is a row that answers "what should I do?" with silence.
 *
 * One thing this migration deliberately does not do, and the deploy that runs
 * it is where the absence shows. Every existing row is backfilled to 'skipped',
 * the admin labels 'skipped' "Nog niet bevestigd" on this column, and the
 * column sits immediately beside Status in the list of reservations. So on the
 * morning after this runs, every booking the owners have ever confirmed — the
 * whole history of the place — reads "Bevestigd" in one column and "Nog niet
 * bevestigd" in the very next one. That is exactly the fortnight spent hunting
 * a breakage that the relabel was chosen to prevent.
 *
 * The tempting fix is to backfill the rows already at 'bevestigd' to 'sent'.
 * It is not taken, because it swaps the confusion for a lie. No confirmation
 * has ever been sent to any of those guests — the mail did not exist — and
 * 'sent' is the one word this column owns that says it was. It would be a
 * 'sent' with an empty "Bevestiging verstuurd op" beside it, and the first
 * owner who went looking for the mail they had supposedly sent would find
 * nothing, anywhere. The column would stop being a record of which guests were
 * actually written to, which is the only job it has.
 *
 * So the history keeps the true answer and the owners are told once instead,
 * in plain Dutch, in docs/wat-is-er-nieuw.md under Reserveren: on reservations
 * from before this, that second column says nobody has been mailed, because
 * nobody was. One honest sentence is cheaper than a column full of quiet
 * fiction, and it stops being relevant after the first evening of new bookings.
 *
 * The site_settings_locales statements are not part of this feature. They are
 * drift that had accumulated between the stored snapshot and the config, and
 * Payload folds whatever it finds into the next migration it writes. They only
 * remove database-level defaults on columns Payload always writes explicitly.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_reservations_locale" AS ENUM('nl', 'en');
  CREATE TYPE "public"."enum_reservations_confirmation_email_status" AS ENUM('pending', 'sent', 'failed', 'skipped');
  ALTER TABLE "site_settings_locales" ALTER COLUMN "description" DROP DEFAULT;
  ALTER TABLE "site_settings_locales" ALTER COLUMN "hero_title" DROP DEFAULT;
  ALTER TABLE "site_settings_locales" ALTER COLUMN "hero_subtitle" DROP DEFAULT;
  ALTER TABLE "site_settings_locales" ALTER COLUMN "newsletter_title" DROP DEFAULT;
  ALTER TABLE "site_settings_locales" ALTER COLUMN "newsletter_text" DROP DEFAULT;
  ALTER TABLE "site_settings_locales" ALTER COLUMN "newsletter_privacy_note" DROP DEFAULT;
  ALTER TABLE "site_settings_locales" ALTER COLUMN "about_intro" DROP DEFAULT;
  ALTER TABLE "site_settings_locales" ALTER COLUMN "footer_tagline" DROP DEFAULT;
  ALTER TABLE "reservations" ADD COLUMN "locale" "enum_reservations_locale" DEFAULT 'nl';
  ALTER TABLE "reservations" ADD COLUMN "confirmation_email_status" "enum_reservations_confirmation_email_status" DEFAULT 'skipped';
  ALTER TABLE "reservations" ADD COLUMN "confirmation_email_error" varchar;
  ALTER TABLE "reservations" ADD COLUMN "confirmation_email_sent_at" timestamp(3) with time zone;
  UPDATE "reservations" SET "confirmation_email_status" = 'skipped' WHERE "confirmation_email_status" IS NULL;
  UPDATE "reservations" SET "locale" = 'nl' WHERE "locale" IS NULL;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "site_settings_locales" ALTER COLUMN "description" SET DEFAULT 'Een warm eetcafé in het hart van Zuilen waar creativiteit, verbinding en lekker eten samenkomen.';
  ALTER TABLE "site_settings_locales" ALTER COLUMN "hero_title" SET DEFAULT 'De Bee''''s Hive';
  ALTER TABLE "site_settings_locales" ALTER COLUMN "hero_subtitle" SET DEFAULT 'Waar eten en creativiteit samenkomen. Een warm eetcafé in het hart van Zuilen.';
  ALTER TABLE "site_settings_locales" ALTER COLUMN "newsletter_title" SET DEFAULT 'Schrijf je in';
  ALTER TABLE "site_settings_locales" ALTER COLUMN "newsletter_text" SET DEFAULT 'Ontvang als eerste nieuws over speciale evenementen, nieuwe gerechten en aanbiedingen.';
  ALTER TABLE "site_settings_locales" ALTER COLUMN "newsletter_privacy_note" SET DEFAULT 'Hooguit een mail per maand, nooit spam, en uitschrijven kan met een klik.';
  ALTER TABLE "site_settings_locales" ALTER COLUMN "about_intro" SET DEFAULT 'De Bee''''s Hive is meer dan een restaurant. Het is een plek waar kunst, creativiteit en lekker eten samenkomen in het hart van Zuilen, Utrecht.';
  ALTER TABLE "site_settings_locales" ALTER COLUMN "footer_tagline" SET DEFAULT 'Gemaakt met liefde in Zuilen';
  ALTER TABLE "reservations" DROP COLUMN IF EXISTS "locale";
  ALTER TABLE "reservations" DROP COLUMN IF EXISTS "confirmation_email_status";
  ALTER TABLE "reservations" DROP COLUMN IF EXISTS "confirmation_email_error";
  ALTER TABLE "reservations" DROP COLUMN IF EXISTS "confirmation_email_sent_at";
  DROP TYPE "public"."enum_reservations_locale";
  DROP TYPE "public"."enum_reservations_confirmation_email_status";`)
}
