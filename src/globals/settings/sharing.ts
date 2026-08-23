import type { Tab } from "payload";

/**
 * Het kaartje dat verschijnt als iemand een link naar de site plakt in
 * WhatsApp, Facebook of LinkedIn.
 *
 * Die apps halen deze gegevens één keer op en onthouden ze daarna lang, dus een
 * wijziging hier is niet meteen overal te zien. Dat is geen fout in de site,
 * dat is hoe die apps werken.
 */
export const sharingTab: Tab = {
  label: "Delen",
  fields: [
    {
      name: "shareImage",
      label: "Afbeelding bij delen",
      type: "upload",
      relationTo: "media",
      admin: {
        description:
          "Verschijnt als iemand een link naar de site deelt. Liefst 1200 bij 630 pixels.",
      },
    },
    {
      name: "shareTitle",
      label: "Titel bij delen",
      type: "text",
      localized: true,
      admin: {
        description:
          "De dikgedrukte regel op het kaartje. Laat leeg om de naam van de zaak "
          + "en de titel van de pagina te gebruiken.",
      },
    },
    {
      name: "shareDescription",
      label: "Tekst bij delen",
      type: "textarea",
      localized: true,
      admin: {
        description:
          "Het zinnetje onder de titel. Houd het kort, want de meeste apps kappen "
          + "het na een regel of twee af. Laat leeg om de Beschrijving (SEO) onder "
          + "Algemeen te gebruiken.",
      },
    },
    {
      name: "shareImageAuto",
      label: "Zelf een afbeelding maken",
      type: "checkbox",
      defaultValue: true,
      admin: {
        description:
          "Geen eigen afbeelding? Dan maken we er zelf een met het logo en de naam.",
      },
    },
  ],
};
