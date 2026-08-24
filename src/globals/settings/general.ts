import type { Tab } from "payload";

/**
 * Alles wat niet bij één pagina hoort: de naam van de zaak, de teksten die
 * zoekmachines te zien krijgen en de losse reserveringslink.
 */
export const generalTab: Tab = {
  label: "Algemeen",
  fields: [
    {
      name: "siteName",
      label: "Naam",
      type: "text",
      defaultValue: "De Bee's Hive",
      required: true,
    },
    {
      name: "description",
      label: "Beschrijving (SEO)",
      type: "textarea",
      localized: true,
      // Geen defaultValue op een vertaald veld — zie SiteSettings.ts.
    },
    {
      name: "keywords",
      label: "Zoekwoorden (SEO)",
      type: "text",
      localized: true,
      admin: {
        description:
          "Komma-gescheiden, bijvoorbeeld: eetcafé Utrecht, lunch Zuilen, borrel. " +
          "Google negeert deze tag sinds 2009 en gebruikt hem niet voor de " +
          "ranking. Dat werk doen de Beschrijving hierboven en de tekst op " +
          "de pagina's wel.",
      },
    },
    {
      name: "cuisines",
      label: "Keukens (voor SEO)",
      type: "text",
      defaultValue: "Dutch, International, South African",
      admin: {
        description: "Komma-gescheiden lijst van keukens voor zoekmachines",
      },
    },
    {
      name: "priceRange",
      label: "Prijsklasse",
      type: "text",
      defaultValue: "€€",
    },
    {
      name: "reservationUrl",
      label: "Reserverings-URL",
      type: "text",
      admin: {
        description:
          "Link naar reserveringssysteem (bijv. formitable, couverts). Laat leeg om knop te verbergen.",
      },
    },
  ],
};
