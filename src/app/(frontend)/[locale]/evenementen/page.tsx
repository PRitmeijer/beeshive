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
import {
  loadEvents,
  recurrenceSentence,
  type EventOccurrence,
} from "@/lib/events";
import type { AgendaItem } from "@/components/EventCard";
import { EvenementenClient } from "./EvenementenClient";

export const dynamic = "force-dynamic";

/**
 * The agenda. Follows the pattern documented at the top of
 * src/app/(frontend)/[locale]/page.tsx: parse the locale, ask the CMS in that
 * language, take the fixed strings from the dictionary, and hand the client
 * component a locale rather than a dictionary.
 *
 * Two things happen here rather than in the client component, and both for the
 * same reason: they need either the clock or a per-locale dictionary function,
 * and neither may cross into a component that renders in the browser. The
 * moment "now" is resolved once, on the server, and travels down as an ISO
 * string — reading it during render is the hydration bug this codebase keeps
 * tripping over. And a recurring evening's sentence ("Elke maandag") is built
 * here because it comes out of a dictionary entry that is a function, which
 * would not survive being passed as a prop.
 */

/** How far ahead the agenda looks. Half a year is more than the café plans. */
const WINDOW_DAYS = 180;

/** How many future dates of a standing fixture the card gets to mention. */
const UPCOMING_SHOWN = 5;

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = parseLocale((await params).locale);
  if (!locale) return {};
  const s = await getSiteSettings(locale);
  const t = getDict(locale);
  return {
    title: t.events.metaTitle(s.siteName),
    description: t.events.metaDescription,
    alternates: alternatesFor(locale, "/evenementen"),
  };
}

/** The picture the CMS holds, at the size a card wants it. */
function cardImage(occurrence: EventOccurrence) {
  const image = occurrence.event.image;
  const url = image?.sizes?.card?.url || image?.url;
  if (!url) return undefined;
  return { url, alt: image?.alt || occurrence.event.title };
}

/**
 * Occurrences to cards.
 *
 * A repeating evening collapses to one card carrying its next date and a few
 * more besides; anything that happens once keeps a card of its own. The
 * resulting list is sorted by the date each card actually shows, so the month
 * headings above them stay true.
 */
function toAgendaItems(
  occurrences: EventOccurrence[],
  locale: Locale,
): AgendaItem[] {
  const t = getDict(locale);
  const seenSeries = new Set<string>();
  const items: AgendaItem[] = [];

  for (const occurrence of occurrences) {
    const event = occurrence.event;
    const seriesKey = String(event.id);

    if (occurrence.isRecurring) {
      if (seenSeries.has(seriesKey)) continue;
      seenSeries.add(seriesKey);
    }

    const upcoming = occurrence.isRecurring
      ? occurrences
          .filter((o) => String(o.event.id) === seriesKey)
          .slice(0, UPCOMING_SHOWN)
          .map((o) => o.start.toISOString())
      : undefined;

    items.push({
      id: occurrence.id,
      slug: event.slug,
      title: event.title,
      excerpt: event.excerpt || undefined,
      startIso: occurrence.start.toISOString(),
      endIso: occurrence.end?.toISOString(),
      allDay: Boolean(event.allDay),
      recurring: occurrence.isRecurring,
      recurrenceLabel: recurrenceSentence(event, t) || undefined,
      upcomingIso: upcoming,
      featured: Boolean(event.featured),
      category: event.category || undefined,
      location: event.location || undefined,
      price: event.price || undefined,
      bookingRequired: Boolean(event.bookingRequired),
      image: cardImage(occurrence),
    });
  }

  items.sort(
    (a, b) => new Date(a.startIso).getTime() - new Date(b.startIso).getTime(),
  );
  return items;
}

export default async function EvenementenPage({ params }: PageProps) {
  const locale = parseLocale((await params).locale);
  if (!locale) notFound();

  const now = new Date();
  const { occurrences } = await loadEvents(locale, {
    from: now,
    to: new Date(now.getTime() + WINDOW_DAYS * 86400000),
  });

  const items = toAgendaItems(occurrences, locale);

  /**
   * An ItemList of Events rather than a bare list of Events: what this page is
   * is an ordered agenda, and saying so is what lets a search engine show the
   * next three evenings under the site's own result. Only the cards actually
   * on the page are described, in the order they appear.
   */
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: getDict(locale).events.title,
    url: canonicalUrl(locale, "/evenementen"),
    numberOfItems: items.length,
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "Event",
        name: item.title,
        startDate: item.startIso,
        ...(item.endIso ? { endDate: item.endIso } : {}),
        eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
        eventStatus: "https://schema.org/EventScheduled",
        url: canonicalUrl(locale, `/evenementen/${item.slug}`),
        ...(item.excerpt ? { description: item.excerpt } : {}),
        ...(item.image ? { image: item.image.url } : {}),
      },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <EvenementenClient
        locale={locale}
        items={items}
        nowIso={now.toISOString()}
        feedHref={`/api/events/ics?locale=${locale}`}
      />
    </>
  );
}
