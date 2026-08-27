import type { Tab } from "payload";

/**
 * Hoe de zaak te bereiken is, en wanneer.
 *
 * Openingstijden komen op drie manieren tot stand, en die drie kunnen elkaar
 * tegenspreken. Het weekschema hieronder is de gewone gang van zaken. Een
 * terugkerende regel ("elke laatste zondag") overrulet het weekschema. Een
 * losse Afwijkende dag overrulet ze allebei, want dat is een datum die de
 * eigenaren zelf hebben ingetikt en die wint dus altijd van een regel.
 */
export const contactTab: Tab = {
  label: "Contact",
  fields: [
    {
      name: "contactEmail",
      label: "E-mailadres",
      type: "email",
      defaultValue: "info@debeeshive.nl",
    },
    {
      name: "phone",
      label: "Telefoonnummer",
      type: "text",
      defaultValue: "030 785 2199",
    },
    {
      name: "address",
      label: "Adres",
      type: "group",
      fields: [
        { name: "street", label: "Straat", type: "text" },
        {
          name: "city",
          label: "Stad",
          type: "text",
          defaultValue: "Utrecht",
        },
        {
          name: "area",
          label: "Wijk",
          type: "text",
          defaultValue: "Zuilen",
        },
        {
          name: "postalCode",
          label: "Postcode",
          type: "text",
        },
        {
          name: "country",
          label: "Land",
          type: "text",
          defaultValue: "Nederland",
        },
        {
          name: "countryCode",
          label: "Landcode (ISO)",
          type: "text",
          defaultValue: "NL",
        },
      ],
    },
    {
      name: "openingHours",
      label: "Openingstijden",
      type: "array",
      fields: [
        {
          name: "day",
          label: "Dag",
          type: "text",
          required: true,
          localized: true,
        },
        {
          name: "hours",
          label: "Tijden",
          type: "text",
          required: true,
          localized: true,
          admin: {
            description: "Bijv. '11:00 – 21:00' of 'Gesloten'",
          },
        },
      ],
      // Monday first. The pages match a row by its position here, not
      // by the day's name, so this order is load-bearing.
      defaultValue: [
        { day: "Maandag", hours: "11:00 – 21:00" },
        { day: "Dinsdag", hours: "Gesloten" },
        { day: "Woensdag", hours: "Gesloten" },
        { day: "Donderdag", hours: "11:00 – 21:00" },
        { day: "Vrijdag", hours: "11:00 – 21:00" },
        { day: "Zaterdag", hours: "11:00 – 21:00" },
        { day: "Zondag", hours: "Gesloten" },
      ],
    },
    {
      name: "recurringOpenings",
      label: "Vaste maandelijkse uitzonderingen",
      type: "array",
      admin: {
        description:
          "Voor een regel die elke maand terugkomt, bijvoorbeeld 'elke laatste "
          + "zondag van de maand zijn we open'. Vul in de hoeveelste van de maand "
          + "het is en welke dag, en daarna óf jullie die dag juist gesloten zijn "
          + "óf van hoe laat tot hoe laat je open bent. Zo'n regel gaat vóór het "
          + "gewone weekschema hierboven, maar een losse datum onder Afwijkende "
          + "dagen gaat er weer overheen.",
      },
      labels: {
        singular: "Terugkerende regel",
        plural: "Terugkerende regels",
      },
      fields: [
        {
          type: "row",
          fields: [
            {
              name: "ordinal",
              label: "De hoeveelste van de maand",
              type: "select",
              required: true,
              defaultValue: "last",
              options: [
                { label: "Eerste", value: "first" },
                { label: "Tweede", value: "second" },
                { label: "Derde", value: "third" },
                { label: "Vierde", value: "fourth" },
                { label: "Laatste", value: "last" },
              ],
              admin: { width: "50%" },
            },
            {
              name: "weekday",
              label: "Dag van de week",
              type: "select",
              required: true,
              defaultValue: "sunday",
              options: [
                { label: "Maandag", value: "monday" },
                { label: "Dinsdag", value: "tuesday" },
                { label: "Woensdag", value: "wednesday" },
                { label: "Donderdag", value: "thursday" },
                { label: "Vrijdag", value: "friday" },
                { label: "Zaterdag", value: "saturday" },
                { label: "Zondag", value: "sunday" },
              ],
              admin: { width: "50%" },
            },
          ],
        },
        {
          name: "closed",
          label: "Juist gesloten die dag",
          type: "checkbox",
          defaultValue: false,
          admin: {
            description:
              "Aanvinken als jullie die dag dicht zijn. De tijden hieronder "
              + "worden dan niet gebruikt.",
          },
        },
        {
          name: "hours",
          label: "Tijden",
          type: "text",
          localized: true,
          admin: {
            description: "Bijvoorbeeld '11:00 - 21:00'.",
          },
        },
        {
          name: "note",
          label: "Toelichting",
          type: "text",
          localized: true,
          admin: {
            description:
              "Korte regel die op de site bij deze dag komt te staan, "
              + "bijvoorbeeld 'Zondagse brunch'. Laat leeg als het niet nodig is.",
          },
        },
      ],
      defaultValue: [],
    },
    {
      name: "openingHoursNote",
      label: "Opmerking bij de openingstijden",
      type: "textarea",
      localized: true,
      admin: {
        description:
          "Alleen een vrije regel tekst onder de openingstijden, meer niet: de "
          + "site rekent er niets mee. Gaat het om een dag waarop jullie echt "
          + "anders open of dicht zijn, zet die dan onder Afwijkende dagen (voor "
          + "één datum) of in de terugkerende regels hierboven (voor iets dat "
          + "elke maand terugkomt). Laat leeg als er niets te melden is: dan "
          + "toont de site hier ook niets.",
      },
    },
    {
      name: "googleMapsEmbedUrl",
      label: "Google Maps Embed URL",
      type: "text",
      defaultValue:
        "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2450.3781318959013!2d5.086582076321947!3d52.10924836655966!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x47c66f402cf74da3%3A0xf5db732de51fc331!2sDe%20Bee%27s%20Hive!5e0!3m2!1snl!2snl!4v1756807839954!5m2!1snl!2snl",
      admin: {
        description:
          "Plak hier de Google Maps embed URL. Ga naar Google Maps → Delen → Insluiten → kopieer de src URL uit de iframe code (begint met https://www.google.com/maps/embed). "
          + "Let op: kopieer alleen de URL zelf, niet de hele iframe-code, en zorg dat er geen &#39; of &amp; in staat.",
      },
    },
    {
      name: "googleReviewUrl",
      label: "Google Reviews URL",
      type: "text",
      defaultValue: "https://maps.app.goo.gl/6VEMHL3Jq9vgAWnw8",
      admin: {
        description:
          "Link naar jullie Google-vermelding, waar gasten de beoordelingen lezen "
          + "en er zelf een achterlaten. Ga naar Google Maps → jullie zaak → Delen "
          + "→ Link kopiëren. Deze link staat op twee plekken: op de contactpagina, "
          + "en onder het bedankje op de reserveringspagina dat gasten te zien "
          + "krijgen als hun avond geweest is. Laat leeg als je er niet om wilt "
          + "vragen; dan verdwijnt hij op allebei die plekken.",
      },
    },
    {
      name: "socialMedia",
      label: "Social Media",
      type: "group",
      fields: [
        {
          name: "instagram",
          label: "Instagram URL",
          type: "text",
          defaultValue: "https://www.instagram.com/debeeshive",
        },
        {
          name: "facebook",
          label: "Facebook URL",
          type: "text",
          defaultValue:
            "https://www.facebook.com/people/De-Bees-Hive/61573726474222",
        },
        {
          name: "tripadvisor",
          label: "TripAdvisor URL",
          type: "text",
        },
      ],
    },
  ],
};
