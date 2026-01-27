import type { CollectionConfig } from "payload";

export const MenuItems: CollectionConfig = {
  slug: "menu-items",
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "category", "price"],
  },
  fields: [
    {
      name: "name",
      type: "text",
      required: true,
    },
    {
      name: "description",
      type: "textarea",
    },
    {
      name: "price",
      type: "number",
      required: true,
      min: 0,
    },
    {
      name: "category",
      type: "relationship",
      relationTo: "menu-categories",
      required: true,
    },
    {
      name: "image",
      type: "upload",
      relationTo: "media",
    },
    {
      name: "dietary",
      type: "select",
      hasMany: true,
      options: [
        { label: "Vegetarisch", value: "vegetarian" },
        { label: "Veganistisch", value: "vegan" },
        { label: "Glutenvrij", value: "gluten-free" },
        { label: "Lactosevrij", value: "dairy-free" },
      ],
    },
    {
      name: "featured",
      type: "checkbox",
      defaultValue: false,
    },
    {
      name: "available",
      type: "checkbox",
      defaultValue: true,
    },
    {
      name: "order",
      type: "number",
      defaultValue: 0,
    },
  ],
};
