import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."_locales" AS ENUM('nl', 'en');
  CREATE TYPE "public"."enum_users_role" AS ENUM('admin', 'editor');
  CREATE TYPE "public"."enum_blog_posts_category" AS ENUM('news', 'recipes', 'events', 'stories', 'tips');
  CREATE TYPE "public"."enum_blog_posts_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_events_recurrence_type" AS ENUM('none', 'weekly', 'biweekly', 'monthlyWeekday', 'monthlyDate');
  CREATE TYPE "public"."enum_events_recurrence_weekday" AS ENUM('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday');
  CREATE TYPE "public"."enum_events_recurrence_ordinal" AS ENUM('first', 'second', 'third', 'fourth', 'last');
  CREATE TYPE "public"."enum_events_category" AS ENUM('buurt', 'muziek', 'workshop', 'proeverij', 'feest', 'overig');
  CREATE TYPE "public"."enum_events_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_menu_items_dietary" AS ENUM('vegetarian', 'vegan', 'gluten-free', 'dairy-free', 'nut-free', 'contains-fish');
  CREATE TYPE "public"."enum_menu_items_spicy_level" AS ENUM('none', 'mild', 'medium', 'hot');
  CREATE TYPE "public"."enum_notifications_type" AS ENUM('info', 'offer', 'event', 'important');
  CREATE TYPE "public"."enum_notifications_display_mode" AS ENUM('banner', 'popup');
  CREATE TYPE "public"."enum_reservations_status" AS ENUM('nieuw', 'gebeld', 'bevestigd', 'geannuleerd');
  CREATE TYPE "public"."enum_reservations_email_status" AS ENUM('pending', 'sent', 'failed', 'skipped');
  CREATE TYPE "public"."enum_contact_messages_status" AS ENUM('nieuw', 'beantwoord', 'gearchiveerd');
  CREATE TYPE "public"."enum_contact_messages_email_status" AS ENUM('pending', 'sent', 'failed', 'skipped');
  CREATE TYPE "public"."enum_site_settings_recurring_openings_ordinal" AS ENUM('first', 'second', 'third', 'fourth', 'last');
  CREATE TYPE "public"."enum_site_settings_recurring_openings_weekday" AS ENUM('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday');
  CREATE TYPE "public"."enum_site_settings_hero_images_focal_point" AS ENUM('center', 'top', 'bottom', 'left', 'right');
  CREATE TABLE IF NOT EXISTS "users" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"role" "enum_users_role" DEFAULT 'editor' NOT NULL,
  	"avatar_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  CREATE TABLE IF NOT EXISTS "media" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric,
  	"sizes_thumbnail_url" varchar,
  	"sizes_thumbnail_width" numeric,
  	"sizes_thumbnail_height" numeric,
  	"sizes_thumbnail_mime_type" varchar,
  	"sizes_thumbnail_filesize" numeric,
  	"sizes_thumbnail_filename" varchar,
  	"sizes_card_url" varchar,
  	"sizes_card_width" numeric,
  	"sizes_card_height" numeric,
  	"sizes_card_mime_type" varchar,
  	"sizes_card_filesize" numeric,
  	"sizes_card_filename" varchar,
  	"sizes_hero_url" varchar,
  	"sizes_hero_width" numeric,
  	"sizes_hero_height" numeric,
  	"sizes_hero_mime_type" varchar,
  	"sizes_hero_filesize" numeric,
  	"sizes_hero_filename" varchar,
  	"sizes_og_url" varchar,
  	"sizes_og_width" numeric,
  	"sizes_og_height" numeric,
  	"sizes_og_mime_type" varchar,
  	"sizes_og_filesize" numeric,
  	"sizes_og_filename" varchar
  );
  
  CREATE TABLE IF NOT EXISTS "media_locales" (
  	"alt" varchar NOT NULL,
  	"caption" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "blog_posts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"slug" varchar NOT NULL,
  	"featured_image_id" integer,
  	"category" "enum_blog_posts_category",
  	"status" "enum_blog_posts_status" DEFAULT 'draft' NOT NULL,
  	"published_date" timestamp(3) with time zone,
  	"author_id" integer,
  	"meta_image_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "blog_posts_locales" (
  	"title" varchar NOT NULL,
  	"excerpt" varchar NOT NULL,
  	"content" jsonb NOT NULL,
  	"meta_title" varchar,
  	"meta_description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "blog_posts_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE IF NOT EXISTS "events_recurrence_skip_dates" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"date" timestamp(3) with time zone
  );
  
  CREATE TABLE IF NOT EXISTS "events" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"image_id" integer,
  	"start_date" timestamp(3) with time zone NOT NULL,
  	"end_date" timestamp(3) with time zone,
  	"all_day" boolean DEFAULT false,
  	"recurrence_type" "enum_events_recurrence_type" DEFAULT 'none',
  	"recurrence_weekday" "enum_events_recurrence_weekday",
  	"recurrence_ordinal" "enum_events_recurrence_ordinal",
  	"recurrence_until" timestamp(3) with time zone,
  	"booking_required" boolean DEFAULT false,
  	"booking_url" varchar,
  	"category" "enum_events_category" DEFAULT 'overig',
  	"slug" varchar NOT NULL,
  	"status" "enum_events_status" DEFAULT 'draft' NOT NULL,
  	"featured" boolean DEFAULT false,
  	"meta_image_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "events_locales" (
  	"title" varchar NOT NULL,
  	"excerpt" varchar NOT NULL,
  	"description" jsonb,
  	"location" varchar,
  	"price" varchar,
  	"booking_note" varchar,
  	"meta_title" varchar,
  	"meta_description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "gallery_images" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"image_id" integer NOT NULL,
  	"category_id" integer NOT NULL,
  	"featured" boolean DEFAULT false,
  	"order" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "gallery_images_locales" (
  	"title" varchar NOT NULL,
  	"description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "gallery_categories" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "gallery_categories_locales" (
  	"name" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "menu_items_dietary" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_menu_items_dietary",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "menu_items" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"price" numeric NOT NULL,
  	"category_id" integer NOT NULL,
  	"spicy_level" "enum_menu_items_spicy_level",
  	"image_id" integer,
  	"featured" boolean DEFAULT false,
  	"seasonal" boolean DEFAULT false,
  	"new_item" boolean DEFAULT false,
  	"available" boolean DEFAULT true,
  	"order" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "menu_items_locales" (
  	"name" varchar NOT NULL,
  	"description" varchar,
  	"allergens" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "menu_categories" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"icon" varchar,
  	"order" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "menu_categories_locales" (
  	"name" varchar NOT NULL,
  	"description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "notifications" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"type" "enum_notifications_type" DEFAULT 'info' NOT NULL,
  	"dismissible" boolean DEFAULT true,
  	"display_mode" "enum_notifications_display_mode" DEFAULT 'banner',
  	"link" varchar,
  	"start_date" timestamp(3) with time zone,
  	"end_date" timestamp(3) with time zone,
  	"active" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "notifications_locales" (
  	"title" varchar NOT NULL,
  	"message" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "mailing_list" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"email" varchar NOT NULL,
  	"name" varchar,
  	"subscribed_at" timestamp(3) with time zone,
  	"active" boolean DEFAULT true,
  	"notes" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "reservations_guest_responses" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"added_at" timestamp(3) with time zone,
  	"dietary" varchar,
  	"drinks" varchar
  );
  
  CREATE TABLE IF NOT EXISTS "reservations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"email" varchar NOT NULL,
  	"phone" varchar NOT NULL,
  	"guests" numeric NOT NULL,
  	"date" timestamp(3) with time zone NOT NULL,
  	"time" varchar NOT NULL,
  	"duration" numeric,
  	"notes" varchar,
  	"occasion" varchar,
  	"status" "enum_reservations_status" DEFAULT 'nieuw',
  	"email_status" "enum_reservations_email_status" DEFAULT 'pending',
  	"email_error" varchar,
  	"email_sent_at" timestamp(3) with time zone,
  	"guest_token" varchar,
  	"source" varchar DEFAULT 'website',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "contact_messages" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"email" varchar NOT NULL,
  	"message" varchar NOT NULL,
  	"notes" varchar,
  	"status" "enum_contact_messages_status" DEFAULT 'nieuw',
  	"email_status" "enum_contact_messages_email_status" DEFAULT 'pending',
  	"email_error" varchar,
  	"email_sent_at" timestamp(3) with time zone,
  	"locale" varchar,
  	"source" varchar DEFAULT 'website',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "opening_exceptions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"date" timestamp(3) with time zone NOT NULL,
  	"closed" boolean DEFAULT false,
  	"show_on_site" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "opening_exceptions_locales" (
  	"hours" varchar,
  	"note" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "payload_locked_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"global_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "payload_locked_documents_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer,
  	"media_id" integer,
  	"blog_posts_id" integer,
  	"events_id" integer,
  	"gallery_images_id" integer,
  	"gallery_categories_id" integer,
  	"menu_items_id" integer,
  	"menu_categories_id" integer,
  	"notifications_id" integer,
  	"mailing_list_id" integer,
  	"reservations_id" integer,
  	"contact_messages_id" integer,
  	"opening_exceptions_id" integer
  );
  
  CREATE TABLE IF NOT EXISTS "payload_preferences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"value" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "payload_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  CREATE TABLE IF NOT EXISTS "payload_migrations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"batch" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "site_settings_opening_hours" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "site_settings_opening_hours_locales" (
  	"day" varchar NOT NULL,
  	"hours" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "site_settings_recurring_openings" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"ordinal" "enum_site_settings_recurring_openings_ordinal" DEFAULT 'last' NOT NULL,
  	"weekday" "enum_site_settings_recurring_openings_weekday" DEFAULT 'sunday' NOT NULL,
  	"closed" boolean DEFAULT false
  );
  
  CREATE TABLE IF NOT EXISTS "site_settings_recurring_openings_locales" (
  	"hours" varchar,
  	"note" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "site_settings_hero_images" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"image_id" integer NOT NULL,
  	"zoom" numeric DEFAULT 100,
  	"focal_point" "enum_site_settings_hero_images_focal_point" DEFAULT 'center'
  );
  
  CREATE TABLE IF NOT EXISTS "site_settings_hero_images_locales" (
  	"caption" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "site_settings_guest_pass_drinks" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "site_settings_guest_pass_drinks_locales" (
  	"label" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "site_settings_guest_pass_dietary" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "site_settings_guest_pass_dietary_locales" (
  	"label" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "site_settings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"site_name" varchar DEFAULT 'De Bee''''s Hive' NOT NULL,
  	"cuisines" varchar DEFAULT 'Dutch, International, South African',
  	"price_range" varchar DEFAULT '€€',
  	"reservation_url" varchar,
  	"contact_email" varchar DEFAULT 'info@debeeshive.nl',
  	"phone" varchar DEFAULT '030 785 2199',
  	"address_street" varchar,
  	"address_city" varchar DEFAULT 'Utrecht',
  	"address_area" varchar DEFAULT 'Zuilen',
  	"address_postal_code" varchar,
  	"address_country" varchar DEFAULT 'Nederland',
  	"address_country_code" varchar DEFAULT 'NL',
  	"google_maps_embed_url" varchar DEFAULT 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2450.3781318959013!2d5.086582076321947!3d52.10924836655966!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x47c66f402cf74da3%3A0xf5db732de51fc331!2sDe%20Bee%27s%20Hive!5e0!3m2!1snl!2snl!4v1756807839954!5m2!1snl!2snl',
  	"google_review_url" varchar DEFAULT 'https://maps.app.goo.gl/6VEMHL3Jq9vgAWnw8',
  	"social_media_instagram" varchar DEFAULT 'https://www.instagram.com/debeeshive',
  	"social_media_facebook" varchar DEFAULT 'https://www.facebook.com/people/De-Bees-Hive/61573726474222',
  	"social_media_tripadvisor" varchar,
  	"about_image_id" integer,
  	"about_video_url" varchar,
  	"reservations_enabled" boolean DEFAULT true,
  	"reservation_duration_minutes" numeric DEFAULT 120,
  	"reservation_capacity" numeric DEFAULT 40,
  	"reservation_max_party_size" numeric DEFAULT 20,
  	"reservation_lead_minutes" numeric DEFAULT 60,
  	"reservation_horizon_days" numeric DEFAULT 90,
  	"guest_pass_enabled" boolean DEFAULT true,
  	"share_image_id" integer,
  	"share_image_auto" boolean DEFAULT true,
  	"umami_enabled" boolean DEFAULT false,
  	"umami_script_url" varchar DEFAULT 'https://cloud.umami.is/script.js',
  	"umami_website_id" varchar,
  	"umami_host_url" varchar,
  	"umami_api_key" varchar,
  	"umami_do_not_track_admin" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE IF NOT EXISTS "site_settings_locales" (
  	"description" varchar DEFAULT 'Een warm eetcafé in het hart van Zuilen waar creativiteit, verbinding en lekker eten samenkomen.',
  	"keywords" varchar,
  	"opening_hours_note" varchar,
  	"hero_title" varchar DEFAULT 'De Bee''''s Hive',
  	"hero_subtitle" varchar DEFAULT 'Waar eten en creativiteit samenkomen. Een warm eetcafé in het hart van Zuilen.',
  	"newsletter_title" varchar DEFAULT 'Schrijf je in',
  	"newsletter_text" varchar DEFAULT 'Ontvang als eerste nieuws over speciale evenementen, nieuwe gerechten en aanbiedingen.',
  	"newsletter_privacy_note" varchar DEFAULT 'Hooguit een mail per maand, nooit spam, en uitschrijven kan met een klik.',
  	"about_intro" varchar DEFAULT 'De Bee''''s Hive is meer dan een restaurant. Het is een plek waar kunst, creativiteit en lekker eten samenkomen in het hart van Zuilen, Utrecht.',
  	"about_story" jsonb,
  	"about_media_caption" varchar,
  	"share_title" varchar,
  	"share_description" varchar,
  	"footer_tagline" varchar DEFAULT 'Gemaakt met liefde in Zuilen',
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  DO $$ BEGIN
   ALTER TABLE "users" ADD CONSTRAINT "users_avatar_id_media_id_fk" FOREIGN KEY ("avatar_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "media_locales" ADD CONSTRAINT "media_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "blog_posts" ADD CONSTRAINT "blog_posts_featured_image_id_media_id_fk" FOREIGN KEY ("featured_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "blog_posts" ADD CONSTRAINT "blog_posts_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "blog_posts" ADD CONSTRAINT "blog_posts_meta_image_id_media_id_fk" FOREIGN KEY ("meta_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "blog_posts_locales" ADD CONSTRAINT "blog_posts_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."blog_posts"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "blog_posts_texts" ADD CONSTRAINT "blog_posts_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."blog_posts"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "events_recurrence_skip_dates" ADD CONSTRAINT "events_recurrence_skip_dates_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "events" ADD CONSTRAINT "events_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "events" ADD CONSTRAINT "events_meta_image_id_media_id_fk" FOREIGN KEY ("meta_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "events_locales" ADD CONSTRAINT "events_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "gallery_images" ADD CONSTRAINT "gallery_images_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "gallery_images" ADD CONSTRAINT "gallery_images_category_id_gallery_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."gallery_categories"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "gallery_images_locales" ADD CONSTRAINT "gallery_images_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."gallery_images"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "gallery_categories_locales" ADD CONSTRAINT "gallery_categories_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."gallery_categories"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "menu_items_dietary" ADD CONSTRAINT "menu_items_dietary_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."menu_items"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_category_id_menu_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."menu_categories"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "menu_items_locales" ADD CONSTRAINT "menu_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."menu_items"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "menu_categories_locales" ADD CONSTRAINT "menu_categories_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."menu_categories"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "notifications_locales" ADD CONSTRAINT "notifications_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "reservations_guest_responses" ADD CONSTRAINT "reservations_guest_responses_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."reservations"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "opening_exceptions_locales" ADD CONSTRAINT "opening_exceptions_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."opening_exceptions"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_blog_posts_fk" FOREIGN KEY ("blog_posts_id") REFERENCES "public"."blog_posts"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_events_fk" FOREIGN KEY ("events_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_gallery_images_fk" FOREIGN KEY ("gallery_images_id") REFERENCES "public"."gallery_images"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_gallery_categories_fk" FOREIGN KEY ("gallery_categories_id") REFERENCES "public"."gallery_categories"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_menu_items_fk" FOREIGN KEY ("menu_items_id") REFERENCES "public"."menu_items"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_menu_categories_fk" FOREIGN KEY ("menu_categories_id") REFERENCES "public"."menu_categories"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_notifications_fk" FOREIGN KEY ("notifications_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_mailing_list_fk" FOREIGN KEY ("mailing_list_id") REFERENCES "public"."mailing_list"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_reservations_fk" FOREIGN KEY ("reservations_id") REFERENCES "public"."reservations"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_contact_messages_fk" FOREIGN KEY ("contact_messages_id") REFERENCES "public"."contact_messages"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_opening_exceptions_fk" FOREIGN KEY ("opening_exceptions_id") REFERENCES "public"."opening_exceptions"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "site_settings_opening_hours" ADD CONSTRAINT "site_settings_opening_hours_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."site_settings"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "site_settings_opening_hours_locales" ADD CONSTRAINT "site_settings_opening_hours_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."site_settings_opening_hours"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "site_settings_recurring_openings" ADD CONSTRAINT "site_settings_recurring_openings_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."site_settings"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "site_settings_recurring_openings_locales" ADD CONSTRAINT "site_settings_recurring_openings_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."site_settings_recurring_openings"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "site_settings_hero_images" ADD CONSTRAINT "site_settings_hero_images_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "site_settings_hero_images" ADD CONSTRAINT "site_settings_hero_images_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."site_settings"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "site_settings_hero_images_locales" ADD CONSTRAINT "site_settings_hero_images_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."site_settings_hero_images"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "site_settings_guest_pass_drinks" ADD CONSTRAINT "site_settings_guest_pass_drinks_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."site_settings"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "site_settings_guest_pass_drinks_locales" ADD CONSTRAINT "site_settings_guest_pass_drinks_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."site_settings_guest_pass_drinks"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "site_settings_guest_pass_dietary" ADD CONSTRAINT "site_settings_guest_pass_dietary_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."site_settings"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "site_settings_guest_pass_dietary_locales" ADD CONSTRAINT "site_settings_guest_pass_dietary_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."site_settings_guest_pass_dietary"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_about_image_id_media_id_fk" FOREIGN KEY ("about_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_share_image_id_media_id_fk" FOREIGN KEY ("share_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "site_settings_locales" ADD CONSTRAINT "site_settings_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."site_settings"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  CREATE INDEX IF NOT EXISTS "users_avatar_idx" ON "users" USING btree ("avatar_id");
  CREATE INDEX IF NOT EXISTS "users_updated_at_idx" ON "users" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "users_created_at_idx" ON "users" USING btree ("created_at");
  CREATE UNIQUE INDEX IF NOT EXISTS "users_email_idx" ON "users" USING btree ("email");
  CREATE INDEX IF NOT EXISTS "media_updated_at_idx" ON "media" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "media_created_at_idx" ON "media" USING btree ("created_at");
  CREATE UNIQUE INDEX IF NOT EXISTS "media_filename_idx" ON "media" USING btree ("filename");
  CREATE INDEX IF NOT EXISTS "media_sizes_thumbnail_sizes_thumbnail_filename_idx" ON "media" USING btree ("sizes_thumbnail_filename");
  CREATE INDEX IF NOT EXISTS "media_sizes_card_sizes_card_filename_idx" ON "media" USING btree ("sizes_card_filename");
  CREATE INDEX IF NOT EXISTS "media_sizes_hero_sizes_hero_filename_idx" ON "media" USING btree ("sizes_hero_filename");
  CREATE INDEX IF NOT EXISTS "media_sizes_og_sizes_og_filename_idx" ON "media" USING btree ("sizes_og_filename");
  CREATE UNIQUE INDEX IF NOT EXISTS "media_locales_locale_parent_id_unique" ON "media_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX IF NOT EXISTS "blog_posts_slug_idx" ON "blog_posts" USING btree ("slug");
  CREATE INDEX IF NOT EXISTS "blog_posts_featured_image_idx" ON "blog_posts" USING btree ("featured_image_id");
  CREATE INDEX IF NOT EXISTS "blog_posts_author_idx" ON "blog_posts" USING btree ("author_id");
  CREATE INDEX IF NOT EXISTS "blog_posts_meta_meta_image_idx" ON "blog_posts" USING btree ("meta_image_id");
  CREATE INDEX IF NOT EXISTS "blog_posts_updated_at_idx" ON "blog_posts" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "blog_posts_created_at_idx" ON "blog_posts" USING btree ("created_at");
  CREATE UNIQUE INDEX IF NOT EXISTS "blog_posts_locales_locale_parent_id_unique" ON "blog_posts_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX IF NOT EXISTS "blog_posts_texts_order_parent_idx" ON "blog_posts_texts" USING btree ("order","parent_id");
  CREATE INDEX IF NOT EXISTS "events_recurrence_skip_dates_order_idx" ON "events_recurrence_skip_dates" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "events_recurrence_skip_dates_parent_id_idx" ON "events_recurrence_skip_dates" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "events_image_idx" ON "events" USING btree ("image_id");
  CREATE UNIQUE INDEX IF NOT EXISTS "events_slug_idx" ON "events" USING btree ("slug");
  CREATE INDEX IF NOT EXISTS "events_meta_meta_image_idx" ON "events" USING btree ("meta_image_id");
  CREATE INDEX IF NOT EXISTS "events_updated_at_idx" ON "events" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "events_created_at_idx" ON "events" USING btree ("created_at");
  CREATE UNIQUE INDEX IF NOT EXISTS "events_locales_locale_parent_id_unique" ON "events_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX IF NOT EXISTS "gallery_images_image_idx" ON "gallery_images" USING btree ("image_id");
  CREATE INDEX IF NOT EXISTS "gallery_images_category_idx" ON "gallery_images" USING btree ("category_id");
  CREATE INDEX IF NOT EXISTS "gallery_images_updated_at_idx" ON "gallery_images" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "gallery_images_created_at_idx" ON "gallery_images" USING btree ("created_at");
  CREATE UNIQUE INDEX IF NOT EXISTS "gallery_images_locales_locale_parent_id_unique" ON "gallery_images_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX IF NOT EXISTS "gallery_categories_updated_at_idx" ON "gallery_categories" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "gallery_categories_created_at_idx" ON "gallery_categories" USING btree ("created_at");
  CREATE UNIQUE INDEX IF NOT EXISTS "gallery_categories_locales_locale_parent_id_unique" ON "gallery_categories_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX IF NOT EXISTS "menu_items_dietary_order_idx" ON "menu_items_dietary" USING btree ("order");
  CREATE INDEX IF NOT EXISTS "menu_items_dietary_parent_idx" ON "menu_items_dietary" USING btree ("parent_id");
  CREATE INDEX IF NOT EXISTS "menu_items_category_idx" ON "menu_items" USING btree ("category_id");
  CREATE INDEX IF NOT EXISTS "menu_items_image_idx" ON "menu_items" USING btree ("image_id");
  CREATE INDEX IF NOT EXISTS "menu_items_updated_at_idx" ON "menu_items" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "menu_items_created_at_idx" ON "menu_items" USING btree ("created_at");
  CREATE UNIQUE INDEX IF NOT EXISTS "menu_items_locales_locale_parent_id_unique" ON "menu_items_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX IF NOT EXISTS "menu_categories_updated_at_idx" ON "menu_categories" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "menu_categories_created_at_idx" ON "menu_categories" USING btree ("created_at");
  CREATE UNIQUE INDEX IF NOT EXISTS "menu_categories_locales_locale_parent_id_unique" ON "menu_categories_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX IF NOT EXISTS "notifications_updated_at_idx" ON "notifications" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "notifications_created_at_idx" ON "notifications" USING btree ("created_at");
  CREATE UNIQUE INDEX IF NOT EXISTS "notifications_locales_locale_parent_id_unique" ON "notifications_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX IF NOT EXISTS "mailing_list_email_idx" ON "mailing_list" USING btree ("email");
  CREATE INDEX IF NOT EXISTS "mailing_list_updated_at_idx" ON "mailing_list" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "mailing_list_created_at_idx" ON "mailing_list" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "reservations_guest_responses_order_idx" ON "reservations_guest_responses" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "reservations_guest_responses_parent_id_idx" ON "reservations_guest_responses" USING btree ("_parent_id");
  CREATE UNIQUE INDEX IF NOT EXISTS "reservations_guest_token_idx" ON "reservations" USING btree ("guest_token");
  CREATE INDEX IF NOT EXISTS "reservations_updated_at_idx" ON "reservations" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "reservations_created_at_idx" ON "reservations" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "contact_messages_updated_at_idx" ON "contact_messages" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "contact_messages_created_at_idx" ON "contact_messages" USING btree ("created_at");
  CREATE UNIQUE INDEX IF NOT EXISTS "opening_exceptions_date_idx" ON "opening_exceptions" USING btree ("date");
  CREATE INDEX IF NOT EXISTS "opening_exceptions_updated_at_idx" ON "opening_exceptions" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "opening_exceptions_created_at_idx" ON "opening_exceptions" USING btree ("created_at");
  CREATE UNIQUE INDEX IF NOT EXISTS "opening_exceptions_locales_locale_parent_id_unique" ON "opening_exceptions_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_global_slug_idx" ON "payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_updated_at_idx" ON "payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_created_at_idx" ON "payload_locked_documents" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_users_id_idx" ON "payload_locked_documents_rels" USING btree ("users_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_media_id_idx" ON "payload_locked_documents_rels" USING btree ("media_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_blog_posts_id_idx" ON "payload_locked_documents_rels" USING btree ("blog_posts_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_events_id_idx" ON "payload_locked_documents_rels" USING btree ("events_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_gallery_images_id_idx" ON "payload_locked_documents_rels" USING btree ("gallery_images_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_gallery_categories_id_idx" ON "payload_locked_documents_rels" USING btree ("gallery_categories_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_menu_items_id_idx" ON "payload_locked_documents_rels" USING btree ("menu_items_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_menu_categories_id_idx" ON "payload_locked_documents_rels" USING btree ("menu_categories_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_notifications_id_idx" ON "payload_locked_documents_rels" USING btree ("notifications_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_mailing_list_id_idx" ON "payload_locked_documents_rels" USING btree ("mailing_list_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_reservations_id_idx" ON "payload_locked_documents_rels" USING btree ("reservations_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_contact_messages_id_idx" ON "payload_locked_documents_rels" USING btree ("contact_messages_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_opening_exceptions_id_idx" ON "payload_locked_documents_rels" USING btree ("opening_exceptions_id");
  CREATE INDEX IF NOT EXISTS "payload_preferences_key_idx" ON "payload_preferences" USING btree ("key");
  CREATE INDEX IF NOT EXISTS "payload_preferences_updated_at_idx" ON "payload_preferences" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "payload_preferences_created_at_idx" ON "payload_preferences" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "payload_preferences_rels_order_idx" ON "payload_preferences_rels" USING btree ("order");
  CREATE INDEX IF NOT EXISTS "payload_preferences_rels_parent_idx" ON "payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX IF NOT EXISTS "payload_preferences_rels_path_idx" ON "payload_preferences_rels" USING btree ("path");
  CREATE INDEX IF NOT EXISTS "payload_preferences_rels_users_id_idx" ON "payload_preferences_rels" USING btree ("users_id");
  CREATE INDEX IF NOT EXISTS "payload_migrations_updated_at_idx" ON "payload_migrations" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "payload_migrations_created_at_idx" ON "payload_migrations" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "site_settings_opening_hours_order_idx" ON "site_settings_opening_hours" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "site_settings_opening_hours_parent_id_idx" ON "site_settings_opening_hours" USING btree ("_parent_id");
  CREATE UNIQUE INDEX IF NOT EXISTS "site_settings_opening_hours_locales_locale_parent_id_unique" ON "site_settings_opening_hours_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX IF NOT EXISTS "site_settings_recurring_openings_order_idx" ON "site_settings_recurring_openings" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "site_settings_recurring_openings_parent_id_idx" ON "site_settings_recurring_openings" USING btree ("_parent_id");
  CREATE UNIQUE INDEX IF NOT EXISTS "site_settings_recurring_openings_locales_locale_parent_id_unique" ON "site_settings_recurring_openings_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX IF NOT EXISTS "site_settings_hero_images_order_idx" ON "site_settings_hero_images" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "site_settings_hero_images_parent_id_idx" ON "site_settings_hero_images" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "site_settings_hero_images_image_idx" ON "site_settings_hero_images" USING btree ("image_id");
  CREATE UNIQUE INDEX IF NOT EXISTS "site_settings_hero_images_locales_locale_parent_id_unique" ON "site_settings_hero_images_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX IF NOT EXISTS "site_settings_guest_pass_drinks_order_idx" ON "site_settings_guest_pass_drinks" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "site_settings_guest_pass_drinks_parent_id_idx" ON "site_settings_guest_pass_drinks" USING btree ("_parent_id");
  CREATE UNIQUE INDEX IF NOT EXISTS "site_settings_guest_pass_drinks_locales_locale_parent_id_unique" ON "site_settings_guest_pass_drinks_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX IF NOT EXISTS "site_settings_guest_pass_dietary_order_idx" ON "site_settings_guest_pass_dietary" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "site_settings_guest_pass_dietary_parent_id_idx" ON "site_settings_guest_pass_dietary" USING btree ("_parent_id");
  CREATE UNIQUE INDEX IF NOT EXISTS "site_settings_guest_pass_dietary_locales_locale_parent_id_unique" ON "site_settings_guest_pass_dietary_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX IF NOT EXISTS "site_settings_about_image_idx" ON "site_settings" USING btree ("about_image_id");
  CREATE INDEX IF NOT EXISTS "site_settings_share_image_idx" ON "site_settings" USING btree ("share_image_id");
  CREATE UNIQUE INDEX IF NOT EXISTS "site_settings_locales_locale_parent_id_unique" ON "site_settings_locales" USING btree ("_locale","_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "users" CASCADE;
  DROP TABLE "media" CASCADE;
  DROP TABLE "media_locales" CASCADE;
  DROP TABLE "blog_posts" CASCADE;
  DROP TABLE "blog_posts_locales" CASCADE;
  DROP TABLE "blog_posts_texts" CASCADE;
  DROP TABLE "events_recurrence_skip_dates" CASCADE;
  DROP TABLE "events" CASCADE;
  DROP TABLE "events_locales" CASCADE;
  DROP TABLE "gallery_images" CASCADE;
  DROP TABLE "gallery_images_locales" CASCADE;
  DROP TABLE "gallery_categories" CASCADE;
  DROP TABLE "gallery_categories_locales" CASCADE;
  DROP TABLE "menu_items_dietary" CASCADE;
  DROP TABLE "menu_items" CASCADE;
  DROP TABLE "menu_items_locales" CASCADE;
  DROP TABLE "menu_categories" CASCADE;
  DROP TABLE "menu_categories_locales" CASCADE;
  DROP TABLE "notifications" CASCADE;
  DROP TABLE "notifications_locales" CASCADE;
  DROP TABLE "mailing_list" CASCADE;
  DROP TABLE "reservations_guest_responses" CASCADE;
  DROP TABLE "reservations" CASCADE;
  DROP TABLE "contact_messages" CASCADE;
  DROP TABLE "opening_exceptions" CASCADE;
  DROP TABLE "opening_exceptions_locales" CASCADE;
  DROP TABLE "payload_locked_documents" CASCADE;
  DROP TABLE "payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload_preferences" CASCADE;
  DROP TABLE "payload_preferences_rels" CASCADE;
  DROP TABLE "payload_migrations" CASCADE;
  DROP TABLE "site_settings_opening_hours" CASCADE;
  DROP TABLE "site_settings_opening_hours_locales" CASCADE;
  DROP TABLE "site_settings_recurring_openings" CASCADE;
  DROP TABLE "site_settings_recurring_openings_locales" CASCADE;
  DROP TABLE "site_settings_hero_images" CASCADE;
  DROP TABLE "site_settings_hero_images_locales" CASCADE;
  DROP TABLE "site_settings_guest_pass_drinks" CASCADE;
  DROP TABLE "site_settings_guest_pass_drinks_locales" CASCADE;
  DROP TABLE "site_settings_guest_pass_dietary" CASCADE;
  DROP TABLE "site_settings_guest_pass_dietary_locales" CASCADE;
  DROP TABLE "site_settings" CASCADE;
  DROP TABLE "site_settings_locales" CASCADE;
  DROP TYPE "public"."_locales";
  DROP TYPE "public"."enum_users_role";
  DROP TYPE "public"."enum_blog_posts_category";
  DROP TYPE "public"."enum_blog_posts_status";
  DROP TYPE "public"."enum_events_recurrence_type";
  DROP TYPE "public"."enum_events_recurrence_weekday";
  DROP TYPE "public"."enum_events_recurrence_ordinal";
  DROP TYPE "public"."enum_events_category";
  DROP TYPE "public"."enum_events_status";
  DROP TYPE "public"."enum_menu_items_dietary";
  DROP TYPE "public"."enum_menu_items_spicy_level";
  DROP TYPE "public"."enum_notifications_type";
  DROP TYPE "public"."enum_notifications_display_mode";
  DROP TYPE "public"."enum_reservations_status";
  DROP TYPE "public"."enum_reservations_email_status";
  DROP TYPE "public"."enum_contact_messages_status";
  DROP TYPE "public"."enum_contact_messages_email_status";
  DROP TYPE "public"."enum_site_settings_recurring_openings_ordinal";
  DROP TYPE "public"."enum_site_settings_recurring_openings_weekday";
  DROP TYPE "public"."enum_site_settings_hero_images_focal_point";`)
}
