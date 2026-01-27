import type { CollectionConfig } from "payload";

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
  fields: [
    {
      name: "name",
      label: "Naam",
      type: "text",
      required: true,
      admin: {
        description: "Bijv. 'Voorgerechten', 'Hoofdgerechten', 'Desserts'",
      },
    },
    {
      name: "description",
      label: "Beschrijving",
      type: "textarea",
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
      defaultValue: 0,
      admin: {
        description: "Lagere nummers verschijnen eerst op de kaart",
      },
    },
  ],
};
