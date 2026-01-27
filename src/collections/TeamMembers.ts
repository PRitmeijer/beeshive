import type { CollectionConfig } from "payload";

export const TeamMembers: CollectionConfig = {
  slug: "team-members",
  labels: {
    singular: "Teamlid",
    plural: "Team",
  },
  admin: {
    useAsTitle: "name",
    group: "Inhoud",
    description: "Beheer teamleden die op de Over Ons pagina worden getoond.",
    defaultColumns: ["name", "role", "order", "updatedAt"],
  },
  fields: [
    {
      name: "name",
      label: "Naam",
      type: "text",
      required: true,
    },
    {
      name: "role",
      label: "Functie",
      type: "text",
      required: true,
      admin: {
        description: "Bijv. 'Chef-kok', 'Eigenaar', 'Barista'",
      },
    },
    {
      name: "bio",
      label: "Korte Bio",
      type: "textarea",
    },
    {
      name: "photo",
      label: "Foto",
      type: "upload",
      relationTo: "media",
    },
    {
      name: "order",
      label: "Volgorde",
      type: "number",
      defaultValue: 0,
      admin: {
        description: "Lagere nummers verschijnen eerst",
      },
    },
  ],
};
