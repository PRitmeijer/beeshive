import type { Tab } from "payload";

/**
 * De regels waarmee het reserveringsformulier rekent.
 *
 * Alles hier is bewust in gewone-mensentaal gezet in plaats van in
 * roostertermen: de eigenaren denken in "hoe lang zit een tafel vol" en "hoeveel
 * mensen passen erin", niet in tijdsloten en capaciteitsvensters. Het formulier
 * rekent die twee getallen om naar de tijden die een gast te zien krijgt, dus
 * een verkeerde waarde hier verstopt meteen tijdstippen op de site — vandaar dat
 * elk veld uitlegt waar het aan zit.
 */
export const reservationsTab: Tab = {
  label: "Reserveren",
  fields: [
    {
      name: "reservationsEnabled",
      label: "Online reserveren aan",
      type: "checkbox",
      defaultValue: true,
      admin: {
        description:
          "Uitvinken haalt het reserveringsformulier van de site. Gasten zien dan "
          + "alleen nog het telefoonnummer. Handig bij een verbouwing of vakantie.",
      },
    },
    {
      type: "row",
      fields: [
        {
          name: "reservationDurationMinutes",
          label: "Duur van een reservering (minuten)",
          type: "number",
          defaultValue: 120,
          min: 15,
          admin: {
            width: "50%",
            description: "Hoe lang een tafel gemiddeld bezet is.",
          },
        },
        {
          name: "reservationCapacity",
          label: "Aantal plaatsen",
          type: "number",
          defaultValue: 40,
          min: 1,
          admin: {
            width: "50%",
            description:
              "Hoeveel gasten er tegelijk aan tafel kunnen. Zit een tijdslot vol, "
              + "dan is dat tijdstip niet meer te kiezen.",
          },
        },
      ],
    },
    {
      type: "row",
      fields: [
        {
          name: "reservationMaxPartySize",
          label: "Grootste gezelschap",
          type: "number",
          defaultValue: 20,
          min: 1,
          admin: {
            width: "50%",
            description:
              "Boven dit aantal kan een gast niet zelf online boeken, maar vragen "
              + "we hem contact op te nemen. Grote groepen wil je liever even spreken.",
          },
        },
        {
          name: "reservationLeadMinutes",
          label: "Minimale tijd vooraf (minuten)",
          type: "number",
          defaultValue: 60,
          min: 0,
          admin: {
            width: "50%",
            description: "Hoe kort van tevoren iemand nog online mag boeken.",
          },
        },
      ],
    },
    {
      name: "reservationHorizonDays",
      label: "Hoe ver vooruit te boeken (dagen)",
      type: "number",
      defaultValue: 90,
      min: 1,
      admin: {
        description:
          "Verder dan dit aantal dagen vooruit staat de agenda dicht. Zo krijg je "
          + "geen reservering binnen voor een datum waarvan je nog niets weet.",
      },
    },
    {
      name: "guestPassEnabled",
      label: "Deelbare pagina voor het gezelschap",
      type: "checkbox",
      defaultValue: true,
      admin: {
        description:
          "Geeft elke reservering een eigen deelbare pagina die de gast naar zijn "
          + "gezelschap kan sturen.",
      },
    },
    {
      /**
       * The same block at the foot of a guest pass, and deliberately not the
       * same words.
       *
       * The two readers are in different situations. Somebody on the landing
       * page went looking for a restaurant. Somebody on a guest pass was
       * booked in by a friend, has never heard of the place, and is reading a
       * chat message on the way somewhere — so this one can be shorter, and
       * can say the thing the homepage never has to: what to expect when they
       * walk in.
       *
       * Falls back to the homepage welcome, then to the About intro.
       */
      name: "guestPassWelcome",
      label: "Welkom-tekst op de gastenpagina",
      type: "textarea",
      localized: true,
      admin: {
        description:
          "Staat onderaan de deelbare pagina, voor gasten die jullie nog niet kennen. Laat leeg om de welkom-tekst van de homepage te gebruiken.",
        condition: (data) => Boolean(data?.guestPassEnabled),
      },
    },
    {
      name: "guestPassDrinks",
      label: "Keuzes voor drinken",
      type: "array",
      labels: { singular: "Keuze", plural: "Keuzes" },
      admin: {
        description:
          "Wat het gezelschap alvast kan kiezen. Laat leeg om niets te vragen.",
        condition: (data) => Boolean(data?.guestPassEnabled),
      },
      fields: [
        {
          name: "label",
          label: "Naam",
          type: "text",
          localized: true,
          admin: {
            description: "Zoals de gast het te zien krijgt, bijv. 'Wijn' of 'Bier'.",
          },
        },
      ],
      defaultValue: [],
    },
    {
      name: "guestPassDietary",
      label: "Keuzes voor dieetwensen",
      type: "array",
      labels: { singular: "Keuze", plural: "Keuzes" },
      admin: {
        description:
          "Wat het gezelschap alvast kan aangeven, bijvoorbeeld 'Vegetarisch' of "
          + "'Notenallergie'. Laat leeg om er niet naar te vragen.",
        condition: (data) => Boolean(data?.guestPassEnabled),
      },
      fields: [
        {
          name: "label",
          label: "Naam",
          type: "text",
          localized: true,
          admin: {
            description: "Zoals de gast het te zien krijgt.",
          },
        },
      ],
      defaultValue: [],
    },
  ],
};
