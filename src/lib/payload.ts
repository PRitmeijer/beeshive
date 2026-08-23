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

/**
 * The row shapes of the array settings.
 *
 * They live here rather than next to the fields that produce them because the
 * defaults below are what gives `SiteSettingsData` its type, and an empty array
 * would otherwise widen to `never[]` — after which every page that renders a row
 * stops type-checking. Naming them also gives the components something to import
 * instead of re-describing the same row three times.
 *
 * Everything but the fields Payload marks required is optional and nullable:
 * these come out of the CMS, where a freshly added row is a row of nulls until
 * someone fills it in.
 */
export interface HeroImage {
  image: MediaRef | null;
  caption?: string | null;
  zoom?: number | null;
  focalPoint?: string | null;
}

export interface RecurringOpening {
  ordinal: string;
  weekday: string;
  closed?: boolean | null;
  hours?: string | null;
  note?: string | null;
}

/** A row that is nothing but one localised label, as used by the guest pass lists. */
export interface LabelRow {
  label?: string | null;
}

const nlDefaults = {
  siteName: "De Bee's Hive",
  description:
    "Een warm eetcafé in het hart van Zuilen waar creativiteit, verbinding en lekker eten samenkomen.",
  keywords: "",
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
  // Empty on purpose: a repeating rule is a claim about when the place is open,
  // so inventing one here would put a wrong opening time on the site of anyone
  // who never opened this tab. Nothing configured means nothing overrides the
  // week schedule above.
  recurringOpenings: [] as RecurringOpening[],
  socialMedia: {
    instagram: "https://www.instagram.com/debeeshive",
    facebook: "https://www.facebook.com/people/De-Bees-Hive/61573726474222",
    tripadvisor: "",
  },
  heroTitle: "De Bee's Hive",
  heroSubtitle:
    "Waar eten en creativiteit samenkomen. Een warm eetcafé in het hart van Zuilen.",
  // Empty means "use the pictures that ship with the theme". The homepage knows
  // its own stock trio; repeating them here would only mean two places to change
  // when the design does.
  heroImages: [] as HeroImage[],
  newsletterTitle: "Schrijf je in",
  newsletterText:
    "Ontvang als eerste nieuws over speciale evenementen, nieuwe gerechten en aanbiedingen.",
  newsletterPrivacyNote:
    "Hooguit een mail per maand, nooit spam, en uitschrijven kan met een klik.",
  aboutIntro:
    "De Bee's Hive is meer dan een restaurant. Het is een plek waar kunst, creativiteit en lekker eten samenkomen in het hart van Zuilen, Utrecht.",
  /** The welcome under the hero. Blank falls through to `aboutIntro`. */
  welcomeText: "",
  /** The welcome at the foot of a guest pass. Blank falls through to the two
   *  above, in that order. */
  guestPassWelcome: "",
  aboutStory: null as string | null,
  aboutImage: null as MediaRef | null,
  aboutVideoUrl: "",
  aboutMediaCaption: "",
  footerTagline: "Gemaakt met liefde in Zuilen",
  // Taken from their own previous site. The listing behind it is what carries
  // the reviews, so the same URL serves the review block on /contact.
  googleMapsEmbedUrl:
    "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2450.3781318959013!2d5.086582076321947!3d52.10924836655966!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x47c66f402cf74da3%3A0xf5db732de51fc331!2sDe%20Bee%27s%20Hive!5e0!3m2!1snl!2snl!4v1756807839954!5m2!1snl!2snl",
  googleReviewUrl: "https://maps.app.goo.gl/6VEMHL3Jq9vgAWnw8",
  openingHoursNote: "Elke laatste zondag van de maand zijn wij extra geopend.",
  // The booking rules are deliberately generous rather than accurate: these only
  // apply while the CMS has nothing, and a form that lets a guest ask for a table
  // is recoverable, while a form that refuses every date looks broken.
  reservationsEnabled: true,
  reservationDurationMinutes: 120,
  reservationCapacity: 40,
  reservationMaxPartySize: 20,
  reservationLeadMinutes: 60,
  reservationHorizonDays: 90,
  guestPassEnabled: true,
  // Empty lists mean the guest pass simply does not ask. Better than guessing at
  // a menu the kitchen never agreed to.
  guestPassDrinks: [] as LabelRow[],
  guestPassDietary: [] as LabelRow[],
  shareImage: null as MediaRef | null,
  shareTitle: "",
  shareDescription: "",
  shareImageAuto: true,
  // Off until someone fills in a website id: loading a measuring script that
  // reports to nobody is only a slower page.
  umamiEnabled: false,
  umamiScriptUrl: "https://cloud.umami.is/script.js",
  umamiWebsiteId: "",
  umamiHostUrl: "",
  umamiApiKey: "",
  umamiDoNotTrackAdmin: true,
};

export type SiteSettingsData = typeof nlDefaults;

const enDefaults: SiteSettingsData = {
  siteName: "De Bee's Hive",
  description:
    "A warm eetcafé in the heart of Zuilen where creativity, connection and good food come together.",
  keywords: "",
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
  recurringOpenings: [] as RecurringOpening[],
  socialMedia: {
    instagram: "https://www.instagram.com/debeeshive",
    facebook: "https://www.facebook.com/people/De-Bees-Hive/61573726474222",
    tripadvisor: "",
  },
  heroTitle: "De Bee's Hive",
  heroSubtitle:
    "Where food and creativity meet. A warm eetcafé in the heart of Zuilen.",
  heroImages: [] as HeroImage[],
  newsletterTitle: "Sign up",
  newsletterText:
    "Be the first to hear about special events, new dishes and offers.",
  newsletterPrivacyNote:
    "At most one email a month, never spam, and you can unsubscribe in one click.",
  aboutIntro:
    "De Bee's Hive is more than a restaurant. It is a place where art, creativity and good food come together in the heart of Zuilen, Utrecht.",
  /** The welcome under the hero. Blank falls through to `aboutIntro`. */
  welcomeText: "",
  /** The welcome at the foot of a guest pass. Blank falls through to the two
   *  above, in that order. */
  guestPassWelcome: "",
  aboutStory: null as string | null,
  aboutImage: null as MediaRef | null,
  aboutVideoUrl: "",
  aboutMediaCaption: "",
  footerTagline: "Made with love in Zuilen",
  // Taken from their own previous site. The listing behind it is what carries
  // the reviews, so the same URL serves the review block on /contact.
  googleMapsEmbedUrl:
    "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2450.3781318959013!2d5.086582076321947!3d52.10924836655966!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x47c66f402cf74da3%3A0xf5db732de51fc331!2sDe%20Bee%27s%20Hive!5e0!3m2!1snl!2snl!4v1756807839954!5m2!1snl!2snl",
  googleReviewUrl: "https://maps.app.goo.gl/6VEMHL3Jq9vgAWnw8",
  openingHoursNote: "We are also open on the last Sunday of every month.",
  // Not localised in the CMS, so these repeat the Dutch numbers exactly. They
  // still have to be spelled out: `SiteSettingsData` demands every key, and a
  // silent divergence here would mean the English booking form quietly runs on
  // different rules than the Dutch one.
  reservationsEnabled: true,
  reservationDurationMinutes: 120,
  reservationCapacity: 40,
  reservationMaxPartySize: 20,
  reservationLeadMinutes: 60,
  reservationHorizonDays: 90,
  guestPassEnabled: true,
  guestPassDrinks: [] as LabelRow[],
  guestPassDietary: [] as LabelRow[],
  shareImage: null as MediaRef | null,
  shareTitle: "",
  shareDescription: "",
  shareImageAuto: true,
  umamiEnabled: false,
  umamiScriptUrl: "https://cloud.umami.is/script.js",
  umamiWebsiteId: "",
  umamiHostUrl: "",
  umamiApiKey: "",
  umamiDoNotTrackAdmin: true,
};

const defaultsByLocale: Record<Locale, SiteSettingsData> = {
  nl: nlDefaults,
  en: enDefaults,
};

/**
 * Whether a value carries anything a reader would see, so a blank CMS field
 * cannot beat a default.
 *
 * Arrays need the same treatment as scalars. A localised array such as
 * openingHours or features still returns one row per entry in an untranslated
 * locale, with every value inside it null. That array is truthy, so a naive
 * check keeps it and the locale's defaults never apply, which is how the
 * English home page ended up rendering rows with no opening time in them.
 *
 * A list with no rows at all is a different matter and `filled()` below, not
 * this, is where it is judged: rows full of nulls are a translation nobody made,
 * but no rows is somebody who deleted them.
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

/**
 * The fields of one CMS object that should override the defaults.
 *
 * An empty list overrides. Deleting the seven opening-hours rows in the admin —
 * the ordinary first half of retyping them — used to leave `hasContent` looking
 * at nothing, drop the field, and put the stock Mon/Thu/Fri/Sat 11:00–21:00 back
 * on the homepage, the contact page and both booking endpoints, hours nobody had
 * typed and nobody could get rid of. An emptied list is an editor's decision and
 * is taken as one; the untranslated-locale case `hasContent` guards against
 * arrives as rows that exist and are blank, which is still dropped.
 */
function filled(source: Record<string, unknown> | null | undefined) {
  return Object.fromEntries(
    Object.entries(source || {}).filter(
      ([, v]) => (Array.isArray(v) && v.length === 0) || hasContent(v),
    ),
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
    // Merge CMS data over defaults, keeping defaults for any missing fields.
    //
    // The two groups are spread again by hand because a group comes back as one
    // object: a half-filled `address` would otherwise replace the default
    // wholesale and take the city and country down with it. Only groups have
    // that problem. Arrays (openingHours, recurringOpenings, heroImages, the
    // guest pass lists) are meant to be replaced whole — half a list is a list —
    // and scalars are what `filled()` already handles. So this stays a list of
    // two until someone adds a third `type: "group"` field to the global.
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
