import type { CollectionConfig } from "payload";

export const Notifications: CollectionConfig = {
  slug: "notifications",
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "type", "active", "startDate", "endDate"],
  },
  fields: [
    {
      name: "title",
      type: "text",
      required: true,
    },
    {
      name: "message",
      type: "textarea",
      required: true,
    },
    {
      name: "type",
      type: "select",
      options: [
        { label: "Info", value: "info" },
        { label: "Aanbieding", value: "offer" },
        { label: "Evenement", value: "event" },
        { label: "Belangrijk", value: "important" },
      ],
      required: true,
      defaultValue: "info",
    },
    {
      name: "link",
      type: "text",
      admin: {
        description: "Optionele link voor meer informatie",
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
    {
      name: "startDate",
      type: "date",
      admin: {
        position: "sidebar",
      },
    },
    {
      name: "endDate",
      type: "date",
      admin: {
        position: "sidebar",
      },
    },
    {
      name: "dismissible",
      type: "checkbox",
      defaultValue: true,
      admin: {
        position: "sidebar",
      },
    },
  ],
};
