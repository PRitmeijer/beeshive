import { describe, expect, it } from "vitest";
import {
  emptyDayLine,
  dateAnswer,
  fromWeek,
  mergeDays,
  readWindowDays,
  sittings,
  timeAnswer,
  type DayFacts,
  type Horizon,
} from "@/lib/bookingFlow";
import {
  parseRanges,
  parseWeek,
  slotsFor,
  type BookingRules,
} from "@/lib/openingHours";

/**
 * The five honest answers.
 *
 * Four of them used to be the same greyed-out silence and the fifth was a
 * column of struck-through chips, which is most of what the owners meant by
 * "cluttered": a guest who picked a shut Tuesday, a guest whose Saturday was
 * full for six, a guest who arrived on a three-week-old link and a guest for
 * whom nothing at all was open were shown very nearly the same thing, and none
 * of them was told what to do next.
 *
 * Each is a different sentence with a different way forward now, and which one
 * a day deserves is decided here rather than in the component — because the
 * distinctions are exactly the ones that are invisible in a browser. "Shut" and
 * "full for six" look identical on screen unless somebody has thought about
 * which is which.
 */

const RULES: BookingRules = {
  leadMinutes: 60,
  horizonDays: 90,
  maxPartySize: 20,
  slotMinutes: 15,
  lastSittingMinutes: 60,
};

const TODAY = "2026-08-25";
const HORIZON: Horizon = { today: TODAY, last: "2026-11-23" };
const SATURDAY = "2026-08-29";

const day = (over: Partial<DayFacts> = {}): DayFacts => ({
  date: SATURDAY,
  ranges: parseRanges("17:00 – 22:00"),
  closed: false,
  full: false,
  note: null,
  ...over,
});

const answer = (days: DayFacts[], full: string[] = [], date = SATURDAY) =>
  timeAnswer(date, days, HORIZON, 12 * 60, RULES, new Set(full));

describe("timeAnswer", () => {
  it("offers the sittings when there are sittings to offer", () => {
    const given = answer([day()]);
    expect(given.kind).toBe("times");
    if (given.kind !== "times") return;
    expect(given.sittings[0].times).toContain("19:00");
    expect(given.full).toEqual([]);
  });

  it("names the taken sittings rather than drawing them", () => {
    // Answer two. Every chip on screen can be pressed; the two that cannot are
    // one quiet line under the group, which says the same thing in eight words
    // instead of thirty grey targets.
    const given = answer([day()], ["19:00", "19:30"]);
    expect(given.kind).toBe("times");
    if (given.kind !== "times") return;
    expect(given.full).toEqual(["19:00", "19:30"]);
    expect(given.sittings.flatMap((s) => s.times)).not.toContain("19:00");
  });

  it("answers a shut day with the owners' own words about it", () => {
    // Answer one, and the warmest sentence in the flow: "Gesloten wegens het
    // personeelsfeest" is the whole reason somebody wanted that evening.
    const given = answer([
      day({ closed: true, ranges: [], note: "Gesloten wegens een besloten feest." }),
    ]);
    expect(given).toMatchObject({
      kind: "day_closed",
      note: "Gesloten wegens een besloten feest.",
    });
  });

  it("answers a day the endpoint marked full as full, not as shut", () => {
    // Answer three. The two must not collapse into one another: a shut day is
    // answered by another day, a full one may be answered by the telephone.
    expect(answer([day({ full: true })]).kind).toBe("day_full");
  });

  it("answers a day whose every sitting is taken as a full day", () => {
    // The endpoint had not got as far as marking the day, but there is no
    // difference to the guest between "the day is full" and "all of its
    // sittings are", and telling them to pick another time would be a small
    // lie that costs a table.
    const every = ["17:00", "17:15", "17:30", "17:45", "18:00", "18:15", "18:30",
      "18:45", "19:00", "19:15", "19:30", "19:45", "20:00", "20:15", "20:30",
      "20:45", "21:00"];
    expect(answer([day()], every).kind).toBe("day_full");
  });

  it("answers a day past the horizon on its own terms", () => {
    // Answer four, and the one somebody reaches by opening a link a friend
    // sent them three weeks ago rather than by wandering.
    expect(answer([], [], "2026-12-25").kind).toBe("beyond_horizon");
  });

  it("answers a day before today the same way", () => {
    expect(answer([], [], "2026-08-01").kind).toBe("beyond_horizon");
  });

  it("carries the next open day into every dead end", () => {
    const days = [day({ full: true }), { ...day(), date: "2026-08-30" }];
    const given = answer(days);
    expect(given).toMatchObject({ kind: "day_full", next: "2026-08-30" });
  });

  it("says so honestly when there is no next open day to offer", () => {
    expect(answer([day({ full: true })])).toMatchObject({ next: null });
  });
});

/**
 * Answer six, and the sentence that used to be a small lie.
 *
 * A day with nothing left to book was answered with `day_closed`, and
 * `day_closed` prints "zaterdag 5 september zijn we dicht." That is true of a
 * Tuesday and untrue of two days the café is open on and serving: tonight after
 * the last sitting has gone by, which happens on every ordinary Saturday
 * somewhere around eight o'clock, and any day a gap before closing set wider
 * than the day's own hours has emptied. `invalidationFor` has kept `day_over`
 * apart from `day_closed` since it was written — the same distinction, one
 * function away — so this is that distinction reaching the sentence a guest
 * reads rather than only the one a screen reader hears.
 *
 * Which of the two a day is comes off its opening hours and not off its
 * `closed` flag, and every test here leans on that. /api/availability answers
 * `closed: day.closed || times.length === 0` on purpose, because a calendar
 * needs one field for "do not offer this square" — so a café-is-open-but-empty
 * day arrives from the wire with `closed` true and its ranges intact, and a
 * flow that read the flag would flip from the honest sentence to the dishonest
 * one under the guest as the fetch resolved.
 */
describe("timeAnswer: open, and past taking bookings", () => {
  const WIDE: BookingRules = { ...RULES, lastSittingMinutes: 600 };

  it("does not call an evening shut because the gap swallowed it", () => {
    // Ten hours before closing on a five-hour evening: a setting the field
    // takes and a mistake a person makes once. The doors open, the kitchen is
    // on, and the only true thing to say is that no table can be had this way.
    const given = timeAnswer(SATURDAY, [day()], HORIZON, 12 * 60, WIDE);
    expect(given.kind).toBe("day_over");
  });

  it("still calls a day with no hours at all shut", () => {
    // The other half of it. Nothing above may weaken answer one: a Tuesday the
    // café never opens is shut, and "we kunnen niets meer aannemen" about it
    // would send the guest looking for a table next Tuesday.
    const given = timeAnswer(
      SATURDAY,
      [day({ closed: true, ranges: [] })],
      HORIZON,
      12 * 60,
      WIDE,
    );
    expect(given.kind).toBe("day_closed");
  });

  it("says it about tonight once the last sitting has gone by", () => {
    // The common case by a very long way, and the one that has been printing
    // the untruth on ordinary evenings all along. Half past nine in the café,
    // an hour's notice, a kitchen open until ten: the doors are open and there
    // is nothing left to book.
    const tonight = day({ date: TODAY });
    const given = timeAnswer(TODAY, [tonight], HORIZON, 21 * 60 + 30, RULES);
    expect(given.kind).toBe("day_over");
  });

  it("holds that answer when the window answer calls the same day closed", () => {
    /**
     * The reason the hours decide it and not the flag. This is the very shape
     * /api/availability sends for an evening whose sittings have gone —
     * `closed` true, the hours still in it, because the calendar needs one
     * field to grey the square with. Read the flag and the sentence on screen
     * changes from true to false the moment the window fetch lands, about a day
     * nothing has actually happened to.
     */
    const fromTheWire = day({ date: TODAY, closed: true });
    const given = timeAnswer(TODAY, [fromTheWire], HORIZON, 21 * 60 + 30, RULES);
    expect(given.kind).toBe("day_over");
  });

  it("carries the owners' note and the next open day into it", () => {
    // Both of these are as much use here as under answer one. "Live muziek
    // vanaf 20:00" is very often why that square was pressed, and it is still
    // true of an evening a table can no longer be booked for.
    const days = [
      day({ date: TODAY, note: "Live muziek vanaf 20:00" }),
      day(),
    ];
    expect(timeAnswer(TODAY, days, HORIZON, 21 * 60 + 30, RULES)).toMatchObject({
      kind: "day_over",
      note: "Live muziek vanaf 20:00",
      next: SATURDAY,
    });
  });
});

describe("dateAnswer", () => {
  it("is the chips when there are days to offer", () => {
    expect(dateAnswer([day()], HORIZON, 12 * 60, RULES)).toEqual({
      kind: "chips",
      dates: [SATURDAY],
    });
  });

  it("is the fifth answer when the whole window has nothing", () => {
    // Answer five, and it has to name the party size when it is printed: a
    // window with nothing in it for six is not a window with nothing in it.
    expect(dateAnswer([day({ full: true })], HORIZON, 12 * 60, RULES)).toEqual({
      kind: "no_days",
    });
  });
});

describe("sittings", () => {
  it("groups a split service into its two halves and keeps the gap", () => {
    const ranges = parseRanges("12:00 – 16:00, 17:00 – 22:00");
    const given = sittings(ranges, ["12:00", "14:30", "17:00", "19:00", "21:00"]);
    expect(given).toHaveLength(2);
    expect(given[0].heading).toBe("12:00 – 16:00");
    expect(given[0].times).toEqual(["12:00", "14:30"]);
    expect(given[1].heading).toBe("17:00 – 22:00");
    expect(given[1].times).toEqual(["17:00", "19:00", "21:00"]);
  });

  it("drops a service with nothing left in it rather than heading an empty row", () => {
    const ranges = parseRanges("12:00 – 16:00, 17:00 – 22:00");
    expect(sittings(ranges, ["19:00"])).toHaveLength(1);
  });

  it("prints one heading for one service, which is where the hours now live", () => {
    // The hint paragraph that used to say "Open 17:00 – 22:00" underneath the
    // list is gone; the group heading says it, over the very chips it is about.
    expect(sittings(parseRanges("17:00 – 22:00"), ["19:00"])[0].heading).toBe(
      "17:00 – 22:00",
    );
  });

  it("keeps a sitting that belongs to no service rather than losing it", () => {
    // It cannot come out of `slotsFor`, but a stale list can arrive beside
    // fresh hours, and a chip that quietly disappears is one a guest goes on
    // looking for. The endpoint refuses what it must.
    expect(sittings(parseRanges("17:00 – 22:00"), ["09:00"])[0].times).toEqual([
      "09:00",
    ]);
  });

  it("has nothing to group when there are no times", () => {
    expect(sittings(parseRanges("17:00 – 22:00"), [])).toEqual([]);
  });

  it("groups by the gap the owners set rather than by the shipped hour", () => {
    /**
     * The bug this would otherwise be. The grouping asks the same question
     * `slotsFor` answered — does this time fall inside this service — and if it
     * asks it with the wrong number the answers part company at the end of the
     * evening. With the gap set to nought a table at closing time is a real
     * sitting; judged against the shipped hour it belongs to no service, falls
     * into the leftovers and comes back under a blank heading, which is a strip
     * of times with no opening hours over it. Both ends are pinned here: the
     * wider gap must not swallow a sitting that is still on offer either.
     */
    const evening = parseRanges("17:00 – 21:00");
    const atClosing = sittings(evening, ["20:30", "21:00"], 0);
    expect(atClosing).toHaveLength(1);
    expect(atClosing[0].heading).toBe("17:00 – 21:00");
    expect(atClosing[0].times).toEqual(["20:30", "21:00"]);

    const wide = sittings(evening, ["19:00", "19:30"], 90);
    expect(wide).toHaveLength(1);
    expect(wide[0].heading).toBe("17:00 – 21:00");
    expect(wide[0].times).toEqual(["19:00", "19:30"]);
  });
});

describe("sittings: one number, two readers", () => {
  /**
   * The property the doc comment on `sittings()` claims and, for a while, only
   * mostly had: hand the grouping and `slotsFor` the same gap, and every time
   * `slotsFor` chose falls inside the service the grouping puts it in. Never a
   * leftover, never the empty heading — a strip of chips under a blank line is
   * the one thing this grouping exists to prevent.
   *
   * It held for every gap a CMS field can produce and broke on the ones the
   * shared sanitiser was written for, because only one of the two readers was
   * using it. NaN is the case with teeth: `slotsFor` read it as the shipped
   * hour and produced a whole evening, while `range.close - NaN` is NaN, every
   * comparison in the grouping went false, and all thirteen times came back
   * under a blank heading. A gap arrives as a plain argument here — a prop that
   * survived a bad serialisation, a stale window, a rules object built by hand
   * — so "not reachable through resolveBookingRules today" is a statement about
   * today and not about the function.
   */
  const evening = parseRanges("17:00 – 21:00");

  it.each([
    [0, "closing time itself is a sitting"],
    [60, "the shipped hour"],
    [90, "the gap in the owners' own field"],
    [240, "a gap that leaves one sitting"],
    [Number.NaN, "a number that is not one"],
    [-30, "a gap below nought"],
    [1e9, "a gap past any day"],
  ])("groups its own times under its own heading at %o (%s)", (gap) => {
    const times = slotsFor(evening, -1, 15, gap);
    const groups = sittings(evening, times, gap);
    if (times.length === 0) {
      // A gap wider than the evening leaves nothing to group, which is the
      // honest answer and the one `timeAnswer` turns into `day_over`.
      expect(groups).toEqual([]);
      return;
    }
    expect(groups).toHaveLength(1);
    expect(groups[0].heading).toBe("17:00 – 21:00");
    expect(groups[0].times).toEqual(times);
  });

  it("reads an unusable gap as the shipped hour, exactly as slotsFor does", () => {
    // Stated as the disagreement rather than as the property, because the
    // disagreement is what shipped: thirteen times, one heading, and the
    // heading is the day's own hours and not an empty string.
    const times = slotsFor(evening, -1, 15, Number.NaN);
    expect(times.at(-1)).toBe("20:00");
    const groups = sittings(evening, times, Number.NaN);
    expect(groups).toHaveLength(1);
    expect(groups[0].heading).not.toBe("");
    expect(groups[0].times).toEqual(times);
  });
});

describe("readWindowDays", () => {
  it("reads the answer /api/availability actually sends", () => {
    expect(
      readWindowDays([
        {
          date: SATURDAY,
          ranges: [{ open: 1020, close: 1320 }],
          closed: false,
          full: true,
          note: "Live muziek vanaf 20:00",
          hours: "17:00 – 22:00",
        },
      ]),
    ).toEqual([
      {
        date: SATURDAY,
        ranges: [{ open: 1020, close: 1320 }],
        closed: false,
        full: true,
        note: "Live muziek vanaf 20:00",
      },
    ]);
  });

  it.each([null, undefined, "days", 7, [null], [{}], [{ ranges: [] }]])(
    "reads %o as nothing at all",
    (value) => {
      expect(readWindowDays(value)).toEqual([]);
    },
  );

  it("drops a range that is not two numbers", () => {
    const given = readWindowDays([
      { date: SATURDAY, ranges: [{ open: "17:00", close: 1320 }, null] },
    ]);
    expect(given[0].ranges).toEqual([]);
  });
});

describe("mergeDays", () => {
  it("lets the endpoint's answer win over the schedule, day by day", () => {
    const base = [day(), { ...day(), date: "2026-08-30" }];
    const merged = mergeDays(base, [{ ...day(), full: true }]);
    expect(merged).toHaveLength(2);
    expect(merged[0].full).toBe(true);
    expect(merged[1].full).toBe(false);
  });

  it("leaves the schedule alone when nothing has been answered", () => {
    const base = [day()];
    expect(mergeDays(base, [])).toBe(base);
  });

  it("keeps the days in date order however they arrived", () => {
    const merged = mergeDays(
      [{ ...day(), date: "2026-08-30" }],
      [{ ...day(), date: "2026-08-26" }],
    );
    expect(merged.map((d) => d.date)).toEqual(["2026-08-26", "2026-08-30"]);
  });
});

describe("fromWeek", () => {
  it("spreads the weekly rows across the horizon for the sheet to fall back on", () => {
    const week = parseWeek([
      { day: "Maandag", hours: "Gesloten" },
      { day: "Dinsdag", hours: "17:00 – 22:00" },
      { day: "Woensdag", hours: "17:00 – 22:00" },
      { day: "Donderdag", hours: "17:00 – 22:00" },
      { day: "Vrijdag", hours: "17:00 – 23:00" },
      { day: "Zaterdag", hours: "12:00 – 23:00" },
      { day: "Zondag", hours: "Gesloten" },
    ]);
    const days = fromWeek(week, { today: TODAY, last: "2026-08-31" });
    expect(days).toHaveLength(7);
    // The 31st is a Monday, which this café keeps shut.
    expect(days.at(-1)).toMatchObject({ date: "2026-08-31", closed: true });
    expect(days[0]).toMatchObject({ date: TODAY, closed: false, full: false });
  });

  it("has nothing to say before the clock has been read", () => {
    expect(fromWeek(parseWeek([]), { today: "", last: "" })).toEqual([]);
  });
});

/**
 * The last hop, from an answer kind to the words on the screen.
 *
 * `timeAnswer` keeps `day_closed` and `day_over` apart, and the tests above
 * pin that thoroughly. What none of them could reach was the branch in
 * TimeBand that turns the kind into a sentence: swapping it so an open evening
 * printed "we zijn dicht" again left the whole suite green, which is the exact
 * untruth the two kinds exist to keep apart. It is a function now, so this can
 * be about the choice rather than about the rendering.
 */
describe("emptyDayLine: which sentence a day with nothing left gets", () => {
  it("says we are shut only about a day we are shut", () => {
    expect(emptyDayLine("day_closed")).toBe("dayClosedOn");
  });

  it("never says we are shut about a day whose sittings have simply gone", () => {
    // The whole point. A Saturday at half past eight, or a day the gap before
    // closing has eaten whole: the kitchen is on and the guest is being told
    // to try another day, not to stay at home.
    expect(emptyDayLine("day_over")).toBe("dayOverOn");
    expect(emptyDayLine("day_over")).not.toBe("dayClosedOn");
  });

  it("hands every other kind the same sentence it hands day_over", () => {
    // Only two of the kinds reach this line — the component asks first — so
    // this is about the default being the safe one. Of the two sentences, the
    // one that cannot be untrue is "nothing more for this day"; claiming to be
    // shut is a fact about the café that a wrong branch would invent.
    for (const kind of ["times", "day_full", "beyond_horizon"] as const) {
      expect(emptyDayLine(kind)).toBe("dayOverOn");
    }
  });
});
