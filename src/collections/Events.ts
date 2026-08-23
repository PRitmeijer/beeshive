import type { CollectionConfig } from "payload";

/**
 * Everything that happens in the café on a particular evening.
 *
 * Most of it repeats: a monthly quiz, a weekly borrel, a workshop on the last
 * Sunday. Rather than ask the owners to type the same evening twelve times,
 * one row carries the pattern and src/lib/events.ts expands it into
 * occurrences while a page is being rendered. Nothing is ever materialised as
 * extra rows in the database — an expanded occurrence exists only for as long
 * as it takes to draw a list, which is why editing the series afterwards fixes
 * every future date at once and why deleting the row makes the whole series
 * disappear.
 *
 * The consequence worth remembering when reading the fields below: `startDate`
 * carries both the date the series begins and the TIME every occurrence
 * inherits. Moving the quiz from 20:00 to 19:30 is a change to `startDate`,
 * not to anything under `recurrence`. `recurrence.until` ends the series,
 * `recurrence.skipDates` punches single holes in it (the one week it is
 * cancelled), and neither of them touches the clock.
 */
export const Events: CollectionConfig = {
  slug: "events",
  labels: {
    singular: "Evenement",
    plural: "Evenementen",
  },
  access: {
    // The agenda is a public page; the rest needs a login.
    read: () => true,
    create: ({ req: { user } }) => Boolean(user),
    update: ({ req: { user } }) => Boolean(user),
    delete: ({ req: { user } }) => Boolean(user),
  },
  admin: {
    useAsTitle: "title",
    // "recurrence.type" rather than a flat "recurrenceType": the column list
    // addresses a field inside a group by its full path.
    defaultColumns: ["title", "startDate", "recurrence.type", "status"],
    description:
      "Alles wat er bij jullie te doen is: eenmalige avonden en terugkerende afspraken. Vul bij een terugkerend evenement één keer de eerste datum in en kies daaronder hoe vaak het terugkomt.",
    group: "Inhoud",
  },
  fields: [
    /**
     * "Neem de Nederlandse tekst over in het Engels" — one button that copies
     * every localized field the editor has not filled in yet, so adding a
     * photo no longer means saving, switching tab and saving again for fields
     * that were never going to differ. A `ui` field: nothing is stored, no
     * migration, and the component decides its own direction from the locale
     * the editor is looking at. See src/components/admin/CopyToLocale.tsx.
     */
    {
      name: "vertalingen",
      type: "ui",
      admin: {
        components: { Field: "@/components/admin/CopyToLocale#CopyToLocale" },
      },
    },
    {
      name: "title",
      label: "Titel",
      type: "text",
      required: true,
      localized: true,
    },
    {
      name: "excerpt",
      label: "Korte omschrijving",
      type: "textarea",
      required: true,
      localized: true,
      maxLength: 300,
      admin: {
        description:
          "Twee of drie zinnen die in de agenda onder de titel komen te staan (max 300 tekens)",
      },
    },
    {
      name: "description",
      label: "Volledige tekst",
      type: "richText",
      localized: true,
      admin: {
        description:
          "Het hele verhaal, zoals het op de pagina van dit evenement komt te staan",
      },
    },
    {
      name: "image",
      label: "Afbeelding",
      type: "upload",
      relationTo: "media",
      // Optional on purpose, and the description says so out loud: the owners
      // should not hold an evening back because there is no photo of it yet.
      required: false,
      admin: {
        description:
          "Mag leeg blijven. Een evenement zonder foto krijgt vanzelf een getekende plaat.",
      },
    },
    {
      type: "row",
      fields: [
        {
          name: "startDate",
          label: "Begint op",
          type: "date",
          required: true,
          admin: {
            width: "50%",
            date: {
              pickerAppearance: "dayAndTime",
              displayFormat: "d MMMM yyyy HH:mm",
            },
            description:
              "Datum én tijd. Bij een terugkerend evenement is dit de eerste keer, en het tijdstip geldt voor alle volgende keren.",
          },
        },
        {
          name: "endDate",
          label: "Eindigt op",
          type: "date",
          admin: {
            width: "50%",
            date: {
              pickerAppearance: "dayAndTime",
              displayFormat: "d MMMM yyyy HH:mm",
            },
            description: "Laat leeg als het einde niet vaststaat.",
          },
        },
      ],
    },
    {
      name: "allDay",
      label: "Hele dag",
      type: "checkbox",
      defaultValue: false,
      admin: {
        description: "Vink aan als er geen begintijd te noemen is.",
      },
    },
    {
      name: "recurrence",
      label: "Herhaling",
      type: "group",
      admin: {
        description:
          "Komt dit vaker terug? Vul het hier in, dan verschijnt het vanzelf op alle volgende dagen.",
      },
      fields: [
        {
          name: "type",
          label: "Hoe vaak",
          type: "select",
          options: [
            { label: "Eenmalig", value: "none" },
            { label: "Elke week", value: "weekly" },
            { label: "Om de week", value: "biweekly" },
            { label: "Elke maand op een vaste weekdag", value: "monthlyWeekday" },
            { label: "Elke maand op dezelfde datum", value: "monthlyDate" },
          ],
          defaultValue: "none",
        },
        {
          name: "weekday",
          label: "Op welke dag",
          type: "select",
          options: [
            { label: "Maandag", value: "monday" },
            { label: "Dinsdag", value: "tuesday" },
            { label: "Woensdag", value: "wednesday" },
            { label: "Donderdag", value: "thursday" },
            { label: "Vrijdag", value: "friday" },
            { label: "Zaterdag", value: "saturday" },
            { label: "Zondag", value: "sunday" },
          ],
          admin: {
            condition: (_data, siblingData) =>
              ["weekly", "biweekly", "monthlyWeekday"].includes(
                siblingData?.type,
              ),
          },
        },
        {
          name: "ordinal",
          label: "De hoeveelste",
          type: "select",
          options: [
            { label: "Eerste", value: "first" },
            { label: "Tweede", value: "second" },
            { label: "Derde", value: "third" },
            { label: "Vierde", value: "fourth" },
            { label: "Laatste", value: "last" },
          ],
          admin: {
            description: "Bijvoorbeeld: de laatste zondag van de maand.",
            condition: (_data, siblingData) =>
              siblingData?.type === "monthlyWeekday",
          },
        },
        {
          name: "until",
          label: "Loopt tot",
          type: "date",
          admin: {
            date: { pickerAppearance: "dayOnly", displayFormat: "d MMMM yyyy" },
            description:
              "Tot wanneer dit doorloopt. Laat leeg voor: voorlopig altijd.",
            condition: (_data, siblingData) => siblingData?.type !== "none",
          },
        },
        {
          name: "skipDates",
          label: "Uitzonderingen",
          type: "array",
          labels: { singular: "Datum", plural: "Data" },
          admin: {
            description: "Dagen waarop het een keer NIET doorgaat.",
            condition: (_data, siblingData) => siblingData?.type !== "none",
          },
          fields: [
            {
              name: "date",
              label: "Datum",
              type: "date",
              required: true,
              admin: {
                date: {
                  pickerAppearance: "dayOnly",
                  displayFormat: "d MMMM yyyy",
                },
              },
            },
          ],
        },
      ],
    },
    {
      type: "row",
      fields: [
        {
          name: "location",
          label: "Locatie",
          type: "text",
          localized: true,
          admin: {
            width: "50%",
            description: "Laat leeg voor bij ons in de zaak.",
          },
        },
        {
          name: "price",
          label: "Prijs",
          type: "text",
          localized: true,
          admin: {
            width: "50%",
            description:
              "Bijv. '7,50' of 'Gratis'. Laat leeg als het niet van toepassing is.",
          },
        },
      ],
    },
    {
      name: "bookingRequired",
      label: "Aanmelden nodig",
      type: "checkbox",
      defaultValue: false,
      admin: {
        description: "Vink aan als mensen zich vooraf moeten opgeven.",
      },
    },
    {
      name: "bookingUrl",
      label: "Aanmeldlink",
      type: "text",
      admin: {
        description:
          "Volledige link naar het formulier of de ticketpagina. Laat leeg als mensen gewoon even bellen.",
        condition: (_data, siblingData) => Boolean(siblingData?.bookingRequired),
      },
    },
    {
      name: "bookingNote",
      label: "Uitleg bij aanmelden",
      type: "text",
      localized: true,
      admin: {
        description:
          "Eén zin, bijvoorbeeld 'Vol is vol' of 'Bel even, dan zetten we je op de lijst'.",
        condition: (_data, siblingData) => Boolean(siblingData?.bookingRequired),
      },
    },
    {
      name: "category",
      label: "Categorie",
      type: "select",
      options: [
        { label: "🏘️ Buurt", value: "buurt" },
        { label: "🎶 Muziek", value: "muziek" },
        { label: "🎨 Workshop", value: "workshop" },
        { label: "🍷 Proeverij", value: "proeverij" },
        { label: "🎉 Feest", value: "feest" },
        { label: "✨ Overig", value: "overig" },
      ],
      defaultValue: "overig",
      admin: {
        position: "sidebar",
        description: "Categorie helpt bezoekers bij het filteren",
      },
    },
    {
      name: "slug",
      label: "URL-slug",
      type: "text",
      required: true,
      unique: true,
      admin: {
        position: "sidebar",
        description: "Het deel van de URL na /evenementen/",
      },
    },
    {
      name: "status",
      label: "Status",
      type: "select",
      options: [
        { label: "📝 Concept", value: "draft" },
        { label: "✅ Gepubliceerd", value: "published" },
      ],
      defaultValue: "draft",
      required: true,
      admin: {
        position: "sidebar",
        description: "Alleen gepubliceerde evenementen staan op de site.",
      },
    },
    {
      name: "featured",
      label: "Uitgelicht",
      type: "checkbox",
      defaultValue: false,
      admin: {
        position: "sidebar",
        description:
          "Zet dit evenement bovenaan de agenda en op de voorpagina.",
      },
    },
  ],
};
