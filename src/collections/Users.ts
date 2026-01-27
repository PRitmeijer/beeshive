import type { CollectionConfig } from "payload";

export const Users: CollectionConfig = {
  slug: "users",
  labels: {
    singular: "Gebruiker",
    plural: "Gebruikers",
  },
  auth: true,
  admin: {
    useAsTitle: "email",
    group: "Systeem",
    description:
      "Beheer wie toegang heeft tot dit admin paneel. Admins kunnen alles doen, editors kunnen alleen inhoud beheren.",
  },
  fields: [
    {
      name: "name",
      label: "Naam",
      type: "text",
    },
    {
      name: "role",
      label: "Rol",
      type: "select",
      options: [
        { label: "🔑 Admin (volledige toegang)", value: "admin" },
        { label: "✏️ Editor (inhoud beheren)", value: "editor" },
      ],
      defaultValue: "editor",
      required: true,
      admin: {
        description: "Admins hebben volledige toegang, editors kunnen alleen inhoud bewerken",
      },
    },
    {
      name: "avatar",
      label: "Profielfoto",
      type: "upload",
      relationTo: "media",
    },
  ],
};
