import { getPayload } from "payload";
import config from "@payload-config";

export const getPayloadClient = () => getPayload({ config });

// Default site settings used as fallback when CMS is not yet initialized
const defaults = {
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
      title: "Verbinding",
      text: "Meer dan een restaurant — een gemeenschap waar iedereen welkom is.",
    },
  ],
  quote:
    "Eten is kunst, en iedereen is welkom om hun creatieve zelf te zijn",
  quoteAttribution: "De Bee's Hive",
  newsletterTitle: "Schrijf je in",
  newsletterText:
    "Ontvang als eerste nieuws over speciale evenementen, nieuwe gerechten en aanbiedingen.",
  aboutIntro:
    "De Bee's Hive is meer dan een restaurant — het is een plek waar kunst, creativiteit en lekker eten samenkomen in het hart van Zuilen, Utrecht.",
  aboutStory: null,
  aboutQuote:
    "Wij zijn een familie met een passie voor eten, kunst en verbinding.",
  values: [
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
  footerTagline: "Gemaakt met liefde in Zuilen",
};

export type SiteSettingsData = typeof defaults;

export async function getSiteSettings(): Promise<SiteSettingsData> {
  try {
    const payload = await getPayloadClient();
    const data = await payload.findGlobal({ slug: "site-settings" });
    // Merge CMS data over defaults, keeping defaults for any missing fields
    return {
      ...defaults,
      ...Object.fromEntries(
        Object.entries(data).filter(
          ([, v]) => v !== null && v !== undefined && v !== "",
        ),
      ),
      address: {
        ...defaults.address,
        ...Object.fromEntries(
          Object.entries((data as any).address || {}).filter(
            ([, v]) => v !== null && v !== undefined && v !== "",
          ),
        ),
      },
      socialMedia: {
        ...defaults.socialMedia,
        ...Object.fromEntries(
          Object.entries((data as any).socialMedia || {}).filter(
            ([, v]) => v !== null && v !== undefined && v !== "",
          ),
        ),
      },
    } as SiteSettingsData;
  } catch {
    return defaults;
  }
}
