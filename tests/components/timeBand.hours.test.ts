import { describe, expect, it } from "vitest";
import { hourRows, quarterColumns } from "@/components/booking/TimeBand";
import { sittings } from "@/lib/bookingFlow";
import { parseRanges } from "@/lib/openingHours";

/**
 * The arithmetic behind reading an evening by the hour instead of by the chip.
 *
 * The band draws every bookable sitting there is — that rule has not moved —
 * but it draws them as ten hours rather than as thirty-seven numbers, and two
 * small functions decide what that looks like. Neither can be checked by
 * opening the site, for the usual reason: the cases that matter are a Sunday
 * split around a shut afternoon, a service the owners have put on the half
 * hour, and an hour that has lost the one sitting a column was holding.
 *
 * What is being defended here is the guest's eye. `hourRows` is what turns the
 * list into ten headings, and `quarterColumns` is what keeps quarter past under
 * quarter past all the way down the page. If the columns ever drifted between
 * one service and the next, the layout would still look plausible in a
 * screenshot and would have quietly given up the only thing it is for.
 *
 * They can drift in time as well as down the page, which is the harder half to
 * see and the reason `quarterColumns` is handed the taken sittings alongside
 * the free ones. The columns belong to the grid the owners set, not to
 * whatever is left of it at twenty past six, and a screenshot taken at opening
 * time cannot show what the band does after the diary has eaten a whole
 * column.
 */

/** A real Saturday: eleven in the morning to nine at night, on the quarter. */
const SATURDAY = (() => {
  const times: string[] = [];
  for (let minutes = 11 * 60; minutes <= 20 * 60; minutes += 15) {
    times.push(
      `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`,
    );
  }
  return times;
})();

describe("hourRows", () => {
  it("turns a thirty-seven sitting Saturday into ten hours", () => {
    const rows = hourRows(SATURDAY);
    expect(rows).toHaveLength(10);
    expect(rows.map((row) => row.hour)).toEqual([
      "11", "12", "13", "14", "15", "16", "17", "18", "19", "20",
    ]);
    expect(rows.flatMap((row) => row.times)).toEqual(SATURDAY);
  });

  it("keeps every sitting on the hour it belongs to", () => {
    const rows = hourRows(SATURDAY);
    expect(rows[0].times).toEqual(["11:00", "11:15", "11:30", "11:45"]);
    // The last hour of the day is one sitting, not four: the kitchen closes an
    // hour after the last table sits down, and the row has to be able to say so
    // rather than padding itself out to look like the nine above it.
    expect(rows[9].times).toEqual(["20:00"]);
  });

  it("leaves out the hour that has nothing left in it", () => {
    // A quarter to eight is the only thing anybody has not taken. There is no
    // seven o'clock row, because there is nothing to press in it — the "Vol om"
    // line under the band is what says where the evening went.
    const rows = hourRows(["18:00", "18:30", "19:45", "20:00"]);
    expect(rows.map((row) => row.hour)).toEqual(["18", "19", "20"]);
    expect(rows[1].times).toEqual(["19:45"]);
  });

  it("does not join the two halves of a split day", () => {
    // Grouped inside a service rather than across the day, so a Sunday with a
    // shut afternoon prints two blocks with the gap between them, exactly as
    // `sittings()` hands them over.
    const ranges = parseRanges("11:00 - 14:00, 17:00 - 21:00");
    const times = ["11:00", "11:30", "12:00", "17:00", "17:30", "18:00"];
    const [lunch, dinner] = sittings(ranges, times).map((group) =>
      hourRows(group.times),
    );
    expect(lunch.map((row) => row.hour)).toEqual(["11", "12"]);
    expect(dinner.map((row) => row.hour)).toEqual(["17", "18"]);
  });

  it("answers an empty evening with no rows at all", () => {
    expect(hourRows([])).toEqual([]);
  });
});

describe("quarterColumns", () => {
  it("reads the four quarters off a quarter-hour day", () => {
    expect(quarterColumns([{ times: SATURDAY }], [])).toEqual([
      "00", "15", "30", "45",
    ]);
  });

  it("gives a half-hour day two columns rather than four with holes in", () => {
    // The grid is the owners' to set in the CMS. An evening they have put on
    // the half hour is two columns wide, and printing it as four with every
    // other one empty would invent a sitting they have decided not to offer.
    expect(
      quarterColumns([{ times: ["17:00", "17:30", "18:00", "18:30"] }], []),
    ).toEqual(["00", "30"]);
  });

  it("uses one set of columns for every service of the day", () => {
    // The whole point. Lunch has lost its quarter past and half past, dinner
    // has not; the columns are the union, so the two blocks print on the same
    // grid and the gap in the lunch rows is visible as a gap.
    const columns = quarterColumns(
      [
        { times: ["12:00", "12:45"] },
        { times: ["17:00", "17:15", "17:30", "17:45"] },
      ],
      [],
    );
    expect(columns).toEqual(["00", "15", "30", "45"]);
    // And the index is what the layout places a chip by, so a sitting keeps
    // its column whichever service it came from.
    expect(columns.indexOf("45")).toBe(3);
    expect(columns.indexOf("15")).toBe(1);
  });

  it("keeps the column of a mark the diary has taken every one of", () => {
    // The regression this argument exists for, and the reason it is not
    // optional. Every quarter to has gone; the grid the owners set has not
    // changed, so the band still prints four columns and each of those hours
    // shows a hole in the fourth. Read off the free sittings alone this
    // answered three columns, and the whole evening below the fold slid one
    // column to the left while a guest was looking at it.
    const free = [
      { times: ["18:00", "18:15", "18:30"] },
      { times: ["19:00", "19:15", "19:30"] },
    ];
    const taken = ["18:45", "19:45"];
    expect(quarterColumns(free, taken)).toEqual(["00", "15", "30", "45"]);
    // And a taken sitting cannot invent a column of its own either: the marks
    // are the union of the two halves of one grid, in clock order.
    expect(quarterColumns([{ times: ["18:00"] }], ["18:30"])).toEqual([
      "00", "30",
    ]);
  });

  it("comes down to one column when the day is offered on the hour", () => {
    // An hourly CMS grid is one column wide and is allowed to be. What it may
    // not be is one column stretched across the row, which is a chip of three
    // hundred pixels with ":00" adrift in the middle of it — the layout keeps
    // the track at a chip's width, and the arithmetic that gets there starts
    // here, with a column count of one rather than of four.
    expect(quarterColumns([{ times: ["17:00", "18:00", "19:00"] }], [])).toEqual(
      ["00"],
    );
  });

  it("is empty when there is nothing to draw", () => {
    expect(quarterColumns([], [])).toEqual([]);
    expect(quarterColumns([{ times: [] }], [])).toEqual([]);
  });
});
