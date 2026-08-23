import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSiteSettings, type SiteSettingsData } from "@/lib/payload";
import { loadSchedule } from "@/lib/schedule";
import {
  describe,
  formatTime,
  nowMinutesInAmsterdam,
  parseWeek,
  todayInAmsterdam,
  type Week,
} from "@/lib/openingHours";
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
 * Today, as the café would answer the phone.
 *
 * This used to be seven CMS rows and a regular expression, which could only
 * ever be right about an ordinary week: on the last Sunday of the month — the
 * one Sunday they are open — the front page said "Vandaag gesloten", and on
 * Eerste Kerstdag it cheerfully offered lunch. The question belongs to
 * src/lib/schedule.ts now, which folds the repeating rules and the one-off
 * exceptions into the week before answering, so the line under the hero is the
 * same answer the booking form gives.
 *
 * Resolved here on the server rather than in the client component, because
 * `new Date()` during render is a hydration hazard; by the time it reaches the
 * browser it is a sentence in the HTML.
 *
 * `note` is the reason the day is unusual, in the reader's language, when the
 * owners wrote one down. HomeClient may render it beside the hours.
 */
async function resolveToday(
  locale: Locale,
  settings: SiteSettingsData,
): Promise<{ label: string; open: boolean; note?: string }> {
  const t = getDict(locale);
  const today = todayInAmsterdam();
  const { days } = await loadSchedule(today, today, locale, settings);
  const day = days[0];
  const note = day?.note || undefined;

  if (!day || (day.ranges.length === 0 && !day.text)) {
    return { label: t.hours.closedToday, open: false, note };
  }
  // No range could be read, but something was typed — "vanaf 17:00", a line
  // about a private party. Print what it says rather than claiming a closure
  // it does not state; nobody can be told the doors are open on the strength
  // of a sentence, so `open` stays false.
  if (day.ranges.length === 0) {
    return { label: t.hours.todayIs(day.text as string), open: false, note };
  }

  const now = nowMinutesInAmsterdam();
  return {
    label: t.hours.todayIs(describe(day.ranges)),
    open: day.ranges.some((r) => now >= r.open && now < r.close),
    note,
  };
}

/**
 * The weekly hours as schema.org wants them: English day names, one entry per
 * stretch the doors are open, so a split service is two entries rather than a
 * regular expression's best guess at the first and last time on the line.
 *
 * Built from the parsed week rather than from the raw rows, so the structured
 * data and the site cannot disagree about what a line means. The repeating
 * rules and the exceptions stay out of it: an OpeningHoursSpecification
 * describes an ordinary week, and "the last Sunday of the month" is not one.
 */
function buildOpeningHoursSpec(week: Week) {
  const days = getDict("en").weekdays;
  return week.flatMap((ranges, index) =>
    ranges.map((range) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: days[index],
      opens: formatTime(range.open),
      closes: formatTime(range.close),
    })),
  );
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
      parseWeek(s.openingHours as { day: string; hours: string }[]),
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
        today={await resolveToday(locale, s)}
      />
    </>
  );
}
