import type { CollectionConfig } from "payload";

export const GalleryImages: CollectionConfig = {
  slug: "gallery-images",
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "category", "order"],
  },
  fields: [
    {
      name: "title",
      type: "text",
      required: true,
    },
    {
      name: "image",
      type: "upload",
      relationTo: "media",
      required: true,
    },
    {
      name: "category",
      type: "select",
      options: [
        { label: "Restaurant", value: "restaurant" },
        { label: "Eten & Drinken", value: "food" },
        { label: "Evenementen", value: "events" },
        { label: "Sfeer", value: "ambiance" },
        { label: "Kunst", value: "art" },
      ],
      required: true,
    },
    {
      name: "description",
      type: "textarea",
    },
    {
      name: "order",
      type: "number",
      defaultValue: 0,
      admin: {
        position: "sidebar",
      },
    },
  ],
};
