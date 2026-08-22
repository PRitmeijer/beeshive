import type { CollectionConfig } from "payload";

export const MenuItems: CollectionConfig = {
  slug: "menu-items",
  labels: {
    singular: "Gerecht",
    plural: "Menukaart",
  },
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "category", "price", "available", "featured"],
    description:
      "Beheer alle gerechten en dranken. Stel prijzen in, voeg dieetwensen toe en markeer seizoensspecials.",
    group: "Restaurant",
  },
  fields: [
    {
      name: "name",
      label: "Naam",
      type: "text",
      required: true,
      localized: true,
    },
    {
      name: "description",
      label: "Beschrijving",
      type: "textarea",
      localized: true,
      admin: {
        description:
          "Korte beschrijving van het gerecht, bijv. ingrediënten of bereidingswijze",
      },
    },
    {
      type: "row",
      fields: [
        {
          name: "price",
          label: "Prijs (€)",
          type: "number",
          required: true,
          min: 0,
          admin: {
            width: "33%",
            step: 0.5,
            description: "Prijs in euro's",
          },
        },
        {
          name: "category",
          label: "Categorie",
          type: "relationship",
          relationTo: "menu-categories",
          required: true,
          admin: {
            width: "33%",
          },
        },
        {
          name: "spicyLevel",
          label: "Pittigheid",
          type: "select",
          options: [
            { label: "Niet pittig", value: "none" },
            { label: "🌶️ Mild", value: "mild" },
            { label: "🌶️🌶️ Pittig", value: "medium" },
            { label: "🌶️🌶️🌶️ Heet", value: "hot" },
          ],
          admin: {
            width: "33%",
          },
        },
      ],
    },
    {
      name: "image",
      label: "Foto",
      type: "upload",
      relationTo: "media",
      admin: {
        description: "Optionele foto van het gerecht",
      },
    },
    {
      name: "dietary",
      label: "Dieetwensen",
      type: "select",
      hasMany: true,
      options: [
        { label: "🌱 Vegetarisch", value: "vegetarian" },
        { label: "🌿 Veganistisch", value: "vegan" },
        { label: "🌾 Glutenvrij", value: "gluten-free" },
        { label: "🥛 Lactosevrij", value: "dairy-free" },
        { label: "🥜 Notenvrij", value: "nut-free" },
        { label: "🐟 Bevat vis", value: "contains-fish" },
      ],
      admin: {
        description: "Selecteer alle relevante dieetwensen",
      },
    },
    {
      name: "allergens",
      label: "Allergenen",
      type: "text",
      localized: true,
      admin: {
        description:
          "Vrij tekstveld voor allergenen, bijv. 'Bevat noten, gluten, ei'",
      },
    },
    {
      type: "row",
      fields: [
        {
          name: "featured",
          label: "⭐ Uitgelicht",
          type: "checkbox",
          defaultValue: false,
          admin: {
            width: "33%",
            description: "Toon als aanbeveling op de kaart",
          },
        },
        {
          name: "seasonal",
          label: "🍂 Seizoensgerecht",
          type: "checkbox",
          defaultValue: false,
          admin: {
            width: "33%",
            description: "Markeer als seizoensgebonden",
          },
        },
        {
          name: "newItem",
          label: "🆕 Nieuw",
          type: "checkbox",
          defaultValue: false,
          admin: {
            width: "33%",
            description: "Toon een 'Nieuw' badge",
          },
        },
      ],
    },
    {
      name: "available",
      label: "Beschikbaar",
      type: "checkbox",
      defaultValue: true,
      admin: {
        position: "sidebar",
        description: "Zet uit als het gerecht tijdelijk niet beschikbaar is",
      },
    },
    {
      name: "order",
      label: "Volgorde",
      type: "number",
      defaultValue: 0,
      admin: {
        position: "sidebar",
        description: "Lagere nummers verschijnen eerst binnen de categorie",
      },
    },
  ],
};
