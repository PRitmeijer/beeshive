import type { CollectionConfig } from "payload";

export const MailingList: CollectionConfig = {
  slug: "mailing-list",
  labels: {
    singular: "Abonnee",
    plural: "Mailinglijst",
  },
  admin: {
    useAsTitle: "email",
    defaultColumns: ["email", "name", "subscribedAt", "active"],
    description:
      "Alle e-mailadressen van bezoekers die zich hebben aangemeld voor de nieuwsbrief. Exporteer deze lijst om nieuwsbrieven te versturen.",
    group: "Marketing",
  },
  fields: [
    {
      name: "email",
      label: "E-mailadres",
      type: "email",
      required: true,
      unique: true,
    },
    {
      name: "name",
      label: "Naam",
      type: "text",
    },
    {
      name: "subscribedAt",
      label: "Aangemeld op",
      type: "date",
      admin: {
        readOnly: true,
        position: "sidebar",
        date: { pickerAppearance: "dayAndTime" },
      },
    },
    {
      name: "active",
      label: "Actief",
      type: "checkbox",
      defaultValue: true,
      admin: {
        position: "sidebar",
        description: "Zet uit om iemand uit te schrijven zonder te verwijderen",
      },
    },
    {
      name: "notes",
      label: "Notities",
      type: "textarea",
      admin: {
        description: "Interne notities over deze abonnee",
      },
    },
  ],
};
