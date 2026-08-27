import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSiteSettings, type SiteSettingsData } from "@/lib/payload";
import { asUpload, buildMetadata } from "@/lib/metadata";
import { getDict } from "@/i18n/dictionaries";
import {
  alternatesFor,
  canonicalUrl,
  parseLocale,
  type Locale,
} from "@/i18n/config";
import {
  dayKeyOf,
  loadEvents,
  recurrenceSentence,
  toIcsEvent,
  type EventDoc,
  type EventOccurrence,
} from "@/lib/events";
import { googleCalendarUrl, outlookCalendarUrl } from "@/lib/ics";
import { jsonLdHtml } from "@/lib/jsonLd";
import { EventClient } from "./EventClient";

/**
 * A minute. The page resolves the series to its next occurrence against the
 * clock, so everything on it — the date, the calendar links, the list of
 * following evenings — is an answer to "when is the next one". See the note
 * above `revalidate` on the home page.
 */
export const revalidate = 60;

/**
 * One evening.
 *
 * The URL names a series, not a date, which is the right thing for a page a
 * visitor arrives at from the agenda or from a search result: what they want
 * is "the buurtbabbel", and the answer to "when" is "next Monday" and keeps
 * being true. So the page resolves the series to its next occurrence and
 * builds every calendar link from that instant.
 *
 * A series that has run out, or a one-off evening that has already happened,
 * still has a page: it simply falls back to the date the CMS holds. Turning
 * yesterday's concert into a 404 breaks every link anyone ever shared, and a
 * page that says when something was is a perfectly good answer.
 */

/** Two years is longer than any pattern the owners will keep an eye on. */
const LOOKAHEAD_DAYS = 730;

type PageProps = { params: Promise<{ locale: string; slug: string }> };

/** A slug from the URL bar, narrowed to what the CMS can actually contain. */
function cleanSlug(raw: string): string | null {
  const slug = decodeURIComponent(raw).trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]{0,120}$/.test(slug) ? slug : null;
}

interface Resolved {
  event: EventDoc;
  occurrences: EventOccurrence[];
  /** The one the page is about: the next, or the last known when none is left. */
  current: EventOccurrence;
}

async function resolveEvent(
  slug: string,
  locale: Locale,
): Promise<Resolved | null> {
  const now = new Date();
  const { events, occurrences } = await loadEvents(locale, {
    slug,
    from: now,
    to: new Date(now.getTime() + LOOKAHEAD_DAYS * 86400000),
    limit: 1,
  });

  const event = events[0];
  if (!event) return null;

  if (occurrences.length > 0) {
    return { event, occurrences, current: occurrences[0] };
  }

  // Nothing ahead. Stand on the date the owners typed, so the page, the
  // metadata and the .ics all agree on one instant rather than on none.
  const start = new Date(event.startDate);
  if (Number.isNaN(start.getTime())) return null;
  const end = event.endDate ? new Date(event.endDate) : undefined;
  const current: EventOccurrence = {
    id: `${event.id}:${dayKeyOf(start)}`,
    event,
    start,
    end: end && !Number.isNaN(end.getTime()) ? end : undefined,
    isRecurring: Boolean(
      event.recurrence?.type && event.recurrence.type !== "none",
    ),
  };
  return { event, occurrences: [current], current };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: raw, slug: rawSlug } = await params;
  const locale = parseLocale(raw);
  const slug = cleanSlug(rawSlug);
  if (!locale || !slug) return {};

  const [resolved, s] = await Promise.all([
    resolveEvent(slug, locale),
    getSiteSettings(locale),
  ]);
  const t = getDict(locale);
  if (!resolved) return { alternates: alternatesFor(locale, `/evenementen/${slug}`) };

  /**
   * The SEO tab first, as on the blog post; see the longer note there. The
   * cast is because `EventDoc` in src/lib/events.ts describes the fields that
   * file needs and the plugin's `meta` group is not one of them — the read is
   * a plain payload.find at depth 1, so the group is there at runtime whether
   * or not the type mentions it.
   */
  const doc = resolved.event as typeof resolved.event & {
    meta?: { title?: string | null; description?: string | null; image?: unknown } | null;
  };

  return buildMetadata({
    locale,
    path: `/evenementen/${slug}`,
    title:
      doc.meta?.title?.trim() ||
      t.events.eventMetaTitle(doc.title, s.siteName),
    description:
      doc.meta?.description?.trim() || doc.excerpt || t.events.metaDescription,
    image: asUpload(doc.meta?.image) ?? asUpload(doc.image),
  });
}

/** The café's own address, for an evening that names no location of its own. */
function houseAddress(s: SiteSettingsData): string {
  return [
    s.siteName,
    s.address.street,
    [s.address.postalCode, s.address.city].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");
}

export default async function EventPage({ params }: PageProps) {
  const { locale: raw, slug: rawSlug } = await params;
  const locale = parseLocale(raw);
  if (!locale) notFound();
  const slug = cleanSlug(rawSlug);
  if (!slug) notFound();

  const [resolved, s] = await Promise.all([
    resolveEvent(slug, locale),
    getSiteSettings(locale),
  ]);
  if (!resolved) notFound();

  const { event, occurrences, current } = resolved;
  const t = getDict(locale);

  const location = event.location || houseAddress(s);
  const icsEvent = toIcsEvent(current, locale, {
    organizerName: s.siteName,
    organizerEmail: s.contactEmail,
    defaultLocation: location,
  });

  // The date in the .ics link is the day, not the instant: the route resolves
  // it back to the same occurrence through the same expansion this page used,
  // so the two can never drift apart.
  const day = dayKeyOf(current.start);
  const icsHref = `/api/events/ics?slug=${encodeURIComponent(slug)}&date=${day}&locale=${locale}`;
  const seriesHref = current.isRecurring
    ? `/api/events/ics?slug=${encodeURIComponent(slug)}&all=1&locale=${locale}`
    : undefined;

  const image = event.image?.sizes?.hero?.url || event.image?.url;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    startDate: current.start.toISOString(),
    ...(current.end ? { endDate: current.end.toISOString() } : {}),
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    eventStatus: "https://schema.org/EventScheduled",
    url: canonicalUrl(locale, `/evenementen/${slug}`),
    ...(event.excerpt ? { description: event.excerpt } : {}),
    ...(image ? { image: [image] } : {}),
    location: {
      "@type": "Place",
      name: event.location || s.siteName,
      address: {
        "@type": "PostalAddress",
        ...(s.address.street ? { streetAddress: s.address.street } : {}),
        addressLocality: s.address.city,
        ...(s.address.postalCode ? { postalCode: s.address.postalCode } : {}),
        addressCountry: s.address.countryCode,
      },
    },
    organizer: {
      "@type": "Organization",
      name: s.siteName,
      url: canonicalUrl(locale, "/"),
    },
    ...(event.price
      ? {
          offers: {
            "@type": "Offer",
            price: event.price,
            url: event.bookingUrl || canonicalUrl(locale, `/evenementen/${slug}`),
            availability: "https://schema.org/InStock",
          },
        }
      : {}),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdHtml(jsonLd) }}
      />
      <EventClient
        locale={locale}
        event={{
          slug: event.slug,
          title: event.title,
          excerpt: event.excerpt || undefined,
          description: event.description,
          location: event.location || undefined,
          price: event.price || undefined,
          bookingRequired: Boolean(event.bookingRequired),
          bookingUrl: event.bookingUrl || undefined,
          bookingNote: event.bookingNote || undefined,
          category: event.category || undefined,
          allDay: Boolean(event.allDay),
          image: image ? { url: image, alt: event.image?.alt || event.title } : undefined,
        }}
        startIso={current.start.toISOString()}
        endIso={current.end?.toISOString()}
        recurrenceLabel={recurrenceSentence(event, t) || undefined}
        upcomingIso={occurrences.slice(0, 8).map((o) => o.start.toISOString())}
        calendar={{
          ics: icsHref,
          series: seriesHref,
          google: googleCalendarUrl(icsEvent),
          outlook: outlookCalendarUrl(icsEvent),
        }}
      />
    </>
  );
}
