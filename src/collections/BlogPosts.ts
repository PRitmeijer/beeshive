import type { CollectionConfig } from "payload";

export const BlogPosts: CollectionConfig = {
  slug: "blog-posts",
  labels: {
    singular: "Blogpost",
    plural: "Blog",
  },
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "status", "category", "publishedDate"],
    description:
      "Schrijf blogposts over recepten, evenementen, verhalen en nieuws. Gepubliceerde posts verschijnen op de Blog-pagina.",
    group: "Inhoud",
  },
  fields: [
    {
      name: "title",
      label: "Titel",
      type: "text",
      required: true,
      localized: true,
    },
    {
      name: "slug",
      label: "URL-slug",
      type: "text",
      required: true,
      unique: true,
      admin: {
        position: "sidebar",
        description: "Het deel van de URL na /blog/, bijv. 'welkom-bij-de-bees-hive'",
      },
    },
    {
      name: "excerpt",
      label: "Samenvatting",
      type: "textarea",
      required: true,
      localized: true,
      maxLength: 300,
      admin: {
        description:
          "Korte samenvatting die verschijnt op de blogpagina en in zoekmachines (max 300 tekens)",
      },
    },
    {
      name: "featuredImage",
      label: "Uitgelichte afbeelding",
      type: "upload",
      relationTo: "media",
      // Optional on purpose: the listing and the article both render a
      // drawn placeholder when there is no photograph yet.
      required: false,
    },
    {
      name: "content",
      label: "Inhoud",
      type: "richText",
      required: true,
      localized: true,
    },
    {
      name: "category",
      label: "Categorie",
      type: "select",
      options: [
        { label: "📰 Nieuws", value: "news" },
        { label: "🍳 Recepten", value: "recipes" },
        { label: "🎉 Evenementen", value: "events" },
        { label: "📖 Verhalen", value: "stories" },
        { label: "💡 Tips", value: "tips" },
      ],
      admin: {
        position: "sidebar",
        description: "Categorie helpt bezoekers bij het filteren",
      },
    },
    {
      name: "tags",
      label: "Tags",
      type: "text",
      hasMany: true,
      admin: {
        description:
          "Voeg tags toe voor betere vindbaarheid, bijv. 'Zuid-Afrika', 'seizoensgebonden', 'workshop'",
      },
    },
    {
      name: "status",
      label: "Status",
      type: "select",
      options: [
        { label: "📝 Concept", value: "draft" },
        { label: "✅ Gepubliceerd", value: "published" },
      ],
      defaultValue: "draft",
      required: true,
      admin: {
        position: "sidebar",
        description: "Alleen gepubliceerde posts zijn zichtbaar op de website",
      },
    },
    {
      name: "publishedDate",
      label: "Publicatiedatum",
      type: "date",
      admin: {
        position: "sidebar",
        date: { pickerAppearance: "dayOnly" },
        description: "Datum die getoond wordt bij de post",
      },
    },
    {
      name: "author",
      label: "Auteur",
      type: "relationship",
      relationTo: "users",
      admin: {
        position: "sidebar",
      },
    },
  ],
};
