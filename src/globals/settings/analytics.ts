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
 * de bezoeker in de browser en stuurt bezoeken naar Umami toe. Het adres van
 * Umami gaat de andere kant op: daarmee haalt dit paneel de cijfers weer op.
 * Het één kan prima aan staan zonder het ander.
 *
 * Voor dat ophalen zijn ook inloggegevens nodig, en die staan bewust niet in dit
 * scherm. Draait Umami op deze server, dan meldt de site zich zelf aan met
 * UMAMI_USERNAME en UMAMI_PASSWORD uit de omgeving; een wachtwoord hoort daar
 * thuis, naast dat van de database, en niet in een veld dat vanuit de admin te
 * openen is. Het veld API-sleutel hieronder blijft bestaan voor Umami Cloud en
 * voor de zeldzame keer dat iemand met de hand een sleutel aanreikt.
 * src/lib/umamiServer.ts legt de volgorde uit waarin die drie meetellen.
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
          "Waar Umami draait. Nodig om de cijfers in dit paneel te tonen. "
          + "Umami draait bij ons op dezelfde server als de website: vul dan "
          + "http://umami:3000 in, dan blijven de cijfers binnen de server en "
          + "hoeven ze niet eerst naar buiten en weer terug. Gebruiken jullie "
          + "Umami Cloud, dan is het https://cloud.umami.is.",
      },
    },
    {
      name: "umamiApiKey",
      label: "API-sleutel",
      type: "text",
      admin: {
        description:
          "Meestal leeg laten. Draait Umami op deze server, dan meldt de site "
          + "zich hier zelf aan met de gebruikersnaam en het wachtwoord die op "
          + "de server staan, en is dit veld niet nodig. Vul het alleen bij "
          + "Umami Cloud, of als iemand met de hand een sleutel voor jullie "
          + "heeft opgehaald. Let op: zo'n sleutel is als een wachtwoord, deel "
          + "hem met niemand. Staat de omgevingsvariabele UMAMI_API_KEY "
          + "ingevuld, dan wint die en wordt wat hier staat genegeerd.",
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
