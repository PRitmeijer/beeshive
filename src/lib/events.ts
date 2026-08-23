import { canonicalUrl, type Locale } from "@/i18n/config";
import type { Dict } from "@/i18n/dictionaries";
import type { MediaRef } from "@/lib/payload";
import type { IcsEvent } from "@/lib/ics";

/**
 * Turning the agenda rows into dates.
 *
 * src/collections/Events.ts stores a series as one row: a first date, a
 * pattern, an end, and a list of evenings the pattern is wrong about. Nothing
 * is ever written out into a table of individual dates, so everything a page
 * shows has to be worked out here, on the way to the screen. That is a
 * deliberate trade — editing the quiz fixes every future Tuesday at once —
 * and it puts all the awkwardness in this one file.
 *
 * The awkwardness is timezones. The owners think in wall-clock time: the quiz
 * is at 20:00, and it is at 20:00 in March and still at 20:00 in November
 * even though the clocks moved an hour in between. An instant does not work
 * that way. Add seven days' worth of milliseconds to 20:00 on the Saturday
 * before the clocks change and you land on 19:00, and the agenda quietly
 * starts lying to people twice a year.
 *
 * So the arithmetic is done in two separate worlds and never in one:
 *
 *   - Calendar days are counted as instants at 12:00 UTC. Midday, not
 *     midnight, and that is the convention the rest of the codebase uses for
 *     the same reason: 12:00 UTC is 13:00 or 14:00 in Amsterdam and 12:00 or
 *     11:00 west of us, so no offset any European client might apply can
 *     round the day to the one before or the one after. Adding N days to a
 *     midday-UTC cursor is exact, because UTC has no clock changes.
 *   - The time of day is re-attached at the end, by asking what instant
 *     corresponds to that wall-clock time in Europe/Amsterdam on that
 *     particular day. That is the step that survives a DST boundary.
 *
 * The other thing worth stating out loud: a recurrence with no `until` never
 * ends. Every entry point here takes a window and refuses to look outside it,
 * and the loops are additionally capped, because a weekly series started in
 * 2015 and asked for "everything" is an infinite list with a database row
 * behind it.
 */

const TZ = "Europe/Amsterdam";

/** Hard ceiling per series, so an open-ended pattern cannot run away. */
const MAX_OCCURRENCES_PER_EVENT = 400;

export type RecurrenceType =
  | "none"
  | "weekly"
  | "biweekly"
  | "monthlyWeekday"
  | "monthlyDate";

export type Weekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export type Ordinal = "first" | "second" | "third" | "fourth" | "last";

/** Monday first, to match the weekday arrays in the dictionaries. */
const WEEKDAY_INDEX: Record<Weekday, number> = {
  monday: 0,
  tuesday: 1,
  wednesday: 2,
  thursday: 3,
  friday: 4,
  saturday: 5,
  sunday: 6,
};

const ORDINAL_INDEX: Record<Exclude<Ordinal, "last">, number> = {
  first: 0,
  second: 1,
  third: 2,
  fourth: 3,
};

/**
 * One row of the collection as it arrives from Payload at depth 1. Everything
 * the owners are not obliged to fill in is optional and nullable, because a
 * freshly created document is mostly nulls until they get to it.
 */
export interface EventDoc {
  id: string | number;
  title: string;
  slug: string;
  excerpt?: string | null;
  description?: unknown;
  image?: MediaRef | null;
  startDate: string;
  endDate?: string | null;
  allDay?: boolean | null;
  recurrence?: {
    type?: RecurrenceType | null;
    weekday?: Weekday | null;
    ordinal?: Ordinal | null;
    until?: string | null;
    skipDates?: ({ date?: string | null } | null)[] | null;
  } | null;
  location?: string | null;
  price?: string | null;
  bookingRequired?: boolean | null;
  bookingUrl?: string | null;
  bookingNote?: string | null;
  category?: string | null;
  status?: string | null;
  featured?: boolean | null;
  updatedAt?: string;
  createdAt?: string;
}

export interface EventOccurrence {
  /** "<eventId>:<YYYY-MM-DD>" — a React key, and the stable half of an ICS UID. */
  id: string;
  event: EventDoc;
  start: Date;
  end?: Date;
  isRecurring: boolean;
}

/* ------------------------------------------------------------------ *
 * Wall clock ↔ instant
 * ------------------------------------------------------------------ */

/**
 * hourCycle rather than hour12: with hour12:false some ICU builds print
 * midnight as "24", which would push every midnight event a day forward.
 */
const wallFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

interface Wall {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** What a clock in Amsterdam reads at this instant. */
function wallParts(instant: Date): Wall {
  const found: Record<string, string> = {};
  for (const part of wallFormat.formatToParts(instant)) {
    if (part.type !== "literal") found[part.type] = part.value;
  }
  return {
    year: Number(found.year),
    month: Number(found.month),
    day: Number(found.day),
    hour: Number(found.hour),
    minute: Number(found.minute),
    second: Number(found.second),
  };
}

/** How far ahead of UTC Amsterdam is at this instant, in milliseconds. */
function offsetMs(instant: Date): number {
  const w = wallParts(instant);
  const asIfUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  // Seconds granularity on both sides: the formatter has no milliseconds, so
  // comparing against a millisecond-precise instant would leak the remainder
  // into the offset.
  return asIfUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** A calendar day, with no time attached. */
interface Day {
  year: number;
  month: number;
  day: number;
}

/**
 * The instant at which a clock in Amsterdam reads this date and time.
 *
 * Two passes. The first guesses the offset from the naive instant, which is
 * wrong by an hour when the guess falls on the far side of a clock change;
 * the second re-reads the offset at the corrected instant and settles it. On
 * the one hour a year that does not exist at all the result lands just after
 * the gap, which is what every calendar application does with it too.
 */
function instantAt(day: Day, hour: number, minute: number): Date {
  const naive = Date.UTC(day.year, day.month - 1, day.day, hour, minute);
  let ts = naive - offsetMs(new Date(naive));
  ts = naive - offsetMs(new Date(ts));
  return new Date(ts);
}

/* ------------------------------------------------------------------ *
 * Calendar-day arithmetic, at midday UTC
 * ------------------------------------------------------------------ */

/** A day cursor: an instant at 12:00 UTC whose UTC parts are the day itself. */
function cursor(day: Day): Date {
  return new Date(Date.UTC(day.year, day.month - 1, day.day, 12));
}

function fromCursor(c: Date): Day {
  return { year: c.getUTCFullYear(), month: c.getUTCMonth() + 1, day: c.getUTCDate() };
}

function addDays(c: Date, days: number): Date {
  return new Date(c.getTime() + days * 86400000);
}

/** Monday = 0, to match WEEKDAY_INDEX and the dictionary weekday arrays. */
function weekdayOf(c: Date): number {
  return (c.getUTCDay() + 6) % 7;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0, 12)).getUTCDate();
}

/** "2026-03-04" — the key an occurrence id and a skip list are matched on. */
export function dayKey(day: Day): string {
  return `${day.year}-${String(day.month).padStart(2, "0")}-${String(day.day).padStart(2, "0")}`;
}

/** The Amsterdam calendar day an instant falls on. */
export function dayKeyOf(instant: Date): string {
  const w = wallParts(instant);
  return dayKey({ year: w.year, month: w.month, day: w.day });
}

/**
 * The nth given weekday of a month, or null when the month has no fifth one.
 * "last" means the final such weekday, which is the fourth in a short month
 * and the fifth in a long one — that is the whole point of the word.
 */
function nthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
  ordinal: Ordinal,
): Day | null {
  const firstWeekday = weekdayOf(cursor({ year, month, day: 1 }));
  const firstMatch = 1 + ((weekday - firstWeekday + 7) % 7);
  const length = daysInMonth(year, month);

  if (ordinal === "last") {
    let day = firstMatch;
    while (day + 7 <= length) day += 7;
    return { year, month, day };
  }

  const day = firstMatch + ORDINAL_INDEX[ordinal] * 7;
  return day <= length ? { year, month, day } : null;
}

/**
 * The skip list and `until` come from day-only pickers, and Payload has
 * stored them as an instant at midnight. Which midnight depends on how the
 * value was written, so both readings are accepted rather than guessing: a
 * date the owners typed to cancel an evening must cancel that evening.
 */
function dayKeysOf(value: string): string[] {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return [];
  const utc = dayKey({
    year: parsed.getUTCFullYear(),
    month: parsed.getUTCMonth() + 1,
    day: parsed.getUTCDate(),
  });
  const local = dayKeyOf(parsed);
  return utc === local ? [utc] : [utc, local];
}

/* ------------------------------------------------------------------ *
 * Expansion
 * ------------------------------------------------------------------ */

/**
 * The calendar days one series lands on inside a window.
 *
 * Each branch jumps straight to the first candidate at or after the window
 * rather than stepping there from the first date, so a fixture that has been
 * running since 2019 costs the same as one starting next week.
 */
function seriesDays(event: EventDoc, first: Day, fromDay: Day, toDay: Day): Day[] {
  const type = event.recurrence?.type ?? "none";
  const days: Day[] = [];

  if (type === "none") return [first];

  const fromCursorTs = cursor(fromDay).getTime();
  const toCursorTs = cursor(toDay).getTime();

  if (type === "weekly" || type === "biweekly") {
    const step = type === "weekly" ? 7 : 14;

    // The first date is the anchor. If the owners also picked a weekday and it
    // disagrees with that date — they typed today's date and meant "Mondays" —
    // the anchor slides forward to the first matching day, so the words they
    // chose win over the date they happened to be looking at.
    let anchor = cursor(first);
    const wanted = event.recurrence?.weekday;
    if (wanted && WEEKDAY_INDEX[wanted] !== weekdayOf(anchor)) {
      anchor = addDays(anchor, (WEEKDAY_INDEX[wanted] - weekdayOf(anchor) + 7) % 7);
    }

    const behind = fromCursorTs - anchor.getTime();
    const jump = behind > 0 ? Math.floor(behind / (step * 86400000)) : 0;
    let c = addDays(anchor, jump * step);

    while (c.getTime() <= toCursorTs && days.length < MAX_OCCURRENCES_PER_EVENT) {
      if (c.getTime() >= anchor.getTime()) days.push(fromCursor(c));
      c = addDays(c, step);
    }
    return days;
  }

  // Both monthly patterns walk months, not days. Start at whichever is later:
  // the month the series begins, or the month the window opens.
  const windowOpensLater =
    fromDay.year > first.year ||
    (fromDay.year === first.year && fromDay.month > first.month);
  let year = windowOpensLater ? fromDay.year : first.year;
  let month = windowOpensLater ? fromDay.month : first.month;

  const startTs = cursor(first).getTime();
  let guard = 0;

  while (guard < MAX_OCCURRENCES_PER_EVENT * 2 && days.length < MAX_OCCURRENCES_PER_EVENT) {
    guard += 1;
    if (year > toDay.year || (year === toDay.year && month > toDay.month)) break;

    let candidate: Day | null = null;
    if (type === "monthlyWeekday") {
      const weekday = event.recurrence?.weekday
        ? WEEKDAY_INDEX[event.recurrence.weekday]
        : weekdayOf(cursor(first));
      candidate = nthWeekdayOfMonth(year, month, weekday, event.recurrence?.ordinal ?? "first");
    } else {
      // Same day number every month. February has no 31st and never will, so
      // that month is skipped rather than dragged back to the 28th: a series
      // that jumps about is harder to read than one with a gap in it.
      candidate = first.day <= daysInMonth(year, month) ? { year, month, day: first.day } : null;
    }

    if (candidate) {
      const ts = cursor(candidate).getTime();
      if (ts >= startTs && ts >= fromCursorTs && ts <= toCursorTs) days.push(candidate);
    }

    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  return days;
}

/**
 * Every occurrence of every given event that falls inside [fromIso, toIso],
 * sorted by start. The window is mandatory and is the only thing standing
 * between a page and an open-ended series.
 */
export function expandOccurrences(
  events: EventDoc[],
  fromIso: string,
  toIso: string,
): EventOccurrence[] {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) return [];

  const fromDay = (() => {
    const w = wallParts(from);
    return { year: w.year, month: w.month, day: w.day };
  })();
  const toDay = (() => {
    const w = wallParts(to);
    return { year: w.year, month: w.month, day: w.day };
  })();

  const out: EventOccurrence[] = [];

  for (const event of events) {
    const start = new Date(event.startDate);
    if (Number.isNaN(start.getTime())) continue;

    const w = wallParts(start);
    const first: Day = { year: w.year, month: w.month, day: w.day };
    // An all-day evening has no time the owners chose; it starts at midnight
    // and the ICS writer strips the time off again anyway.
    const hour = event.allDay ? 0 : w.hour;
    const minute = event.allDay ? 0 : w.minute;

    // The owners type the end of the first evening. Every later one lasts as
    // long as that first one did, which is the only reading that does not
    // require them to fill in an end date per repeat.
    const endValue = event.endDate ? new Date(event.endDate) : null;
    const duration =
      endValue && !Number.isNaN(endValue.getTime()) && endValue > start
        ? endValue.getTime() - start.getTime()
        : null;

    const isRecurring = Boolean(
      event.recurrence?.type && event.recurrence.type !== "none",
    );

    const skipped = new Set<string>();
    for (const row of event.recurrence?.skipDates ?? []) {
      if (row?.date) for (const key of dayKeysOf(row.date)) skipped.add(key);
    }

    // `until` is a day, so the series runs to the end of it rather than to
    // its midnight — "loopt tot 30 juni" includes the thirtieth.
    let untilKey: string | null = null;
    if (isRecurring && event.recurrence?.until) {
      untilKey = dayKeysOf(event.recurrence.until)[0] ?? null;
    }

    for (const day of seriesDays(event, first, fromDay, toDay)) {
      const key = dayKey(day);
      if (skipped.has(key)) continue;
      if (untilKey && key > untilKey) continue;

      const occurrenceStart = instantAt(day, hour, minute);
      if (occurrenceStart < from || occurrenceStart > to) continue;

      out.push({
        id: `${event.id}:${key}`,
        event,
        start: occurrenceStart,
        end: duration ? new Date(occurrenceStart.getTime() + duration) : undefined,
        isRecurring,
      });
    }
  }

  out.sort((a, b) => a.start.getTime() - b.start.getTime());
  return out;
}

/* ------------------------------------------------------------------ *
 * Loading
 * ------------------------------------------------------------------ */

export interface LoadEventsOptions {
  /** Start of the window. Defaults to now. */
  from?: Date;
  /** End of the window. Defaults to six months out. */
  to?: Date;
  /** Restrict to one series, for a detail page or a single .ics. */
  slug?: string;
  /** How many rows to read from the CMS, not how many occurrences come back. */
  limit?: number;
}

export interface LoadedEvents {
  events: EventDoc[];
  occurrences: EventOccurrence[];
  from: Date;
  to: Date;
}

const DEFAULT_WINDOW_DAYS = 180;

/**
 * Published events for one language, already expanded across the window.
 *
 * The Payload client is imported inside the function rather than at the top
 * of the file. Everything above this point is arithmetic that a route, a page
 * or a test can call without a database anywhere near it, and a top-level
 * import would drag the whole CMS in behind it.
 */
export async function loadEvents(
  locale: Locale,
  opts: LoadEventsOptions = {},
): Promise<LoadedEvents> {
  const from = opts.from ?? new Date();
  const to = opts.to ?? new Date(from.getTime() + DEFAULT_WINDOW_DAYS * 86400000);

  try {
    const { getPayloadClient } = await import("@/lib/payload");
    const payload = await getPayloadClient();
    const res = await payload.find({
      collection: "events",
      where: opts.slug
        ? { slug: { equals: opts.slug }, status: { equals: "published" } }
        : { status: { equals: "published" } },
      sort: "startDate",
      limit: Math.min(opts.limit ?? 100, 200),
      depth: 1,
      locale,
    });
    const events = res.docs as unknown as EventDoc[];
    return {
      events,
      occurrences: expandOccurrences(events, from.toISOString(), to.toISOString()),
      from,
      to,
    };
  } catch {
    // The CMS is not reachable, or has never been initialised. An empty
    // agenda is a page; a thrown error is a 500.
    return { events: [], occurrences: [], from, to };
  }
}

/* ------------------------------------------------------------------ *
 * Words
 * ------------------------------------------------------------------ */

/**
 * "Elke maandag", "Elke laatste zondag van de maand", and their English
 * counterparts. The dictionary is an argument rather than an import: this
 * file is shared by both languages and must not hold a copy of either, and
 * the word order of these three sentences differs between them — which is
 * exactly why the dictionary entries are functions.
 */
export function recurrenceSentence(event: EventDoc, t: Dict): string | null {
  const type = event.recurrence?.type;
  if (!type || type === "none") return null;

  // Fall back to the weekday the first date happens to be, so a series the
  // owners set up without touching the weekday select still reads correctly.
  const configured = event.recurrence?.weekday;
  let index: number;
  if (configured) {
    index = WEEKDAY_INDEX[configured];
  } else {
    const start = new Date(event.startDate);
    if (Number.isNaN(start.getTime())) return null;
    const w = wallParts(start);
    index = weekdayOf(cursor({ year: w.year, month: w.month, day: w.day }));
  }
  const weekday = t.weekdays[index];

  switch (type) {
    case "weekly":
      return t.events.everyWeekOn(weekday);
    case "biweekly":
      return t.events.everyTwoWeeksOn(weekday);
    case "monthlyWeekday":
      return t.events.everyMonthOn(
        t.events.ordinals[event.recurrence?.ordinal ?? "first"],
        weekday,
      );
    case "monthlyDate": {
      const start = new Date(event.startDate);
      if (Number.isNaN(start.getTime())) return null;
      return t.events.everyMonthOnDate(wallParts(start).day);
    }
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ *
 * Handing an occurrence to a calendar
 * ------------------------------------------------------------------ */

export interface IcsEventOptions {
  organizerName?: string;
  organizerEmail?: string;
  /** Used when the event itself names no location: the café's own address. */
  defaultLocation?: string;
}

/**
 * One occurrence in the shape src/lib/ics.ts wants.
 *
 * The UID is the occurrence id, which already carries the event and the day,
 * so downloading the same evening twice updates one entry instead of making
 * two. A recurring series downloaded whole therefore arrives as a set of
 * separate dated entries rather than as an RRULE — deliberately: the pattern
 * here can be edited or have holes punched in it at any time, and a client
 * that has cached an RRULE would keep showing dates we have since cancelled.
 */
export function toIcsEvent(
  occurrence: EventOccurrence,
  locale: Locale,
  opts: IcsEventOptions = {},
): IcsEvent {
  const event = occurrence.event;
  return {
    uid: occurrence.id,
    title: event.title,
    description: event.excerpt || undefined,
    location: event.location || opts.defaultLocation || undefined,
    start: occurrence.start,
    end: occurrence.end,
    url: canonicalUrl(locale, `/evenementen/${event.slug}`),
    allDay: Boolean(event.allDay),
    organizerName: opts.organizerName,
    organizerEmail: opts.organizerEmail,
  };
}
