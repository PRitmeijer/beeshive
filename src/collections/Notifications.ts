import type { CollectionConfig } from "payload";

export const Notifications: CollectionConfig = {
  slug: "notifications",
  labels: {
    singular: "Melding",
    plural: "Meldingen",
  },
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "type", "active", "startDate", "endDate"],
    description:
      "Meldingen verschijnen als banner bovenaan de website. Gebruik ze voor aanbiedingen, evenementen of belangrijke berichten.",
    group: "Website",
  },
  fields: [
    {
      name: "title",
      label: "Titel",
      type: "text",
      required: true,
      admin: {
        description: "Korte, opvallende titel voor de melding",
      },
    },
    {
      name: "message",
      label: "Bericht",
      type: "textarea",
      required: true,
      admin: {
        description: "Het volledige bericht dat bezoekers zien",
      },
    },
    {
      type: "row",
      fields: [
        {
          name: "type",
          label: "Type",
          type: "select",
          options: [
            { label: "ℹ️ Informatie", value: "info" },
            { label: "🏷️ Aanbieding", value: "offer" },
            { label: "🎉 Evenement", value: "event" },
            { label: "⚠️ Belangrijk", value: "important" },
          ],
          required: true,
          defaultValue: "info",
          admin: {
            width: "50%",
            description: "Bepaalt de kleur van de banner",
          },
        },
        {
          name: "dismissible",
          label: "Wegklikbaar",
          type: "checkbox",
          defaultValue: true,
          admin: {
            width: "50%",
            description: "Kunnen bezoekers de melding sluiten?",
          },
        },
      ],
    },
    {
      name: "link",
      label: "Link (optioneel)",
      type: "text",
      admin: {
        description:
          "URL naar meer informatie, bijv. een blogpost of externe pagina",
      },
    },
    {
      type: "row",
      fields: [
        {
          name: "startDate",
          label: "Startdatum",
          type: "date",
          admin: {
            width: "50%",
            description: "Vanaf wanneer is de melding zichtbaar?",
            date: { pickerAppearance: "dayOnly" },
          },
        },
        {
          name: "endDate",
          label: "Einddatum",
          type: "date",
          admin: {
            width: "50%",
            description: "Tot wanneer is de melding zichtbaar?",
            date: { pickerAppearance: "dayOnly" },
          },
        },
      ],
    },
    {
      name: "active",
      label: "Actief",
      type: "checkbox",
      defaultValue: true,
      admin: {
        position: "sidebar",
        description: "Zet uit om de melding tijdelijk te verbergen",
      },
    },
  ],
};
