import { buildConfig } from "payload";
import { sqliteAdapter } from "@payloadcms/db-sqlite";
import { nodemailerAdapter } from "@payloadcms/email-nodemailer";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";

import { Users } from "./collections/Users";
import { Media } from "./collections/Media";
import { BlogPosts } from "./collections/BlogPosts";
import { GalleryImages } from "./collections/GalleryImages";
import { GalleryCategories } from "./collections/GalleryCategories";
import { MenuItems } from "./collections/MenuItems";
import { MenuCategories } from "./collections/MenuCategories";
import { Notifications } from "./collections/Notifications";
import { MailingList } from "./collections/MailingList";
import { Reservations } from "./collections/Reservations";
import { SiteSettings } from "./globals/SiteSettings";
import { migrations } from "./migrations";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

/**
 * `next build` runs with NODE_ENV=production, so every "are we in production"
 * check in this file has to exclude it or the build inherits behaviour meant
 * for a running server. It does not need a signing key, and it must not touch
 * the schema: the pages read the CMS while they prerender, so anything Payload
 * does on connect happens inside a static worker with no terminal attached.
 */
const isBuild = process.env.NEXT_PHASE === "phase-production-build";
const isProduction = process.env.NODE_ENV === "production" && !isBuild;

/**
 * Admin sessions are signed with this. A committed fallback would let anyone
 * who can read the repository forge one, so production has to fail loudly
 * instead of booting insecurely. Local development keeps a fixed throwaway so
 * nobody has to configure anything to run the site.
 */
function payloadSecret() {
  const fromEnv = process.env.PAYLOAD_SECRET;
  if (fromEnv) return fromEnv;
  if (isProduction) {
    throw new Error(
      "PAYLOAD_SECRET is niet gezet. Zet die environment-variabele voordat je deployt.",
    );
  }
  return "dev-only-insecure-secret";
}

/**
 * Outgoing mail.
 *
 * Configured only when SMTP_HOST is set. Left unset, Payload keeps its own
 * default, which writes every message to the console — which is what you want
 * on a laptop, and is why /api/reserve treats a failed send as a warning
 * rather than as a failed booking.
 *
 * SMTP_SECURE is inferred from the port unless it is given: 465 is implicit
 * TLS, 587 upgrades with STARTTLS.
 */
function emailAdapter() {
  const host = process.env.SMTP_HOST;
  if (!host) return undefined;

  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  return nodemailerAdapter({
    defaultFromName: process.env.EMAIL_FROM_NAME || "De Bee's Hive",
    defaultFromAddress: process.env.EMAIL_FROM || "no-reply@debeeshive.nl",
    transportOptions: {
      host,
      port,
      secure: process.env.SMTP_SECURE
        ? process.env.SMTP_SECURE === "true"
        : port === 465,
      ...(user ? { auth: { user, pass } } : {}),
    },
  });
}

export default buildConfig({
  admin: {
    user: Users.slug,
    meta: {
      titleSuffix: " | De Bee's Hive",
    },
  },
  collections: [
    Users,
    Media,
    BlogPosts,
    GalleryImages,
    GalleryCategories,
    MenuItems,
    MenuCategories,
    Notifications,
    MailingList,
    Reservations,
  ],
  globals: [SiteSettings],
  // Dutch is the source language and the fallback: an English field left empty
  // in the admin serves its Dutch value rather than a hole in the page.
  localization: {
    locales: [
      { label: "Nederlands", code: "nl" },
      { label: "English", code: "en" },
    ],
    defaultLocale: "nl",
    fallback: true,
  },
  editor: lexicalEditor(),
  email: emailAdapter(),
  secret: payloadSecret(),
  typescript: {
    outputFile: path.resolve(dirname, "payload-types.ts"),
  },
  db: sqliteAdapter({
    client: {
      url: process.env.DATABASE_URI || "file:./database.db",
    },
    // Development may keep pushing the schema straight from the collections,
    // which is what makes local iteration quick. Production must not: a push
    // on SQLite rewrites tables in place and, for a field that has just been
    // made `localized: true`, drops the column before its values have moved
    // into the `_locales` side table. That is precisely the change this site
    // made when it went bilingual, and precisely the data it would have cost.
    push: !isProduction && !isBuild,
    migrationDir: path.resolve(dirname, "migrations"),
    // Production is driven by src/migrations instead, applied on connect. The
    // container is a standalone Next build with no Payload CLI in it, so there
    // is nowhere to run `payload migrate` from; importing the list here bundles
    // it with the server and Payload runs anything outstanding itself.
    //
    // Never during `next build`. Payload connects once per static worker there,
    // and against a database that was built by dev push it stops to ask on
    // stdin whether to migrate anyway. Nothing can answer, the worker sits at
    // "Collecting page data" until the 60 second export timeout fires three
    // times, and the build dies without ever naming the prompt as the cause.
    ...(isBuild ? {} : { prodMigrations: migrations }),
  }),
  sharp,
  upload: {
    limits: {
      fileSize: 10000000, // 10MB
    },
  },
});
