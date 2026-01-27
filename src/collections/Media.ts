import type { CollectionConfig } from "payload";

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
    staticDir: "../media",
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
      admin: {
        description:
          "Beschrijf de afbeelding kort voor slechtzienden en zoekmachines, bijv. 'Gerecht met seizoensgroenten op een houten bord'",
      },
    },
    {
      name: "caption",
      label: "Bijschrift",
      type: "text",
      admin: {
        description: "Optioneel bijschrift dat onder de afbeelding kan verschijnen",
      },
    },
  ],
};
