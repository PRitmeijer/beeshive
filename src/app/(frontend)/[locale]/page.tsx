import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSiteSettings } from "@/lib/payload";
import { getDict } from "@/i18n/dictionaries";
import {
  alternatesFor,
  canonicalUrl,
  parseLocale,
  type Locale,
} from "@/i18n/config";
import { HomeClient } from "./HomeClient";

export const dynamic = "force-dynamic";

/**
 * The pattern every page in this tree follows.
 *
 *  1. `params` is a promise carrying the `[locale]` segment. Run it through
 *     parseLocale() and call notFound() when it is not a declared language.
 *  2. Ask the CMS for that locale: getSiteSettings(locale), or pass
 *     `locale` to payload.find({ ... }) for a collection.
 *  3. Take the hard-coded strings from getDict(locale).
 *  4. Build metadata alternates with alternatesFor(locale, "<dutch path>").
 *  5. Hand the client component `locale`, never the dictionary: some entries
 *     are functions and would not survive the server/client boundary.
 */
type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const locale = parseLocale((await params).locale);
  if (!locale) return {};
  const s = await getSiteSettings(locale);
  const t = getDict(locale);
  return {
    title: t.home.metaTitle(s.siteName, s.address.area),
    description: s.description,
    alternates: alternatesFor(locale, "/"),
  };
}

/**
 * Monday-first weekday index for right now in the café's own timezone. The
 * index rather than the name, because the CMS rows may be filled in either
 * language while the page is being translated.
 */
function amsterdamWeekdayIndex(now: Date): number {
  const english = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    timeZone: "Europe/Amsterdam",
  }).format(now);
  const index = getDict("en").weekdays.findIndex(
    (d) => d.toLowerCase() === english.toLowerCase(),
  );
  return index;
}

/** "Gesloten" or "Closed", whichever language the row happens to be in. */
const CLOSED = /gesloten|closed/i;

/**
 * Today's hours, resolved on the server in the café's own timezone. Doing this
 * in the client component would mean `new Date()` during render, which is a
 * hydration hazard; here it is just a string in the HTML.
 */
function resolveToday(
  hours: { day: string; hours: string }[],
  locale: Locale,
) {
  const t = getDict(locale);
  const now = new Date();
  const index = amsterdamWeekdayIndex(now);
  const names = [
    getDict("nl").weekdays[index],
    getDict("en").weekdays[index],
  ].filter(Boolean);

  const entry = hours.find((h) =>
    names.some((n) => h.day.trim().toLowerCase() === n.toLowerCase()),
  );
  if (!entry || CLOSED.test(entry.hours)) {
    return { label: t.hours.closedToday, open: false };
  }

  const match = entry.hours.match(/(\d{1,2}):(\d{2})\s*[^\d]{1,3}\s*(\d{1,2}):(\d{2})/);
  let open = false;
  if (match) {
    const [hh, mm] = new Intl.DateTimeFormat("nl-NL", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Europe/Amsterdam",
    })
      .format(now)
      .split(":")
      .map(Number);
    const mins = hh * 60 + mm;
    const from = Number(match[1]) * 60 + Number(match[2]);
    const till = Number(match[3]) * 60 + Number(match[4]);
    open = mins >= from && mins < till;
  }
  return { label: t.hours.todayIs(entry.hours), open };
}

// Map the CMS day names, in either language, to the English ones schema.org
// wants. Built from the dictionaries so the two can never drift apart.
const dayMap: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  const english = getDict("en").weekdays;
  for (const dict of [getDict("nl"), getDict("en")]) {
    dict.weekdays.forEach((day, i) => {
      map[day.toLowerCase()] = english[i];
    });
  }
  return map;
})();

function buildOpeningHoursSpec(
  hours: { day: string; hours: string }[],
) {
  return hours
    .filter((h) => !CLOSED.test(h.hours))
    .map((h) => {
      const match = h.hours.match(/(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})/);
      return {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: dayMap[h.day.toLowerCase()] || h.day,
        opens: match?.[1] || "12:00",
        closes: match?.[2] || "22:00",
      };
    });
}

export default async function HomePage({ params }: PageProps) {
  const locale = parseLocale((await params).locale);
  if (!locale) notFound();

  const s = await getSiteSettings(locale);
  const t = getDict(locale);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: s.siteName,
    description: s.description,
    url: canonicalUrl(locale, "/"),
    email: s.contactEmail,
    ...(s.phone ? { telephone: s.phone } : {}),
    servesCuisine: s.cuisines
      .split(",")
      .map((c: string) => c.trim()),
    priceRange: s.priceRange,
    address: {
      "@type": "PostalAddress",
      ...(s.address.street
        ? { streetAddress: s.address.street }
        : {}),
      addressLocality: s.address.city,
      addressRegion: s.address.city,
      ...(s.address.postalCode
        ? { postalCode: s.address.postalCode }
        : {}),
      addressCountry: s.address.countryCode,
    },
    openingHoursSpecification: buildOpeningHoursSpec(
      s.openingHours as { day: string; hours: string }[],
    ),
    sameAs: [
      s.socialMedia.instagram,
      s.socialMedia.facebook,
      s.socialMedia.tripadvisor,
    ].filter(Boolean),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <h1 className="sr-only">
        {t.home.srHeading(s.siteName, s.address.area, s.address.city)}
      </h1>
      <HomeClient
        locale={locale}
        settings={s}
        today={resolveToday(s.openingHours, locale)}
      />
    </>
  );
}
