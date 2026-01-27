import type { GlobalConfig } from "payload";

export const SiteSettings: GlobalConfig = {
  slug: "site-settings",
  label: "Site Instellingen",
  fields: [
    // ── General ──
    {
      type: "tabs",
      tabs: [
        {
          label: "Algemeen",
          fields: [
            {
              name: "siteName",
              label: "Naam",
              type: "text",
              defaultValue: "De Bee's Hive",
              required: true,
            },
            {
              name: "tagline",
              label: "Slogan",
              type: "text",
              defaultValue: "Waar eten en creativiteit samenkomen",
            },
            {
              name: "description",
              label: "Beschrijving (SEO)",
              type: "textarea",
              defaultValue:
                "Een warm eetcafé in het hart van Zuilen waar creativiteit, verbinding en lekker eten samenkomen.",
            },
            {
              name: "cuisines",
              label: "Keukens (voor SEO)",
              type: "text",
              defaultValue: "Dutch, International, South African",
              admin: {
                description:
                  "Komma-gescheiden lijst van keukens voor zoekmachines",
              },
            },
            {
              name: "priceRange",
              label: "Prijsklasse",
              type: "text",
              defaultValue: "€€",
            },
            {
              name: "reservationUrl",
              label: "Reserverings-URL",
              type: "text",
              admin: {
                description:
                  "Link naar reserveringssysteem (bijv. formitable, couverts). Laat leeg om knop te verbergen.",
              },
            },
            {
              name: "heroImage",
              label: "Hero Afbeelding",
              type: "upload",
              relationTo: "media",
            },
            {
              name: "logo",
              label: "Logo",
              type: "upload",
              relationTo: "media",
            },
          ],
        },

        // ── Contact ──
        {
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
                },
                {
                  name: "hours",
                  label: "Tijden",
                  type: "text",
                  required: true,
                  admin: {
                    description: "Bijv. '12:00 – 22:00' of 'Gesloten'",
                  },
                },
              ],
              defaultValue: [
                { day: "Maandag", hours: "Gesloten" },
                { day: "Dinsdag", hours: "Gesloten" },
                { day: "Woensdag", hours: "12:00 – 22:00" },
                { day: "Donderdag", hours: "12:00 – 22:00" },
                { day: "Vrijdag", hours: "12:00 – 22:00" },
                { day: "Zaterdag", hours: "12:00 – 22:00" },
                { day: "Zondag", hours: "12:00 – 22:00" },
              ],
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
                  defaultValue: "https://instagram.com/debeeshive",
                },
                {
                  name: "facebook",
                  label: "Facebook URL",
                  type: "text",
                },
                {
                  name: "tripadvisor",
                  label: "TripAdvisor URL",
                  type: "text",
                },
              ],
            },
          ],
        },

        // ── Homepage ──
        {
          label: "Homepage",
          fields: [
            {
              name: "heroTitle",
              label: "Hero Titel",
              type: "text",
              defaultValue: "De Bee's Hive",
              admin: {
                description:
                  "De grote titel op de homepage. Gebruik | om het accent-woord te scheiden, bijv. 'De Bee's|Hive'",
              },
            },
            {
              name: "heroSubtitle",
              label: "Hero Ondertitel",
              type: "text",
              defaultValue:
                "Waar eten en creativiteit samenkomen. Een warm eetcafé in het hart van Zuilen.",
            },
            {
              name: "introTitle",
              label: "Introductie Titel",
              type: "text",
              defaultValue: "De kunst van het leven",
            },
            {
              name: "introText",
              label: "Introductie Tekst",
              type: "textarea",
              defaultValue:
                "De Bee's Hive ontstond uit een liefde voor alle vormen van kunst en creativiteit in het dagelijks leven. Begonnen in Zuid-Afrika, keerden wij terug naar onze Nederlandse roots om een plek te creëren waar het 'kunst van het leven' kan floreren.",
            },
            {
              name: "features",
              label: "Kenmerken",
              type: "array",
              maxRows: 6,
              defaultValue: [
                {
                  icon: "🍳",
                  title: "Creatieve Keuken",
                  text: "Gerechten bereid met passie, lokale ingrediënten en een vleugje creativiteit.",
                },
                {
                  icon: "🎨",
                  title: "Kunst & Cultuur",
                  text: "Een plek waar creativiteit, verbinding en schoonheid in elke hoek zichtbaar is.",
                },
                {
                  icon: "🤝",
                  title: "Verbinding",
                  text: "Meer dan een restaurant — een gemeenschap waar iedereen welkom is.",
                },
              ],
              fields: [
                {
                  name: "icon",
                  label: "Emoji/Icoon",
                  type: "text",
                  required: true,
                },
                {
                  name: "title",
                  label: "Titel",
                  type: "text",
                  required: true,
                },
                {
                  name: "text",
                  label: "Tekst",
                  type: "textarea",
                  required: true,
                },
              ],
            },
            {
              name: "quote",
              label: "Quote",
              type: "text",
              defaultValue:
                "Eten is kunst, en iedereen is welkom om hun creatieve zelf te zijn",
            },
            {
              name: "quoteAttribution",
              label: "Quote Toeschrijving",
              type: "text",
              defaultValue: "De Bee's Hive",
            },
            {
              name: "newsletterTitle",
              label: "Nieuwsbrief Titel",
              type: "text",
              defaultValue: "Schrijf je in",
            },
            {
              name: "newsletterText",
              label: "Nieuwsbrief Tekst",
              type: "text",
              defaultValue:
                "Ontvang als eerste nieuws over speciale evenementen, nieuwe gerechten en aanbiedingen.",
            },
          ],
        },

        // ── Over Ons ──
        {
          label: "Over Ons",
          fields: [
            {
              name: "aboutIntro",
              label: "Intro Tekst",
              type: "textarea",
              defaultValue:
                "De Bee's Hive is meer dan een restaurant — het is een plek waar kunst, creativiteit en lekker eten samenkomen in het hart van Zuilen, Utrecht.",
            },
            {
              name: "aboutStory",
              label: "Ons Verhaal",
              type: "richText",
              admin: {
                description:
                  "Het volledige verhaal op de Over Ons pagina. Gebruik de editor voor opmaak.",
              },
            },
            {
              name: "aboutQuote",
              label: "Quote",
              type: "text",
              defaultValue:
                "Wij zijn een familie met een passie voor eten, kunst en verbinding.",
            },
            {
              name: "values",
              label: "Waarden",
              type: "array",
              maxRows: 6,
              defaultValue: [
                {
                  icon: "🌍",
                  title: "Onze Roots",
                  text: "Van Zuid-Afrika naar Zuilen — onze culturele reis vormt de basis van alles wat we doen.",
                },
                {
                  icon: "🌿",
                  title: "Duurzaamheid",
                  text: "Lokale ingrediënten, seizoensgebonden gerechten en respect voor de natuur.",
                },
                {
                  icon: "💛",
                  title: "Gemeenschap",
                  text: "Een warme plek voor iedereen — buren, families, kunstenaars en dromers.",
                },
              ],
              fields: [
                {
                  name: "icon",
                  label: "Emoji/Icoon",
                  type: "text",
                  required: true,
                },
                {
                  name: "title",
                  label: "Titel",
                  type: "text",
                  required: true,
                },
                {
                  name: "text",
                  label: "Tekst",
                  type: "textarea",
                  required: true,
                },
              ],
            },
          ],
        },

        // ── Footer ──
        {
          label: "Footer",
          fields: [
            {
              name: "footerTagline",
              label: "Footer Slogan",
              type: "text",
              defaultValue: "Gemaakt met liefde in Zuilen",
            },
          ],
        },
      ],
    },
  ],
};
