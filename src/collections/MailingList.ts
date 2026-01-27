import type { CollectionConfig } from "payload";

export const MailingList: CollectionConfig = {
  slug: "mailing-list",
  admin: {
    useAsTitle: "email",
    defaultColumns: ["email", "name", "subscribedAt"],
  },
  fields: [
    {
      name: "email",
      type: "email",
      required: true,
      unique: true,
    },
    {
      name: "name",
      type: "text",
    },
    {
      name: "subscribedAt",
      type: "date",
      admin: {
        readOnly: true,
        position: "sidebar",
      },
    },
    {
      name: "active",
      type: "checkbox",
      defaultValue: true,
      admin: {
        position: "sidebar",
      },
    },
  ],
};
