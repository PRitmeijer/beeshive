import type { CollectionConfig } from "payload";
import { assignNextOrder } from "@/lib/ordering";

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
  // The overview opens in the order the site prints them, not by whenever
  // somebody happened to add them. Seeing the sequence is most of managing it.
  defaultSort: "order",
  hooks: {
    beforeChange: [assignNextOrder("gallery-categories")],
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
      admin: {
        description:
          "Lagere nummers staan vooraan in de filterbalk. Laat leeg en het komt onderaan te staan; de nummers gaan met stappen van 10, zodat je er altijd iets tussen kunt zetten.",
      },
    },
  ],
};
