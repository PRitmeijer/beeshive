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
 * Wat er gemeten wordt is bewust beperkt, en dat is hieronder bij de eerste
 * schakelaar ook in gewone woorden aan de eigenaren uitgelegd. De reden dat die
 * zin daar staat en niet alleen in de code: sinds het meten van het
 * reserveringsformulier is uitgebreid, gaat er bij elke datum die iemand
 * aanklikt "hoe ver vooruit" en de dag van de week mee, en bij een mislukte
 * boeking daarbovenop een grootte-groep ("5-6"). Dat is precies het soort
 * detail waarvan iemand een half jaar later schrikt als hij het toevallig
 * ontdekt in plaats van het gewoon te lezen. Let op de eerste helft daarvan:
 * die zin heeft hier een tijd gestaan alsof het alleen bij mislukte boekingen
 * gebeurde, terwijl het formulier de beschikbaarheid opvraagt zodra er een
 * datum staat — dus ook bij boekingen die gewoon doorgaan en bij mensen die
 * halverwege stoppen. Een belofte die smaller is dan wat de code doet is erger
 * dan geen belofte. docs/analytics.md legt de afweging in het lang uit; de
 * losse getallen — de exacte datum en het exacte aantal personen — gaan er
 * nooit doorheen, want dan zou een reservering terug te vinden zijn. Daarom
 * begint "hoe ver vooruit" ook bij "vandaag of morgen" en niet bij "vandaag":
 * Umami zet zelf de dag waarop het gemeten is erbij, dus een groep die precies
 * één dag aanwijst ís de geboekte avond.
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
          + "gemeten en blijven de grafieken leeg. We meten wat mensen op de "
          + "site doen, nooit wie ze zijn: geen namen, geen e-mailadressen, "
          + "geen telefoonnummers, en niets van wat iemand in een veld typt. "
          + "Kiest iemand in het reserveringsformulier een datum, dan slaan we "
          + "wel op hoe ver vooruit die datum ligt — vandaag of morgen, 2 tot "
          + "6 dagen, en zo verder — en welke dag van de week het is. Dat "
          + "gebeurt bij elke datum die iemand aanklikt: ook als de "
          + "reservering gewoon doorgaat, en ook als iemand halverwege stopt. "
          + "Lukt een reservering niet, dan komt daar nog bij of het om een "
          + "kleine of een grote tafel ging (bijvoorbeeld \"5-6\") — anders "
          + "kunnen jullie niet zien wáár het misgaat. Het precieze aantal "
          + "personen en de precieze avond gaan er nooit in, want daarmee zou "
          + "een reservering terug te vinden zijn.",
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
