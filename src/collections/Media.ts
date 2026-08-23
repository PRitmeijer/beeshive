import type { CollectionConfig } from "payload";
import path from "path";
import { fileURLToPath } from "url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Where the uploaded originals and their generated sizes are written.
 *
 * This must be absolute. A relative `staticDir` is resolved against the
 * process's working directory, not against this file, and the two are not the
 * same place in the two environments this runs in: from `/app` in the
 * container, "../media" resolved to `/media` — the distribution's own
 * root-level mount point, owned by root — so uploads failed with nothing more
 * useful than "There was a problem while uploading the file.", and any that
 * had succeeded would have been written outside the mounted volume and lost
 * on the next rebuild. In development it resolved to a `media` directory
 * beside the repository rather than inside it.
 *
 * MEDIA_DIR is set in docker-compose to the mounted volume. The fallback is
 * for `npm run dev`, and is the repository's own media directory.
 *
 * It stays here even when R2 is on: Payload still uses it as the scratch path
 * while sharp resizes an upload, and it is what the site falls back to the
 * moment the bucket variables are removed again.
 */
const staticDir =
  process.env.MEDIA_DIR || path.resolve(dirname, "../../media");

/**
 * The same "is there a bucket" question src/payload.config.ts answers, asked
 * again rather than imported.
 *
 * The config imports this file, so importing the config back would close a
 * cycle whose resolution order is decided by whichever module Node happens to
 * load first — and the losing side gets `undefined` instead of a function. Two
 * duplicated lines are cheaper than that. If the list of variables ever
 * changes, change it in both places; the failure mode otherwise is that
 * uploads land in the bucket while Payload keeps looking for them on disk.
 */
const usingR2 = Boolean(
  process.env.R2_BUCKET &&
    process.env.R2_ENDPOINT &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY,
);

/**
 * Every generated size is re-encoded as WebP; the original the owners uploaded
 * is stored untouched, so nothing is ever lost to the conversion.
 *
 * Quality 78 is the point where a photograph of a plate stops getting visibly
 * better and only gets bigger — roughly a third of the equivalent JPEG for the
 * hero size, which is the single heaviest thing the home page loads.
 *
 * `og` is in here too. Facebook, LinkedIn and X all read WebP share cards now;
 * if some scraper ever turns out not to, that is the one size to hand a
 * `format: "jpeg"` instead, because it is the only one a stranger's server
 * fetches rather than a browser.
 */
const webp = { format: "webp" as const, options: { quality: 78 } };

export const Media: CollectionConfig = {
  slug: "media",
  labels: {
    singular: "Bestand",
    plural: "Media",
  },
  admin: {
    description:
      "Upload afbeeldingen die je kunt gebruiken in blogposts, de galerij, menukaart en andere plekken op de website.",
    group: "Systeem",
  },
  upload: {
    staticDir,
    // With R2 configured the files live in the bucket and nothing is written
    // to the container's disk, so Payload must not try to read them back from
    // there — an upload would appear to succeed and then 404. Without it, this
    // stays false and the site behaves exactly as it did before R2 existed.
    disableLocalStorage: usingR2,
    imageSizes: [
      { name: "thumbnail", width: 400, height: 300, position: "centre", formatOptions: webp },
      { name: "card", width: 768, height: 512, position: "centre", formatOptions: webp },
      { name: "hero", width: 1920, height: 1080, position: "centre", formatOptions: webp },
      // 1200x630 is what the social networks crop to; generating it here means
      // the SEO plugin's share image is already the right shape instead of
      // being letterboxed by whoever renders the card.
      { name: "og", width: 1200, height: 630, position: "centre", formatOptions: webp },
    ],
    adminThumbnail: "thumbnail",
    mimeTypes: ["image/*"],
  },
  fields: [
    {
      name: "alt",
      label: "Alt-tekst",
      type: "text",
      required: true,
      localized: true,
      admin: {
        description:
          "Beschrijf de afbeelding kort voor slechtzienden en zoekmachines, bijv. 'Gerecht met seizoensgroenten op een houten bord'",
      },
    },
    {
      name: "caption",
      label: "Bijschrift",
      type: "text",
      localized: true,
      admin: {
        description: "Optioneel bijschrift dat onder de afbeelding kan verschijnen",
      },
    },
  ],
};
