import type { CollectionConfig } from "payload";

export const Testimonials: CollectionConfig = {
  slug: "testimonials",
  labels: {
    singular: "Review",
    plural: "Reviews",
  },
  admin: {
    useAsTitle: "author",
    group: "Inhoud",
    description:
      "Beheer klantbeoordelingen en reviews die op de website worden getoond.",
    defaultColumns: ["author", "rating", "featured", "updatedAt"],
  },
  fields: [
    {
      type: "row",
      fields: [
        {
          name: "author",
          label: "Naam",
          type: "text",
          required: true,
          admin: { width: "50%" },
        },
        {
          name: "rating",
          label: "⭐ Beoordeling",
          type: "select",
          options: [
            { label: "⭐⭐⭐⭐⭐ (5)", value: "5" },
            { label: "⭐⭐⭐⭐ (4)", value: "4" },
            { label: "⭐⭐⭐ (3)", value: "3" },
            { label: "⭐⭐ (2)", value: "2" },
            { label: "⭐ (1)", value: "1" },
          ],
          defaultValue: "5",
          required: true,
          admin: { width: "50%" },
        },
      ],
    },
    {
      name: "text",
      label: "Review Tekst",
      type: "textarea",
      required: true,
      localized: true,
    },
    {
      name: "source",
      label: "Bron",
      type: "select",
      options: [
        { label: "Google", value: "google" },
        { label: "TripAdvisor", value: "tripadvisor" },
        { label: "Instagram", value: "instagram" },
        { label: "Mondeling", value: "verbal" },
        { label: "Anders", value: "other" },
      ],
      admin: {
        description: "Waar komt deze review vandaan?",
      },
    },
    {
      name: "featured",
      label: "Uitgelicht op homepage",
      type: "checkbox",
      defaultValue: false,
      admin: {
        description: "Toon deze review op de homepage",
      },
    },
    {
      name: "avatar",
      label: "Foto",
      type: "upload",
      relationTo: "media",
    },
  ],
};
