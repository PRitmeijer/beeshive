import type { Tab } from "payload";
/*
 * Safe to import from a global: @/lib/reservationMail is handed a Payload
 * instance rather than fetching one, so it reaches no further than
 * @/i18n/config and @/i18n/dictionaries and cannot come back round to the
 * config this tab is part of. Its own header spells that rule out.
 */
import {
  CONFIRMATION_MAIL_RELEASED,
  CONFIRMATION_MODES,
  DEFAULT_CONFIRMATION_MODE,
  type ConfirmationMode,
} from "@/lib/reservationMail";

/**
 * The dropdown as the owners read it, in the order CONFIRMATION_MODES declares.
 *
 * Written as a lookup keyed by the mode rather than as a hand-typed list of
 * options, so that the three values in the CMS are literally the three values
 * the mail code branches on. A fourth mode added to that list and not to this
 * one stops the build here, which is the only place it could still be caught
 * before an owner is looking at a select with a missing entry in it.
 */
const CONFIRMATION_MODE_LABELS: Record<ConfirmationMode, string> = {
  approval: "Pas versturen als jullie de reservering bevestigen",
  auto: "Meteen versturen, de reservering staat dan direct op Bevestigd",
  off: "Helemaal niet versturen",
};

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
      /**
       * When the guest's confirmation goes out — the owners' decision, made on
       * the same screen where they decide whether bookings are taken at all.
       *
       * It sits next to `reservationsEnabled` because it is the same kind of
       * question. That one is "do we take bookings online", this one is "and
       * does the guest hear back from the website or from us", and an owner who
       * has opened this tab has already opened it to change how bookings are
       * handled.
       *
       * `approval` is the default and stays the default. It is how the café
       * works today — they ring the guest back, they look at the evening, and
       * only then do they promise a table — so deploying this changes nobody's
       * Tuesday. Full auto is here for the day they decide they want it, not
       * switched on underneath them. The reasoning behind the three values, and
       * why `auto` confirms the booking outright instead of merely mailing
       * about it, is written out once in @/lib/reservationMail.
       *
       * The description answers the question the owners will actually ask about
       * full auto before anything else: whether a machine saying yes can put
       * more people in the room than fit. It cannot — src/lib/capacity.ts
       * counts the seats before the row is written, in every mode — and that
       * sentence belongs here, where they are deciding, rather than in a file
       * they will never open.
       */
      name: "reservationConfirmationMode",
      label: "Bevestigingsmail aan de gast",
      type: "select",
      defaultValue: DEFAULT_CONFIRMATION_MODE,
      options: CONFIRMATION_MODES.map((value) => ({
        label: CONFIRMATION_MODE_LABELS[value],
        value,
      })),
      admin: {
        /*
         * Hidden while the confirmation mail is held back from the release.
         *
         * The feature is finished and switched off at the source — see
         * CONFIRMATION_MAIL_RELEASED — and this is the other half of that: a
         * dropdown the owners can set to "Meteen versturen" and then watch do
         * nothing is a bug report waiting to be written about a mail that was
         * never on. The field itself stays, with its stored value untouched, so
         * releasing it is one constant and no migration.
         */
        hidden: !CONFIRMATION_MAIL_RELEASED,
        description:
          "Wanneer de gast een mailtje krijgt dat zijn tafel klaarstaat. "
          + "Bevestigen jullie zelf, dan gaat de mail weg op het moment dat je "
          + "de reservering op Bevestigd zet en opslaat — dat is hoe het nu "
          + "werkt. Kies je Meteen versturen, dan bevestigt een aanvraag "
          + "zichzelf: de gast krijgt de mail direct na het boeken en hoeft "
          + "niet te wachten. Te vol kan het daarmee niet worden — het "
          + "formulier telt de plaatsen al voordat een reservering wordt "
          + "opgeslagen, dus een tijdstip dat vol zit is niet te kiezen, ook "
          + "niet 's nachts. Het enige dat wegvalt is dat er nog iemand naar "
          + "kijkt voordat de tafel vastligt. Helemaal niet versturen betekent "
          + "dat de gast niets van de site hoort en jullie hem zelf bellen. "
          + "Jullie eigen mailtje over een nieuwe aanvraag blijft in alle drie "
          + "de gevallen gewoon komen.",
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
      /**
       * The other end of the same evening, and the natural sibling of the lead
       * time above: one says how soon before a sitting a guest may still book
       * it, this says how late before closing that sitting may be. It was a
       * constant of sixty in src/lib/openingHours.ts until the café asked for
       * it — an eetcafé closing at nine wants a wider gap than one closing at
       * eight, and the hour was being given to both.
       *
       * It sits under the row rather than inside it, at full width, purely
       * because of the help text. The two things the owners have to understand
       * here — the worked example, and that this is the last table *booked*
       * rather than the last table *occupied* — do not fit in a half-column
       * gutter, and a warning nobody reads is not a warning.
       *
       * Nought is deliberately allowed: it means a guest may book the closing
       * hour itself, which is a real thing to want on a night the bar runs on
       * after the kitchen stops. There is no upper limit tied to the opening
       * hours, because this one number covers a week of days of different
       * lengths; `resolveBookingRules()` caps it at a day, and a gap wider than
       * some day's own hours simply leaves that day with no times, which every
       * screen already knows how to say.
       */
      name: "reservationLastSittingMinutes",
      label: "Laatste reservering vóór sluitingstijd (minuten)",
      type: "number",
      defaultValue: 60,
      min: 0,
      admin: {
        description:
          "Hoeveel minuten vóór sluitingstijd een gast nog een tafel kan "
          + "boeken. Sluiten jullie om 21:00 en staat hier 90, dan is 19:30 het "
          + "laatste tijdstip dat een gast kan kiezen. Let op: dit is het "
          + "laatste moment waarop een tafel geboekt kan worden, niet het "
          + "laatste moment dat er iemand zit. Rekenen jullie twee uur per "
          + "tafel, dan zit een gezelschap dat om 19:30 begint er nog een half "
          + "uur nadat de deur dicht is — dat mag, maar kies het bewust. Vul je "
          + "hier 0 in, dan kan er tot precies sluitingstijd geboekt worden. "
          + "Houd het getal wel ruim onder de tijd dat jullie op je kortste dag "
          + "open zijn, want anders blijven er die dag helemaal geen tijden "
          + "over om uit te kiezen.",
      },
    },
    {
      /**
       * How far apart the sittings sit, which the owners asked to be able to
       * change: at half hours a Saturday evening collapses onto seven, half
       * past seven and eight, and everybody walks in at once. Quarters spread
       * the same arrivals across the kitchen's worst hour without adding a
       * single seat, which is the whole reason it defaults to fifteen.
       *
       * A select of two rather than a number, because only two answers are
       * safe. Every stored booking already sits on a whole or a half hour, so
       * both of these keep every row that exists exactly on grid and no
       * reservation had to be moved; a free number would let somebody type
       * twenty and put every table in the diary between two slots.
       *
       * Written as a string in the CMS the way a select always is, and turned
       * back into a number by `resolveBookingRules()` — which also refuses
       * anything that is not one of these two, so a column edited by hand
       * cannot hand the form a grid the endpoint is not using.
       */
      name: "reservationSlotMinutes",
      label: "Tijdstippen om de",
      type: "select",
      defaultValue: "15",
      options: [
        { label: "Kwartier — 19:00, 19:15, 19:30", value: "15" },
        { label: "Half uur — 19:00, 19:30", value: "30" },
      ],
      admin: {
        description:
          "Om de hoeveel tijd een gast een tafel kan kiezen. Per kwartier "
          + "komen gasten meer verspreid binnen, wat op een drukke zaterdag "
          + "een stuk rustiger werkt in de keuken. Per half uur geeft een "
          + "kortere lijst met tijden. Reserveringen die er al staan blijven "
          + "gewoon staan: die vallen bij allebei de keuzes precies op een "
          + "tijdstip.",
      },
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
