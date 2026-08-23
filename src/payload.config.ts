import { buildConfig } from "payload";
import type { CollectionSlug } from "payload";
import { postgresAdapter } from "@payloadcms/db-postgres";
import { s3Storage } from "@payloadcms/storage-s3";
import { seoPlugin } from "@payloadcms/plugin-seo";
import { nodemailerAdapter } from "@payloadcms/email-nodemailer";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";

import { Users } from "./collections/Users";
import { Media } from "./collections/Media";
import { BlogPosts } from "./collections/BlogPosts";
import { Events } from "./collections/Events";
import { GalleryImages } from "./collections/GalleryImages";
import { GalleryCategories } from "./collections/GalleryCategories";
import { MenuItems } from "./collections/MenuItems";
import { MenuCategories } from "./collections/MenuCategories";
import { Notifications } from "./collections/Notifications";
import { MailingList } from "./collections/MailingList";
import { Reservations } from "./collections/Reservations";
import { ContactMessages } from "./collections/ContactMessages";
import { OpeningExceptions } from "./collections/OpeningExceptions";
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
 * Cloudflare R2 is optional, and deliberately so.
 *
 * With the four variables set, uploads go to the bucket and the container
 * keeps no files of its own; without them the site writes to
 * `MEDIA_DIR`/`./media` exactly as it always has. That is what lets someone
 * clone the repository, run `npm run dev` and upload a photograph without an
 * account at Cloudflare, and it is why this check is a function of the
 * environment rather than of NODE_ENV: a staging container without a bucket
 * should degrade to disk rather than fail every upload.
 *
 * Media.ts has to know the same answer — a collection that keeps
 * `disableLocalStorage` off while the bucket is on would have Payload look for
 * files on a disk that no longer holds them. It repeats these two lines rather
 * than importing them, because this file already imports Media and the cycle
 * would resolve to `undefined` at exactly the wrong moment.
 */
/** Trailing slash trimmed once here so the joins below cannot double it. */
const r2PublicUrl = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");

export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_BUCKET &&
      process.env.R2_ENDPOINT &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY,
  );
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

/**
 * Where a document of each SEO-managed collection lives on the public site.
 *
 * The generated canonical URL is only ever as right as this map, so it is the
 * one place to change when a route is renamed. Note that the Dutch site keeps
 * the bare path and English lives under /en (see src/i18n/config.ts), which is
 * why the locale the editor is currently in is folded into the URL below.
 */
const publicPathByCollection: Record<string, string> = {
  "blog-posts": "blog",
  // Matches the hint on the Events collection's slug field: "het deel van de
  // URL na /evenementen/". If that page is ever moved, both have to move.
  events: "evenementen",
};

/**
 * The SEO plugin's "generate" buttons.
 *
 * They fill the fields once, from the document in front of the editor; the
 * owners can then overwrite anything. Everything here is therefore a starting
 * suggestion in plain Dutch rather than a rule — the titles are written to sit
 * under Google's ~60 character cut-off with the site name still attached, and
 * the descriptions are trimmed to something close to 160.
 */
const titleSuffix = " | De Bee's Hive";

function trimTo(value: string, max: number) {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  // Cut on a word boundary rather than mid-word: a description ending in
  // "seizoensgroe…" reads like a bug to the owners, who will then retype it.
  return `${clean.slice(0, max - 1).replace(/\s\S*$/, "")}…`;
}

export default buildConfig({
  admin: {
    user: Users.slug,
    meta: {
      titleSuffix,
    },
  },
  collections: [
    Users,
    Media,
    BlogPosts,
    Events,
    GalleryImages,
    GalleryCategories,
    MenuItems,
    MenuCategories,
    Notifications,
    MailingList,
    Reservations,
    ContactMessages,
    OpeningExceptions,
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
  plugins: [
    /**
     * Search-engine metadata for the two collections that have public detail
     * pages of their own.
     *
     * The plugin adds a `meta` group to each of them — meta.title,
     * meta.description, meta.image and (in this version) meta.keywords — and
     * with `tabbedUI` it moves the collection's own fields into a "Content"
     * tab and puts these behind an "SEO" tab beside it. That is a schema
     * change on both collections, so it needs a migration like any other.
     *
     * Every generated field is localised, which is the whole point: the Dutch
     * and the English page each carry their own title and description, and the
     * generate buttons read the document in the locale the editor is looking
     * at. `generateURL` folds the locale into the path for the same reason.
     */
    seoPlugin({
      collections: ["blog-posts", "events"] as CollectionSlug[],
      uploadsCollection: "media",
      tabbedUI: true,
      generateTitle: ({ doc }) => {
        const title = (doc as { title?: string })?.title || "";
        if (!title) return "De Bee's Hive";
        return `${trimTo(title, 60 - titleSuffix.length)}${titleSuffix}`;
      },
      generateDescription: ({ doc }) => {
        const d = doc as { excerpt?: string; summary?: string; intro?: string };
        // Events are another agent's collection and may spell their short text
        // differently; take whichever of the usual three is filled rather than
        // hard-coding one field name and generating empty descriptions.
        const source = d?.excerpt || d?.summary || d?.intro || "";
        return source ? trimTo(source, 160) : "";
      },
      generateImage: ({ doc }) => {
        // Whatever the page already shows at the top is the right share image;
        // the plugin stores a media id, and Media generates a 1200x630 `og`
        // size for exactly this.
        const d = doc as { featuredImage?: unknown; image?: unknown };
        const image = d?.featuredImage ?? d?.image;
        if (!image) return "";
        if (typeof image === "object" && image !== null && "id" in image) {
          return String((image as { id: unknown }).id);
        }
        return String(image);
      },
      generateURL: ({ doc, collectionSlug, locale }) => {
        const base = process.env.NEXT_PUBLIC_SITE_URL || "https://debeeshive.nl";
        const segment = publicPathByCollection[collectionSlug || ""] || "";
        const slug = (doc as { slug?: string })?.slug || "";
        const prefix = locale && locale !== "nl" ? `/${locale}` : "";
        return [base.replace(/\/$/, ""), prefix, segment && `/${segment}`, slug && `/${slug}`]
          .filter(Boolean)
          .join("");
      },
    }),
    /**
     * Uploads on Cloudflare R2, when there is an R2 to talk to.
     *
     * R2 speaks the S3 API, with two deviations the AWS SDK has to be told
     * about explicitly:
     *
     *   - `region: "auto"`. R2 buckets are not in a region — Cloudflare places
     *     the data itself — but the SDK refuses to sign a request without a
     *     region string, and any real AWS region name here ends up in the
     *     signature and is rejected. "auto" is the value Cloudflare documents.
     *   - `forcePathStyle: true`. The SDK's default is virtual-hosted style,
     *     `https://<bucket>.<endpoint>/<key>`, which for the R2 endpoint
     *     `https://<account>.r2.cloudflarestorage.com` produces a hostname
     *     that does not resolve. Path style keeps the bucket in the path,
     *     which is what the R2 endpoint expects.
     *
     * `enabled` is what makes the whole thing optional: with the plugin
     * disabled Payload falls back to its own local disk handling and nothing
     * else in the config has to change. Files are served to visitors from
     * R2_PUBLIC_URL (a custom domain or the bucket's public r2.dev address),
     * which is a Media/collection concern rather than the client's.
     */
    s3Storage({
      enabled: isR2Configured(),
      collections: {
        media: r2PublicUrl
          ? {
              // With a public address on the bucket — a custom domain, or the
              // r2.dev subdomain — visitors fetch the file straight from
              // Cloudflare. Without one, `media: true` leaves the URLs on
              // /api/media/file/..., which still works: Payload fetches the
              // object from R2 and streams it. That is one Node request per
              // photograph, on a server that has better things to do, so set
              // R2_PUBLIC_URL if the bucket is public.
              //
              // `disablePayloadAccessControl` has to go with it. Payload only
              // hands out the generated URL once it has stopped insisting on
              // serving the file through its own access-checked route, and
              // media in this CMS is public by definition — everything in it
              // is on a page anyone can load.
              disablePayloadAccessControl: true,
              generateFileURL: ({ filename, prefix }) =>
                [r2PublicUrl, prefix, filename].filter(Boolean).join("/"),
            }
          : true,
      },
      bucket: process.env.R2_BUCKET || "",
      config: {
        endpoint: process.env.R2_ENDPOINT || "",
        region: "auto",
        forcePathStyle: true,
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
        },
      },
    }),
  ],
  editor: lexicalEditor(),
  email: emailAdapter(),
  secret: payloadSecret(),
  typescript: {
    outputFile: path.resolve(dirname, "payload-types.ts"),
  },
  db: postgresAdapter({
    pool: {
      connectionString:
        process.env.DATABASE_URI ||
        "postgresql://beeshive:beeshive@localhost:5433/beeshive",
    },
    // Development may keep pushing the schema straight from the collections,
    // which is what makes local iteration quick. Production must not. Postgres
    // is kinder about this than SQLite was — it ALTERs a table rather than
    // rebuilding it — but the dangerous case is unchanged: drizzle compares the
    // collections to the live tables and will DROP a column it can no longer
    // account for, which is precisely what a field newly marked
    // `localized: true` looks like, its values not yet copied into the
    // `_locales` side table. It also decides on its own when a change needs a
    // destructive rewrite, and answers to nobody about it.
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
