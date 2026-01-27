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
import { SiteSettings } from "./globals/SiteSettings";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

export default buildConfig({
  admin: {
    user: Users.slug,
    meta: {
      titleSuffix: " — De Bee's Hive",
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
  ],
  globals: [SiteSettings],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || "fallback-secret-change-me",
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
