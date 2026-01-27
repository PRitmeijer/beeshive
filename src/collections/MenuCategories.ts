import type { CollectionConfig } from "payload";

export const MenuCategories: CollectionConfig = {
  slug: "menu-categories",
  admin: {
    useAsTitle: "name",
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
      name: "order",
      type: "number",
      defaultValue: 0,
    },
  ],
};
