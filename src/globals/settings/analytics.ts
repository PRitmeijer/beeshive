import type { Tab } from "payload";

/**
 * Bezoekcijfers via Umami.
 *
 * Umami is gekozen omdat het geen cookies zet en geen persoonsgegevens bewaart:
 * daardoor hoeft de site geen cookiebanner te tonen en blijft de AVG-kant
 * eenvoudig. De cijfers zijn dus wat grover dan bij Google Analytics, en dat is
 * de bedoeling.
 *
 * Er zijn twee losse verbindingen in het spel. Het script hieronder draait bij
 * de bezoeker in de browser en stuurt bezoeken naar Umami toe. De host-URL en de
 * API-sleutel gaan de andere kant op: die gebruikt dit paneel om de cijfers weer
 * op te halen. Het één kan prima aan staan zonder het ander.
 */
export const analyticsTab: Tab = {
  label: "Statistieken",
  fields: [
    {
      name: "umamiEnabled",
      label: "Bezoekcijfers bijhouden",
      type: "checkbox",
      defaultValue: false,
      admin: {
        description:
          "Zet het meetscript op de site. Staat dit uit, dan wordt er niets "
          + "gemeten en blijven de grafieken leeg.",
      },
    },
    {
      name: "umamiScriptUrl",
      label: "Script-adres",
      type: "text",
      defaultValue: "https://cloud.umami.is/script.js",
      admin: {
        description:
          "Laat dit staan zoals het staat, tenzij jullie Umami op een eigen "
          + "server draaien. Dan geeft Umami zelf het juiste adres.",
      },
    },
    {
      name: "umamiWebsiteId",
      label: "Website-ID",
      type: "text",
      admin: {
        description:
          "Het lange nummer met streepjes dat Umami bij jullie website toont "
          + "(Settings → Websites). Zonder dit nummer meet Umami niets.",
      },
    },
    {
      name: "umamiHostUrl",
      label: "Adres van Umami",
      type: "text",
      admin: {
        description:
          "Waar Umami draait, bijvoorbeeld https://cloud.umami.is. Nodig om de "
          + "cijfers in dit paneel te tonen.",
      },
    },
    {
      name: "umamiApiKey",
      label: "API-sleutel",
      type: "text",
      admin: {
        description:
          "Let op: dit is een sleutel, behandel hem als een wachtwoord en deel "
          + "hem met niemand. Hij kan ook buiten dit scherm om worden ingesteld "
          + "als de omgevingsvariabele UMAMI_API_KEY; staat die ingevuld, dan "
          + "wint die en wordt wat hier staat genegeerd.",
      },
    },
    {
      name: "umamiDoNotTrackAdmin",
      label: "Eigen bezoeken niet meetellen",
      type: "checkbox",
      defaultValue: true,
      admin: {
        description:
          "Als jullie zelf ingelogd zijn, tellen die bezoeken niet mee. Anders "
          + "lijkt de site drukker dan hij is.",
      },
    },
  ],
};
