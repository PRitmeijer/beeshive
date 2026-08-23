/**
 * Reading the week's opening hours out of the CMS.
 *
 * The hours are typed by hand, one free-text line per day ("11:00 – 21:00",
 * "Gesloten", occasionally a split service like "12:00-16:00, 17:00-22:00").
 * The booking form and the endpoint that receives the booking both need to
 * know what that line means, so the reading of it lives here and is done once.
 *
 * This module imports nothing, so it bundles on either side of the boundary.
 */

/** Minutes from midnight, so arithmetic and comparison are trivial. */
export interface Range {
  open: number;
  close: number;
}

export interface HoursRow {
  day: string;
  hours: string;
}

/** One entry per weekday, Monday first. An empty list means closed. */
export type Week = Range[][];

/**
 * One date after the schedule has had its say.
 *
 * The full answer, with the layer it came from and the loader that fetches it,
 * is `DaySchedule` in src/lib/schedule.ts — but that module reads the CMS, so
 * it belongs to the server alone. This is the part of the shape the browser
 * needs, declared in the module both sides already import, so the form and the
 * pages can hold a resolved schedule without dragging Payload into the bundle.
 * `DaySchedule` extends it, so a server-resolved day is one of these.
 */
export interface ScheduledDay {
  /** YYYY-MM-DD in the café's own timezone. */
  date: string;
  /** Empty means the doors stay shut. */
  ranges: Range[];
  closed: boolean;
  /** Why this day differs, when it does, in the reader's language. */
  note?: string | null;
  /** The hours as they were typed, for a line no range could be read out of. */
  text?: string | null;
}

/**
 * The cell says the doors are shut.
 *
 * Matched loosely, because the word rarely arrives alone: "Gesloten (vakantie
 * 1-15 juli)" is exactly how a person writes a holiday, and anchoring this to
 * the whole cell read the dates in the explanation as opening times. What keeps
 * "11:00 - 21:00 (keuken gesloten na 20:00)" open is not the anchor but the
 * order — see `parseRanges`, which only believes the word when it comes before
 * the first time on the line.
 */
const CLOSED = /\b(gesloten|closed|dicht)\b/i;

/** Minutes in a day, for the times that run past the end of one. */
const DAY_MINUTES = 24 * 60;

/**
 * How far past midnight a closing time is still believable.
 *
 * A kitchen that runs to one or two in the morning is an ordinary Saturday; a
 * line reading "20:00 - 07:00" is somebody who swapped the two ends round. The
 * cut sits at four, past the latest hour a Utrecht eetcafé may serve and well
 * short of any plausible morning opening, so a real late kitchen is read as one
 * and a typo is still refused.
 */
const LATEST_CLOSE_AFTER_MIDNIGHT = 4 * 60;

/**
 * The last table we take online sits down this long before the doors close,
 * so nobody books a table for the minute the lights go off.
 */
export const LAST_SITTING_BEFORE_CLOSE = 60;

/**
 * The grid every offered time sits on. Exported because the seat counting in
 * src/lib/capacity.ts walks the same grid: a table booked at 19:00 has to
 * occupy the very slots the form is offering, or the two disagree about what
 * "full" means.
 */
export const SLOT_MINUTES = 30;

/**
 * How far ahead of now the earliest same-day booking may be. Without it the
 * form happily offers a table at 19:00 to someone filling the form in at
 * 18:58, which is a phone call, not a booking.
 */
export const LEAD_MINUTES = 60;

/** "9", "09:30", "9.30" -> minutes from midnight. */
function toMinutes(hour: string, minute: string | undefined): number {
  return Number(hour) * 60 + Number(minute ?? 0);
}

/** "19:00" -> 1140, or null for anything that is not a time of day. */
export function timeToMinutes(time: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  return m ? toMinutes(m[1], m[2]) : null;
}

/**
 * Minutes from midnight as a clock reads them. A range that runs past midnight
 * carries a close beyond 24:00, and 01:00 is what a person — and schema.org's
 * `closes` — expects to see there, never "25:00".
 */
export function formatTime(minutes: number): string {
  const clock = ((minutes % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  const h = String(Math.floor(clock / 60)).padStart(2, "0");
  const m = String(clock % 60).padStart(2, "0");
  return `${h}:${m}`;
}

/**
 * Every time range in one day's line. Anything with no times in it at all —
 * "Gesloten", a note, an empty cell — yields none, which reads as closed.
 *
 * A close after midnight comes back as minutes past this day's midnight, so a
 * Saturday running to one o'clock is `{ open: 1020, close: 1500 }`. Everything
 * downstream compares `open` and `close` and nothing divides by the length of a
 * day, so the only place that has to know is `formatTime`, which wraps, and
 * `slotsFor`, which stops offering tables at midnight because a slot is a time
 * on a date and half past midnight belongs to the next one.
 */
export function parseRanges(hours: string | null | undefined): Range[] {
  if (!hours) return [];
  // Built per call: a /g regex carries lastIndex between uses.
  const pattern =
    /(\d{1,2})(?:[:.](\d{2}))?\s*(?:[–—−-]|tot|to|till|until)\s*(\d{1,2})(?:[:.](\d{2}))?/gi;
  const found = [...hours.matchAll(pattern)];

  // "Gesloten (vakantie 1-15 juli)" is shut and says why; "11:00 - 21:00
  // (keuken gesloten na 20:00)" is open and says how late the kitchen runs.
  // Whichever comes first on the line is the one being said about the day.
  const closed = CLOSED.exec(hours);
  if (closed && (found.length === 0 || closed.index < found[0].index)) return [];

  const ranges: Range[] = [];
  for (const m of found) {
    const open = toMinutes(m[1], m[2]);
    let close = toMinutes(m[3], m[4]);
    // A close at or before the open is either a kitchen that runs past
    // midnight or two ends typed the wrong way round, and the hour tells them
    // apart: carried over the date line it has to land before the small hours.
    if (close <= open) close += DAY_MINUTES;
    if (close > open && close <= DAY_MINUTES + LATEST_CLOSE_AFTER_MIDNIGHT) {
      ranges.push({ open, close });
    }
  }
  return ranges.sort((a, b) => a.open - b.open);
}

/**
 * The CMS array in weekday order. Rows are taken by position rather than by
 * the day's name, exactly as the contact and reservation pages do, so a row
 * translated into English still lands on the right day.
 */
export function parseWeek(rows: HoursRow[] | null | undefined): Week {
  const week: Week = [[], [], [], [], [], [], []];
  (rows || []).slice(0, 7).forEach((row, i) => {
    week[i] = parseRanges(row?.hours);
  });
  return week;
}

/** True when not one day of the week could be read: nothing to enforce. */
export function weekIsEmpty(week: Week): boolean {
  return week.every((day) => day.length === 0);
}

/**
 * Monday-first index for a YYYY-MM-DD string, or null if it is not one.
 * Read at midday UTC so the day cannot slip either side of a date line.
 */
export function weekdayIndex(isoDate: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const d = new Date(`${isoDate}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return (d.getUTCDay() + 6) % 7;
}

/**
 * Bookable half hours for one day: from the door opening up to an hour before
 * it closes, per range, with any overlap between ranges collapsed.
 *
 * `notBefore` is minutes from midnight, and drops everything earlier. It is
 * how today differs from every other day: the slots that have already been
 * and gone are not on offer.
 */
export function slotsFor(ranges: Range[], notBefore = -1): string[] {
  const found = new Set<number>();
  for (const { open, close } of ranges) {
    const last = close - LAST_SITTING_BEFORE_CLOSE;
    // Walk the half-hour grid from the door opening, so the slots stay on
    // :00 and :30 whatever `notBefore` happens to be, and keep the ones that
    // have not already gone. A day that closes after midnight stops offering
    // at midnight: a booking is a date and a time of day, and a guest wanting
    // half past twelve books it on the date the clock will show.
    for (let t = open; t <= last && t < DAY_MINUTES; t += SLOT_MINUTES) {
      if (t >= notBefore) found.add(t);
    }
  }
  return [...found].sort((a, b) => a - b).map(formatTime);
}

/**
 * Whether a HH:MM string is one of the day's bookable slots.
 *
 * One of the slots, not merely a minute inside the hours: the grid is part of
 * the answer, or this says yes to 19:07 on a day whose form only ever offered
 * 19:00 and 19:30. The seat counting in src/lib/capacity.ts walks that same
 * grid, and a booking taken off it is one nothing else can see.
 *
 * The step is measured from each range's own opening, exactly as `slotsFor`
 * lays it out, so a day that opens at 11:15 offers — and accepts — 11:45.
 */
export function isBookable(
  ranges: Range[],
  time: string,
  notBefore = -1,
): boolean {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!m) return false;
  const minutes = toMinutes(m[1], m[2]);
  if (minutes < notBefore) return false;
  return ranges.some(
    ({ open, close }) =>
      minutes >= open &&
      minutes <= close - LAST_SITTING_BEFORE_CLOSE &&
      (minutes - open) % SLOT_MINUTES === 0,
  );
}

/** The time now in the café's own timezone, as minutes from midnight. */
export function nowMinutesInAmsterdam(): number {
  const [h, m] = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Amsterdam",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(new Date())
    .split(":");
  return Number(h) * 60 + Number(m);
}

/** Today in the café's own timezone, as YYYY-MM-DD. */
export function todayInAmsterdam(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** How far ahead the form offers a table. The endpoint allows a year. */
const HORIZON_DAYS = 90;

/**
 * The days a table can actually be had, starting today: every date inside the
 * horizon whose weekday yields at least one bookable slot.
 *
 * A native date input cannot grey out individual days — `min` and `max` are
 * all it understands — so a guest could pick a Tuesday, fill the whole form
 * in and only then be told the café is shut. Offering the open dates and
 * nothing else means the question never arises.
 *
 * If the hours cannot be read at all, every date is offered rather than none:
 * a CMS someone has emptied should not silently close the bookings.
 */
export function availableDates(
  today: string,
  week: Week,
  nowMinutes?: number,
): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return [];
  const anchor = new Date(`${today}T12:00:00.000Z`);
  if (Number.isNaN(anchor.getTime())) return [];
  const unknown = weekIsEmpty(week);

  const dates: string[] = [];
  for (let i = 0; i < HORIZON_DAYS; i++) {
    // Stepping whole days from midday UTC stays at midday UTC, so no amount
    // of daylight saving can nudge one of these onto the wrong date.
    const day = new Date(anchor.getTime() + i * 86_400_000);
    const iso = day.toISOString().slice(0, 10);
    if (unknown) {
      dates.push(iso);
      continue;
    }
    const index = (day.getUTCDay() + 6) % 7;
    // Today drops off the list once its last sitting is inside the lead time.
    const notBefore =
      i === 0 && typeof nowMinutes === "number"
        ? nowMinutes + LEAD_MINUTES
        : -1;
    if (slotsFor(week[index], notBefore).length > 0) dates.push(iso);
  }
  return dates;
}

/**
 * The same list, but read off days somebody has already resolved.
 *
 * `availableDates()` above knows only the seven weekly rows, so it offers a
 * Sunday exactly never — including the last Sunday of the month, when the café
 * is open, and including the Tuesday in December they open on purpose. Handed
 * the output of `resolveDay()` for the window instead, this offers the days the
 * café is really open and nothing else, because by then the exceptions and the
 * repeating rules have already been folded in.
 *
 * It is a second function rather than a changed one: the booking form still
 * runs off the weekly rows in the sheet on phones, where there is no server
 * render to resolve anything, and that has to keep working.
 */
export function availableDatesFromSchedule(
  days: ScheduledDay[],
  today: string,
  nowMinutes?: number,
): string[] {
  return days
    .filter((day) => {
      // Today drops off the list once its last sitting is inside the lead time.
      const notBefore =
        day.date === today && typeof nowMinutes === "number"
          ? nowMinutes + LEAD_MINUTES
          : -1;
      return slotsFor(day.ranges, notBefore).length > 0;
    })
    .map((day) => day.date);
}

/** One resolved day out of a window, by date. */
export function dayFromSchedule(
  days: ScheduledDay[],
  isoDate: string,
): ScheduledDay | null {
  return days.find((day) => day.date === isoDate) ?? null;
}

/** "11:00 – 21:00", or "12:00 – 16:00, 17:00 – 22:00" for a split day. */
export function describe(ranges: Range[]): string {
  return ranges
    .map((r) => `${formatTime(r.open)} – ${formatTime(r.close)}`)
    .join(", ");
}
