import type { Tab } from "payload";

/**
 * De teksten en foto's boven aan de homepage, plus het nieuwsbriefblok.
 */
export const homepageTab: Tab = {
  label: "Homepage",
  fields: [
    {
      name: "heroTitle",
      label: "Hero Titel",
      type: "text",
      localized: true,
      defaultValue: "De Bee's Hive",
      admin: {
        description:
          "De grote titel op de homepage. Gebruik | om het accent-woord te scheiden, bijv. 'De Bee's|Hive'",
      },
    },
    {
      name: "heroSubtitle",
      label: "Hero Ondertitel",
      type: "text",
      localized: true,
      defaultValue:
        "Waar eten en creativiteit samenkomen. Een warm eetcafé in het hart van Zuilen.",
    },
    {
      name: "heroImages",
      label: "Foto's naast de titel",
      type: "array",
      maxRows: 3,
      admin: {
        description:
          "De drie foto's die naast de titel op de homepage staan. Laat dit "
          + "helemaal leeg om de standaardfoto's te tonen. Zet je er zelf foto's "
          + "in, doe er dan het liefst drie, in dezelfde volgorde als je ze op de "
          + "site wilt zien.",
      },
      labels: { singular: "Foto", plural: "Foto's" },
      fields: [
        {
          name: "image",
          label: "Foto",
          type: "upload",
          relationTo: "media",
          required: true,
        },
        {
          name: "caption",
          label: "Bijschrift",
          type: "text",
          localized: true,
          admin: {
            description: "Korte regel bij de foto. Laat leeg voor geen bijschrift.",
          },
        },
        {
          type: "row",
          fields: [
            {
              name: "zoom",
              label: "Zoom",
              type: "number",
              min: 60,
              max: 200,
              defaultValue: 100,
              admin: {
                width: "50%",
                description:
                  "100 is de foto zoals hij is. Lager zoomt uit, hoger zoomt in.",
              },
            },
            {
              name: "focalPoint",
              label: "Belangrijkste deel van de foto",
              type: "select",
              defaultValue: "center",
              options: [
                { label: "Midden", value: "center" },
                { label: "Boven", value: "top" },
                { label: "Onder", value: "bottom" },
                { label: "Links", value: "left" },
                { label: "Rechts", value: "right" },
              ],
              admin: {
                width: "50%",
                description:
                  "Welk deel van de foto altijd zichtbaar moet blijven als hij "
                  + "wordt bijgesneden. Staat het onderwerp bijvoorbeeld boven in "
                  + "beeld, kies dan Boven.",
              },
            },
          ],
        },
      ],
      defaultValue: [],
    },
    {
      name: "newsletterTitle",
      label: "Nieuwsbrief Titel",
      type: "text",
      localized: true,
      defaultValue: "Schrijf je in",
    },
    {
      name: "newsletterText",
      label: "Nieuwsbrief Tekst",
      type: "text",
      localized: true,
      defaultValue:
        "Ontvang als eerste nieuws over speciale evenementen, nieuwe gerechten en aanbiedingen.",
    },
    {
      name: "newsletterPrivacyNote",
      label: "Nieuwsbrief Geruststelling",
      type: "text",
      localized: true,
      defaultValue:
        "Hooguit een mail per maand, nooit spam, en uitschrijven kan met een klik.",
      admin: {
        description:
          "Het kleine regeltje onder het inschrijfveld. Mensen vullen hun "
          + "e-mailadres eerder in als hier staat wat je ermee doet.",
      },
    },
  ],
};
