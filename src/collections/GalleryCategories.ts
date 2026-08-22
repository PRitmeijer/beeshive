import type { CollectionConfig } from "payload";

export const GalleryCategories: CollectionConfig = {
  slug: "gallery-categories",
  labels: {
    singular: "Galerij Categorie",
    plural: "Galerij Categorieën",
  },
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "order"],
    description:
      "Maak zelf categorieën aan om de galerij mee te filteren, bijv. Restaurant, Eten & Drinken, Sfeer, Kunst.",
    group: "Inhoud",
  },
  fields: [
    {
      name: "name",
      label: "Naam",
      type: "text",
      required: true,
      localized: true,
      admin: {
        description:
          "De knop waarop bezoekers filteren, bijv. 'Eten & Drinken'. Vertaal hem op het Engelse tabblad; blijft die leeg, dan wordt de Nederlandse naam getoond.",
      },
    },
    {
      name: "order",
      label: "Volgorde",
      type: "number",
      defaultValue: 0,
      admin: {
        description: "Lagere nummers staan vooraan in de filterbalk",
      },
    },
  ],
};
