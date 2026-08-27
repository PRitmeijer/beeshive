import { describe, expect, it } from "vitest";
import {
  dateAfter,
  monthAfter,
  monthGrid,
  monthOf,
} from "@/lib/openingHours";
import { LEAP_DAY, SPRING_FORWARD, underProcessTz, ABSURD_TIMEZONES } from "../support/time";

/**
 * The arithmetic the month picker is drawn from.
 *
 * The date list used to be a dropdown of up to ninety options, which needed no
 * arithmetic at all beyond stepping a day at a time; a month grid needs to know
 * where a month begins, how long it is and what the weeks either side of it
 * look like. That is where the awkward cases live — a month beginning on a
 * Sunday, a five-Sunday month, the leap day, and the night the clocks move —
 * and none of them can be found by opening the site in September.
 *
 * Every one of these is done at midday UTC, which is the discipline the whole
 * booking path keeps: a date stepped from midnight is a date an offset can push
 * onto the day before.
 */

describe("dateAfter", () => {
  it.each([
    ["2026-09-12", 1, "2026-09-13"],
    ["2026-09-12", -1, "2026-09-11"],
    ["2026-09-12", 0, "2026-09-12"],
    ["2026-09-30", 1, "2026-10-01"],
    ["2026-12-31", 1, "2027-01-01"],
    ["2026-01-01", -1, "2025-12-31"],
    ["2026-09-12", 90, "2026-12-11"],
  ])("reads %o plus %i days as %o", (from, days, expected) => {
    expect(dateAfter(from, days)).toBe(expected);
  });

  it("crosses the night the clocks go forward without losing a day", () => {
    // 2026-03-29 is the night 02:00 never happens in Amsterdam. Stepping whole
    // days from midday UTC stays at midday UTC, so it cannot matter — which is
    // exactly the sort of claim worth an assertion rather than a comment.
    expect(dateAfter("2026-03-28", 1)).toBe(SPRING_FORWARD);
    expect(dateAfter(SPRING_FORWARD, 1)).toBe("2026-03-30");
    expect(dateAfter(SPRING_FORWARD, -1)).toBe("2026-03-28");
  });

  it("steps onto and off the leap day", () => {
    expect(dateAfter("2028-02-28", 1)).toBe(LEAP_DAY);
    expect(dateAfter(LEAP_DAY, 1)).toBe("2028-03-01");
  });

  it.each(ABSURD_TIMEZONES)("answers the same under %s", (tz) => {
    // The suite runs under TZ=UTC and the owners' laptop is in Amsterdam, so
    // "it works on my machine" is a real hazard here rather than a joke.
    expect(underProcessTz(tz, () => dateAfter("2026-09-12", 1))).toBe(
      "2026-09-13",
    );
    expect(underProcessTz(tz, () => monthGrid("2026-09")[0][0])).toBe(null);
  });

  it("answers with nothing for something that is not a date", () => {
    expect(dateAfter("morgen", 1)).toBe("");
  });
});

describe("monthOf and monthAfter", () => {
  it("takes the month off a date", () => {
    expect(monthOf("2026-08-29")).toBe("2026-08");
  });

  it.each([
    ["2026-11", 2, "2027-01"],
    ["2026-01", -1, "2025-12"],
    ["2026-09", 0, "2026-09"],
    ["2026-09", 12, "2027-09"],
    ["2026-12", 1, "2027-01"],
  ])("reads %o plus %i months as %o", (from, months, expected) => {
    expect(monthAfter(from, months)).toBe(expected);
  });

  it("does not roll a short month over", () => {
    // Every month is entered on its first day, so a January the 31st cannot
    // become a March the 3rd on the way to February — the classic way month
    // arithmetic goes wrong.
    expect(monthAfter("2026-01", 1)).toBe("2026-02");
  });
});

describe("monthGrid", () => {
  const flat = (month: string) =>
    monthGrid(month).flat().filter((day): day is string => day !== null);

  it("lays a month out Monday first with the gaps left empty", () => {
    // September 2026 begins on a Tuesday, so the first row carries one gap and
    // then the 1st.
    const weeks = monthGrid("2026-09");
    expect(weeks[0][0]).toBe(null);
    expect(weeks[0][1]).toBe("2026-09-01");
    expect(weeks[0][6]).toBe("2026-09-06");
  });

  it("gives every row exactly seven cells", () => {
    for (const month of ["2026-02", "2026-09", "2026-11", "2028-02"]) {
      for (const week of monthGrid(month)) expect(week).toHaveLength(7);
    }
  });

  it.each([
    ["2026-02", 28],
    ["2026-09", 30],
    ["2026-12", 31],
    ["2028-02", 29],
  ])("holds every day of %o and no more (%i)", (month, length) => {
    const days = flat(month);
    expect(days).toHaveLength(length);
    expect(days[0]).toBe(`${month}-01`);
    expect(days.at(-1)).toBe(`${month}-${String(length).padStart(2, "0")}`);
    // Nothing from the months either side ever appears, whatever the shape of
    // the weeks around it.
    for (const day of days) expect(monthOf(day)).toBe(month);
  });

  it("needs six rows for a thirty-one day month starting on a Sunday", () => {
    // The shape that breaks a five-row grid: March 2026 runs Sunday to
    // Tuesday and needs six.
    expect(monthGrid("2026-03")).toHaveLength(6);
    expect(monthGrid("2026-03")[0][6]).toBe("2026-03-01");
    expect(monthGrid("2026-03").at(-1)?.[0]).toBe("2026-03-30");
  });

  it("holds the five Sundays of a five-Sunday March", () => {
    // 2026-03-29 is the fifth Sunday of March as well as the last, which is
    // the date the recurring-opening rules are hardest about.
    const sundays = monthGrid("2026-03")
      .map((week) => week[6])
      .filter(Boolean);
    expect(sundays).toEqual([
      "2026-03-01",
      "2026-03-08",
      "2026-03-15",
      "2026-03-22",
      SPRING_FORWARD,
    ]);
  });

  it("puts the leap day in the month it belongs to", () => {
    expect(flat("2028-02")).toContain(LEAP_DAY);
    expect(flat("2028-03")).not.toContain(LEAP_DAY);
  });

  it("answers with nothing for something that is not a month", () => {
    expect(monthGrid("volgende maand")).toEqual([]);
  });
});
