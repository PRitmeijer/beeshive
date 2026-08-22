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
const nlDefaults = {
  siteName: "De Bee's Hive",
  tagline: "Waar eten en creativiteit samenkomen",
  description:
    "Een warm eetcafé in het hart van Zuilen waar creativiteit, verbinding en lekker eten samenkomen.",
  cuisines: "Dutch, International, South African",
  priceRange: "€€",
  reservationUrl: "",
  contactEmail: "info@debeeshive.nl",
  phone: "",
  address: {
    street: "",
    city: "Utrecht",
    area: "Zuilen",
    postalCode: "",
    country: "Nederland",
    countryCode: "NL",
  },
  openingHours: [
    { day: "Maandag", hours: "Gesloten" },
    { day: "Dinsdag", hours: "Gesloten" },
    { day: "Woensdag", hours: "12:00 – 22:00" },
    { day: "Donderdag", hours: "12:00 – 22:00" },
    { day: "Vrijdag", hours: "12:00 – 22:00" },
    { day: "Zaterdag", hours: "12:00 – 22:00" },
    { day: "Zondag", hours: "12:00 – 22:00" },
  ],
  socialMedia: {
    instagram: "https://instagram.com/debeeshive",
    facebook: "",
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
  googleMapsEmbedUrl: "",
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
  phone: "",
  address: {
    street: "",
    city: "Utrecht",
    area: "Zuilen",
    postalCode: "",
    country: "The Netherlands",
    countryCode: "NL",
  },
  openingHours: [
    { day: "Monday", hours: "Closed" },
    { day: "Tuesday", hours: "Closed" },
    { day: "Wednesday", hours: "12:00 – 22:00" },
    { day: "Thursday", hours: "12:00 – 22:00" },
    { day: "Friday", hours: "12:00 – 22:00" },
    { day: "Saturday", hours: "12:00 – 22:00" },
    { day: "Sunday", hours: "12:00 – 22:00" },
  ],
  socialMedia: {
    instagram: "https://instagram.com/debeeshive",
    facebook: "",
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
  googleMapsEmbedUrl: "",
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
      ...(locale === defaultLocale ? {} : { fallbackLocale: "none" as const }),
    });
    // Merge CMS data over defaults, keeping defaults for any missing fields
    return {
      ...defaults,
      ...filled(data as Record<string, unknown>),
      address: {
        ...defaults.address,
        ...filled((data as any).address),
      },
      socialMedia: {
        ...defaults.socialMedia,
        ...filled((data as any).socialMedia),
      },
    } as SiteSettingsData;
  } catch {
    return defaults;
  }
}
