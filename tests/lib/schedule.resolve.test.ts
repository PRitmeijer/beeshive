import { describe, expect, it, vi } from "vitest";
import { parseRanges, type Week } from "@/lib/openingHours";
import {
  matchesRecurring,
  resolveDay,
  resolveRange,
  type ScheduleInput,
} from "@/lib/schedule";
import { LEAP_DAY } from "../support/time";

/**
 * The three-layer resolution: an exception beats a repeating rule beats the
 * plain week.
 *
 * The mock below is here for one reason and it is not this file's subject.
 * src/lib/schedule.ts imports `getPayloadClient` from src/lib/payload.ts, and
 * that module's own first lines import @payload-config — so simply importing
 * the resolver would build the Postgres adapter, the S3 plugin and the mail
 * transport before the first assertion ran. A `vi.mock` FACTORY replaces the
 * module by its specifier before anything that imports it is evaluated, which
 * is precisely what is wanted. `importActual` would defeat the whole exercise:
 * it evaluates the real module, and the real module is the thing being avoided.
 *
 * Nothing in this file calls anything that would reach the fake. The resolver
 * itself — matchesRecurring, resolveDay, resolveRange — touches no database at
 * all, which is why it can be tested this cheaply.
 */
vi.mock("@/lib/payload", () => ({
  getPayloadClient: async () => {
    throw new Error("no test in this file may reach the database");
  },
  getSiteSettings: async () => {
    throw new Error("no test in this file may reach the CMS");
  },
}));

const OPEN = "11:00 – 21:00";
const openWeek = (...days: (string | null)[]): Week =>
  Array.from({ length: 7 }, (_, i) => parseRanges(days[i] ?? null));

/** The stock week: Mon, Thu, Fri, Sat open; Tue, Wed, Sun shut. */
const STOCK: Week = openWeek(OPEN, null, null, OPEN, OPEN, OPEN, null);

const input = (overrides: Partial<ScheduleInput> = {}): ScheduleInput => ({
  week: STOCK,
  recurring: [],
  exceptions: [],
  ...overrides,
});

describe("matchesRecurring: the last weekday of the month", () => {
  /**
   * The awkward one, and the reason it is counted from the end rather than the
   * start. There is no fifth Sunday in most months and there is in some, so
   * "the last Sunday" is sometimes the fourth and sometimes the fifth — which
   * means counting forwards cannot express it at all. This is the last Sunday
   * precisely when adding a week lands in the following month.
   *
   * The dates below are real 2026 Sundays, computed rather than remembered.
   */
  const lastSunday = { ordinal: "last", weekday: "sunday" };

  it.each([
    ["2026-01-25", "the 4th Sunday of January"],
    ["2026-02-22", "the 4th Sunday of February, with six days of month left after it"],
    ["2026-03-29", "the 5th Sunday of March, and the night the clocks go forward"],
    ["2026-05-31", "the 5th Sunday of May"],
    ["2026-08-30", "the 5th Sunday of August"],
    ["2026-11-29", "the 5th Sunday of November"],
    ["2026-12-27", "the 4th Sunday of December — adding a week lands in 2027"],
  ])("matches %s (%s)", (date) => {
    expect(matchesRecurring(date, lastSunday)).toBe(true);
  });

  it.each([
    ["2026-03-22", "the 4th Sunday of a five-Sunday March"],
    ["2026-05-24", "the 4th Sunday of a five-Sunday May"],
    ["2026-03-28", "the Saturday before it"],
  ])("does not match %s (%s)", (date) => {
    expect(matchesRecurring(date, lastSunday)).toBe(false);
  });

  it("matches the leap day when it is the last Tuesday of February", () => {
    expect(matchesRecurring(LEAP_DAY, { ordinal: "last", weekday: "tuesday" })).toBe(
      true,
    );
  });
});

describe("matchesRecurring: fourth is not the same question as last", () => {
  /**
   * Three assertions that together prove the ordinal is not merely being
   * counted forwards from the first of the month. March 2026 has five Sundays,
   * so the fourth and the last are different days; February 2026 has four, so
   * they are the same day.
   */
  const fourth = { ordinal: "fourth", weekday: "sunday" };
  const last = { ordinal: "last", weekday: "sunday" };

  it("pulls the two apart in a five-Sunday month", () => {
    expect(matchesRecurring("2026-03-22", fourth)).toBe(true);
    expect(matchesRecurring("2026-03-29", fourth)).toBe(false);
    expect(matchesRecurring("2026-03-22", last)).toBe(false);
    expect(matchesRecurring("2026-03-29", last)).toBe(true);
  });

  it("puts the two together in a four-Sunday month", () => {
    expect(matchesRecurring("2026-02-22", fourth)).toBe(true);
    expect(matchesRecurring("2026-02-22", last)).toBe(true);
  });
});

describe("matchesRecurring: the numbered ordinals count forwards", () => {
  // The 1st to the 7th of a month can only ever hold the first Sunday, the 8th
  // to the 14th only the second, and so on — arithmetic that is honest because
  // it does not depend on how long the month is.
  it.each([
    ["first", "2026-03-01", true],
    ["first", "2026-03-08", false],
    ["second", "2026-03-08", true],
    ["second", "2026-03-15", false],
    ["third", "2026-03-15", true],
    ["fourth", "2026-03-22", true],
  ])("%s Sunday: %s is %s", (ordinal, date, expected) => {
    expect(matchesRecurring(date, { ordinal, weekday: "sunday" })).toBe(expected);
  });

  it("gives a fifth Sunday no numbered ordinal at all", () => {
    for (const ordinal of ["first", "second", "third", "fourth"]) {
      expect(matchesRecurring("2026-03-29", { ordinal, weekday: "sunday" })).toBe(false);
    }
  });
});

describe("matchesRecurring: what it refuses", () => {
  it("refuses no rule at all", () => {
    expect(matchesRecurring("2026-03-29", null)).toBe(false);
    expect(matchesRecurring("2026-03-29", undefined)).toBe(false);
  });

  it("refuses a weekday written in Dutch", () => {
    // The WEEKDAYS list is English, so the CMS select values must be too. A
    // translated option value would silently disable every repeating rule the
    // owners had ever set, and nothing would say so.
    expect(matchesRecurring("2026-03-29", { ordinal: "last", weekday: "zondag" })).toBe(
      false,
    );
  });

  it("forgives whitespace and capitals, because a select value can carry both", () => {
    expect(
      matchesRecurring("2026-03-29", { ordinal: "  LAST ", weekday: "  Sunday  " }),
    ).toBe(true);
  });

  it.each(["fifth", "", "laatste", "1"])("refuses the ordinal %o", (ordinal) => {
    expect(matchesRecurring("2026-03-29", { ordinal, weekday: "sunday" })).toBe(false);
  });

  it("refuses a valid ordinal on the wrong weekday", () => {
    expect(matchesRecurring("2026-03-29", { ordinal: "last", weekday: "monday" })).toBe(
      false,
    );
  });

  it.each(["29-03-2026", "2026-3-29", "", "2026-13-01"])(
    "refuses the date %o",
    (date) => {
      expect(matchesRecurring(date, { ordinal: "last", weekday: "sunday" })).toBe(false);
    },
  );
});

describe("resolveDay: precedence, one rung at a time", () => {
  // 2026-03-29 is a Sunday, which the stock week has shut.
  const sunday = "2026-03-29";
  // 2026-09-19 is a Saturday, which the stock week has open.
  const saturday = "2026-09-19";

  it("serves the plain week when nothing else speaks", () => {
    const day = resolveDay(saturday, input());
    expect(day.source).toBe("week");
    expect(day.closed).toBe(false);
    expect(day.ranges).toEqual(parseRanges(OPEN));
    expect(day.note).toBeNull();
  });

  it("lets a repeating rule open a day the week has shut", () => {
    const day = resolveDay(
      sunday,
      input({
        recurring: [
          {
            ordinal: "last",
            weekday: "sunday",
            hours: "12:00 - 20:00",
            note: "Extra open",
          },
        ],
      }),
    );
    expect(day.source).toBe("recurring");
    expect(day.closed).toBe(false);
    expect(day.ranges).toEqual([{ open: 720, close: 1200 }]);
    expect(day.note).toBe("Extra open");
    expect(day.text).toBe("12:00 - 20:00");
  });

  it("lets an exception beat a repeating rule, hours and all", () => {
    const day = resolveDay(
      sunday,
      input({
        recurring: [{ ordinal: "last", weekday: "sunday", hours: "12:00 - 20:00" }],
        exceptions: [{ date: sunday, hours: "16:00 - 22:00", note: "Privéfeest tot 16u" }],
      }),
    );
    expect(day.source).toBe("exception");
    expect(day.ranges).toEqual([{ open: 960, close: 1320 }]);
    expect(day.note).toBe("Privéfeest tot 16u");
  });

  it("lets an exception shut a day the week and a rule both opened", () => {
    const day = resolveDay(
      saturday,
      input({
        recurring: [{ ordinal: "third", weekday: "saturday", hours: "12:00 - 23:00" }],
        exceptions: [{ date: saturday, closed: true, note: "Bruiloft" }],
      }),
    );
    expect(day.source).toBe("exception");
    expect(day.closed).toBe(true);
    expect(day.ranges).toEqual([]);
    expect(day.text).toBeNull();
    expect(day.note).toBe("Bruiloft");
  });
});

describe("resolveDay: what a repeating rule does", () => {
  const sunday = "2026-03-29";
  const saturday = "2026-09-19";

  it("shuts a day and keeps the reason", () => {
    const day = resolveDay(
      saturday,
      input({
        recurring: [
          { ordinal: "third", weekday: "saturday", closed: true, note: "Elke derde zaterdag dicht" },
        ],
      }),
    );
    expect(day.closed).toBe(true);
    expect(day.ranges).toEqual([]);
    expect(day.text).toBeNull();
    expect(day.note).toBe("Elke derde zaterdag dicht");
  });

  it("repeats the week's own hours when a rule says open without saying when", () => {
    const day = resolveDay(
      saturday,
      input({
        recurring: [{ ordinal: "third", weekday: "saturday", note: "Live muziek" }],
      }),
    );
    expect(day.source).toBe("recurring");
    expect(day.ranges).toEqual(parseRanges(OPEN));
    expect(day.note).toBe("Live muziek");
  });

  it("drops a rule that says open without saying when over a day the week has shut", () => {
    // A note reading "we zijn open" over a day with no times on it is a
    // promise the site cannot keep, so the week's answer stands and the note
    // goes with the rule.
    const day = resolveDay(
      sunday,
      input({ recurring: [{ ordinal: "last", weekday: "sunday", note: "We zijn open" }] }),
    );
    expect(day.source).toBe("week");
    expect(day.closed).toBe(true);
    expect(day.note).toBeNull();
  });

  it("lets the first matching rule win", () => {
    const day = resolveDay(
      sunday,
      input({
        recurring: [
          { ordinal: "last", weekday: "sunday", hours: "12:00 - 20:00", note: "eerste" },
          { ordinal: "last", weekday: "sunday", hours: "14:00 - 18:00", note: "tweede" },
        ],
      }),
    );
    expect(day.note).toBe("eerste");
    expect(day.ranges).toEqual([{ open: 720, close: 1200 }]);
  });
});

describe("resolveDay: what an exception does", () => {
  const saturday = "2026-09-19";

  it("still counts when the owners chose not to show it, but says nothing", () => {
    // The one most likely to be broken by a refactor: "Tonen op de site" off
    // withholds the wording, never the hours — the booking form has to know
    // the day is shut whether or not the site names it.
    const day = resolveDay(
      saturday,
      input({
        exceptions: [
          { date: saturday, closed: true, note: "Privéfeest", showOnSite: false },
        ],
      }),
    );
    expect(day.closed).toBe(true);
    expect(day.source).toBe("exception");
    expect(day.note).toBeNull();
  });

  it.each([true, undefined])("shows the note when showOnSite is %o", (showOnSite) => {
    const day = resolveDay(
      saturday,
      input({ exceptions: [{ date: saturday, closed: true, note: "Privéfeest", showOnSite }] }),
    );
    expect(day.note).toBe("Privéfeest");
  });

  it("overrides the hours even with the note withheld", () => {
    const day = resolveDay(
      saturday,
      input({
        exceptions: [
          { date: saturday, hours: "16:00 - 22:00", note: "stil", showOnSite: false },
        ],
      }),
    );
    expect(day.ranges).toEqual([{ open: 960, close: 1320 }]);
    expect(day.note).toBeNull();
  });

  it("matches a date stored as a full ISO timestamp by its first ten characters", () => {
    const day = resolveDay(
      "2026-12-25",
      input({ exceptions: [{ date: "2026-12-25T12:00:00.000Z", closed: true, note: "Kerst" }] }),
    );
    expect(day.closed).toBe(true);
    expect(day.note).toBe("Kerst");
  });

  it.each([null, undefined, "", "niet een datum"])("ignores a row dated %o", (date) => {
    const day = resolveDay(
      saturday,
      input({ exceptions: [{ date: date as string, closed: true, note: "x" }] }),
    );
    expect(day.source).toBe("week");
    expect(day.closed).toBe(false);
  });

  it("lets the first of two rows on one date win", () => {
    const day = resolveDay(
      saturday,
      input({
        exceptions: [
          { date: saturday, hours: "16:00 - 22:00", note: "eerste" },
          { date: saturday, closed: true, note: "tweede" },
        ],
      }),
    );
    expect(day.note).toBe("eerste");
    expect(day.closed).toBe(false);
  });

  it("FINDING: a note-only row leaves the source at week, which /api/reserve keys off", () => {
    // A row that is neither closed nor carries parseable hours exists only to
    // put a line on the site — "Live muziek vanaf 20:00". The note comes
    // through, but `source` stays where it was, and /api/reserve decides
    // whether to enforce its hours at all with `day.source === "week"`. So an
    // empty CMS week plus a note-only exception is still an unenforced day,
    // which is not what the comment in that route describes. Pinned as it
    // behaves; reported as a finding rather than changed here.
    const day = resolveDay(
      saturday,
      input({ exceptions: [{ date: saturday, note: "Live muziek vanaf 20:00" }] }),
    );
    expect(day.note).toBe("Live muziek vanaf 20:00");
    expect(day.source).toBe("week");
  });
});

describe("resolveDay: the plain week", () => {
  it("carries the line as it was typed, so a day with no readable range still says something", () => {
    // "vanaf 17:00" yields no bookable range, so the day is shut for booking —
    // but /api/availability prints the line instead of silence.
    const day = resolveDay(
      "2026-09-15",
      input({
        week: openWeek(OPEN, "vanaf 17:00"),
        weekHours: [OPEN, "vanaf 17:00"],
      }),
    );
    expect(day.closed).toBe(true);
    expect(day.ranges).toEqual([]);
    expect(day.text).toBe("vanaf 17:00");
  });

  it("answers a date that is not a date with a shut day and no text", () => {
    const day = resolveDay("2026-13-01", input({ weekHours: [OPEN] }));
    expect(day.ranges).toEqual([]);
    expect(day.closed).toBe(true);
    expect(day.text).toBeNull();
  });
});

describe("resolveRange", () => {
  it("includes both ends", () => {
    const days = resolveRange("2026-09-12", "2026-09-14", input());
    expect(days.map((day) => day.date)).toEqual([
      "2026-09-12",
      "2026-09-13",
      "2026-09-14",
    ]);
  });

  it("answers a single day for a window of one", () => {
    expect(resolveRange("2026-09-12", "2026-09-12", input())).toHaveLength(1);
  });

  it.each([
    ["2026-09-14", "2026-09-12", "the ends the wrong way round"],
    ["12-09-2026", "2026-09-14", "a malformed start"],
    ["2026-09-12", "2026-9-14", "a malformed end"],
  ])("answers nothing for %s to %s (%s)", (from, to) => {
    expect(resolveRange(from, to, input())).toEqual([]);
  });

  it("caps an absurd window at four hundred days rather than answering it", () => {
    // Anything longer than this is a mistake, not a question.
    expect(resolveRange("2026-01-01", "2027-12-31", input())).toHaveLength(400);
  });

  it.each([
    ["2026-03-25", "2026-04-02", "the spring-forward night"],
    ["2026-10-22", "2026-10-29", "the autumn night"],
    ["2028-02-25", "2028-03-03", "the leap day"],
  ])("walks %s to %s with no gaps or repeats (%s)", (from, to) => {
    const dates = resolveRange(from, to, input()).map((day) => day.date);
    expect(new Set(dates).size).toBe(dates.length);
    for (let i = 1; i < dates.length; i += 1) {
      const previous = new Date(`${dates[i - 1]}T12:00:00.000Z`).getTime();
      expect(new Date(`${dates[i]}T12:00:00.000Z`).getTime() - previous).toBe(86_400_000);
    }
    expect(dates.at(-1)).toBe(to);
  });
});
