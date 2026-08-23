import { NextResponse, type NextRequest } from "next/server";
import { getSiteSettings } from "@/lib/payload";
import { getDict } from "@/i18n/dictionaries";
import { resolveLocale } from "@/i18n/config";
import { buildIcs, icsFilename, type IcsEvent } from "@/lib/ics";
import { dayKeyOf, loadEvents, toIcsEvent } from "@/lib/events";

/**
 * The calendar file behind every "zet in mijn agenda" button, and behind the
 * subscribable feed at the foot of the agenda.
 *
 * Three requests, deliberately kept as three shapes of the same URL rather
 * than three routes, because they are the same question asked with different
 * scope:
 *
 *   ?slug=…&date=YYYY-MM-DD   one evening
 *   ?slug=…&all=1             the whole series
 *   (nothing)                 everything in the next ninety days
 *
 * A .ics is served, not built in the browser, and that is worth stating. A
 * blob or a data: URL would save a round trip, but neither can carry a
 * filename iOS will honour, and on an iPhone an .ics without a filename opens
 * as a wall of text instead of as an event. Apple Calendar is the client that
 * matters most for this button, so the round trip is the price.
 *
 * Everything that arrives from the query string is treated as hostile: the
 * slug is matched against a pattern before it is ever handed to the CMS, the
 * date has to be a date and has to be within a few years of now, and every
 * window is capped. An .ics endpoint is a nice thing to point a script at,
 * and "give me every occurrence of an open-ended weekly series" is otherwise
 * an unbounded amount of work for one GET.
 */

/** How far the subscribable feed looks ahead. */
const FEED_DAYS = 90;

/** How far a whole-series download looks ahead. */
const SERIES_DAYS = 730;

/** Ceilings on what one response may contain. */
const MAX_SERIES_EVENTS = 200;
const MAX_FEED_EVENTS = 400;

/** A requested date more than this far from today is not a real request. */
const MAX_DATE_DRIFT_DAYS = 1826;

const SLUG = /^[a-z0-9][a-z0-9-]{0,120}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function calendarResponse(
  body: string,
  filename: string,
  disposition: "attachment" | "inline",
  maxAge: number,
) {
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      // icsFilename() has already reduced the name to ASCII letters, digits
      // and hyphens, so the plain form needs no RFC 5987 companion.
      "Content-Disposition": `${disposition}; filename="${filename}"`,
      "Cache-Control": `public, max-age=${maxAge}`,
    },
  });
}

function notFound(message: string) {
  return new NextResponse(message, {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

function badRequest(message: string) {
  return new NextResponse(message, {
    status: 400,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const locale = resolveLocale(params.get("locale") || undefined);
  const t = getDict(locale);

  const rawSlug = params.get("slug");
  const slug = rawSlug ? rawSlug.trim().toLowerCase() : null;
  if (rawSlug !== null && (!slug || !SLUG.test(slug))) {
    return badRequest("Bad slug");
  }

  const rawDate = params.get("date");
  if (rawDate !== null && !DAY.test(rawDate)) return badRequest("Bad date");

  const wholeSeries = params.get("all") === "1";
  const now = new Date();

  let settings;
  try {
    settings = await getSiteSettings(locale);
  } catch {
    return notFound("Agenda unavailable");
  }

  const house = [
    settings.siteName,
    settings.address.street,
    [settings.address.postalCode, settings.address.city].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");

  const icsOptions = {
    organizerName: settings.siteName,
    organizerEmail: settings.contactEmail,
    defaultLocation: house,
  };

  /* ---- one evening ---- */
  if (slug && rawDate) {
    const anchor = new Date(`${rawDate}T12:00:00Z`);
    if (Number.isNaN(anchor.getTime())) return badRequest("Bad date");
    const drift = Math.abs(anchor.getTime() - now.getTime()) / 86400000;
    if (drift > MAX_DATE_DRIFT_DAYS) return badRequest("Date out of range");

    // A window of a couple of days around the anchor. Two rather than one so
    // that an evening near midnight, whose instant sits on the far side of
    // the UTC date line from the day it belongs to, is still inside it.
    const { occurrences } = await loadEvents(locale, {
      slug,
      from: new Date(anchor.getTime() - 2 * 86400000),
      to: new Date(anchor.getTime() + 2 * 86400000),
      limit: 1,
    });

    const match = occurrences.find((o) => dayKeyOf(o.start) === rawDate);
    if (!match) return notFound("Event not found");

    const body = buildIcs([toIcsEvent(match, locale, icsOptions)], {
      calendarName: match.event.title,
    });
    return calendarResponse(
      body,
      icsFilename(`${match.event.title} ${rawDate}`),
      "attachment",
      300,
    );
  }

  /* ---- one series, or its next date ---- */
  if (slug) {
    const { events, occurrences } = await loadEvents(locale, {
      slug,
      from: now,
      to: new Date(now.getTime() + SERIES_DAYS * 86400000),
      limit: 1,
    });

    const event = events[0];
    if (!event) return notFound("Event not found");

    const wanted = wholeSeries
      ? occurrences.slice(0, MAX_SERIES_EVENTS)
      : occurrences.slice(0, 1);
    if (wanted.length === 0) return notFound("Nothing upcoming");

    const body = buildIcs(
      wanted.map((o) => toIcsEvent(o, locale, icsOptions)),
      { calendarName: event.title },
    );
    return calendarResponse(
      body,
      icsFilename(event.title),
      "attachment",
      wholeSeries ? 1800 : 300,
    );
  }

  /* ---- the whole agenda, as something to subscribe to ---- */
  const { occurrences } = await loadEvents(locale, {
    from: now,
    to: new Date(now.getTime() + FEED_DAYS * 86400000),
  });

  const items: IcsEvent[] = occurrences
    .slice(0, MAX_FEED_EVENTS)
    .map((o) => toIcsEvent(o, locale, icsOptions));

  // Inline rather than attachment: a calendar application subscribing to this
  // URL is not downloading a file, and an attachment header makes a browser
  // that follows the link save it instead of opening it.
  return calendarResponse(
    buildIcs(items, { calendarName: t.events.calendarName(settings.siteName) }),
    icsFilename(t.events.calendarName(settings.siteName)),
    "inline",
    1800,
  );
}
