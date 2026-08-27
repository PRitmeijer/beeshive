import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HORIZON_DAYS,
  MAX_HORIZON_DAYS,
  availableDates,
  availableDatesFromSchedule,
  dayFromSchedule,
  nowMinutesInAmsterdam,
  parseRanges,
  todayInAmsterdam,
  weekdayIndex,
  type ScheduledDay,
  type Week,
} from "@/lib/openingHours";
import { ABSURD_TIMEZONES, freezeAt, underProcessTz } from "../support/time";

/**
 * Dates, and the café's own clock.
 *
 * The suite runs under TZ=UTC (see vitest.config.ts) and the owners' laptop is
 * in Europe/Amsterdam. Everything in this module asks Intl for Amsterdam
 * explicitly, so the two must give identical answers — and the only way to
 * assert that is to change the process timezone and look, which the last block
 * of the clock section does.
 */

afterEach(() => {
  vi.useRealTimers();
});

const OPEN_ALL_WEEK: Week = Array.from({ length: 7 }, () => parseRanges("11:00 – 21:00"));
const SHUT_ALL_WEEK: Week = [[], [], [], [], [], [], []];
const SATURDAYS_ONLY: Week = [[], [], [], [], [], parseRanges("11:00 – 21:00"), []];

describe("weekdayIndex", () => {
  it.each([
    ["2026-09-14", 0, "a Monday"],
    ["2026-09-19", 5, "a Saturday"],
    ["2026-09-20", 6, "a Sunday"],
  ])("reads %s as %i (%s), Monday first", (date, index) => {
    expect(weekdayIndex(date)).toBe(index);
  });

  it.each(["14-09-2026", "2026-9-14", "", "not a date", "2026-13-01"])(
    "refuses %o",
    (date) => {
      expect(weekdayIndex(date)).toBeNull();
    },
  );

  it("TRAP: rolls a date that does not exist over into the next month", () => {
    // 31 February becomes 3 March, a Tuesday, and this reports Tuesday rather
    // than null. Nothing here is wrong — Date does that — but it is exactly
    // why /api/reserve does a round-trip check on the date before trusting it,
    // and that check has its own test in tests/api/reserve.test.ts.
    expect(weekdayIndex("2026-02-31")).toBe(1);
  });
});

describe("nowMinutesInAmsterdam", () => {
  it.each([
    ["2026-01-15T12:00:00Z", 780, "13:00 CET, midwinter"],
    ["2026-07-15T12:00:00Z", 840, "14:00 CEST, midsummer"],
  ])("reads %s as %i (%s)", (instant, minutes) => {
    freezeAt(instant);
    expect(nowMinutesInAmsterdam()).toBe(minutes);
  });

  it("crosses the spring-forward gap, where 02:xx never happens", () => {
    freezeAt("2026-03-29T00:30:00Z");
    expect(nowMinutesInAmsterdam()).toBe(90); // 01:30, still CET
    freezeAt("2026-03-29T01:30:00Z");
    expect(nowMinutesInAmsterdam()).toBe(210); // 03:30 CEST — 02:30 did not exist
  });

  it("returns the same wall clock twice on the autumn night, which is correct", () => {
    // Two different instants, one reading of 02:30. This is the case that
    // breaks naive lead-time arithmetic, and it is the reason nothing in the
    // booking path tries to turn a wall clock back into an instant by hand.
    freezeAt("2026-10-25T00:30:00Z");
    expect(nowMinutesInAmsterdam()).toBe(150);
    freezeAt("2026-10-25T01:30:00Z");
    expect(nowMinutesInAmsterdam()).toBe(150);
  });
});

describe("todayInAmsterdam", () => {
  it("turns over at 22:00 UTC in summer", () => {
    freezeAt("2026-09-12T21:59:00Z");
    expect(todayInAmsterdam()).toBe("2026-09-12");
    freezeAt("2026-09-12T22:00:00Z");
    expect(todayInAmsterdam()).toBe("2026-09-13");
  });

  it("turns over an hour later in winter", () => {
    freezeAt("2026-01-12T22:59:00Z");
    expect(todayInAmsterdam()).toBe("2026-01-12");
    freezeAt("2026-01-12T23:00:00Z");
    expect(todayInAmsterdam()).toBe("2026-01-13");
  });
});

describe("the process timezone cannot change any of it", () => {
  /**
   * The point of pinning TZ=UTC in the config is that this test can exist. If
   * a clock read ever slips through that uses the local timezone by accident,
   * it will pass on the laptop it was written on and fail here — which is the
   * failure everybody wants, in the place they want it.
   */
  it.each(ABSURD_TIMEZONES)("answers identically under %s", (tz) => {
    freezeAt("2026-09-12T22:30:00Z");
    const minutes = nowMinutesInAmsterdam();
    const today = todayInAmsterdam();
    expect(today).toBe("2026-09-13");

    underProcessTz(tz, () => {
      expect(nowMinutesInAmsterdam()).toBe(minutes);
      expect(todayInAmsterdam()).toBe(today);
      expect(weekdayIndex("2026-09-14")).toBe(0);
    });
  });
});

describe("availableDates", () => {
  it.each(["12-09-2026", "2026-9-12", "", "2026-13-01"])(
    "offers nothing when today is %o",
    (today) => {
      expect(availableDates(today, OPEN_ALL_WEEK)).toEqual([]);
    },
  );

  it("offers every date when the CMS week cannot be read at all", () => {
    // A CMS nobody has filled in must not silently close the bookings. This is
    // the same state /api/reserve reads as "nothing to enforce".
    const dates = availableDates("2026-09-12", SHUT_ALL_WEEK);
    expect(dates).toHaveLength(HORIZON_DAYS + 1);
    expect(dates[0]).toBe("2026-09-12");
  });

  it("is inclusive of the horizon itself, because the endpoint is", () => {
    // /api/reserve refuses a date *past* today plus the horizon, so the last
    // date it accepts has to be on this list or the form stops one day short
    // of what would be taken.
    const dates = availableDates("2026-09-12", SHUT_ALL_WEEK, undefined, 7);
    expect(dates).toHaveLength(8);
    expect(dates.at(-1)).toBe("2026-09-19");
  });

  it("is strictly increasing, contiguous and free of duplicates", () => {
    const dates = availableDates("2026-09-12", SHUT_ALL_WEEK);
    expect(new Set(dates).size).toBe(dates.length);
    for (let i = 1; i < dates.length; i += 1) {
      const previous = new Date(`${dates[i - 1]}T12:00:00.000Z`).getTime();
      expect(new Date(`${dates[i]}T12:00:00.000Z`).getTime() - previous).toBe(86_400_000);
    }
  });

  it.each(["2026-03-25", "2026-10-22"])(
    "walks cleanly across the clock change starting at %s",
    (today) => {
      // Every step is a whole day added to midday UTC, so no offset can nudge
      // one of these onto its neighbour — which is what this asserts.
      const dates = availableDates(today, SHUT_ALL_WEEK);
      expect(new Set(dates).size).toBe(HORIZON_DAYS + 1);
      for (let i = 1; i < dates.length; i += 1) {
        const previous = new Date(`${dates[i - 1]}T12:00:00.000Z`).getTime();
        expect(new Date(`${dates[i]}T12:00:00.000Z`).getTime() - previous).toBe(86_400_000);
      }
    },
  );

  it("clamps a CMS horizon above the hard ceiling", () => {
    expect(availableDates("2026-09-12", SHUT_ALL_WEEK, undefined, 365)).toHaveLength(
      MAX_HORIZON_DAYS + 1,
    );
  });

  it("offers only the days the week is open on", () => {
    const dates = availableDates("2026-09-12", SATURDAYS_ONLY);
    expect(dates.every((date) => weekdayIndex(date) === 5)).toBe(true);
    // The documented blindness of this function: it knows only the seven
    // weekly rows, so it can never offer the last Sunday of the month even
    // when the café really is open. availableDatesFromSchedule exists for
    // exactly that, and is tested below.
    expect(dates.some((date) => weekdayIndex(date) === 6)).toBe(false);
  });

  it("keeps today until the lead time passes its last sitting, and not a minute longer", () => {
    // 11:00–21:00 means the last table sits at 20:00. With an hour of notice,
    // 19:00 still buys it and 19:01 does not.
    expect(availableDates("2026-09-12", OPEN_ALL_WEEK, 1140)[0]).toBe("2026-09-12");
    expect(availableDates("2026-09-12", OPEN_ALL_WEEK, 1141)[0]).toBe("2026-09-13");
  });

  it("applies the lead time to today and to no other day", () => {
    const dates = availableDates("2026-09-12", OPEN_ALL_WEEK, 1400);
    expect(dates).not.toContain("2026-09-12");
    expect(dates[0]).toBe("2026-09-13");
  });

  it("honours a lead time the owners lengthened", () => {
    // Three hours' notice: at 17:30 the last sitting is already inside it.
    expect(availableDates("2026-09-12", OPEN_ALL_WEEK, 1050, 90, 180)).not.toContain(
      "2026-09-12",
    );
    expect(availableDates("2026-09-12", OPEN_ALL_WEEK, 1050, 90, 60)[0]).toBe(
      "2026-09-12",
    );
  });
});

describe("availableDatesFromSchedule", () => {
  const scheduled = (date: string, line: string): ScheduledDay => {
    const ranges = parseRanges(line);
    return { date, ranges, closed: ranges.length === 0 };
  };

  it("drops the days the schedule closed", () => {
    const days = [
      scheduled("2026-09-12", "11:00 – 21:00"),
      scheduled("2026-09-13", "Gesloten"),
      scheduled("2026-09-14", "11:00 – 21:00"),
    ];
    expect(availableDatesFromSchedule(days, "2026-09-12")).toEqual([
      "2026-09-12",
      "2026-09-14",
    ]);
  });

  it("offers a Sunday the exceptions opened, which availableDates never could", () => {
    const days = [scheduled("2026-03-29", "12:00 - 20:00")];
    expect(availableDatesFromSchedule(days, "2026-03-29")).toEqual(["2026-03-29"]);
  });

  it("drops days before today, because a cached window starts at yesterday", () => {
    // /reserveren is held in the ISR cache, so a window resolved last night
    // still begins on a date that has been and gone. Offering it is how a
    // guest gets told "kies een datum vanaf vandaag" about the first entry in
    // the list they were shown.
    const days = [
      scheduled("2026-09-11", "11:00 – 21:00"),
      scheduled("2026-09-12", "11:00 – 21:00"),
    ];
    expect(availableDatesFromSchedule(days, "2026-09-12")).toEqual(["2026-09-12"]);
  });

  it("applies the lead time to today alone", () => {
    const days = [
      scheduled("2026-09-12", "11:00 – 21:00"),
      scheduled("2026-09-13", "11:00 – 21:00"),
    ];
    expect(availableDatesFromSchedule(days, "2026-09-12", 1400)).toEqual([
      "2026-09-13",
    ]);
  });

  it("drops a day whose hours yield no bookable slot at all", () => {
    expect(
      availableDatesFromSchedule([scheduled("2026-09-12", "11:00-11:30")], "2026-09-12"),
    ).toEqual([]);
  });

  it("answers an empty window with an empty list", () => {
    expect(availableDatesFromSchedule([], "2026-09-12")).toEqual([]);
  });
});

describe("dayFromSchedule", () => {
  const days: ScheduledDay[] = [
    { date: "2026-09-12", ranges: [], closed: true, note: "first" },
    { date: "2026-09-12", ranges: [], closed: true, note: "second" },
    { date: "2026-09-13", ranges: [], closed: true },
  ];

  it("finds the day asked for", () => {
    expect(dayFromSchedule(days, "2026-09-13")?.date).toBe("2026-09-13");
  });

  it("answers null rather than undefined for a day outside the window", () => {
    expect(dayFromSchedule(days, "2026-12-25")).toBeNull();
  });

  it("takes the first of two entries sharing a date", () => {
    expect(dayFromSchedule(days, "2026-09-12")?.note).toBe("first");
  });
});
