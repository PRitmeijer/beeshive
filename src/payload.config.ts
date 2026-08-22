import { buildConfig } from "payload";
import { sqliteAdapter } from "@payloadcms/db-sqlite";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";

import { Users } from "./collections/Users";
import { Media } from "./collections/Media";
import { BlogPosts } from "./collections/BlogPosts";
import { GalleryImages } from "./collections/GalleryImages";
import { MenuItems } from "./collections/MenuItems";
import { MenuCategories } from "./collections/MenuCategories";
import { Notifications } from "./collections/Notifications";
import { MailingList } from "./collections/MailingList";
import { Reservations } from "./collections/Reservations";
import { Testimonials } from "./collections/Testimonials";
import { Events } from "./collections/Events";
import { TeamMembers } from "./collections/TeamMembers";
import { SiteSettings } from "./globals/SiteSettings";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

/**
 * Admin sessions are signed with this. A committed fallback would let anyone
 * who can read the repository forge one, so production has to fail loudly
 * instead of booting insecurely. Local development keeps a fixed throwaway so
 * nobody has to configure anything to run the site.
 */
function payloadSecret() {
  const fromEnv = process.env.PAYLOAD_SECRET;
  if (fromEnv) return fromEnv;
  // `next build` also runs with NODE_ENV=production, and the build has no
  // business needing a signing key. Only refuse to boot when actually serving.
  const building = process.env.NEXT_PHASE === "phase-production-build";
  if (process.env.NODE_ENV === "production" && !building) {
    throw new Error(
      "PAYLOAD_SECRET is niet gezet. Zet die environment-variabele voordat je deployt.",
    );
  }
  return "dev-only-insecure-secret";
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
    MenuItems,
    MenuCategories,
    Notifications,
    MailingList,
    Reservations,
    Testimonials,
    Events,
    TeamMembers,
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
  secret: payloadSecret(),
  typescript: {
    outputFile: path.resolve(dirname, "payload-types.ts"),
  },
  db: sqliteAdapter({
    client: {
      url: process.env.DATABASE_URI || "file:./database.db",
    },
  }),
  sharp,
  upload: {
    limits: {
      fileSize: 10000000, // 10MB
    },
  },
});
