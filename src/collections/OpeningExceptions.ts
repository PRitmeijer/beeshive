import type { CollectionConfig } from "payload";

/**
 * Single days that do not follow the normal week.
 *
 * The weekly schedule in Site Instellingen is the rule; this is the list of
 * exceptions to it, one row per calendar day. Christmas, a private party, a
 * funeral, an extra Sunday open because the neighbourhood asked — all the same
 * shape: a date, whether the doors are shut, and a line the site can show so a
 * guest standing outside knows why.
 *
 * Kept as its own collection rather than as rows inside the settings global so
 * that a past date can simply be deleted, and so the reservation form can look
 * one day up by date instead of walking a list.
 */
export const OpeningExceptions: CollectionConfig = {
  slug: "opening-exceptions",
  labels: {
    singular: "Afwijkende dag",
    plural: "Afwijkende dagen",
  },
  access: {
    /**
     * Public, but only the rows that were meant to be public.
     *
     * The opening hours block, the contact page and the reservation form all
     * read this while rendering and none of them has a user, so it cannot be
     * staff-only. `read: () => true` was too generous, though: it is Payload's
     * own REST endpoint as well as ours, and an anonymous
     * `GET /api/opening-exceptions` handed back every row — including the ones
     * the owners had deliberately unticked, with the Dutch note still on them.
     * "Besloten feest, 14 december" is not a secret exactly, but it is nobody
     * else's business either.
     *
     * A query constraint rather than a yes/no, so a logged-in editor keeps
     * seeing everything and a stranger sees only what is on the site. This does
     * NOT change what the site itself resolves: `loadSchedule` in
     * src/lib/schedule.ts goes through the Local API, which bypasses access by
     * design, so a day that is closed but not announced still closes the
     * bookings — which is exactly what `showOnSite` is for.
     */
    read: ({ req: { user } }) =>
      user ? true : { showOnSite: { equals: true } },
    create: ({ req: { user } }) => Boolean(user),
    update: ({ req: { user } }) => Boolean(user),
    delete: ({ req: { user } }) => Boolean(user),
  },
  admin: {
    useAsTitle: "date",
    defaultColumns: ["date", "closed", "hours", "note"],
    description:
      "Hiermee zetten jullie een enkele dag dicht of juist open, los van het normale weekschema. Een terugkerende regel (bijvoorbeeld elke laatste zondag van de maand) staat bij Site Instellingen -> Contact.",
    group: "Instellingen",
  },
  timestamps: true,
  hooks: {
    beforeValidate: [
      ({ data }) => {
        // Stored at midday UTC: a dayOnly field must not slide to the day
        // before or after when it is rendered in another timezone. Midday
        // survives every offset the site will ever be read in.
        if (data?.date) {
          const day = String(data.date).slice(0, 10);
          if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
            const midday = new Date(`${day}T12:00:00.000Z`);
            if (!Number.isNaN(midday.getTime())) {
              data.date = midday.toISOString();
            }
          }
        }
        return data;
      },
    ],
  },
  fields: [
    {
      name: "date",
      label: "Datum",
      type: "date",
      required: true,
      unique: true,
      admin: {
        date: { pickerAppearance: "dayOnly", displayFormat: "d MMMM yyyy" },
        description: "De dag waar het om gaat. Eén rij per dag.",
      },
    },
    {
      name: "closed",
      label: "Gesloten",
      type: "checkbox",
      defaultValue: false,
      admin: {
        description: "Vink aan als jullie die dag dicht zijn.",
      },
    },
    {
      name: "hours",
      label: "Openingstijden",
      type: "text",
      localized: true,
      admin: {
        description:
          "Bijvoorbeeld '11:00 - 21:00'. Alleen invullen als jullie die dag open zijn, maar op andere tijden dan normaal.",
        condition: (_data, siblingData) => !siblingData?.closed,
      },
    },
    {
      name: "note",
      label: "Toelichting",
      type: "text",
      localized: true,
      admin: {
        description:
          "Wat er die dag aan de hand is; dit komt op de site te staan, bijvoorbeeld 'Eerste Kerstdag' of 'Besloten feest'.",
      },
    },
    {
      name: "showOnSite",
      label: "Tonen op de site",
      type: "checkbox",
      defaultValue: true,
      admin: {
        position: "sidebar",
        description:
          "Uit zetten als de dag wel meetelt voor reserveringen, maar niet apart genoemd hoeft te worden.",
      },
    },
  ],
};
