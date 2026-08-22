import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`users\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`name\` text,
  	\`role\` text DEFAULT 'editor' NOT NULL,
  	\`avatar_id\` integer,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`email\` text NOT NULL,
  	\`reset_password_token\` text,
  	\`reset_password_expiration\` text,
  	\`salt\` text,
  	\`hash\` text,
  	\`login_attempts\` numeric DEFAULT 0,
  	\`lock_until\` text,
  	FOREIGN KEY (\`avatar_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`users_avatar_idx\` ON \`users\` (\`avatar_id\`);`)
  await db.run(sql`CREATE INDEX \`users_updated_at_idx\` ON \`users\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`users_created_at_idx\` ON \`users\` (\`created_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`users_email_idx\` ON \`users\` (\`email\`);`)
  await db.run(sql`CREATE TABLE \`media\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`url\` text,
  	\`thumbnail_u_r_l\` text,
  	\`filename\` text,
  	\`mime_type\` text,
  	\`filesize\` numeric,
  	\`width\` numeric,
  	\`height\` numeric,
  	\`focal_x\` numeric,
  	\`focal_y\` numeric,
  	\`sizes_thumbnail_url\` text,
  	\`sizes_thumbnail_width\` numeric,
  	\`sizes_thumbnail_height\` numeric,
  	\`sizes_thumbnail_mime_type\` text,
  	\`sizes_thumbnail_filesize\` numeric,
  	\`sizes_thumbnail_filename\` text,
  	\`sizes_card_url\` text,
  	\`sizes_card_width\` numeric,
  	\`sizes_card_height\` numeric,
  	\`sizes_card_mime_type\` text,
  	\`sizes_card_filesize\` numeric,
  	\`sizes_card_filename\` text,
  	\`sizes_hero_url\` text,
  	\`sizes_hero_width\` numeric,
  	\`sizes_hero_height\` numeric,
  	\`sizes_hero_mime_type\` text,
  	\`sizes_hero_filesize\` numeric,
  	\`sizes_hero_filename\` text
  );
  `)
  await db.run(sql`CREATE INDEX \`media_updated_at_idx\` ON \`media\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`media_created_at_idx\` ON \`media\` (\`created_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`media_filename_idx\` ON \`media\` (\`filename\`);`)
  await db.run(sql`CREATE INDEX \`media_sizes_thumbnail_sizes_thumbnail_filename_idx\` ON \`media\` (\`sizes_thumbnail_filename\`);`)
  await db.run(sql`CREATE INDEX \`media_sizes_card_sizes_card_filename_idx\` ON \`media\` (\`sizes_card_filename\`);`)
  await db.run(sql`CREATE INDEX \`media_sizes_hero_sizes_hero_filename_idx\` ON \`media\` (\`sizes_hero_filename\`);`)
  await db.run(sql`CREATE TABLE \`media_locales\` (
  	\`alt\` text NOT NULL,
  	\`caption\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`media_locales_locale_parent_id_unique\` ON \`media_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`blog_posts\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`slug\` text NOT NULL,
  	\`featured_image_id\` integer,
  	\`category\` text,
  	\`status\` text DEFAULT 'draft' NOT NULL,
  	\`published_date\` text,
  	\`author_id\` integer,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`featured_image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`author_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`blog_posts_slug_idx\` ON \`blog_posts\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`blog_posts_featured_image_idx\` ON \`blog_posts\` (\`featured_image_id\`);`)
  await db.run(sql`CREATE INDEX \`blog_posts_author_idx\` ON \`blog_posts\` (\`author_id\`);`)
  await db.run(sql`CREATE INDEX \`blog_posts_updated_at_idx\` ON \`blog_posts\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`blog_posts_created_at_idx\` ON \`blog_posts\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`blog_posts_locales\` (
  	\`title\` text NOT NULL,
  	\`excerpt\` text NOT NULL,
  	\`content\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`blog_posts\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`blog_posts_locales_locale_parent_id_unique\` ON \`blog_posts_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`blog_posts_texts\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer NOT NULL,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`text\` text,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`blog_posts\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`blog_posts_texts_order_parent_idx\` ON \`blog_posts_texts\` (\`order\`,\`parent_id\`);`)
  await db.run(sql`CREATE TABLE \`gallery_images\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`image_id\` integer NOT NULL,
  	\`category_id\` integer NOT NULL,
  	\`featured\` integer DEFAULT false,
  	\`order\` numeric DEFAULT 0,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`category_id\`) REFERENCES \`gallery_categories\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`gallery_images_image_idx\` ON \`gallery_images\` (\`image_id\`);`)
  await db.run(sql`CREATE INDEX \`gallery_images_category_idx\` ON \`gallery_images\` (\`category_id\`);`)
  await db.run(sql`CREATE INDEX \`gallery_images_updated_at_idx\` ON \`gallery_images\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`gallery_images_created_at_idx\` ON \`gallery_images\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`gallery_images_locales\` (
  	\`title\` text NOT NULL,
  	\`description\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`gallery_images\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`gallery_images_locales_locale_parent_id_unique\` ON \`gallery_images_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`gallery_categories\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` numeric DEFAULT 0,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`gallery_categories_updated_at_idx\` ON \`gallery_categories\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`gallery_categories_created_at_idx\` ON \`gallery_categories\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`gallery_categories_locales\` (
  	\`name\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`gallery_categories\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`gallery_categories_locales_locale_parent_id_unique\` ON \`gallery_categories_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`menu_items_dietary\` (
  	\`order\` integer NOT NULL,
  	\`parent_id\` integer NOT NULL,
  	\`value\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`menu_items\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`menu_items_dietary_order_idx\` ON \`menu_items_dietary\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`menu_items_dietary_parent_idx\` ON \`menu_items_dietary\` (\`parent_id\`);`)
  await db.run(sql`CREATE TABLE \`menu_items\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`price\` numeric NOT NULL,
  	\`category_id\` integer NOT NULL,
  	\`spicy_level\` text,
  	\`image_id\` integer,
  	\`featured\` integer DEFAULT false,
  	\`seasonal\` integer DEFAULT false,
  	\`new_item\` integer DEFAULT false,
  	\`available\` integer DEFAULT true,
  	\`order\` numeric DEFAULT 0,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`category_id\`) REFERENCES \`menu_categories\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`menu_items_category_idx\` ON \`menu_items\` (\`category_id\`);`)
  await db.run(sql`CREATE INDEX \`menu_items_image_idx\` ON \`menu_items\` (\`image_id\`);`)
  await db.run(sql`CREATE INDEX \`menu_items_updated_at_idx\` ON \`menu_items\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`menu_items_created_at_idx\` ON \`menu_items\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`menu_items_locales\` (
  	\`name\` text NOT NULL,
  	\`description\` text,
  	\`allergens\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`menu_items\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`menu_items_locales_locale_parent_id_unique\` ON \`menu_items_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`menu_categories\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`icon\` text,
  	\`order\` numeric DEFAULT 0,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`menu_categories_updated_at_idx\` ON \`menu_categories\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`menu_categories_created_at_idx\` ON \`menu_categories\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`menu_categories_locales\` (
  	\`name\` text NOT NULL,
  	\`description\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`menu_categories\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`menu_categories_locales_locale_parent_id_unique\` ON \`menu_categories_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`notifications\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`type\` text DEFAULT 'info' NOT NULL,
  	\`dismissible\` integer DEFAULT true,
  	\`display_mode\` text DEFAULT 'banner',
  	\`link\` text,
  	\`start_date\` text,
  	\`end_date\` text,
  	\`active\` integer DEFAULT true,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`notifications_updated_at_idx\` ON \`notifications\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`notifications_created_at_idx\` ON \`notifications\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`notifications_locales\` (
  	\`title\` text NOT NULL,
  	\`message\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`notifications\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`notifications_locales_locale_parent_id_unique\` ON \`notifications_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`mailing_list\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`email\` text NOT NULL,
  	\`name\` text,
  	\`subscribed_at\` text,
  	\`active\` integer DEFAULT true,
  	\`notes\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`mailing_list_email_idx\` ON \`mailing_list\` (\`email\`);`)
  await db.run(sql`CREATE INDEX \`mailing_list_updated_at_idx\` ON \`mailing_list\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`mailing_list_created_at_idx\` ON \`mailing_list\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`reservations\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	\`email\` text,
  	\`phone\` text NOT NULL,
  	\`guests\` numeric NOT NULL,
  	\`date\` text NOT NULL,
  	\`time\` text NOT NULL,
  	\`occasion\` text,
  	\`notes\` text,
  	\`status\` text DEFAULT 'nieuw',
  	\`source\` text DEFAULT 'website',
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`reservations_updated_at_idx\` ON \`reservations\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`reservations_created_at_idx\` ON \`reservations\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`payload_locked_documents\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`global_slug\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_global_slug_idx\` ON \`payload_locked_documents\` (\`global_slug\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_updated_at_idx\` ON \`payload_locked_documents\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_created_at_idx\` ON \`payload_locked_documents\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`payload_locked_documents_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`users_id\` integer,
  	\`media_id\` integer,
  	\`blog_posts_id\` integer,
  	\`gallery_images_id\` integer,
  	\`gallery_categories_id\` integer,
  	\`menu_items_id\` integer,
  	\`menu_categories_id\` integer,
  	\`notifications_id\` integer,
  	\`mailing_list_id\` integer,
  	\`reservations_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_locked_documents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`blog_posts_id\`) REFERENCES \`blog_posts\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`gallery_images_id\`) REFERENCES \`gallery_images\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`gallery_categories_id\`) REFERENCES \`gallery_categories\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`menu_items_id\`) REFERENCES \`menu_items\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`menu_categories_id\`) REFERENCES \`menu_categories\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`notifications_id\`) REFERENCES \`notifications\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`mailing_list_id\`) REFERENCES \`mailing_list\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`reservations_id\`) REFERENCES \`reservations\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_order_idx\` ON \`payload_locked_documents_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_parent_idx\` ON \`payload_locked_documents_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_path_idx\` ON \`payload_locked_documents_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_users_id_idx\` ON \`payload_locked_documents_rels\` (\`users_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_media_id_idx\` ON \`payload_locked_documents_rels\` (\`media_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_blog_posts_id_idx\` ON \`payload_locked_documents_rels\` (\`blog_posts_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_gallery_images_id_idx\` ON \`payload_locked_documents_rels\` (\`gallery_images_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_gallery_categories_id_idx\` ON \`payload_locked_documents_rels\` (\`gallery_categories_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_menu_items_id_idx\` ON \`payload_locked_documents_rels\` (\`menu_items_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_menu_categories_id_idx\` ON \`payload_locked_documents_rels\` (\`menu_categories_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_notifications_id_idx\` ON \`payload_locked_documents_rels\` (\`notifications_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_mailing_list_id_idx\` ON \`payload_locked_documents_rels\` (\`mailing_list_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_reservations_id_idx\` ON \`payload_locked_documents_rels\` (\`reservations_id\`);`)
  await db.run(sql`CREATE TABLE \`payload_preferences\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`key\` text,
  	\`value\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`payload_preferences_key_idx\` ON \`payload_preferences\` (\`key\`);`)
  await db.run(sql`CREATE INDEX \`payload_preferences_updated_at_idx\` ON \`payload_preferences\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`payload_preferences_created_at_idx\` ON \`payload_preferences\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`payload_preferences_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`users_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_preferences\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`payload_preferences_rels_order_idx\` ON \`payload_preferences_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`payload_preferences_rels_parent_idx\` ON \`payload_preferences_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_preferences_rels_path_idx\` ON \`payload_preferences_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`payload_preferences_rels_users_id_idx\` ON \`payload_preferences_rels\` (\`users_id\`);`)
  await db.run(sql`CREATE TABLE \`payload_migrations\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`name\` text,
  	\`batch\` numeric,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`payload_migrations_updated_at_idx\` ON \`payload_migrations\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`payload_migrations_created_at_idx\` ON \`payload_migrations\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`site_settings_opening_hours\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`site_settings\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`site_settings_opening_hours_order_idx\` ON \`site_settings_opening_hours\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`site_settings_opening_hours_parent_id_idx\` ON \`site_settings_opening_hours\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`site_settings_opening_hours_locales\` (
  	\`day\` text NOT NULL,
  	\`hours\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`site_settings_opening_hours\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`site_settings_opening_hours_locales_locale_parent_id_unique\` ON \`site_settings_opening_hours_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`site_settings\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`site_name\` text DEFAULT 'De Bee''''s Hive' NOT NULL,
  	\`cuisines\` text DEFAULT 'Dutch, International, South African',
  	\`price_range\` text DEFAULT '€€',
  	\`reservation_url\` text,
  	\`contact_email\` text DEFAULT 'info@debeeshive.nl',
  	\`phone\` text DEFAULT '030 785 2199',
  	\`address_street\` text,
  	\`address_city\` text DEFAULT 'Utrecht',
  	\`address_area\` text DEFAULT 'Zuilen',
  	\`address_postal_code\` text,
  	\`address_country\` text DEFAULT 'Nederland',
  	\`address_country_code\` text DEFAULT 'NL',
  	\`google_maps_embed_url\` text DEFAULT 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2450.3781318959013!2d5.086582076321947!3d52.10924836655966!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x47c66f402cf74da3%3A0xf5db732de51fc331!2sDe%20Bee%27s%20Hive!5e0!3m2!1snl!2snl!4v1756807839954!5m2!1snl!2snl',
  	\`google_review_url\` text DEFAULT 'https://maps.app.goo.gl/6VEMHL3Jq9vgAWnw8',
  	\`social_media_instagram\` text DEFAULT 'https://www.instagram.com/debeeshive',
  	\`social_media_facebook\` text DEFAULT 'https://www.facebook.com/people/De-Bees-Hive/61573726474222',
  	\`social_media_tripadvisor\` text,
  	\`about_image_id\` integer,
  	\`about_video_url\` text,
  	\`updated_at\` text,
  	\`created_at\` text,
  	FOREIGN KEY (\`about_image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`site_settings_about_image_idx\` ON \`site_settings\` (\`about_image_id\`);`)
  await db.run(sql`CREATE TABLE \`site_settings_locales\` (
  	\`description\` text DEFAULT 'Een warm eetcafé in het hart van Zuilen waar creativiteit, verbinding en lekker eten samenkomen.',
  	\`opening_hours_note\` text,
  	\`hero_title\` text DEFAULT 'De Bee''''s Hive',
  	\`hero_subtitle\` text DEFAULT 'Waar eten en creativiteit samenkomen. Een warm eetcafé in het hart van Zuilen.',
  	\`newsletter_title\` text DEFAULT 'Schrijf je in',
  	\`newsletter_text\` text DEFAULT 'Ontvang als eerste nieuws over speciale evenementen, nieuwe gerechten en aanbiedingen.',
  	\`about_intro\` text DEFAULT 'De Bee''''s Hive is meer dan een restaurant. Het is een plek waar kunst, creativiteit en lekker eten samenkomen in het hart van Zuilen, Utrecht.',
  	\`about_story\` text,
  	\`about_media_caption\` text,
  	\`footer_tagline\` text DEFAULT 'Gemaakt met liefde in Zuilen',
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`site_settings\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`site_settings_locales_locale_parent_id_unique\` ON \`site_settings_locales\` (\`_locale\`,\`_parent_id\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`users\`;`)
  await db.run(sql`DROP TABLE \`media\`;`)
  await db.run(sql`DROP TABLE \`media_locales\`;`)
  await db.run(sql`DROP TABLE \`blog_posts\`;`)
  await db.run(sql`DROP TABLE \`blog_posts_locales\`;`)
  await db.run(sql`DROP TABLE \`blog_posts_texts\`;`)
  await db.run(sql`DROP TABLE \`gallery_images\`;`)
  await db.run(sql`DROP TABLE \`gallery_images_locales\`;`)
  await db.run(sql`DROP TABLE \`gallery_categories\`;`)
  await db.run(sql`DROP TABLE \`gallery_categories_locales\`;`)
  await db.run(sql`DROP TABLE \`menu_items_dietary\`;`)
  await db.run(sql`DROP TABLE \`menu_items\`;`)
  await db.run(sql`DROP TABLE \`menu_items_locales\`;`)
  await db.run(sql`DROP TABLE \`menu_categories\`;`)
  await db.run(sql`DROP TABLE \`menu_categories_locales\`;`)
  await db.run(sql`DROP TABLE \`notifications\`;`)
  await db.run(sql`DROP TABLE \`notifications_locales\`;`)
  await db.run(sql`DROP TABLE \`mailing_list\`;`)
  await db.run(sql`DROP TABLE \`reservations\`;`)
  await db.run(sql`DROP TABLE \`payload_locked_documents\`;`)
  await db.run(sql`DROP TABLE \`payload_locked_documents_rels\`;`)
  await db.run(sql`DROP TABLE \`payload_preferences\`;`)
  await db.run(sql`DROP TABLE \`payload_preferences_rels\`;`)
  await db.run(sql`DROP TABLE \`payload_migrations\`;`)
  await db.run(sql`DROP TABLE \`site_settings_opening_hours\`;`)
  await db.run(sql`DROP TABLE \`site_settings_opening_hours_locales\`;`)
  await db.run(sql`DROP TABLE \`site_settings\`;`)
  await db.run(sql`DROP TABLE \`site_settings_locales\`;`)
}
