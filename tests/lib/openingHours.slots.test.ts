import { describe, expect, it } from "vitest";
import {
  LAST_SITTING_BEFORE_CLOSE,
  LEAD_MINUTES,
  SLOT_MINUTES,
  isBookable,
  isOnGrid,
  formatTime,
  parseRanges,
  slotsFor,
  type Range,
} from "@/lib/openingHours";

/**
 * The grid: what the form offers and what the endpoint accepts.
 *
 * These two functions have to agree to the minute or the site offers a table
 * it will then refuse. They very nearly did not: a day typed in as
 * "11:15 - 21:00" used to lay its grid out from the door opening — 11:15,
 * 11:45, 12:15 — times the form showed, this module accepted and the
 * Reservations collection threw out, so every booking on such a day came back
 * as "er ging iets mis aan onze kant". The grid is absolute now, and the last
 * block in this file is the property test that keeps it that way.
 *
 * It is quarter hours out of the box and half hours when the owners say so, so
 * every block below is written twice over where the answer differs: once at
 * the default and once at thirty. The half-hour grid being a strict subset of
 * the quarter-hour one is the whole reason that switch is safe to flip, and
 * "the subset property" at the foot of the file is where that is proved rather
 * than asserted.
 */

const day = (line: string): Range[] => parseRanges(line);

describe("the constants the whole booking path shares", () => {
  /**
   * Asserted literally rather than compared to themselves. src/lib/capacity.ts
   * walks the same grid these lay out, and the browser bundle holds its own
   * copy of the lead time, so moving one of these numbers has to be a
   * deliberate, visible edit rather than a drift somebody notices in April.
   */
  it("are the numbers everything else was written against", () => {
    expect(SLOT_MINUTES).toBe(15);
    expect(LAST_SITTING_BEFORE_CLOSE).toBe(60);
    expect(LEAD_MINUTES).toBe(60);
  });

  it("still says an hour before closing when nobody has set anything", () => {
    /**
     * The promise made when the gap stopped being a constant and became a
     * field: on the day it shipped, this café's evenings did not move by a
     * minute. Written against the same "11:00 – 21:00" the block below uses,
     * so the two cannot drift apart.
     */
    expect(slotsFor(day("11:00 – 21:00")).at(-1)).toBe("20:00");
    expect(slotsFor(day("11:00 – 21:00"), -1, SLOT_MINUTES, 60)).toEqual(
      slotsFor(day("11:00 – 21:00")),
    );
  });
});

/**
 * The gap between the last bookable sitting and closing time, which the owners
 * now set in Site Instellingen.
 *
 * The request came from the café in one sentence: they close at nine some
 * nights, and an hour before that is earlier than they want the last table to
 * be. Everything here is about the two ends of the range — a nought that means
 * "up to closing time" and a number so large the day has nothing left in it —
 * because those are the two an owner will reach for first and the two the old
 * constant never had to survive.
 */
describe("the gap before closing", () => {
  const evening = day("17:00 – 21:00");

  it("makes 19:30 the last table at ninety minutes, and refuses 19:45", () => {
    const slots = slotsFor(evening, -1, SLOT_MINUTES, 90);
    expect(slots.at(-1)).toBe("19:30");
    expect(slots).not.toContain("19:45");
    expect(slots).not.toContain("20:00");
    // And the endpoint agrees with the form to the minute, which is the whole
    // point of threading the number through rather than reading it twice.
    expect(isBookable(evening, "19:30", -1, SLOT_MINUTES, 90)).toBe(true);
    expect(isBookable(evening, "19:45", -1, SLOT_MINUTES, 90)).toBe(false);
    // The same evening once the owners have also asked for half hours.
    expect(slotsFor(evening, -1, 30, 90).at(-1)).toBe("19:30");
    expect(isBookable(evening, "19:30", -1, 30, 90)).toBe(true);
  });

  it("lets somebody book the closing hour itself at nought", () => {
    const slots = slotsFor(evening, -1, SLOT_MINUTES, 0);
    expect(slots.at(-1)).toBe("21:00");
    expect(isBookable(evening, "21:00", -1, SLOT_MINUTES, 0)).toBe(true);
    // And is genuinely a change: the shipped hour refuses the same table.
    expect(isBookable(evening, "21:00")).toBe(false);
    expect(isBookable(evening, "21:15", -1, SLOT_MINUTES, 0)).toBe(false);
  });

  it("leaves one sitting when the gap is exactly the day's own length", () => {
    // Four hours of opening and a four-hour gap: the door opening is the last
    // sitting as well as the first, which is arithmetic rather than a special
    // case, and worth pinning as the last value before the day empties.
    expect(slotsFor(evening, -1, SLOT_MINUTES, 4 * 60)).toEqual(["17:00"]);
  });

  it.each([
    [4 * 60 + 15, "a quarter of an hour more than the day is open"],
    [10 * 60, "most of a working day"],
    [24 * 60, "a whole day"],
    [100_000, "a number nobody could have meant"],
  ])("yields no sittings at all for %i minutes (%s)", (gap) => {
    /**
     * The honest degradation. A gap wider than the evening leaves nothing to
     * offer, and the answer is an empty list — the same one a Monday gives —
     * rather than a throw, a negative loop or a band of times under a blank
     * heading. Every screen downstream already knows what to say about a day
     * with no sittings on it, so an owner who types 600 where they meant 90
     * sees a closed-looking week rather than a broken one.
     */
    expect(slotsFor(evening, -1, SLOT_MINUTES, gap)).toEqual([]);
    expect(isBookable(evening, "19:00", -1, SLOT_MINUTES, gap)).toBe(false);
  });

  it("treats an unusable gap as nothing said, and a negative one as nought", () => {
    // `slotsFor` and `isBookable` are reachable from callers holding whatever
    // they were handed — a prop that survived a serialisation, a stale window —
    // so they agree here about the answer before either counts a slot. A NaN
    // would otherwise turn every comparison false and silently empty the day.
    expect(slotsFor(evening, -1, SLOT_MINUTES, Number.NaN).at(-1)).toBe("20:00");
    expect(isBookable(evening, "20:00", -1, SLOT_MINUTES, Number.NaN)).toBe(true);
    expect(slotsFor(evening, -1, SLOT_MINUTES, -30).at(-1)).toBe("21:00");
    expect(isBookable(evening, "21:00", -1, SLOT_MINUTES, -30)).toBe(true);
  });

  it("applies the gap to each service of a split day on its own", () => {
    // A lunch service and a dinner service are two closing times, and the gap
    // is a rule about closing rather than about the day.
    const split = day("12:00-16:00, 17:00-22:00");
    const slots = slotsFor(split, -1, 30, 90);
    expect(slots).toContain("14:30");
    expect(slots).not.toContain("15:00");
    expect(slots.at(-1)).toBe("20:30");
    expect(slots).not.toContain("21:00");
  });
});

describe("slotsFor", () => {
  it("offers nothing on a day with no hours", () => {
    expect(slotsFor([])).toEqual([]);
  });

  it("runs from the opening to an hour before close and no further", () => {
    const slots = slotsFor(day("11:00 – 21:00"));
    expect(slots).toHaveLength(37);
    expect(slots[0]).toBe("11:00");
    expect(slots[1]).toBe("11:15");
    expect(slots.at(-1)).toBe("20:00");
    expect(slots).not.toContain("20:15");
    expect(slots).not.toContain("21:00");
  });

  it("does the same on the half hour when the owners ask for half hours", () => {
    const slots = slotsFor(day("11:00 – 21:00"), -1, 30);
    expect(slots).toHaveLength(19);
    expect(slots[0]).toBe("11:00");
    expect(slots[1]).toBe("11:30");
    expect(slots.at(-1)).toBe("20:00");
    expect(slots).not.toContain("11:15");
  });

  it("counts the grid from midnight whatever time the doors open", () => {
    // The fix, pinned, and the property the whole setting rests on. An opening
    // at a quarter past starts at the next slot on the day's own grid — which
    // is 11:15 at quarter hours and 11:30 at half hours — rather than laying a
    // grid of its own out from the door. Step from the door instead and every
    // day would have its own minutes, and the half hours would no longer be a
    // subset of the quarters.
    expect(slotsFor(day("11:15 - 21:00"))[0]).toBe("11:15");
    expect(slotsFor(day("11:20 - 21:00"))[0]).toBe("11:30");
    const halves = slotsFor(day("11:15 - 21:00"), -1, 30);
    expect(halves[0]).toBe("11:30");
    expect(halves).not.toContain("11:15");
    expect(halves).not.toContain("11:45");
    expect(halves.at(-1)).toBe("20:00");
  });

  it("collapses overlapping ranges into one list with nothing repeated", () => {
    const slots = slotsFor([
      { open: 660, close: 900 },
      { open: 840, close: 1320 },
    ]);
    expect(new Set(slots).size).toBe(slots.length);
    expect(slots).toEqual([...slots].sort());
    expect(slots[0]).toBe("11:00");
    expect(slots.at(-1)).toBe("21:00");
  });

  it("stops at the date line on a day that closes after midnight", () => {
    // A booking is a time on a date, and half past midnight belongs to the
    // next date — so a guest wanting it books it there.
    const slots = slotsFor(day("17:00 - 01:00"));
    expect(slots.at(-1)).toBe("23:45");
    expect(slots).not.toContain("00:00");
    expect(slots).not.toContain("00:15");

    expect(slotsFor(day("22:00-02:00"), -1, 30)).toEqual([
      "22:00",
      "22:30",
      "23:00",
      "23:30",
    ]);
    expect(slotsFor(day("22:00-02:00")).at(-1)).toBe("23:45");
  });

  it.each([
    ["11:00-11:30", "shorter than the last-sitting rule", []],
    ["11:00-12:00", "exactly the last-sitting rule", ["11:00"]],
  ])("handles a degenerate day: %o (%s)", (line, _why, expected) => {
    expect(slotsFor(day(line), -1, 30)).toEqual(expected);
  });

  describe("notBefore, which is how today differs from every other day", () => {
    const hours = day("11:00 – 21:00");

    it("is inclusive of the minute itself", () => {
      expect(slotsFor(hours, 1140)[0]).toBe("19:00");
      expect(slotsFor(hours, 1141)[0]).toBe("19:15");
      expect(slotsFor(hours, 1141, 30)[0]).toBe("19:30");
    });

    it("empties the day once it passes the last sitting", () => {
      expect(slotsFor(hours, 1201)).toEqual([]);
    });

    it("changes nothing at its default", () => {
      expect(slotsFor(hours, -1)).toEqual(slotsFor(hours));
    });
  });
});

describe("isBookable", () => {
  const hours = day("11:00 – 21:00");

  it.each(["11:00", "19:00", "20:00"])("accepts %o on an 11:00–21:00 day", (time) => {
    expect(isBookable(hours, time)).toBe(true);
  });

  it.each([
    ["20:30", "inside the hours but past the last sitting"],
    ["10:30", "before the doors open"],
    // The one that matters most: a time inside the hours that the form never
    // offered. Without this the endpoint accepts a hand-rolled request for a
    // minute the seat counting cannot see.
    ["19:07", "inside the hours and on no grid"],
    ["07:00", "hours before opening"],
    ["7:00", "not even the right format"],
    ["19:0", "truncated"],
    ["24:00", "not a time"],
    ["19:60", "not a time"],
    ["", "nothing at all"],
    [" 19:00", "a leading space"],
  ])("refuses %o (%s)", (time) => {
    expect(isBookable(hours, time)).toBe(false);
  });

  it("respects notBefore exactly as slotsFor does", () => {
    expect(isBookable(hours, "19:00", 1140)).toBe(true);
    expect(isBookable(hours, "19:00", 1141)).toBe(false);
  });

  it("uses the absolute grid on a day that opens at a quarter past", () => {
    const quarterPast = day("11:15 - 21:00");
    expect(isBookable(quarterPast, "11:30")).toBe(true);
    expect(isBookable(quarterPast, "11:15")).toBe(true);
    // The same day, once the owners have asked for half hours.
    expect(isBookable(quarterPast, "11:15", -1, 30)).toBe(false);
    expect(isBookable(quarterPast, "11:45", -1, 30)).toBe(false);
    expect(isBookable(quarterPast, "11:30", -1, 30)).toBe(true);
  });

  it("refuses a quarter hour when the owners asked for half hours", () => {
    // The four places that have to agree about this are the form's own grid,
    // this function as /api/availability and /api/reserve call it, the route's
    // own check before any schedule is resolved, and the `time` field in the
    // Reservations collection. A guest handed 19:15 by a form running on the
    // finer grid, arriving at an endpoint told to use the coarser one, is
    // refused here rather than stored somewhere nothing else can see.
    expect(isBookable(hours, "19:15")).toBe(true);
    expect(isBookable(hours, "19:15", -1, 30)).toBe(false);
  });

  it("accepts a time that only the second of two ranges offers", () => {
    const split = day("12:00-16:00, 17:00-22:00");
    expect(isBookable(split, "20:00")).toBe(true);
    // In the gap between the two services, and inside neither.
    expect(isBookable(split, "16:30")).toBe(false);
  });
});

/**
 * The property that keeps the form and the endpoint from ever disagreeing.
 *
 * For a handful of real day shapes: every string `slotsFor` offers is accepted
 * by `isBookable`, and every other minute of the day is refused by it. That
 * second half is what makes this worth writing — a `slotsFor` that returned an
 * empty list would satisfy the first half perfectly.
 */
describe("slotsFor and isBookable describe the same day", () => {
  const shapes: [string, Range[], number][] = [
    ["an ordinary Saturday", day("11:00 – 21:00"), -1],
    ["a day opening at a quarter past", day("11:15 - 21:00"), -1],
    ["a day opening at twenty past", day("11:20 - 21:00"), -1],
    ["a split service", day("12:00-16:00, 17:00-22:00"), -1],
    ["two overlapping services", [{ open: 660, close: 900 }, { open: 840, close: 1320 }], -1],
    ["a kitchen running to one in the morning", day("17:00 - 01:00"), -1],
    ["today, with an hour of notice already gone", day("11:00 – 21:00"), 1140],
    ["a day that is shut", [], -1],
  ];

  /**
   * Both settings at once, as a table, because both are now the owners' to
   * move and the pair of them is where a disagreement would hide: a form
   * laying its grid out with one gap while the endpoint checks it against
   * another offers a table and then refuses it. The gaps are the ones an owner
   * plausibly types — the shipped hour, the ninety minutes this café asked
   * for, an odd number that lands between two slots, nought, and one wide
   * enough to empty most of the shapes below.
   */
  describe.each([
    [15, 60],
    [15, 90],
    [15, 45],
    [15, 0],
    [15, 10 * 60],
    [30, 60],
    [30, 90],
    [30, 45],
    [30, 0],
    [30, 10 * 60],
  ])("on a grid of %i minutes with a gap of %i", (slotMinutes, gap) => {
    it.each(shapes)("%s", (_name, ranges, notBefore) => {
      const offered = new Set(
        slotsFor(ranges, notBefore, slotMinutes, gap),
      );
      for (const time of offered) {
        expect(isBookable(ranges, time, notBefore, slotMinutes, gap)).toBe(true);
      }
      // Every minute of the day, not only the grid: a minute off the grid that
      // isBookable accepted would be a booking nothing else can see.
      for (let minutes = 0; minutes < 24 * 60; minutes += 1) {
        const time = formatTime(minutes);
        expect(isBookable(ranges, time, notBefore, slotMinutes, gap)).toBe(
          offered.has(time),
        );
      }
    });
  });
});

/**
 * The subset property, which is the entire safety argument for the setting.
 *
 * Thirty is a multiple of fifteen, so every time the half-hour grid offers is
 * also a time the quarter-hour grid offers — which is what makes it true that
 * every reservation already stored at :00 or :30 stays exactly on grid, that no
 * row had to be migrated, and that the owners can change their minds back
 * without stranding anything they took in between.
 *
 * It is only true because the grid is counted from midnight. `slotsFor` used to
 * step from each range's own opening time, and on a day typed in as
 * "11:20 - 21:00" the two grids would then have shared not one single minute.
 */
describe("the subset property", () => {
  const shapes = [
    "11:00 – 21:00",
    "11:15 - 21:00",
    "11:20 - 21:00",
    "12:00-16:00, 17:00-22:00",
    "17:00 - 01:00",
  ];

  it.each(shapes)("every half hour on %o is also a quarter hour", (line) => {
    const quarters = new Set(slotsFor(day(line)));
    const halves = slotsFor(day(line), -1, 30);
    expect(halves.length).toBeGreaterThan(0);
    for (const time of halves) expect(quarters.has(time)).toBe(true);
  });

  it("accepts every time already stored on the old grid", () => {
    // Read the other way round: whatever the owners choose, a booking taken at
    // a whole or a half hour is still on the grid the seat counting walks.
    const hours = day("11:00 – 21:00");
    for (const time of ["11:00", "19:00", "19:30", "20:00"]) {
      expect(isOnGrid(time, 15)).toBe(true);
      expect(isOnGrid(time, 30)).toBe(true);
      expect(isBookable(hours, time, -1, 15)).toBe(true);
      expect(isBookable(hours, time, -1, 30)).toBe(true);
    }
  });
});

describe("isOnGrid", () => {
  it.each([
    ["19:00", 15, true],
    ["19:15", 15, true],
    ["19:30", 15, true],
    ["19:45", 15, true],
    ["19:15", 30, false],
    ["19:45", 30, false],
    ["19:07", 15, false],
    ["00:00", 15, true],
  ])("reads %o on a grid of %i as %o", (time, slotMinutes, expected) => {
    expect(isOnGrid(time, slotMinutes)).toBe(expected);
  });

  it.each(["7:00", "19:0", "24:00", "19:60", "", " 19:00", "half acht"])(
    "refuses %o, which is not a time at all",
    (time) => {
      expect(isOnGrid(time)).toBe(false);
    },
  );

  it("falls back to the module's own grid when handed nonsense", () => {
    // Same judgement `resolveBookingRules` makes: a spacing that is not one of
    // the two offered is nothing said, never a grid of its own.
    expect(isOnGrid("19:15", 20)).toBe(true);
    expect(isOnGrid("19:15", 0)).toBe(true);
  });
});
