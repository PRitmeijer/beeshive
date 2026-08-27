import type { SiteSettingsData } from "@/lib/payload";

/**
 * Site Instellingen as a test can hand them over.
 *
 * Every booking rule in this codebase is a CMS field: the lead time, the
 * horizon, the largest party, the size of the room, how long a table is held,
 * whether the guest pass exists, whether the confirmation waits for a human.
 * A test that cares about one of those wants to set one of those, so this is a
 * builder with the café's real stock week in it — Mon/Thu/Fri/Sat 11:00–21:00,
 * shut on Tuesday, Wednesday and Sunday, exactly as src/lib/payload.ts ships
 * it — and an overrides object on top.
 *
 * The cast at the end is the one liberty taken. `SiteSettingsData` is derived
 * from the Dutch defaults object and therefore carries three dozen keys about
 * hero images, Umami and share cards that no booking test has an opinion
 * about. Spelling all of them out here would mean a fixture that has to be
 * edited every time somebody adds a field to the global, for no gain: the
 * price of the cast is that a field this fixture forgets arrives as
 * `undefined` rather than failing to compile, and every consumer of these
 * settings already has to survive an `undefined` because a raw `findGlobal`
 * of a never-saved CMS hands them one.
 */
export interface SettingsOverrides {
  [key: string]: unknown;
}

/** The stock week, Monday first, in the CMS's own free text. */
export const STOCK_WEEK_NL = [
  { day: "Maandag", hours: "11:00 – 21:00" },
  { day: "Dinsdag", hours: "Gesloten" },
  { day: "Woensdag", hours: "Gesloten" },
  { day: "Donderdag", hours: "11:00 – 21:00" },
  { day: "Vrijdag", hours: "11:00 – 21:00" },
  { day: "Zaterdag", hours: "11:00 – 21:00" },
  { day: "Zondag", hours: "Gesloten" },
];

export const STOCK_WEEK_EN = [
  { day: "Monday", hours: "11:00 – 21:00" },
  { day: "Tuesday", hours: "Closed" },
  { day: "Wednesday", hours: "Closed" },
  { day: "Thursday", hours: "11:00 – 21:00" },
  { day: "Friday", hours: "11:00 – 21:00" },
  { day: "Saturday", hours: "11:00 – 21:00" },
  { day: "Sunday", hours: "Closed" },
];

export function settingsFixture(
  locale: string = "nl",
  overrides: SettingsOverrides = {},
): SiteSettingsData {
  return {
    siteName: "De Bee's Hive",
    contactEmail: "info@debeeshive.nl",
    phone: "030 785 2199",
    address: {
      street: "Sweder van Zuylenweg 56",
      city: "Utrecht",
      area: "Zuilen",
      postalCode: "3553 HG",
      country: locale === "en" ? "The Netherlands" : "Nederland",
      countryCode: "NL",
    },
    openingHours: locale === "en" ? STOCK_WEEK_EN : STOCK_WEEK_NL,
    recurringOpenings: [],
    reservationsEnabled: true,
    reservationDurationMinutes: 120,
    reservationCapacity: 40,
    reservationMaxPartySize: 20,
    reservationLeadMinutes: 60,
    reservationHorizonDays: 90,
    // A string, as a select stores it, and the same value the field and both
    // fallback objects in src/lib/payload.ts ship with. Spelled out rather than
    // left to the fallback so a test reading this fixture can see which grid
    // the sittings are on without going and looking.
    reservationSlotMinutes: "15",
    reservationConfirmationMode: "approval",
    guestPassEnabled: true,
    guestPassDietary: [{ label: "Vegetarisch" }, { label: "Vegetarian" }],
    guestPassDrinks: [{ label: "Bier" }, { label: "Beer" }],
    openingHoursNote: "Elke laatste zondag van de maand zijn wij extra geopend.",
    ...overrides,
  } as unknown as SiteSettingsData;
}
