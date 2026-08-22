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

/** The whole cell reads "Gesloten" or "Closed", never a time. */
const CLOSED = /^\s*(gesloten|closed|dicht)\s*$/i;

/**
 * The last table we take online sits down this long before the doors close,
 * so nobody books a table for the minute the lights go off.
 */
export const LAST_SITTING_BEFORE_CLOSE = 60;

const SLOT_MINUTES = 30;

/** "9", "09:30", "9.30" -> minutes from midnight. */
function toMinutes(hour: string, minute: string | undefined): number {
  return Number(hour) * 60 + Number(minute ?? 0);
}

export function formatTime(minutes: number): string {
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  return `${h}:${m}`;
}

/**
 * Every time range in one day's line. Anything with no times in it at all —
 * "Gesloten", a note, an empty cell — yields none, which reads as closed.
 */
export function parseRanges(hours: string | null | undefined): Range[] {
  if (!hours || CLOSED.test(hours)) return [];
  // Built per call: a /g regex carries lastIndex between uses.
  const pattern =
    /(\d{1,2})(?:[:.](\d{2}))?\s*(?:[–—−-]|tot|to|till|until)\s*(\d{1,2})(?:[:.](\d{2}))?/gi;
  const ranges: Range[] = [];
  for (const m of hours.matchAll(pattern)) {
    const open = toMinutes(m[1], m[2]);
    const close = toMinutes(m[3], m[4]);
    // A close time before the open time means someone typed it wrong, or the
    // kitchen runs past midnight. Neither is something to guess at.
    if (close > open && close <= 24 * 60) ranges.push({ open, close });
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
 */
export function slotsFor(ranges: Range[]): string[] {
  const found = new Set<number>();
  for (const { open, close } of ranges) {
    const last = close - LAST_SITTING_BEFORE_CLOSE;
    for (let t = open; t <= last; t += SLOT_MINUTES) found.add(t);
  }
  return [...found].sort((a, b) => a - b).map(formatTime);
}

/** Whether a HH:MM string is one of the day's bookable slots. */
export function isBookable(ranges: Range[], time: string): boolean {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!m) return false;
  const minutes = toMinutes(m[1], m[2]);
  return ranges.some(
    ({ open, close }) =>
      minutes >= open && minutes <= close - LAST_SITTING_BEFORE_CLOSE,
  );
}

/** "11:00 – 21:00", or "12:00 – 16:00, 17:00 – 22:00" for a split day. */
export function describe(ranges: Range[]): string {
  return ranges
    .map((r) => `${formatTime(r.open)} – ${formatTime(r.close)}`)
    .join(", ");
}
