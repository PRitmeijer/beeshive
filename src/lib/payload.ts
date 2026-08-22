import { getPayload } from "payload";
import config from "@payload-config";
import { defaultLocale, type Locale } from "@/i18n/config";

export const getPayloadClient = () => getPayload({ config });

/**
 * Site settings the pages can rely on before anyone has touched the CMS.
 *
 * The Dutch set is the shape of the data: `SiteSettingsData` is derived from
 * it, so the English set cannot drift out of step. Payload itself already
 * falls back from English to Dutch for any field left empty in the admin
 * (see `localization.fallback` in src/payload.config.ts); these defaults only
 * cover the case where the CMS has no value in either language, or is not
 * reachable at all.
 */
/**
 * What an upload field hands back once Payload has populated it. Only the
 * parts anything actually renders are named; the rest of the document is real
 * but of no interest here.
 */
export interface MediaRef {
  url?: string | null;
  alt?: string | null;
  width?: number | null;
  height?: number | null;
  sizes?: {
    card?: { url?: string | null } | null;
    hero?: { url?: string | null } | null;
  } | null;
}

const nlDefaults = {
  siteName: "De Bee's Hive",
  tagline: "Waar eten en creativiteit samenkomen",
  description:
    "Een warm eetcafé in het hart van Zuilen waar creativiteit, verbinding en lekker eten samenkomen.",
  cuisines: "Dutch, International, South African",
  priceRange: "€€",
  reservationUrl: "",
  contactEmail: "info@debeeshive.nl",
  phone: "030 785 2199",
  address: {
    street: "",
    city: "Utrecht",
    area: "Zuilen",
    postalCode: "",
    country: "Nederland",
    countryCode: "NL",
  },
  // Monday first, always: ContactClient and ReserverenClient find a row by its
  // position in this list rather than by the day's name, so a translated or
  // re-typed label still lands on the right day.
  openingHours: [
    { day: "Maandag", hours: "11:00 – 21:00" },
    { day: "Dinsdag", hours: "Gesloten" },
    { day: "Woensdag", hours: "Gesloten" },
    { day: "Donderdag", hours: "11:00 – 21:00" },
    { day: "Vrijdag", hours: "11:00 – 21:00" },
    { day: "Zaterdag", hours: "11:00 – 21:00" },
    { day: "Zondag", hours: "Gesloten" },
  ],
  socialMedia: {
    instagram: "https://www.instagram.com/debeeshive",
    facebook: "https://www.facebook.com/people/De-Bees-Hive/61573726474222",
    tripadvisor: "",
  },
  heroTitle: "De Bee's Hive",
  heroSubtitle:
    "Waar eten en creativiteit samenkomen. Een warm eetcafé in het hart van Zuilen.",
  introTitle: "De kunst van het leven",
  introText:
    "De Bee's Hive ontstond uit een liefde voor alle vormen van kunst en creativiteit in het dagelijks leven. Begonnen in Zuid-Afrika, keerden wij terug naar onze Nederlandse roots om een plek te creëren waar het 'kunst van het leven' kan floreren.",
  features: [
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
  quote: "Eten is kunst, en iedereen is welkom om hun creatieve zelf te zijn",
  quoteAttribution: "De Bee's Hive",
  newsletterTitle: "Schrijf je in",
  newsletterText:
    "Ontvang als eerste nieuws over speciale evenementen, nieuwe gerechten en aanbiedingen.",
  aboutIntro:
    "De Bee's Hive is meer dan een restaurant. Het is een plek waar kunst, creativiteit en lekker eten samenkomen in het hart van Zuilen, Utrecht.",
  aboutStory: null as string | null,
  aboutQuote:
    "Wij zijn een familie met een passie voor eten, kunst en verbinding.",
  aboutImage: null as MediaRef | null,
  aboutVideoUrl: "",
  aboutMediaCaption: "",
  values: [
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
  footerTagline: "Gemaakt met liefde in Zuilen",
  // Taken from their own previous site. The listing behind it is what carries
  // the reviews, so the same URL serves the review block on /contact.
  googleMapsEmbedUrl:
    "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2450.3781318959013!2d5.086582076321947!3d52.10924836655966!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x47c66f402cf74da3%3A0xf5db732de51fc331!2sDe%20Bee%27s%20Hive!5e0!3m2!1snl!2snl!4v1756807839954!5m2!1snl!2snl",
  googleReviewUrl: "https://maps.app.goo.gl/6VEMHL3Jq9vgAWnw8",
  openingHoursNote: "Elke laatste zondag van de maand zijn wij extra geopend.",
};

export type SiteSettingsData = typeof nlDefaults;

const enDefaults: SiteSettingsData = {
  siteName: "De Bee's Hive",
  tagline: "Where food and creativity meet",
  description:
    "A warm eetcafé in the heart of Zuilen where creativity, connection and good food come together.",
  cuisines: "Dutch, International, South African",
  priceRange: "€€",
  reservationUrl: "",
  contactEmail: "info@debeeshive.nl",
  phone: "030 785 2199",
  address: {
    street: "",
    city: "Utrecht",
    area: "Zuilen",
    postalCode: "",
    country: "The Netherlands",
    countryCode: "NL",
  },
  openingHours: [
    { day: "Monday", hours: "11:00 – 21:00" },
    { day: "Tuesday", hours: "Closed" },
    { day: "Wednesday", hours: "Closed" },
    { day: "Thursday", hours: "11:00 – 21:00" },
    { day: "Friday", hours: "11:00 – 21:00" },
    { day: "Saturday", hours: "11:00 – 21:00" },
    { day: "Sunday", hours: "Closed" },
  ],
  socialMedia: {
    instagram: "https://www.instagram.com/debeeshive",
    facebook: "https://www.facebook.com/people/De-Bees-Hive/61573726474222",
    tripadvisor: "",
  },
  heroTitle: "De Bee's Hive",
  heroSubtitle:
    "Where food and creativity meet. A warm eetcafé in the heart of Zuilen.",
  introTitle: "The art of living",
  introText:
    "De Bee's Hive grew out of a love for every form of art and creativity in daily life. It started in South Africa, and we returned to our Dutch roots to make a place where the 'art of living' can flourish.",
  features: [
    {
      icon: "🍳",
      title: "A creative kitchen",
      text: "Dishes made with passion, local ingredients and a touch of invention.",
    },
    {
      icon: "🎨",
      title: "Art & culture",
      text: "A place where creativity, connection and beauty show in every corner.",
    },
    {
      icon: "🤝",
      title: "Community",
      text: "More than a restaurant. A community where everyone is welcome.",
    },
  ],
  quote: "Food is art, and everyone is welcome to be their creative self",
  quoteAttribution: "De Bee's Hive",
  newsletterTitle: "Sign up",
  newsletterText:
    "Be the first to hear about special events, new dishes and offers.",
  aboutIntro:
    "De Bee's Hive is more than a restaurant. It is a place where art, creativity and good food come together in the heart of Zuilen, Utrecht.",
  aboutStory: null as string | null,
  aboutQuote: "We are a family with a passion for food, art and connection.",
  aboutImage: null as MediaRef | null,
  aboutVideoUrl: "",
  aboutMediaCaption: "",
  values: [
    {
      icon: "🌍",
      title: "Our roots",
      text: "From South Africa to Zuilen. Our cultural journey underpins everything we do.",
    },
    {
      icon: "🌿",
      title: "Sustainability",
      text: "Local ingredients, seasonal dishes and respect for the land.",
    },
    {
      icon: "💛",
      title: "Community",
      text: "A warm place for everyone: neighbours, families, artists and dreamers.",
    },
  ],
  footerTagline: "Made with love in Zuilen",
  // Taken from their own previous site. The listing behind it is what carries
  // the reviews, so the same URL serves the review block on /contact.
  googleMapsEmbedUrl:
    "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2450.3781318959013!2d5.086582076321947!3d52.10924836655966!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x47c66f402cf74da3%3A0xf5db732de51fc331!2sDe%20Bee%27s%20Hive!5e0!3m2!1snl!2snl!4v1756807839954!5m2!1snl!2snl",
  googleReviewUrl: "https://maps.app.goo.gl/6VEMHL3Jq9vgAWnw8",
  openingHoursNote: "We are also open on the last Sunday of every month.",
};

const defaultsByLocale: Record<Locale, SiteSettingsData> = {
  nl: nlDefaults,
  en: enDefaults,
};

/**
 * Drop anything that carries no content, so a blank CMS field cannot beat a
 * default.
 *
 * Arrays need the same treatment as scalars. A localised array such as
 * openingHours or features still returns one row per entry in an untranslated
 * locale, with every value inside it null. That array is truthy, so a naive
 * check keeps it and the locale's defaults never apply, which is how the
 * English home page ended up rendering rows with no opening time in them.
 */
function hasContent(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return false;
  if (Array.isArray(value)) return value.some(hasContent);
  if (typeof value === "object") {
    // Payload gives array rows an `id`, which is not content on its own.
    return Object.entries(value as Record<string, unknown>).some(
      ([key, v]) => key !== "id" && hasContent(v),
    );
  }
  return true;
}

function filled(source: Record<string, unknown> | null | undefined) {
  return Object.fromEntries(
    Object.entries(source || {}).filter(([, v]) => hasContent(v)),
  );
}

/**
 * Site settings for one language.
 *
 * `localization.fallback` is on so the admin shows the Dutch value as a hint
 * next to an empty English field. For rendering that is exactly wrong: the
 * fallback hands back Dutch text, `filled()` sees a non-empty string, and the
 * English defaults below never get a chance. So reads for a non-default locale
 * ask for that locale only, and anything genuinely untranslated falls through
 * to the English defaults in this file instead of to Dutch.
 */
export async function getSiteSettings(
  locale: Locale = defaultLocale,
): Promise<SiteSettingsData> {
  const defaults = defaultsByLocale[locale] ?? nlDefaults;
  try {
    const payload = await getPayloadClient();
    const data = await payload.findGlobal({
      slug: "site-settings",
      locale,
      // `false` is the Local API's way of saying "no fallback"; "none" is the
      // REST query string spelling of the same thing, and is not in the type.
      ...(locale === defaultLocale ? {} : { fallbackLocale: false as const }),
    });
    // Merge CMS data over defaults, keeping defaults for any missing fields
    return {
      ...defaults,
      ...filled(data as unknown as Record<string, unknown>),
      address: {
        ...defaults.address,
        ...filled((data as any).address),
      },
      socialMedia: {
        ...defaults.socialMedia,
        ...filled((data as any).socialMedia),
      },
    } as SiteSettingsData;
  } catch (error) {
    // Falling back to the defaults keeps the site up when the CMS is
    // unreachable, which is the point — but it also means a schema that has
    // drifted from the collections serves stock copy while looking perfectly
    // healthy. Say so in the log, or the next person will spend an afternoon
    // wondering why their CMS edits do nothing.
    console.error("site settings unavailable, serving defaults", error);
    return defaults;
  }
}
