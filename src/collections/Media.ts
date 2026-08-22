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
 */
const staticDir =
  process.env.MEDIA_DIR || path.resolve(dirname, "../../media");

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
    imageSizes: [
      { name: "thumbnail", width: 400, height: 300, position: "centre" },
      { name: "card", width: 768, height: 512, position: "centre" },
      { name: "hero", width: 1920, height: 1080, position: "centre" },
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
