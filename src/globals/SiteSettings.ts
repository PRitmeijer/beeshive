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
              localized: true,
              defaultValue: "Waar eten en creativiteit samenkomen",
            },
            {
              name: "description",
              label: "Beschrijving (SEO)",
              type: "textarea",
              localized: true,
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
              name: "openingHoursNote",
              label: "Afwijkende openingstijden",
              type: "textarea",
              localized: true,
              admin: {
                description:
                  "Vrij veld voor alles wat niet in het weekschema past. Bijvoorbeeld: "
                  + "'Elke laatste zondag van de maand zijn we open' of een aangepaste "
                  + "tijd rond de feestdagen. Laat leeg als er niets bijzonders is: dan "
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
                  + "→ Link kopiëren. Laat leeg als je dit blok niet op de contactpagina wilt.",
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
        },

        // ── Homepage ──
        {
          label: "Homepage",
          fields: [
            {
              name: "heroTitle",
              label: "Hero Titel",
              type: "text",
              localized: true,
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
              localized: true,
              defaultValue:
                "Waar eten en creativiteit samenkomen. Een warm eetcafé in het hart van Zuilen.",
            },
            {
              name: "introTitle",
              label: "Introductie Titel",
              type: "text",
              localized: true,
              defaultValue: "De kunst van het leven",
            },
            {
              name: "introText",
              label: "Introductie Tekst",
              type: "textarea",
              localized: true,
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
                  title: "Gemeenschap",
                  text: "Meer dan een restaurant. Een gemeenschap waar iedereen welkom is.",
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
                  localized: true,
                },
                {
                  name: "text",
                  label: "Tekst",
                  type: "textarea",
                  required: true,
                  localized: true,
                },
              ],
            },
            {
              name: "quote",
              label: "Quote",
              type: "text",
              localized: true,
              defaultValue:
                "Eten is kunst, en iedereen is welkom om hun creatieve zelf te zijn",
            },
            {
              name: "quoteAttribution",
              label: "Quote Toeschrijving",
              type: "text",
              localized: true,
              defaultValue: "De Bee's Hive",
            },
            {
              name: "newsletterTitle",
              label: "Nieuwsbrief Titel",
              type: "text",
              localized: true,
              defaultValue: "Schrijf je in",
            },
            {
              name: "newsletterText",
              label: "Nieuwsbrief Tekst",
              type: "text",
              localized: true,
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
              localized: true,
              defaultValue:
                "De Bee's Hive is meer dan een restaurant. Het is een plek waar kunst, creativiteit en lekker eten samenkomen in het hart van Zuilen, Utrecht.",
            },
            {
              name: "aboutStory",
              label: "Ons Verhaal",
              type: "richText",
              localized: true,
              admin: {
                description:
                  "Het volledige verhaal op de Over Ons pagina. Gebruik de editor voor opmaak.",
              },
            },
            {
              name: "aboutQuote",
              label: "Quote",
              type: "text",
              localized: true,
              defaultValue:
                "Wij zijn een familie met een passie voor eten, kunst en verbinding.",
            },
            {
              name: "aboutImage",
              label: "Foto",
              type: "upload",
              relationTo: "media",
              admin: {
                description:
                  "Eén foto op de Over Ons pagina, onder de quote. Bijvoorbeeld de familie, "
                  + "de keuken of de zaak. Laat leeg als je hier niets wilt tonen. "
                  + "Staat er ook een video-URL ingevuld, dan wint de video.",
              },
            },
            {
              name: "aboutVideoUrl",
              label: "Video (YouTube of Vimeo)",
              type: "text",
              admin: {
                description:
                  "Plak de embed-URL van de video, bijv. https://www.youtube.com/embed/XXXXXXXXXXX "
                  + "of https://player.vimeo.com/video/123456789. Op YouTube: Delen → Insluiten → "
                  + "kopieer de src uit de iframe-code. Een gewone youtube.com/watch?v=... link "
                  + "werkt niet. Video's zelf uploaden kan hier niet, die worden te groot.",
              },
            },
            {
              name: "aboutMediaCaption",
              label: "Bijschrift bij foto of video",
              type: "text",
              localized: true,
              admin: {
                description:
                  "Eén korte regel onder de foto of video. Laat leeg voor geen bijschrift.",
              },
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
                  text: "Van Zuid-Afrika naar Zuilen. Onze culturele reis vormt de basis van alles wat we doen.",
                },
                {
                  icon: "🌿",
                  title: "Duurzaamheid",
                  text: "Lokale ingrediënten, seizoensgebonden gerechten en respect voor de natuur.",
                },
                {
                  icon: "💛",
                  title: "Gemeenschap",
                  text: "Een warme plek voor iedereen: buren, families, kunstenaars en dromers.",
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
                  localized: true,
                },
                {
                  name: "text",
                  label: "Tekst",
                  type: "textarea",
                  required: true,
                  localized: true,
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
              localized: true,
              defaultValue: "Gemaakt met liefde in Zuilen",
            },
          ],
        },
      ],
    },
  ],
};
