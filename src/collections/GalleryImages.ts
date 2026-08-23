import type { CollectionConfig } from "payload";
import { assignNextOrder } from "@/lib/ordering";

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
  // The overview opens in the order the site prints them, not by whenever
  // somebody happened to add them. Seeing the sequence is most of managing it.
  defaultSort: "order",
  hooks: {
    beforeChange: [assignNextOrder("gallery-images")],
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
      admin: {
        position: "sidebar",
        description:
          "Lagere nummers verschijnen eerst. Laat leeg en het komt onderaan te staan; de nummers gaan met stappen van 10, zodat je er altijd iets tussen kunt zetten.",
      },
    },
  ],
};
