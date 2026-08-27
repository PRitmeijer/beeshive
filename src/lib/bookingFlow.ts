/**
 * The arithmetic behind the booking accordion.
 *
 * Which three days are offered without opening a calendar, what happens to a
 * chosen evening when the party grows, and which of the five honest answers a
 * day deserves: all of it is decided here rather than inside the component, for
 * two reasons that are really the same reason.
 *
 * The first is that this is the half of the flow that can be checked without a
 * browser, and it is the half where the awkward cases live — a party of six on
 * a Saturday that is open but full, a chosen time that survives a party change
 * while the date does not, today after the last sitting has gone. None of that
 * is visible by opening the site at half past two on a Tuesday.
 *
 * The second is the boundary. A client component may take types from the
 * modules that read the CMS and never values, or the Payload config and
 * nodemailer follow the import into the browser bundle and the production build
 * dies on `fs` — while tsc and the whole test suite go on passing. This module
 * imports one thing, src/lib/openingHours.ts, which imports nothing at all, so
 * everything below bundles on either side of that line and the accordion can
 * hold its own rules without dragging the server in behind them.
 */

import {
  LAST_SITTING_BEFORE_CLOSE,
  dateAfter,
  formatTime,
  gapRule,
  slotsFor,
  timeToMinutes,
  weekdayIndex,
  type BookingRules,
  type Range,
  type ScheduledDay,
  type Week,
} from "@/lib/openingHours";

/**
 * Everything the flow knows about one date, from whichever of its two sources
 * spoke last.
 *
 * `closed` and `full` are two fields because they are two different answers and
 * two different things for a guest to do about it: a shut day sends them to
 * another day, a full one may send them to the telephone. And `full` is only
 * ever true of a party size — a Saturday with no room for six may have a table
 * for two — which is why the sentence that prints it has to name the party.
 */
export interface DayFacts {
  /** YYYY-MM-DD in the café's own timezone. */
  date: string;
  ranges: Range[];
  closed: boolean;
  /** No room left that day for the party the window was asked about. */
  full: boolean;
  /** Why this day differs, in the owners' own words, when they typed any. */
  note: string | null;
}

/**
 * The window answer, read as suspiciously as anything off the wire. A row with
 * no date is dropped rather than repaired: a day the flow knows nothing about
 * falls back to what the server-rendered schedule already said, which is a
 * poorer answer than the endpoint's and never a wrong one.
 */
export function readWindowDays(value: unknown): DayFacts[] {
  if (!Array.isArray(value)) return [];
  const days: DayFacts[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const day = row as Record<string, unknown>;
    if (typeof day.date !== "string") continue;
    const ranges: Range[] = [];
    if (Array.isArray(day.ranges)) {
      for (const entry of day.ranges) {
        const range = entry as Range | null;
        if (
          range &&
          typeof range.open === "number" &&
          typeof range.close === "number"
        ) {
          ranges.push({ open: range.open, close: range.close });
        }
      }
    }
    days.push({
      date: day.date,
      ranges,
      closed: day.closed === true,
      full: day.full === true,
      note: typeof day.note === "string" ? day.note : null,
    });
  }
  return days;
}

/**
 * The server-resolved schedule, in the same shape. It carries no seat count —
 * only the endpoint can see the other reservations — so every day starts out
 * with room in it, and the window answer is what takes that back.
 */
export function fromSchedule(days: ScheduledDay[]): DayFacts[] {
  return days.map((day) => ({
    date: day.date,
    ranges: day.ranges,
    closed: day.closed,
    full: false,
    note: day.note ?? null,
  }));
}

/**
 * The seven weekly rows, spread across the horizon.
 *
 * The fallback of last resort, and it exists for exactly one surface: the
 * booking sheet on phones mounts from a cached layout with no server render
 * behind it, so until its own request lands — and for ever, if that request
 * fails — the weekly pattern is all there is. It cannot see the repeating rules
 * or the afwijkende dagen, so it will offer a Sunday the café is shut and miss
 * the last Sunday of the month when it is open; the endpoint refuses the first
 * and the window answer restores the second the moment it arrives. A poorer
 * answer than the schedule's, never a wrong one, and far better than a sheet
 * that draws nothing at all.
 */
export function fromWeek(week: Week, horizon: Horizon): DayFacts[] {
  const days: DayFacts[] = [];
  if (!horizon.today || !horizon.last) return days;
  for (
    let iso = horizon.today;
    iso && iso <= horizon.last;
    iso = dateAfter(iso, 1)
  ) {
    const index = weekdayIndex(iso);
    const ranges = index === null ? [] : week[index];
    days.push({
      date: iso,
      ranges,
      closed: ranges.length === 0,
      full: false,
      note: null,
    });
  }
  return days;
}

/**
 * Two sources of truth about the same days, resolved the one way that can be
 * right: whatever the endpoint has answered wins, day by day, and everything it
 * has not been asked about keeps what the schedule said. The window is fetched
 * a fortnight at a time and then a month at a time as the calendar is paged, so
 * this is called with a partial answer far more often than with a complete one.
 */
export function mergeDays(base: DayFacts[], answered: DayFacts[]): DayFacts[] {
  if (answered.length === 0) return base;
  const merged = new Map(base.map((day) => [day.date, day]));
  for (const day of answered) merged.set(day.date, day);
  return [...merged.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** One day out of a window, by date. */
export function dayIn(days: DayFacts[], iso: string): DayFacts | null {
  return days.find((day) => day.date === iso) ?? null;
}

/**
 * The sittings one day really offers, with today measured against the clock and
 * every other day open from the door.
 */
export function timesFor(
  day: DayFacts | null,
  today: string,
  nowMinutes: number | undefined,
  rules: BookingRules,
): string[] {
  if (!day || day.closed) return [];
  const notBefore =
    day.date === today && typeof nowMinutes === "number"
      ? nowMinutes + rules.leadMinutes
      : -1;
  return slotsFor(day.ranges, notBefore, rules.slotMinutes, rules.lastSittingMinutes);
}

/** The window either end of which nothing may be offered. */
export interface Horizon {
  /** Today in Amsterdam, as the flow has reconciled it. */
  today: string;
  /** The last date the endpoint will accept, inclusive. */
  last: string;
}

/**
 * Every day a table can actually be had, in order.
 *
 * Shut days, days already given away to a party this size, days before today
 * and days past the horizon all fall out here, which is what makes the three
 * chips above the calendar true rather than optimistic.
 */
export function openDates(
  days: DayFacts[],
  horizon: Horizon,
  nowMinutes: number | undefined,
  rules: BookingRules,
): string[] {
  return days
    .filter(
      (day) =>
        day.date >= horizon.today &&
        day.date <= horizon.last &&
        !day.closed &&
        !day.full &&
        timesFor(day, horizon.today, nowMinutes, rules).length > 0,
    )
    .map((day) => day.date);
}

/**
 * The days offered without opening a calendar. Three of them, because three
 * full-width rows is the most that fits above the fold beside the party tiles
 * and because a fourth would be a list rather than a suggestion.
 *
 * The window fetch can only ever remove one of these and slide the next up; it
 * cannot add a day in front of one somebody has already pressed, because the
 * order is the calendar's and not the answer's.
 */
export function dateChips(
  days: DayFacts[],
  horizon: Horizon,
  nowMinutes: number | undefined,
  rules: BookingRules,
  count = 3,
): string[] {
  return openDates(days, horizon, nowMinutes, rules).slice(0, count);
}

/**
 * The first day after this one that can still take the party. It is what every
 * dead end in the flow offers as the way forward, so a guest who is told the
 * Saturday is full is told in the same breath which evening is not.
 */
export function nextOpenAfter(
  days: DayFacts[],
  after: string,
  horizon: Horizon,
  nowMinutes: number | undefined,
  rules: BookingRules,
): string | null {
  return (
    openDates(days, horizon, nowMinutes, rules).find((iso) => iso > after) ??
    null
  );
}

/**
 * How a day is named on its own chip.
 *
 * "Vanavond" is the whole reason the chips beat a calendar, and it is also the
 * one of these that can be a small lie: a café open from eleven has plenty of
 * days whose remaining sittings are lunch. So the evening word is used only
 * when the first sitting still on offer really is an evening one, and the plain
 * "Vandaag" carries the rest. Everything past tomorrow is called by its
 * weekday, which is how somebody deciding between two Saturdays thinks about
 * it.
 */
export type RelativeDay = "tonight" | "today" | "tomorrow" | "other";

/** From this hour on, a table is an evening out rather than lunch. */
const EVENING_FROM = 17 * 60;

export function relativeDay(
  iso: string,
  horizon: Horizon,
  times: string[],
): RelativeDay {
  if (iso !== horizon.today) {
    return iso === dayAfter(horizon.today) ? "tomorrow" : "other";
  }
  const first = times.length > 0 ? timeToMinutes(times[0]) : null;
  return first !== null && first >= EVENING_FROM ? "tonight" : "today";
}

/** Tomorrow, read at midday so no offset can shift it onto another date. */
function dayAfter(iso: string): string {
  const at = Date.parse(`${iso}T12:00:00.000Z`);
  return Number.isNaN(at)
    ? ""
    : new Date(at + 86_400_000).toISOString().slice(0, 10);
}

/**
 * What a change of party size does to an answer already given.
 *
 * The rule the owners agreed is that nothing is ever wiped in silence and no
 * stale time is ever left on screen. Those two pull in opposite directions —
 * the safe thing is to clear everything, the kind thing is to keep what still
 * holds — so the three outcomes are named here and the component only has to
 * obey them.
 *
 * It is asked twice per change, and deliberately. The window answer lands
 * first and knows whether the whole day still has room, which is `clear_both`;
 * the day answer lands a moment later and knows which sittings went, which is
 * `clear_time`. Asking the same function both times is what keeps those two
 * from becoming two rules that can disagree.
 *
 * ## Why the verdict is not enough
 *
 * It used to be three bare strings, and that made the accordion tell a lie out
 * loud. Six quite different things end in a cleared answer — the café is shut
 * that Tuesday, the day has filled up for this party, the last sitting of today
 * has gone by, the date is behind us, it is further ahead than the owners take
 * bookings, and the sitting itself was taken while the band was open — and a
 * component handed the word `clear_both` has no way to tell any of them apart.
 * So it said "zit vol voor 2 personen" about all of them, and a screen-reader
 * guest choosing a Tuesday the café is closed was told the place was full.
 *
 * The cause travels with the verdict for exactly that reason: the verdict is
 * what the flow *does* (which band re-opens), the cause is what it *says*, and
 * the two are different questions that were being answered by one word.
 */
export type Invalidation =
  | { verdict: "keep" }
  | {
      verdict: "clear_time";
      /**
       * `time_taken` is somebody else's booking landing on that half hour;
       * `time_outside_hours` is the half hour no longer being on the day's grid
       * at all, which happens when a CMS exception narrows a day under a guest
       * who had already chosen an evening on it. Both clear the sitting and
       * keep the day; they are not the same sentence.
       */
      cause: "time_taken" | "time_outside_hours";
    }
  | {
      verdict: "clear_both";
      cause:
        | "date_past"
        | "beyond_horizon"
        | "day_closed"
        | "day_full"
        | "day_over";
    };

const KEEP: Invalidation = { verdict: "keep" };

export function invalidationFor(
  chosen: { date: string; time: string },
  days: DayFacts[],
  horizon: Horizon,
  nowMinutes: number | undefined,
  rules: BookingRules,
  fullTimes: ReadonlySet<string> = new Set(),
): Invalidation {
  if (!chosen.date) return KEEP;
  // The two ends of the window, kept apart because they are opposite sentences:
  // one day is over and the other has not opened for booking yet.
  if (chosen.date < horizon.today) {
    return { verdict: "clear_both", cause: "date_past" };
  }
  if (chosen.date > horizon.last) {
    return { verdict: "clear_both", cause: "beyond_horizon" };
  }
  const day = dayIn(days, chosen.date);
  // A day nobody has answered about yet keeps whatever the guest chose. The
  // answer is moments away and clearing on the strength of not knowing is how
  // a booking loses its date every time the party size is nudged.
  if (!day) return KEEP;
  const times = timesFor(day, horizon.today, nowMinutes, rules);
  // Judged on the hours and not on `closed`, and for the same reason
  // `timeAnswer` below does it: /api/availability sends `closed` true for a day
  // that is open but has nothing left to book, so reading the flag here would
  // announce "we zijn dicht" about tonight the moment the window answer landed
  // and "we kunnen niets meer aannemen" about the same evening a second
  // earlier. The two functions have to reach the same verdict about one day or
  // the spoken line and the printed line contradict each other on screen.
  if (day.ranges.length === 0) {
    return { verdict: "clear_both", cause: "day_closed" };
  }
  if (day.full) return { verdict: "clear_both", cause: "day_full" };
  // An open day with nothing left on it is today after the last sitting has
  // gone by — a different thing from a full day, and answered differently: no
  // party size on earth reopens it, so the sentence must not name one.
  if (times.length === 0) return { verdict: "clear_both", cause: "day_over" };
  /**
   * And a day whose every remaining sitting has been taken is full, whatever
   * the window answer said about it.
   *
   * This test has to come before the ones about the chosen sitting, and it did
   * not, which is how the flow came to tell a guest to pick another time on a
   * day that had none. The window answer and the day answer see different
   * things: the window carries one `full` flag per day and is a fortnight
   * behind the last booking, while the day answer names every taken half hour
   * and is seconds old. When the second one says all of them are gone, that is
   * the more recent word and it means the same thing as `full`.
   */
  const free = times.filter((time) => !fullTimes.has(time));
  if (free.length === 0) return { verdict: "clear_both", cause: "day_full" };
  if (!chosen.time) return KEEP;
  if (!times.includes(chosen.time)) {
    return { verdict: "clear_time", cause: "time_outside_hours" };
  }
  if (fullTimes.has(chosen.time)) {
    return { verdict: "clear_time", cause: "time_taken" };
  }
  return KEEP;
}

/**
 * One service, and the times inside it.
 *
 * The heading is the service's own hours — "17:00 – 21:00" — rather than a
 * lunch/dinner taxonomy invented here, because the café has never had one and
 * a split Sunday would need a third word nobody has agreed on. It also does
 * the work the old hint paragraph under the list used to do: a guest can read
 * the opening hours off the heading of the group they are choosing from.
 */
export interface Sitting {
  /** The range's own opening minute, which is unique within a day. */
  key: string;
  heading: string;
  times: string[];
}

/**
 * The day's sittings, grouped into the services they belong to.
 *
 * Walked in range order rather than bucketed into a map, so a split service
 * with an afternoon gap in the middle keeps its two halves apart — that gap is
 * the single most useful thing on the screen for somebody choosing between
 * lunch and dinner, and joining them would throw it away.
 *
 * A time that belongs to no range at all cannot happen from `slotsFor`, but it
 * can from a stale list arriving beside fresh hours, so it is kept and shown
 * rather than silently dropped: the endpoint refuses what it must, and a
 * sitting that quietly disappears is a sitting the guest goes on looking for.
 *
 * Which is exactly why `lastSittingMinutes` has to be handed in rather than
 * read off the module constant, as it was until the gap became a setting. This
 * asks the same question `slotsFor` answered — does this time fall inside this
 * service — and if it asks it with a different number the answers diverge at
 * the end of the evening. Set the gap to nought and every sitting at closing
 * time fell outside every range here, dropped into `leftovers`, and came out
 * as a band with no opening hours in its heading: a strip of times under a
 * blank line, which is the one thing this grouping exists to prevent. The
 * default keeps the old answer for any caller with no rules to hand.
 *
 * And "the same number" has to mean the same number after sanitising, or the
 * agreement holds only for the values that need no sanitising. It went through
 * `gapRule` on the `slotsFor` side and raw on this one, which put the two back
 * in disagreement at exactly the values that sanitiser was written for: handed
 * a NaN — a prop that survived a bad serialisation, a stale window, a rules
 * object built by hand — `slotsFor` read it as the shipped hour and produced a
 * whole evening of times, while every comparison below went false, dropped all
 * thirteen of them into `leftovers` and printed them under an empty heading.
 * A gap of 1e9 parted the two the same way at the other end. So the judgement
 * is imported rather than repeated, which is the entire point of its being a
 * function and not two clamps.
 */
export function sittings(
  ranges: Range[],
  times: string[],
  lastSittingMinutes: number = LAST_SITTING_BEFORE_CLOSE,
): Sitting[] {
  if (times.length === 0) return [];
  const gap = gapRule(lastSittingMinutes);
  const groups: Sitting[] = ranges.map((range) => ({
    key: String(range.open),
    heading: `${formatTime(range.open)} – ${formatTime(range.close)}`,
    times: [],
  }));
  const leftovers: string[] = [];
  for (const time of times) {
    const minutes = timeToMinutes(time);
    const index =
      minutes === null
        ? -1
        : ranges.findIndex(
            (range) => minutes >= range.open && minutes <= range.close - gap,
          );
    if (index === -1) leftovers.push(time);
    else groups[index].times.push(time);
  }
  const answered = groups.filter((group) => group.times.length > 0);
  if (leftovers.length > 0) {
    if (answered.length > 0) answered[answered.length - 1].times.push(...leftovers);
    else answered.push({ key: "rest", heading: "", times: leftovers });
  }
  return answered;
}

/**
 * The six honest answers, as data.
 *
 * Every one of them is a different sentence with a different way forward, and
 * for a long time four of them were the same greyed-out silence. `times` is
 * the ordinary answer and carries the full sittings alongside the free ones,
 * because "vol om 19:00" is the fifth answer rather than a fifth state: the
 * guest is looking at an evening that has room, and one line names the two
 * half-hours that do not.
 *
 * `day_over` is the sixth and the newest, and it is here because the fourth
 * was telling a lie. A day with nothing left to book used to be answered with
 * `day_closed`, which prints "zaterdag 5 september zijn we dicht." — and that
 * sentence is simply untrue of two days the café is open and serving. One is
 * this evening after the last sitting has gone by, which happens on every
 * ordinary Saturday somewhere around eight o'clock: the doors are open, the
 * kitchen is on, and the site announces that they are shut. The other is a gap
 * before closing set wider than a day's whole opening — 600 minutes on a
 * 17:00–21:00 evening — where the owners have chosen to take no online
 * bookings that day at all. `invalidationFor` below has kept `day_over` apart
 * from `day_closed` since it was written, for exactly this reason; this is the
 * same distinction reaching the sentence a guest actually reads.
 *
 * The two are told apart by the day's own hours rather than by its `closed`
 * flag, and that is not a stylistic choice. /api/availability answers `closed:
 * day.closed || times.length === 0`, deliberately, because a date picker needs
 * one field for "do not offer this square"; so the moment the window answer
 * lands, a café-is-open-but-nothing-left day arrives here with `closed` true
 * and its ranges intact. Read the flag and the sentence would flip from honest
 * to dishonest under the guest as the fetch resolved. Ranges are the schedule's
 * own and say the one thing that cannot change with the seat count: whether the
 * doors open at all that day.
 */
export type DateAnswer =
  | { kind: "chips"; dates: string[] }
  /** Not one day in the whole horizon can take this party. */
  | { kind: "no_days" };

export type TimeAnswer =
  | { kind: "times"; sittings: Sitting[]; full: string[] }
  /** The doors do not open at all that day. */
  | { kind: "day_closed"; note: string | null; next: string | null }
  /**
   * They do, and there is nothing left to book: tonight's last sitting has
   * gone by, or the gap before closing has swallowed the whole day. The note
   * travels with it as well — an afwijkende dag saying "Live muziek vanaf
   * 20:00" is very often why the guest pressed that square, and it is still
   * true of an evening they can no longer book a table for.
   */
  | { kind: "day_over"; note: string | null; next: string | null }
  | { kind: "day_full"; next: string | null }
  | { kind: "beyond_horizon" };

/**
 * Which sentence a day with nothing to offer gets, as a dictionary key.
 *
 * A one-line branch, lifted out of the component for one reason: inside the
 * JSX no test could reach it. `timeAnswer` above is careful to keep
 * `day_closed` and `day_over` apart — a café that is shut and a café that is
 * open with its last sitting gone are different facts, and only one of them is
 * answered by staying at home — and the library half of that is well defended.
 * The last hop, from the kind to the words a guest actually reads, was not:
 * swapping the branch so an open evening printed "we zijn dicht" again left
 * every one of the eleven hundred tests passing. That is precisely the untruth
 * the distinction was introduced to remove, and it could have come back
 * silently at any time.
 *
 * There is no render-test harness in this suite — vitest runs in node and no
 * test mounts a component — so rather than build one for a ternary, the
 * decision is a function and the component does as it is told. The same trade
 * `passStage` in @/lib/guestPassStage makes, for the same reason.
 *
 * Returning the key rather than the sentence keeps this out of the
 * dictionaries: a test can assert the choice without asserting the wording,
 * and the wording stays where every other guest-facing string lives.
 */
export function emptyDayLine(
  kind: TimeAnswer["kind"],
): "dayClosedOn" | "dayOverOn" {
  return kind === "day_closed" ? "dayClosedOn" : "dayOverOn";
}

export function dateAnswer(
  days: DayFacts[],
  horizon: Horizon,
  nowMinutes: number | undefined,
  rules: BookingRules,
  count = 3,
): DateAnswer {
  const dates = dateChips(days, horizon, nowMinutes, rules, count);
  return dates.length > 0 ? { kind: "chips", dates } : { kind: "no_days" };
}

export function timeAnswer(
  date: string,
  days: DayFacts[],
  horizon: Horizon,
  nowMinutes: number | undefined,
  rules: BookingRules,
  fullTimes: ReadonlySet<string> = new Set(),
): TimeAnswer {
  if (date < horizon.today || date > horizon.last) {
    return { kind: "beyond_horizon" };
  }
  const day = dayIn(days, date);
  const times = timesFor(day, horizon.today, nowMinutes, rules);
  const next = nextOpenAfter(days, date, horizon, nowMinutes, rules);
  const note = day?.note ?? null;
  // A day nobody has any hours for is shut; a day with hours and no sittings
  // left is open and past taking bookings. See the note on `TimeAnswer` for
  // why the question is asked of the ranges and not of `closed`.
  if (!day || day.ranges.length === 0) {
    return { kind: "day_closed", note, next };
  }
  if (times.length === 0) return { kind: "day_over", note, next };
  const free = times.filter((time) => !fullTimes.has(time));
  if (day.full || free.length === 0) return { kind: "day_full", next };
  return {
    kind: "times",
    sittings: sittings(day.ranges, free, rules.lastSittingMinutes),
    full: times.filter((time) => fullTimes.has(time)),
  };
}

/**
 * "Zaterdag 29 augustus", written from the dictionary rather than through Intl:
 * the server and the browser must produce the same string to the character, and
 * two ICU builds need not agree. The year is added only when the date is not in
 * the current one, where leaving it off is a genuine ambiguity rather than
 * noise.
 *
 * Lifted out of the form unchanged, because the details screen and the server
 * that renders it now print the same line and three copies of this is three
 * ways for a docket to disagree with the chip that produced it.
 */
export function formatDayLabel(
  iso: string,
  weekdays: readonly string[],
  months: readonly string[],
  today: string,
): string {
  const at = Date.parse(`${iso}T12:00:00.000Z`);
  if (Number.isNaN(at)) return "";
  const d = new Date(at);
  const weekday = weekdays[(d.getUTCDay() + 6) % 7];
  const month = months[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  const thisYear = today ? Number(today.slice(0, 4)) : year;
  return `${weekday} ${d.getUTCDate()} ${month}${
    year === thisYear ? "" : ` ${year}`
  }`;
}
