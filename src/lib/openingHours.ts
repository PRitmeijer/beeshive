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
 * How long before the doors close the last table we take online sits down,
 * when the owners have not said otherwise.
 *
 * It was a flat hour for everybody until the café asked for the number to be
 * theirs, and the request came with its own reasoning: a kitchen closing at
 * nine wants a different gap from one closing at eight, and "an hour" was the
 * answer given to both. Sixty is still what ships, so on the day this became a
 * setting not one sitting anywhere moved by a minute.
 *
 * It is a default parameter and not a fallback for any particular surface.
 * Every screen and every endpoint that draws or judges a sitting is handed the
 * resolved rules — the layout resolves them for the booking sheet on phones as
 * surely as the reserveren page does for itself — so what this number really
 * covers is a caller with no rules in its hand at all: a unit test, a library
 * entry point below, a component rendered without the prop. Saying it was "for
 * the sheet on phones" was true of an earlier arrangement and has not been
 * true since the layout started passing `rules` down, and a comment that names
 * a surface invites the next reader to go and check that surface rather than
 * the argument.
 *
 * Worth being clear about what this number is not, because it is the thing the
 * owners will not think of: it is the last time a table can be *booked*, not
 * the last time anybody is sitting at one. A party seated ninety minutes
 * before closing on a two-hour sitting is still there half an hour after the
 * doors shut. That is theirs to decide, so the field's own help text in
 * src/globals/settings/reservations.ts says it in as many words.
 */
export const LAST_SITTING_BEFORE_CLOSE = 60;

/**
 * The two grids the sittings may sit on, finest first.
 *
 * It was half hours and nothing else until the owners asked for quarters: at
 * half-hour granularity a Saturday evening collapses onto 19:00, 19:30 and
 * 20:00 and the whole room walks in at once, where quarters spread the same
 * number of arrivals across the kitchen's worst hour without adding a seat.
 *
 * Moving between the two is safe, and cheaply so, because thirty is a multiple
 * of fifteen: the half-hour grid is a strict subset of the quarter-hour one, so
 * every reservation already stored at :00 or :30 is still exactly on grid and
 * no row anywhere had to be touched. That property only holds because
 * `slotsFor` and `isBookable` below snap to absolute boundaries rather than
 * stepping from each day's own opening time — a day opening at 11:15 would
 * otherwise have had a grid of its own, and "subset" would mean nothing.
 *
 * Finest first because the Reservations collection reads the first entry: its
 * `time` field has to accept every grid the CMS can be set to, and it cannot
 * read the CMS to find out which one is in force today.
 */
export const SLOT_MINUTES_CHOICES = [15, 30] as const;

/**
 * The grid when nobody has said otherwise, and the one the CMS field defaults
 * to. Exported because the seat counting in src/lib/capacity.ts walks the same
 * grid: a table booked at 19:00 has to occupy the very slots the form is
 * offering, or the two disagree about what "full" means.
 */
export const SLOT_MINUTES = 15;

/**
 * The five numbers the owners set in Site Instellingen, and the defaults for a
 * caller that has not been handed them.
 *
 * They are booking rules rather than opening hours, so this is not where a
 * reader would look for them first — but the browser and both endpoints all
 * have to agree about them to the number, and this is the only module all
 * three already import and the only one that imports nothing itself. Putting
 * them anywhere else meant either a Payload import in the browser bundle or a
 * second copy of each value, and a second copy is precisely what went wrong:
 * the lead time was honoured by /api/reserve and hard-coded at sixty by the
 * form and by /api/availability, so an owner who asked for three hours' notice
 * got a form that went on offering tables it would refuse, and told the guest
 * "die tijd is al geweest" about half past five in the afternoon.
 *
 * The constants below are what a caller with no resolved rules to hand falls
 * back to: a unit test, one of the library entry points at the foot of this
 * file, a component rendered without its `rules` prop. Everything that ships a
 * booking to a guest goes the other way — `resolveBookingRules()` reads the
 * CMS on the server and the answer travels down as one prop, the booking sheet
 * on phones included, which the layout hands `rules={resolveBookingRules(s)}`
 * exactly as the reserveren page hands its own.
 */

/**
 * How far ahead of now the earliest same-day booking may be. Without it the
 * form happily offers a table at 19:00 to someone filling the form in at
 * 18:58, which is a phone call, not a booking.
 */
export const LEAD_MINUTES = 60;

/** How far ahead a table can be had when the CMS has not said otherwise. */
export const HORIZON_DAYS = 90;

/**
 * The furthest ahead any of this will look, whatever the CMS says: thirteen
 * weeks to the day. Two reasons it is a cap rather than a suggestion. A picker
 * offering a year is a list nobody scrolls, and /api/availability walks every
 * reservation in the window to draw it — so this is also the size of the
 * largest window that endpoint will answer at all. An owner who opens the
 * horizon to half a year gets a quarter, which is the same answer the endpoint
 * gives, rather than the old arrangement where the page silently capped at 92,
 * the form's own fallback said 90 and the endpoint accepted whatever it read.
 */
export const MAX_HORIZON_DAYS = 91;

/** The largest party the form takes when the CMS has not said otherwise. */
export const MAX_PARTY_SIZE = 20;

/**
 * And the largest it will take however high the CMS goes, because the
 * `guests` field in src/collections/Reservations.ts stops at thirty. Above it
 * every check in /api/reserve passed and `payload.create` then threw a
 * ValidationError the route could only turn into "er ging iets mis aan onze
 * kant" — so a party of thirty-five was a 500 for the guest and a stack trace
 * for the owners. Refusing at thirty is a sentence they can read; the two
 * numbers have to be raised together or not at all.
 */
export const PARTY_SIZE_CEILING = 30;

/** What the form and both endpoints must agree about, as one value. */
export interface BookingRules {
  /** Minutes of notice the kitchen wants for a table today. */
  leadMinutes: number;
  /** How many days ahead the picker offers, and the endpoint accepts. */
  horizonDays: number;
  /** The largest party that may book without ringing up. */
  maxPartySize: number;
  /** How far apart the sittings are: one of SLOT_MINUTES_CHOICES. */
  slotMinutes: number;
  /**
   * Minutes between the last bookable sitting and closing time. The mirror of
   * `leadMinutes`: one is how soon before a sitting a guest may still book it,
   * this is how late in the evening a sitting may still be.
   */
  lastSittingMinutes: number;
}

/** The five constants above as one value, for a caller handed no `rules`. */
export const DEFAULT_BOOKING_RULES: BookingRules = {
  leadMinutes: LEAD_MINUTES,
  horizonDays: HORIZON_DAYS,
  maxPartySize: MAX_PARTY_SIZE,
  slotMinutes: SLOT_MINUTES,
  lastSittingMinutes: LAST_SITTING_BEFORE_CLOSE,
};

/**
 * A CMS number that is really a number, floored, and inside the range it is
 * allowed to be in. `min` is nought for the lead time, because "no notice at
 * all" is a setting the owners can and do choose, and the sanitiser that
 * treated it as missing quietly gave them back the hour they had just removed.
 *
 * Which is why an empty field has to be told apart from a nought before
 * anything is coerced. `Number(null)`, `Number("")`, `Number(false)` and
 * `Number([])` are every one of them a finite nought, so a field nobody has
 * filled in used to arrive here as a deliberate setting of zero and come back
 * as the clamp minimum: a horizon of one day, a largest party of one, a form
 * refusing a table for two. Nothing live hits that today, because
 * `getSiteSettings()` drops the empties before merging and the field reaches
 * this as `undefined` — but `resolveBookingRules` takes the loose shape and
 * offers itself to anything holding one, and a raw `findGlobal` result is
 * exactly such a shape with the empties still in it. So: absent means the
 * fallback, nought means nought, and the two are decided before `Number` gets
 * a chance to blur them together.
 */
function rule(value: unknown, min: number, max: number, fallback: number): number {
  const raw = typeof value === "string" ? value.trim() : value;
  if (typeof raw !== "number" && (typeof raw !== "string" || raw === "")) {
    return fallback;
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.floor(n), min), max);
}

/**
 * The sittings' spacing, which is a choice out of a list rather than a number
 * in a range, and so cannot go through `rule()` above.
 *
 * Clamping would be the wrong shape here and quietly dangerous with it: a CMS
 * holding 20 — a value the select cannot produce but a hand-written API call
 * or an older column can — would clamp to 30 under a range rule and hand the
 * form a grid the endpoint was not using. Anything that is not exactly one of
 * the offered grids is treated as nothing said at all, which is the only
 * answer that keeps the form, both endpoints and the collection walking the
 * same minutes.
 *
 * A select stores its value as a string, so "15" and 15 both arrive here.
 */
function slotRule(value: unknown): number {
  const n = Number(typeof value === "string" ? value.trim() : value);
  return (SLOT_MINUTES_CHOICES as readonly number[]).includes(n)
    ? n
    : SLOT_MINUTES;
}

/**
 * The same judgement for the gap before closing, applied to a number that has
 * already been resolved rather than to a raw CMS value.
 *
 * `slotsFor` and `isBookable` take the gap as a plain argument, exactly as they
 * take the spacing, and both are reachable from callers holding whatever they
 * were handed — a prop that survived a serialisation, a stale window, a test.
 * A negative gap would quietly offer tables after closing time and a NaN would
 * turn every comparison in this file into `false` and empty the day, so the two
 * functions agree here about what an unusable number means before either of
 * them counts a single slot. Nought survives, because nought is a real setting:
 * see `resolveBookingRules` below.
 *
 * Exported because there is a third reader of that same number outside this
 * module. `sittings()` in src/lib/bookingFlow.ts groups a day's times into the
 * services they fall inside, which is the very question `slotsFor` answered
 * when it chose them, and for a while it asked it with the argument raw. That
 * reopened precisely what its own doc comment says it closes: handed a NaN it
 * matched no service at all and returned every one of the day's thirteen times
 * under an empty heading — a strip of chips beneath a blank line — where
 * `slotsFor`, sanitising, had cheerfully produced those thirteen times from a
 * gap of sixty. Two readers of one number disagreeing about what an unusable
 * value means is the whole reason this function exists, so it is shared rather
 * than copied.
 */
export function gapRule(minutes: number): number {
  return Number.isFinite(minutes)
    ? Math.min(Math.max(Math.floor(minutes), 0), DAY_MINUTES)
    : LAST_SITTING_BEFORE_CLOSE;
}

/**
 * The rules as the owners set them, sanitised once, for everything downstream
 * to share. Takes the loose shape rather than `SiteSettingsData` so the
 * browser bundle can hold the result without importing Payload's types.
 */
export function resolveBookingRules(settings: {
  reservationLeadMinutes?: unknown;
  reservationHorizonDays?: unknown;
  reservationMaxPartySize?: unknown;
  reservationSlotMinutes?: unknown;
  reservationLastSittingMinutes?: unknown;
}): BookingRules {
  return {
    slotMinutes: slotRule(settings.reservationSlotMinutes),
    leadMinutes: rule(settings.reservationLeadMinutes, 0, 24 * 60, LEAD_MINUTES),
    /**
     * Nought is allowed and means what it says: the last table may be booked
     * for closing time itself. It is a strange thing to want and a perfectly
     * coherent one — a bar taking a last drinks order on the hour — and the
     * sanitiser that treats a deliberate nought as an empty field is exactly
     * the bug the lead time already had, where an owner who removed the hour
     * got the hour handed straight back.
     *
     * The top of the range is a day, not the length of the day being asked
     * about, because this one number is set once for a week of days that are
     * not the same length. Clamping it against any particular day would mean
     * giving that day back sittings the owners asked not to have. A gap wider
     * than a day's own hours therefore leaves that day with no sittings at all
     * — which is not a crash and not a blank panel: `slotsFor` returns an empty
     * list, and every screen already has an honest answer for a day with no
     * times on it, the same one a Monday gets.
     */
    lastSittingMinutes: rule(
      settings.reservationLastSittingMinutes,
      0,
      DAY_MINUTES,
      LAST_SITTING_BEFORE_CLOSE,
    ),
    horizonDays: rule(
      settings.reservationHorizonDays,
      1,
      MAX_HORIZON_DAYS,
      HORIZON_DAYS,
    ),
    maxPartySize: rule(
      settings.reservationMaxPartySize,
      1,
      PARTY_SIZE_CEILING,
      MAX_PARTY_SIZE,
    ),
  };
}

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
 * The calendar arithmetic the month picker is drawn from.
 *
 * It lives here rather than in the component for two reasons. It is pure date
 * work of exactly the kind the rest of this module already does — and does at
 * midday UTC, for the same reason: a date stepped from midnight can be nudged
 * onto the day before or after by an offset or by the night the clocks move,
 * and a picker that loses the 29th of March is a picker nobody trusts again.
 * And it is the half of the picker that can be tested without a browser, which
 * is the half where the awkward cases are: a five-Sunday month, a month that
 * begins on a Sunday, and the leap day.
 */

/** The date this many days after another. Negative steps backwards. */
export function dateAfter(isoDate: string, days: number): string {
  const at = new Date(`${isoDate}T12:00:00.000Z`).getTime();
  if (Number.isNaN(at)) return "";
  return new Date(at + days * 86_400_000).toISOString().slice(0, 10);
}

/** "2026-08-29" -> "2026-08". */
export const monthOf = (isoDate: string) => isoDate.slice(0, 7);

/** "2026-11" plus two months is "2027-01"; Date does the carrying. */
export function monthAfter(month: string, months: number): string {
  const at = new Date(
    Date.UTC(
      Number(month.slice(0, 4)),
      Number(month.slice(5, 7)) - 1 + months,
      1,
      12,
    ),
  );
  return Number.isNaN(at.getTime()) ? "" : at.toISOString().slice(0, 7);
}

/**
 * One month as the weeks it is printed in, Monday first, with the days
 * belonging to the months either side left as gaps.
 *
 * Gaps rather than the neighbouring months' numbers: a square showing the 31st
 * of July under a heading reading August is a square people press by mistake,
 * and there is nothing on a booking form for a wrong press to be worth.
 */
export function monthGrid(month: string): (string | null)[][] {
  const first = new Date(`${month}-01T12:00:00.000Z`);
  if (Number.isNaN(first.getTime())) return [];
  const lead = (first.getUTCDay() + 6) % 7;
  const length = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0, 12),
  ).getUTCDate();
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let day = 1; day <= length; day += 1) {
    cells.push(`${month}-${String(day).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
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
 * Bookable sittings for one day: from the first slot on or after the door
 * opening up to `lastSittingMinutes` before it closes, per range, with any
 * overlap between ranges collapsed.
 *
 * `notBefore` is minutes from midnight, and drops everything earlier. It is
 * how today differs from every other day: the slots that have already been
 * and gone are not on offer.
 *
 * `slotMinutes` is how far apart they sit and `lastSittingMinutes` is how long
 * before closing the last of them may be, and both come from the CMS by way of
 * `resolveBookingRules` on every path that ends in a guest being offered a
 * table — the booking sheet on phones included, which the layout resolves for.
 * The module constants behind the two defaults are for a caller holding no
 * rules at all: a test, or one of the two entry points at the foot of this
 * file. Leave them to it in application code and this quietly counts a day by
 * a rule the owners did not set.
 *
 * A gap wider than the day's own hours empties the day rather than throwing:
 * `last` lands before `first`, the loop never runs, and the caller gets the
 * same empty list a Monday gives it. Every screen downstream already knows what
 * to say about a day with no sittings, so an owner who types 600 into a field
 * meant for 90 sees a closed-looking week and not a broken one.
 */
export function slotsFor(
  ranges: Range[],
  notBefore = -1,
  slotMinutes: number = SLOT_MINUTES,
  lastSittingMinutes: number = LAST_SITTING_BEFORE_CLOSE,
): string[] {
  const step = slotRule(slotMinutes);
  const gap = gapRule(lastSittingMinutes);
  const found = new Set<number>();
  for (const { open, close } of ranges) {
    const last = close - gap;
    // The grid is the day's own, counted from midnight, and not the door
    // opening's. It used to be the latter, and a kitchen typed in as
    // "11:15 - 21:00" then offered 11:15, 11:45, 12:15 and so on: times the
    // form was happy to show, this file was happy to accept, and the
    // Reservations collection refused outright, so every single booking on
    // such a day came back as "Er ging iets mis aan onze kant" with a
    // ValidationError in the log and nothing stored. An opening on an odd
    // minute now simply starts at the next slot, which is the one answer the
    // form, the endpoint and the collection can all agree on.
    //
    // It is also what makes the spacing safe to change. Because the grid is
    // absolute, half hours are a strict subset of quarter hours, and every
    // booking already stored at :00 or :30 stays exactly on grid whichever of
    // the two the owners pick. Step from the door opening instead and each day
    // would have a grid of its own, moving under the stored rows.
    //
    // Keeping the agreement is /api/reserve's job as much as this file's, and
    // for a while it was not doing it: the grid was checked there only by
    // `isBookable` below, which is skipped on a day whose hours nobody has
    // typed into the CMS yet, so on that one path a hand-rolled "19:07" walked
    // past every check in the endpoint and came back as the same 500. It now
    // refuses anything off the grid itself, before the schedule is even
    // consulted, which is what makes the sentence above true on every path
    // rather than on most of them.
    //
    // A day that closes after midnight stops offering at midnight: a booking
    // is a date and a time of day, and a guest wanting half past twelve books
    // it on the date the clock will show.
    const first = Math.ceil(open / step) * step;
    for (let t = first; t <= last && t < DAY_MINUTES; t += step) {
      if (t >= notBefore) found.add(t);
    }
  }
  return [...found].sort((a, b) => a - b).map(formatTime);
}

/**
 * Whether a HH:MM string lands on the grid at all, said in one place.
 *
 * /api/reserve asks this before it has resolved a schedule, because the
 * schedule check below is skipped on a day whose hours nobody has typed in;
 * `isBookable` asks it as part of a larger question. Two spellings of the same
 * arithmetic is exactly how the form and the endpoint came to disagree about
 * what a valid time was, so there is only the one.
 */
export function isOnGrid(
  time: string,
  slotMinutes: number = SLOT_MINUTES,
): boolean {
  const minutes = timeToMinutes(time);
  return minutes !== null && minutes % slotRule(slotMinutes) === 0;
}

/**
 * Whether a HH:MM string is one of the day's bookable slots.
 *
 * One of the slots, not merely a minute inside the hours: the grid is part of
 * the answer, or this says yes to 19:07 on a day whose form only ever offered
 * 19:00 and 19:15. The seat counting in src/lib/capacity.ts walks that same
 * grid, and a booking taken off it is one nothing else can see.
 *
 * The grid is absolute, exactly as `slotsFor` lays it out, and counted from
 * midnight rather than from the door. A day opening at 11:15 therefore offers
 * — and accepts — 11:15 as its first table on the quarter-hour grid and 11:30
 * on the half-hour one.
 *
 * `slotMinutes` and `lastSittingMinutes` are the same two numbers `slotsFor`
 * was handed, and every caller that has them has to pass both to both: a form
 * laying its grid out with a ninety-minute gap while the endpoint checks it
 * against sixty offers a quarter past seven and then refuses it, which is the
 * disagreement this whole file is arranged to prevent. The property test in
 * tests/lib/openingHours.slots.test.ts walks every minute of several day
 * shapes at every setting to prove the two still describe the same day.
 */
export function isBookable(
  ranges: Range[],
  time: string,
  notBefore = -1,
  slotMinutes: number = SLOT_MINUTES,
  lastSittingMinutes: number = LAST_SITTING_BEFORE_CLOSE,
): boolean {
  const minutes = timeToMinutes(time);
  if (minutes === null) return false;
  if (minutes < notBefore) return false;
  if (!isOnGrid(time, slotMinutes)) return false;
  const gap = gapRule(lastSittingMinutes);
  return ranges.some(
    ({ open, close }) => minutes >= open && minutes <= close - gap,
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

/**
 * The days a table can be had off the seven weekly rows alone, starting today:
 * every date inside the horizon whose weekday yields at least one bookable
 * slot.
 *
 * NOTHING IN src/ CALLS THIS, and the same is true of
 * `availableDatesFromSchedule` below. It is a library entry point, kept
 * deliberately and worth being honest about rather than describing a job it no
 * longer does. It answered the old date dropdown, and every screen that used to
 * ask it now asks `openDates()` / `dateChips()` in src/lib/bookingFlow.ts
 * instead — which is a strictly better answer for a booking surface, because
 * those two also drop a day the seat count has given away and a day whose every
 * remaining sitting has gone by. What is left here is the weekly-rows question
 * on its own, for a caller that has only a `Week` in its hand: it is exercised
 * by tests/lib/openingHours.dates.test.ts, and the day it acquires a caller in
 * src/ again this paragraph is the thing to read first.
 *
 * A native date input cannot grey out individual days — `min` and `max` are
 * all it understands — so a guest could pick a Tuesday, fill the whole form in
 * and only then be told the café is shut. This is the list that answered that.
 *
 * If the hours cannot be read at all, every date is offered rather than none:
 * a CMS someone has emptied should not silently close the bookings.
 *
 * The horizon, the lead time, the spacing and the gap before closing are all
 * arguments rather than constants because every one of them belongs to the
 * owners: a café that will not plan more than a fortnight ahead had this
 * offering ninety days regardless, and the guest found out by being refused
 * after filling the form in. The same goes for the gap — a day whose sittings
 * all fall inside it is a day this must not put in the list at all.
 */
export function availableDates(
  today: string,
  week: Week,
  nowMinutes?: number,
  horizonDays: number = HORIZON_DAYS,
  leadMinutes: number = LEAD_MINUTES,
  slotMinutes: number = SLOT_MINUTES,
  lastSittingMinutes: number = LAST_SITTING_BEFORE_CLOSE,
): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return [];
  const anchor = new Date(`${today}T12:00:00.000Z`);
  if (Number.isNaN(anchor.getTime())) return [];
  const unknown = weekIsEmpty(week);

  const days = Math.min(Math.max(Math.floor(horizonDays), 1), MAX_HORIZON_DAYS);
  const dates: string[] = [];
  // Inclusive of the horizon itself, because that is where /api/reserve draws
  // the line: it refuses a date *past* today plus the horizon, so the last day
  // the endpoint accepts is one this list would otherwise stop short of.
  for (let i = 0; i <= days; i++) {
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
      i === 0 && typeof nowMinutes === "number" ? nowMinutes + leadMinutes : -1;
    if (slotsFor(week[index], notBefore, slotMinutes, lastSittingMinutes).length > 0) {
      dates.push(iso);
    }
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
 * It has no caller in src/ either, for the reason given above: the flow reaches
 * for `openDates()` in src/lib/bookingFlow.ts, which asks this same question of
 * the same resolved days and then also drops the days the seat count has taken
 * away. This is the half of that without the seats, for a caller that has no
 * window answer to merge in.
 *
 * Days before `today` are dropped rather than trusted. A resolved window is
 * handed over by whoever resolved it, and on /reserveren that is a page held
 * in the ISR cache: a window resolved last night still begins at yesterday,
 * and offering yesterday is how a guest ends up being told "kies een datum
 * vanaf vandaag" about the first date in the list.
 */
export function availableDatesFromSchedule(
  days: ScheduledDay[],
  today: string,
  nowMinutes?: number,
  leadMinutes: number = LEAD_MINUTES,
  slotMinutes: number = SLOT_MINUTES,
  lastSittingMinutes: number = LAST_SITTING_BEFORE_CLOSE,
): string[] {
  return days
    .filter((day) => {
      if (day.date < today) return false;
      // Today drops off the list once its last sitting is inside the lead time.
      const notBefore =
        day.date === today && typeof nowMinutes === "number"
          ? nowMinutes + leadMinutes
          : -1;
      return slotsFor(day.ranges, notBefore, slotMinutes, lastSittingMinutes).length > 0;
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
