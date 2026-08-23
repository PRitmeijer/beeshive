import type { CollectionConfig, Payload } from "payload";
import { siteUrl } from "@/i18n/config";
import { outboundEmailFields, sendOnChange } from "@/lib/outboundEmail";
import { newGuestToken } from "@/lib/guestToken";
/*
 * Safe to import from here, and deliberately so. The cycle this file already
 * documents further down runs guestPass -> @/lib/payload -> the config -> this
 * file, and it exists because those modules fetch a Payload instance of their
 * own. @/lib/guestHistory does not: it is handed one, which is what the two
 * exported functions take as their second argument, so its only imports are a
 * type from the `payload` package and @/lib/openingHours, which imports
 * nothing at all. Nothing here reaches back round to the config.
 */
import { historyFor } from "@/lib/guestHistory";

/**
 * Reservation requests coming in from the public form.
 *
 * These are requests, not confirmed bookings: the owners call or mail every
 * guest back themselves, and only then move the status along.
 *
 * Access is deliberately lopsided. Anyone may create (the form is public and
 * unauthenticated), but reading, editing and deleting is staff only, since a
 * row holds a name, an e-mail address and a phone number.
 */

interface Reservation {
  id: number | string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  date?: string | null;
  time?: string | null;
  guests?: number | null;
  notes?: string | null;
  occasion?: string | null;
  guestToken?: string | null;
}

/**
 * Where the notification goes. Read out of the CMS every time rather than
 * baked in, so the owners can redirect it themselves (Site Instellingen ->
 * Contact) without a deploy.
 */
async function ownersAddress(payload: Payload): Promise<string> {
  try {
    const settings = await payload.findGlobal({
      slug: "site-settings",
      overrideAccess: true,
    });
    const email = (settings as { contactEmail?: string | null })?.contactEmail;
    return email || "info@debeeshive.nl";
  } catch {
    return "info@debeeshive.nl";
  }
}

/** The stored date is midday UTC; the owners only ever want the day itself. */
const dayOf = (value?: string | null) => (value ? String(value).slice(0, 10) : "-");

/**
 * The one sentence the notification mail carries about the guest themselves.
 *
 * It counts reservations and says so, which is narrower than it looks and
 * deliberately so. What the guest book can prove is that this address or this
 * number booked a table before; whether anybody sat at it, and whether these
 * same people walked in on a Tuesday without booking at all, it has no idea.
 * So the line no longer claims a first visit — plenty of first-time bookers
 * have been at the bar for years — and leaves the owners to draw their own
 * conclusion from a number that is actually true.
 *
 * Every failure mode still gets its own wording rather than being folded into
 * "nee", because this sentence is acted on. "We could not look it up" and
 * "there is nothing to look up" both have to survive the trip to the inbox as
 * themselves, or the mail quietly turns a doubt into a fact.
 *
 * The date is left as a plain YYYY-MM-DD to match the `Datum:` line three rows
 * above it; the sidebar badge in the admin is where it is spelled out in Dutch,
 * because that is read rather than scanned.
 */
async function reservationLine(
  doc: Reservation,
  payload: Payload,
): Promise<string> {
  if (!doc.email?.trim() && !doc.phone?.trim()) {
    return "niet na te gaan, er staat geen e-mailadres en geen telefoonnummer bij";
  }
  try {
    const history = await historyFor(
      { id: doc.id, email: doc.email, phone: doc.phone, date: doc.date },
      payload,
    );
    if (history.isFirstReservation) {
      return "nee";
    }
    const count =
      history.priorReservations === 1
        ? "1 eerdere reservering"
        : `${history.priorReservations} eerdere reserveringen`;
    const before = history.lastReservation
      ? `, de laatste op ${history.lastReservation}`
      : "";
    const how =
      history.matchedOn === "phone" ? " (herkend aan het telefoonnummer)" : "";
    return `ja, ${count}${before}${how}`;
  } catch (error) {
    // Never worth losing the whole notification over. The booking is the point
    // of this mail; the greeting is a courtesy on top of it.
    console.error("guest history unavailable for reservation mail", error);
    return "niet opgezocht, de eerdere reserveringen waren even niet te lezen";
  }
}

export const Reservations: CollectionConfig = {
  slug: "reservations",
  labels: {
    singular: "Reserveringsaanvraag",
    plural: "Reserveringsaanvragen",
  },
  access: {
    // Closed even to anonymous creates. Public create would also open Payload's
    // own POST /api/reservations, and that endpoint skips every check in
    // /api/reserve: no honeypot, no past-date rule, no length caps. The route
    // writes through the local API, which bypasses access by design, so the
    // form keeps working and the REST endpoint stays shut.
    create: () => false,
    // Guest data: never readable or mutable without a login.
    read: ({ req: { user } }) => Boolean(user),
    update: ({ req: { user } }) => Boolean(user),
    delete: ({ req: { user } }) => Boolean(user),
  },
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "date", "guests", "status", "createdAt"],
    description:
      "Aanvragen die via het reserveringsformulier binnenkomen. Een aanvraag is nog geen bevestiging: bel of mail de gast en zet daarna de status.",
    group: "Gasten",
  },
  hooks: {
    beforeChange: [
      ({ data, operation }) => {
        // Minted once, at the very beginning, because the token is what the
        // guest link is made of: handing out a new one silently would break a
        // link that is already in somebody's WhatsApp.
        if (operation === "create" && !data.guestToken) {
          data.guestToken = newGuestToken();
        }
        return data;
      },
    ],
    afterChange: [
      // The mail the owners get used to be sent inline from /api/reserve. It
      // lives here now so that the request being stored and the request being
      // announced are two separate, visible steps: the route only has to say
      // emailStatus "pending", and a failed send leaves a row the owners can
      // retry from the admin instead of a booking nobody heard about.
      sendOnChange<Reservation>({
        to: (_doc, payload) => ownersAddress(payload),
        // Answering goes straight back to the guest.
        replyTo: (doc) =>
          doc.email ? `${doc.name ?? doc.email} <${doc.email}>` : undefined,
        subject: (doc) =>
          `Reserveringsaanvraag: ${doc.name ?? "onbekend"}, ${dayOf(doc.date)} om ${doc.time ?? "-"} (${doc.guests ?? "?"}p)`,
        body: async (doc, payload) =>
          [
            `Naam:        ${doc.name || "-"}`,
            `E-mail:      ${doc.email || "-"}`,
            `Telefoon:    ${doc.phone || "-"}`,
            `Datum:       ${dayOf(doc.date)}`,
            `Tijd:        ${doc.time || "-"}`,
            `Personen:    ${doc.guests ?? "-"}`,
            `Gelegenheid: ${doc.occasion || "-"}`,
            // The owners read this mail long before they open the admin, and
            // on a busy evening they may never open it at all — so the one
            // thing the sidebar badge exists to tell them is said here too.
            `Eerder gereserveerd: ${await reservationLine(doc, payload)}`,
            "",
            "Opmerkingen:",
            doc.notes || "-",
            "",
            `Bekijk en bevestig: ${siteUrl}/admin/collections/reservations/${doc.id}`,
            /*
             * The guest's own page. There is no confirmation mail to the guest
             * yet, so this line is the only way the link reaches them: the
             * owners forward it once the table is confirmed. Built by hand
             * rather than through `guestPassUrl()` from @/lib/guestPass on
             * purpose — that module imports @/lib/payload, which imports the
             * config, which imports this file. If a guest-facing mail is ever
             * added, use `guestPassUrl()` there, where the cycle does not
             * exist.
             */
            `Gastenpagina:  ${doc.guestToken ? `${siteUrl}/reservering/${doc.guestToken}` : "nog niet aangemaakt"}`,
            "",
            "Let op: dit is een aanvraag, nog geen bevestiging. De gast wacht op bericht.",
          ].join("\n"),
      }),
    ],
  },
  fields: [
    {
      type: "row",
      fields: [
        {
          name: "name",
          label: "Naam",
          type: "text",
          required: true,
          maxLength: 120,
          admin: { width: "50%" },
        },
        {
          name: "email",
          label: "E-mailadres",
          type: "email",
          required: true,
          admin: { width: "50%" },
        },
      ],
    },
    {
      type: "row",
      fields: [
        {
          name: "phone",
          label: "Telefoonnummer",
          type: "text",
          required: true,
          maxLength: 40,
          admin: {
            width: "50%",
            description: "Hierop bevestigen we de tafel",
          },
        },
        {
          name: "guests",
          label: "Aantal personen",
          type: "number",
          required: true,
          min: 1,
          max: 30,
          admin: { width: "50%" },
        },
      ],
    },
    {
      type: "row",
      fields: [
        {
          name: "date",
          label: "Datum",
          type: "date",
          required: true,
          admin: {
            width: "50%",
            date: { pickerAppearance: "dayOnly", displayFormat: "d MMMM yyyy" },
          },
        },
        {
          name: "time",
          label: "Tijd",
          type: "text",
          required: true,
          maxLength: 10,
          /**
           * The seat counting in src/lib/capacity.ts lays every booking out on
           * a half-hour grid, and a booking that starts at 19:07 used to occupy
           * a column nothing else ever read: it consumed no capacity and saw
           * none. The arithmetic there now floors an odd time onto the grid, so
           * this is no longer load-bearing — but a table is still either at
           * seven or at half past, and letting the field say otherwise only
           * invites the question of what "19:07" was supposed to mean.
           *
           * /api/reserve never produces one of these; a row typed in by hand in
           * the admin is the only way in, which is why the message is written
           * for the owners rather than for a developer.
           */
          validate: (value: string | null | undefined) => {
            if (!value) return "Vul een tijd in, bijvoorbeeld 19:00.";
            return /^([01]\d|2[0-3]):(00|30)$/.test(value.trim())
              ? true
              : "Gebruik hele of halve uren in 24-uursnotatie, bijvoorbeeld 19:00 of 19:30.";
          },
          admin: { width: "50%" },
        },
      ],
    },
    {
      name: "duration",
      label: "Duur (minuten)",
      type: "number",
      min: 15,
      max: 480,
      // No default: an empty field is the signal to fall back to the standard
      // sitting time, and Payload has no way to express "explicitly nothing".
      admin: {
        description:
          "Hoe lang deze tafel bezet is. Leeg = de standaard uit Site Instellingen.",
      },
    },
    {
      name: "notes",
      label: "Opmerkingen",
      type: "textarea",
      maxLength: 2000,
      admin: {
        description:
          "Allergieën, verjaardag, kinderstoel, een rustige tafel: wat de gast doorgeeft.",
      },
    },
    {
      name: "guestNote",
      label: "Bericht aan het gezelschap",
      type: "textarea",
      maxLength: 500,
      // Not localized, unlike everything on the public site: this is one line
      // written by hand to one party, and the owners know which language that
      // party speaks better than a translation tab does.
      admin: {
        description:
          "Komt op de gedeelde gastenpagina te staan, dus iedereen die de link krijgt leest dit mee. Schrijf het aan het gezelschap zelf, bijvoorbeeld: \"we houden de grote tafel bij het raam voor jullie vrij\". Laat leeg als er niets te melden is.",
      },
    },
    {
      name: "occasion",
      label: "Gelegenheid (oud veld)",
      type: "text",
      maxLength: 120,
      admin: {
        // Not `hidden`: that would take the field out of the admin altogether,
        // and with it the answers the guests who did fill it in already gave.
        // Read-only and down here instead, out of the way but still readable.
        readOnly: true,
        description:
          "Het formulier vraagt hier niet meer naar; de gasten vonden het een vreemde vraag. Wat een gast nu doorgeeft staat bij Opmerkingen. Oude aanvragen houden hun antwoord.",
      },
    },
    {
      name: "guestResponses",
      label: "Reacties van het gezelschap",
      type: "array",
      labels: { singular: "Reactie", plural: "Reacties" },
      admin: {
        description:
          "Wat het gezelschap zelf heeft doorgegeven via de gedeelde link.",
        // Written by the guest page through the local API, never typed here.
        // Left editable so the owners can correct a typo or delete a prank
        // entry, which is the only thing they will ever want to do with it.
        initCollapsed: true,
      },
      fields: [
        {
          type: "row",
          fields: [
            {
              name: "name",
              label: "Naam",
              type: "text",
              admin: { width: "50%" },
            },
            {
              name: "addedAt",
              label: "Doorgegeven op",
              type: "date",
              admin: {
                width: "50%",
                readOnly: true,
                date: { pickerAppearance: "dayAndTime" },
              },
            },
          ],
        },
        {
          name: "dietary",
          label: "Dieetwensen",
          type: "text",
          admin: {
            description: "Wat deze persoon niet eet, gescheiden door komma's",
          },
        },
        {
          name: "drinks",
          label: "Drinken",
          type: "text",
        },
      ],
    },
    {
      /**
       * "Eerste reservering" or "4e reservering", at the top of the sidebar.
       *
       * Reservering rather than bezoek because that is all the database can
       * honestly claim: somebody who walked in on a Tuesday without ringing has
       * been here and no row records it.
       *
       * A `ui` field stores nothing and adds no column: it is a place to hang a
       * component, and everything it shows is worked out at render time from
       * the reservations that are already there. See
       * src/components/admin/GuestHistory.tsx for why the component is a server
       * one, and src/lib/guestHistory.ts for why that matters.
       *
       * First in the sidebar on purpose. It is the thing the owners open a
       * booking to find out, and by the time they have scrolled past the status
       * and the mail bookkeeping they have already decided what to say.
       */
      name: "guestHistory",
      type: "ui",
      admin: {
        position: "sidebar",
        components: { Field: "@/components/admin/GuestHistory#GuestHistory" },
      },
    },
    {
      name: "status",
      label: "Status",
      type: "select",
      options: [
        { label: "Nieuw", value: "nieuw" },
        { label: "Gebeld", value: "gebeld" },
        { label: "Bevestigd", value: "bevestigd" },
        { label: "Geannuleerd", value: "geannuleerd" },
      ],
      defaultValue: "nieuw",
      access: {
        // The public form may never choose its own status. Only a logged in
        // user moves an aanvraag along.
        create: () => false,
        update: ({ req: { user } }) => Boolean(user),
      },
      hooks: {
        // Belt and braces: whatever arrives on a create, the row starts at
        // "nieuw". Field access alone is bypassed by the local API.
        beforeChange: [
          ({ operation, value }) => (operation === "create" ? "nieuw" : value),
        ],
      },
      admin: {
        position: "sidebar",
        description:
          "Nieuw is nog niet bevestigd. Zet op bevestigd zodra de gast bericht heeft.",
      },
    },
    ...outboundEmailFields(),
    {
      name: "guestToken",
      label: "Sleutel gastenpagina",
      type: "text",
      unique: true,
      index: true,
      admin: {
        position: "sidebar",
        readOnly: true,
        description:
          "Het geheime deel van de deelbare link naar de gastenpagina. Iedereen met die link kan de reservering zien en aanvullen, dus deel hem alleen met het gezelschap. Wordt er een nieuwe sleutel gemaakt, dan werkt de oude link niet meer.",
      },
    },
    {
      name: "source",
      label: "Binnengekomen via",
      type: "text",
      defaultValue: "website",
      access: {
        // Same reasoning as status: readOnly only hides a field in the admin
        // UI, it does not stop an API caller from writing it. The local API
        // (used by /api/reserve) bypasses field access and sets this itself.
        create: () => false,
        update: ({ req: { user } }) => Boolean(user),
      },
      admin: {
        position: "sidebar",
        readOnly: true,
        description: "Wordt automatisch ingevuld",
      },
    },
  ],
};
