import { defaultLocale, type Locale } from "@/i18n/config";
import {
  getPayloadClient,
  getSiteSettings,
  type RecurringOpening,
  type SiteSettingsData,
} from "@/lib/payload";
import {
  parseRanges,
  parseWeek,
  weekdayIndex,
  type ScheduledDay,
  type Week,
} from "./openingHours";

/**
 * What the doors do on one particular date.
 *
 * The week in Site Instellingen is seven lines of free text, and seven lines
 * cannot say the two things the owners keep needing to say: "elke laatste
 * zondag van de maand zijn we open", and "op Eerste Kerstdag niet". Both used
 * to live in the note underneath the table, where the site could read them as
 * well as a passing dog could — the homepage still said "Vandaag gesloten" on
 * the Sunday they were standing behind the bar, and the booking form still
 * refused the date.
 *
 * So the question moved here, and everything that needs an answer — the
 * "Vandaag ..." line, the contact page, the date picker, /api/reserve — asks
 * this module instead of parsing the CMS rows for itself. There is one order
 * of precedence and it is the one a human would use:
 *
 *   a one-off exception  beats  a repeating rule  beats  the normal week.
 *
 * The exception wins because it was typed about this date and nothing else.
 * The repeating rule wins over the week because that is what "elke laatste
 * zondag" means. Nothing here invents an opening time it was not given: a rule
 * or an exception with no hours in it does not turn a shut day into an open
 * one, since the alternative is a website promising a table at times nobody
 * agreed to.
 *
 * All the date arithmetic happens at midday UTC, exactly as the rest of the
 * codebase does it (the exception rows are stored that way too). Midday is far
 * enough from either edge of the day that no timezone offset and no daylight
 * saving jump can push a date onto its neighbour.
 */

/** One resolved day, plus where the answer came from. */
export interface DaySchedule extends ScheduledDay {
  /** Which layer had the last word. Mostly of interest while debugging. */
  source: "week" | "recurring" | "exception";
}

/** An exception row as it comes out of the CMS, narrowed to what is read. */
export interface ExceptionRow {
  date: string;
  closed?: boolean | null;
  hours?: string | null;
  note?: string | null;
  showOnSite?: boolean | null;
}

export interface ScheduleInput {
  week: Week;
  recurring: RecurringOpening[];
  exceptions: ExceptionRow[];
  /**
   * The weekly rows as they were typed, Monday first. Only carried so a day
   * can report the line it came from: an owner who writes "vanaf 17:00" gets
   * that back on the site instead of silence, even though no bookable range
   * can be read out of it.
   */
  weekHours?: (string | null | undefined)[];
}

const WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const ORDINALS: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
};

/** Anything longer than this is a mistake, not a question. */
const MAX_RANGE_DAYS = 400;

const DAY_MS = 86_400_000;

const isIso = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

/** Midday UTC for a YYYY-MM-DD string, or null if it is not one. */
function midday(isoDate: string): Date | null {
  if (!isIso(isoDate)) return null;
  const d = new Date(`${isoDate}T12:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Whether one repeating rule speaks about this date.
 *
 * "The last Sunday of the month" is the awkward one. There is no fifth Sunday
 * in most months and there is in some, so the last Sunday is the fourth or the
 * fifth depending on where the month's days happen to fall — which means it
 * cannot be counted from the start of the month at all. It is counted from the
 * end instead: this is the last Sunday precisely when adding a week lands in
 * the following month. The numbered ordinals do count forwards, where the
 * arithmetic is honest: the 1st to the 7th of a month can only ever hold the
 * first Sunday, the 8th to the 14th only the second, and so on.
 */
export function matchesRecurring(
  isoDate: string,
  rule: RecurringOpening | null | undefined,
): boolean {
  if (!rule) return false;
  const wanted = WEEKDAYS.indexOf(String(rule.weekday || "").trim().toLowerCase());
  if (wanted === -1) return false;

  const day = midday(isoDate);
  if (!day) return false;
  // Monday-first, like every other weekday index in this codebase.
  if ((day.getUTCDay() + 6) % 7 !== wanted) return false;

  const ordinal = String(rule.ordinal || "").trim().toLowerCase();
  if (ordinal === "last") {
    return new Date(day.getTime() + 7 * DAY_MS).getUTCMonth() !== day.getUTCMonth();
  }
  const nth = ORDINALS[ordinal];
  return nth ? Math.floor((day.getUTCDate() - 1) / 7) + 1 === nth : false;
}

/** The plain weekly answer, before any rule or exception gets a say. */
function fromWeek(isoDate: string, input: ScheduleInput): DaySchedule {
  const index = weekdayIndex(isoDate);
  const ranges = index === null ? [] : input.week?.[index] ?? [];
  return {
    date: isoDate,
    ranges,
    closed: ranges.length === 0,
    source: "week",
    note: null,
    text: index === null ? null : input.weekHours?.[index] ?? null,
  };
}

/** The first matching rule wins: the one the owners typed first reads first. */
function applyRecurring(day: DaySchedule, input: ScheduleInput): DaySchedule {
  const rule = (input.recurring || []).find((r) => matchesRecurring(day.date, r));
  if (!rule) return day;

  const note = rule.note ?? null;
  if (rule.closed) {
    return { ...day, ranges: [], closed: true, source: "recurring", note, text: null };
  }

  const ranges = parseRanges(rule.hours);
  if (ranges.length > 0) {
    return {
      ...day,
      ranges,
      closed: false,
      source: "recurring",
      note,
      text: rule.hours ?? null,
    };
  }

  // A rule that says "open" without saying when. If the week already opens on
  // this weekday it simply repeats it, and the note is worth carrying. If it
  // does not, the rule stays unanswered: a note reading "we zijn open" over a
  // day with no times is a promise the site cannot keep, so the week's own
  // answer stands and the note is dropped with it.
  if (day.ranges.length > 0) {
    return { ...day, source: "recurring", note };
  }
  return day;
}

/** One row about one date, so it overrules whatever came before it. */
function applyException(day: DaySchedule, input: ScheduleInput): DaySchedule {
  const row = (input.exceptions || []).find(
    (e) => String(e?.date ?? "").slice(0, 10) === day.date,
  );
  if (!row) return day;

  // "Tonen op de site" off means the day still counts — for the booking form
  // above all — but is not named. Only the note is held back, never the hours.
  const note = row.showOnSite === false ? null : row.note ?? null;

  if (row.closed) {
    return { ...day, ranges: [], closed: true, source: "exception", note, text: null };
  }

  const ranges = parseRanges(row.hours);
  if (ranges.length > 0) {
    return {
      ...day,
      ranges,
      closed: false,
      source: "exception",
      note,
      text: row.hours ?? null,
    };
  }

  // Neither shut nor re-timed: a row that exists only to put a line on the
  // site next to an otherwise ordinary day ("Live muziek vanaf 20:00").
  return { ...day, note: note ?? day.note };
}

export function resolveDay(isoDate: string, input: ScheduleInput): DaySchedule {
  return applyException(applyRecurring(fromWeek(isoDate, input), input), input);
}

/** Every day from `fromIso` to `toIso`, both ends included. */
export function resolveRange(
  fromIso: string,
  toIso: string,
  input: ScheduleInput,
): DaySchedule[] {
  const start = midday(fromIso);
  const end = midday(toIso);
  if (!start || !end || end.getTime() < start.getTime()) return [];

  const days: DaySchedule[] = [];
  for (let i = 0; i < MAX_RANGE_DAYS; i++) {
    // Whole days added to midday UTC stay at midday UTC, so the walk cannot
    // drift over a daylight saving boundary.
    const at = new Date(start.getTime() + i * DAY_MS);
    if (at.getTime() > end.getTime()) break;
    days.push(resolveDay(at.toISOString().slice(0, 10), input));
  }
  return days;
}

/**
 * The exception rows touching a window, in one query.
 *
 * One `find` for the whole window rather than one per day: a date picker asks
 * about ninety days at a time, and ninety round trips to answer "no exceptions
 * this quarter" would be a page that loads by the second.
 *
 * A failure here is not allowed to take the page down with it. An unreachable
 * collection means the normal week is served, which is wrong on Christmas Day
 * but right on the other three hundred and sixty four.
 */
export async function loadExceptions(
  fromIso: string,
  toIso: string,
  locale: Locale = defaultLocale,
): Promise<ExceptionRow[]> {
  if (!isIso(fromIso) || !isIso(toIso)) return [];
  try {
    const payload = await getPayloadClient();
    const res = await payload.find({
      collection: "opening-exceptions",
      locale,
      where: {
        // The rows sit at midday UTC; widening to the whole day either side
        // keeps a row that was written before that convention existed.
        and: [
          { date: { greater_than_equal: `${fromIso}T00:00:00.000Z` } },
          { date: { less_than_equal: `${toIso}T23:59:59.999Z` } },
        ],
      },
      depth: 0,
      pagination: false,
      limit: MAX_RANGE_DAYS,
    });
    return (res.docs as ExceptionRow[]) || [];
  } catch (error) {
    console.error("opening exceptions unavailable, serving the week", error);
    return [];
  }
}

/**
 * Everything needed to answer for a window: the settings, the rules, the rows.
 *
 * `settings` is there for the pages that have already asked the CMS for them —
 * the homepage renders half of itself out of the same object — so resolving
 * the hours does not cost a second read of the global.
 */
export async function loadSchedule(
  fromIso: string,
  toIso: string,
  locale: Locale = defaultLocale,
  settings?: SiteSettingsData,
): Promise<{ input: ScheduleInput; days: DaySchedule[] }> {
  const s = settings ?? (await getSiteSettings(locale));
  const rows = (s.openingHours || []) as { day: string; hours: string }[];
  const input: ScheduleInput = {
    week: parseWeek(rows),
    weekHours: rows.slice(0, 7).map((r) => r?.hours ?? null),
    recurring: (s.recurringOpenings || []) as RecurringOpening[],
    exceptions: await loadExceptions(fromIso, toIso, locale),
  };
  return { input, days: resolveRange(fromIso, toIso, input) };
}
