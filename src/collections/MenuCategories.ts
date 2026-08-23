import type { CollectionConfig } from "payload";
import { assignNextOrder } from "@/lib/ordering";

export const MenuCategories: CollectionConfig = {
  slug: "menu-categories",
  labels: {
    singular: "Menu Categorie",
    plural: "Menu Categorieën",
  },
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "order"],
    description:
      "Maak categorieën aan voor de menukaart, bijv. Voorgerechten, Hoofdgerechten, Desserts, Dranken.",
    group: "Restaurant",
  },
  // The overview opens in the order the site prints them, not by whenever
  // somebody happened to add them. Seeing the sequence is most of managing it.
  defaultSort: "order",
  hooks: {
    beforeChange: [assignNextOrder("menu-categories")],
  },
  fields: [
    {
      name: "name",
      label: "Naam",
      type: "text",
      required: true,
      localized: true,
      admin: {
        description: "Bijv. 'Voorgerechten', 'Hoofdgerechten', 'Desserts'",
      },
    },
    {
      name: "description",
      label: "Beschrijving",
      type: "textarea",
      localized: true,
      admin: {
        description:
          "Optionele korte tekst onder de categorienaam op de kaart, bijv. 'Om te beginnen'",
      },
    },
    {
      name: "icon",
      label: "Icoon (emoji)",
      type: "text",
      admin: {
        description: "Optioneel emoji-icoon, bijv. 🍽️ of 🥂",
      },
    },
    {
      name: "order",
      label: "Volgorde",
      type: "number",
      admin: {
        description:
          "Lagere nummers verschijnen eerst op de kaart. Laat leeg en het komt onderaan te staan; de nummers gaan met stappen van 10, zodat je er altijd iets tussen kunt zetten.",
      },
    },
  ],
};
