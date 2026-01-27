import type { GlobalConfig } from "payload";

export const SiteSettings: GlobalConfig = {
  slug: "site-settings",
  label: "Site Instellingen",
  fields: [
    {
      name: "siteName",
      type: "text",
      defaultValue: "De Bee's Hive",
    },
    {
      name: "tagline",
      type: "text",
      defaultValue: "Waar eten en creativiteit samenkomen",
    },
    {
      name: "description",
      type: "textarea",
      defaultValue:
        "Een warm eetcafé in het hart van Zuilen waar creativiteit, verbinding en lekker eten samenkomen.",
    },
    {
      name: "contactEmail",
      type: "email",
      defaultValue: "info@debeeshive.nl",
    },
    {
      name: "phone",
      type: "text",
    },
    {
      name: "address",
      type: "textarea",
    },
    {
      name: "openingHours",
      type: "array",
      fields: [
        { name: "day", type: "text", required: true },
        { name: "hours", type: "text", required: true },
      ],
    },
    {
      name: "socialMedia",
      type: "group",
      fields: [
        { name: "instagram", type: "text" },
        { name: "facebook", type: "text" },
        { name: "tripadvisor", type: "text" },
      ],
    },
    {
      name: "heroImage",
      type: "upload",
      relationTo: "media",
    },
    {
      name: "logo",
      type: "upload",
      relationTo: "media",
    },
  ],
};
