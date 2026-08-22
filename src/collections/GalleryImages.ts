import type { CollectionConfig } from "payload";

export const GalleryImages: CollectionConfig = {
  slug: "gallery-images",
  labels: {
    singular: "Galerij Foto",
    plural: "Galerij",
  },
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "category", "featured", "order"],
    description:
      "Upload foto's van het restaurant, gerechten, evenementen en meer. Ze verschijnen op de Galerij-pagina.",
    group: "Inhoud",
  },
  fields: [
    {
      name: "title",
      label: "Titel",
      type: "text",
      required: true,
      localized: true,
      admin: {
        description: "Beschrijvende titel voor de foto",
      },
    },
    {
      name: "image",
      label: "Foto",
      type: "upload",
      relationTo: "media",
      required: true,
    },
    {
      type: "row",
      fields: [
        {
          name: "category",
          label: "Categorie",
          type: "relationship",
          relationTo: "gallery-categories",
          required: true,
          admin: {
            width: "50%",
            description:
              "Bezoekers filteren hierop. Staat de categorie er nog niet bij, maak hem dan aan onder Galerij Categorieën.",
          },
        },
        {
          name: "featured",
          label: "Uitgelicht",
          type: "checkbox",
          defaultValue: false,
          admin: {
            width: "50%",
            description: "Uitgelichte foto's verschijnen als eerste",
          },
        },
      ],
    },
    {
      name: "description",
      label: "Beschrijving",
      type: "textarea",
      localized: true,
      admin: {
        description: "Optioneel bijschrift dat in de lightbox verschijnt",
      },
    },
    {
      name: "order",
      label: "Volgorde",
      type: "number",
      defaultValue: 0,
      admin: {
        position: "sidebar",
        description: "Lagere nummers verschijnen eerst",
      },
    },
  ],
};
