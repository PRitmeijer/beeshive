import type { CollectionConfig } from "payload";

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
          maxLength: 40,
          admin: {
            width: "50%",
            description: "Handig om even terug te bellen",
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
          admin: { width: "50%" },
        },
      ],
    },
    {
      name: "occasion",
      label: "Gelegenheid",
      type: "text",
      maxLength: 120,
      admin: {
        description: "Bijvoorbeeld verjaardag, zakenlunch of familiediner",
      },
    },
    {
      name: "notes",
      label: "Opmerkingen",
      type: "textarea",
      maxLength: 2000,
      admin: {
        description: "Wensen van de gast, allergieën, kinderstoel en dergelijke",
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
