import type { CollectionConfig } from "payload";

export const Events: CollectionConfig = {
  slug: "events",
  labels: {
    singular: "Evenement",
    plural: "Evenementen",
  },
  admin: {
    useAsTitle: "title",
    group: "Inhoud",
    description:
      "Beheer evenementen, specials en activiteiten. Deze worden op de homepage en evenementenpagina getoond.",
    defaultColumns: ["title", "date", "type", "active", "updatedAt"],
  },
  fields: [
    {
      name: "title",
      label: "Titel",
      type: "text",
      required: true,
    },
    {
      type: "row",
      fields: [
        {
          name: "type",
          label: "Type",
          type: "select",
          options: [
            { label: "🎉 Evenement", value: "event" },
            { label: "🍽️ Special", value: "special" },
            { label: "🎵 Live Muziek", value: "music" },
            { label: "🎨 Workshop", value: "workshop" },
            { label: "🥂 Feestdag", value: "holiday" },
          ],
          required: true,
          admin: { width: "50%" },
        },
        {
          name: "date",
          label: "Datum",
          type: "date",
          admin: {
            width: "50%",
            description: "Laat leeg voor doorlopende specials",
            date: { pickerAppearance: "dayOnly", displayFormat: "d MMMM yyyy" },
          },
        },
      ],
    },
    {
      name: "description",
      label: "Beschrijving",
      type: "textarea",
      required: true,
    },
    {
      name: "image",
      label: "Afbeelding",
      type: "upload",
      relationTo: "media",
    },
    {
      type: "row",
      fields: [
        {
          name: "active",
          label: "Actief",
          type: "checkbox",
          defaultValue: true,
          admin: { width: "50%" },
        },
        {
          name: "homepage",
          label: "Toon op homepage",
          type: "checkbox",
          defaultValue: false,
          admin: { width: "50%" },
        },
      ],
    },
    {
      name: "price",
      label: "Prijs",
      type: "text",
      admin: {
        description: "Bijv. '€15 p.p.' of 'Gratis'. Laat leeg als niet van toepassing.",
      },
    },
    {
      name: "link",
      label: "Link / Aanmelden URL",
      type: "text",
      admin: {
        description: "Optionele link voor aanmelding of meer info",
      },
    },
  ],
};
