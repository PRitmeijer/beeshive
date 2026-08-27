import { describe, expect, it } from "vitest";
import {
  describe as describeRanges,
  formatTime,
  parseRanges,
  parseWeek,
  timeToMinutes,
  weekIsEmpty,
} from "@/lib/openingHours";

/**
 * Reading the line a human typed into the CMS.
 *
 * No mocks anywhere in this file, because the module under test imports
 * nothing at all — no Payload, no Next, not even node:crypto. That is also why
 * it is the most valuable file in the suite: the date picker, /api/availability,
 * /api/reserve and the seat counting all defer to whatever it says a day's
 * hours are, so a misreading here is wrong in four places at once and visible
 * in none of them.
 */

describe("timeToMinutes", () => {
  it.each([
    ["00:00", 0],
    ["11:00", 660],
    ["19:00", 1140],
    ["19:30", 1170],
    ["23:59", 1439],
  ])("reads %s as %i minutes past midnight", (time, minutes) => {
    expect(timeToMinutes(time)).toBe(minutes);
  });

  // The format is exactly two digits, a colon, two digits, and nothing else on
  // either side. Everything below is a string somebody has genuinely typed
  // into a time field at some point, and every one of them has to be a null
  // rather than a plausible-looking number.
  it.each(["9:30", "24:00", "19:60", "19:0", "", " 19:00", "19:00 ", "half acht"])(
    "refuses %o",
    (time) => {
      expect(timeToMinutes(time)).toBeNull();
    },
  );
});

describe("formatTime", () => {
  it.each([
    [0, "00:00"],
    [1140, "19:00"],
    // Past midnight. A kitchen running to one in the morning is stored as
    // 1500 minutes past this day's midnight, and "25:00" is not a time anybody
    // — or schema.org — reads.
    [1440, "00:00"],
    [1500, "01:00"],
    [1680, "04:00"],
    // The negative branch of the double modulo, which exists so that
    // arithmetic that runs backwards off the start of a day still renders.
    [-30, "23:30"],
  ])("renders %i as %s", (minutes, expected) => {
    expect(formatTime(minutes)).toBe(expected);
  });
});

describe("parseRanges: the separators people actually type", () => {
  const eleventoNine = [{ open: 660, close: 1260 }];

  it.each([
    ["11:00 – 21:00", "en dash"],
    ["11:00-21:00", "hyphen"],
    ["11:00—21:00", "em dash"],
    ["11:00−21:00", "the real minus sign, U+2212"],
    ["11.00-21.00", "dots instead of a colon"],
    ["11 tot 21", "Dutch, no minutes"],
    ["11 to 21", "English"],
    ["11 till 21", "English again"],
    ["11 until 21", "English again"],
    ["11:00 TOT 21:00", "shouted"],
  ])("reads %o (%s)", (line) => {
    expect(parseRanges(line)).toEqual(eleventoNine);
  });

  it.each([null, undefined, ""])("reads %o as no hours at all", (line) => {
    expect(parseRanges(line)).toEqual([]);
  });

  it("reads a split service as two ranges", () => {
    expect(parseRanges("12:00-16:00, 17:00-22:00")).toEqual([
      { open: 720, close: 960 },
      { open: 1020, close: 1320 },
    ]);
  });

  it("sorts by opening time however they were typed", () => {
    expect(parseRanges("17:00-22:00, 12:00-16:00")).toEqual([
      { open: 720, close: 960 },
      { open: 1020, close: 1320 },
    ]);
  });
});

describe("parseRanges: closing after midnight", () => {
  it.each([
    ["17:00 - 01:00", { open: 1020, close: 1500 }],
    ["22:00-02:00", { open: 1320, close: 1560 }],
    // Four in the morning is the cut, and it is inclusive.
    ["20:00 - 04:00", { open: 1200, close: 1680 }],
  ])("keeps %o", (line, range) => {
    expect(parseRanges(line)).toEqual([range]);
  });

  it.each([
    // One minute past the cut: this is somebody who swapped the two ends.
    ["20:00 - 04:01", "a minute past the believable close"],
    ["20:00 - 07:00", "the two ends the wrong way round"],
    // Surprising and deliberate: a café that never shuts is not a thing this
    // one does, and a line saying so is a mistake rather than a Saturday.
    ["11:00 - 11:00", "a twenty-four hour day"],
  ])("refuses %o (%s)", (line) => {
    expect(parseRanges(line)).toEqual([]);
  });
});

/**
 * The ordering rule, which is the subtlest thing in the module and the reason
 * the closed-word regex is not anchored to the whole cell.
 *
 * "Gesloten (vakantie 1-15 juli)" is how a person writes a holiday, and
 * "1-15" really does parse as a time range — so anchoring would have read the
 * explanation as opening hours. What saves it is that the word comes first.
 * And "11:00 – 21:00 (keuken gesloten na 20:00)" is an open day that says how
 * late the kitchen runs, saved by the word coming second.
 */
describe("parseRanges: the word for shut, and where it sits on the line", () => {
  it.each(["Gesloten", "Closed", "Dicht", "GESLOTEN"])("%o is shut", (line) => {
    expect(parseRanges(line)).toEqual([]);
  });

  it("is shut when the word comes before the first time, even with dates after it", () => {
    expect(parseRanges("Gesloten (vakantie 1-15 juli)")).toEqual([]);
    expect(parseRanges("Vandaag gesloten, morgen 11:00 - 21:00")).toEqual([]);
  });

  it("is open when the first time comes before the word", () => {
    expect(parseRanges("11:00 – 21:00 (keuken gesloten na 20:00)")).toEqual([
      { open: 660, close: 1260 },
    ]);
  });

  it("does not fire on the word inside another word", () => {
    // \b does not match inside "Afgesloten", so the terras being shut does not
    // shut the café.
    expect(parseRanges("Afgesloten terras, 11:00-21:00")).toEqual([
      { open: 660, close: 1260 },
    ]);
  });

  it("keeps every range on a line whose first token is a time", () => {
    // Defensible but not obvious, and worth having written down: the word
    // arrives after the first time, so it is read as a remark rather than as
    // the answer — and the "gesloten 16:00-17:00" in the middle contributes a
    // range of its own, so the café is described as open through its own
    // break. The owners are better served by typing "12:00-16:00, 17:00-22:00".
    expect(parseRanges("12:00-16:00, gesloten 16:00-17:00, 17:00-22:00")).toEqual([
      { open: 720, close: 960 },
      { open: 960, close: 1020 },
      { open: 1020, close: 1320 },
    ]);
  });
});

/**
 * TWO KNOWN MISREADINGS, pinned as they behave today rather than as they
 * ought to. Both are reported as findings; neither is fixed here, because a
 * test suite that quietly changed the code it is meant to describe would be
 * the least useful thing in this repository. If either is fixed, this block
 * is the thing that should fail.
 */
describe("parseRanges: current behaviour that is arguably wrong", () => {
  it("TRAP: reads a holiday written the other way round as an opening at one in the morning", () => {
    // "1-15 juli gesloten" — the word comes last, so the ordering rule does
    // not save it, and "1-15" is read as 01:00 to 15:00. The site would tell
    // guests the café opens at one in the morning. The common phrasing,
    // "Gesloten (vakantie 1-15 juli)", is handled correctly above.
    expect(parseRanges("1-15 juli gesloten")).toEqual([{ open: 60, close: 900 }]);
  });

  it("TRAP: reads t/m as no hours at all, so the day shows as closed", () => {
    // "t/m" is the most common Dutch range separator after the dash and is not
    // in the alternation, so this reads as a line with no times on it — which
    // everything downstream treats as shut.
    expect(parseRanges("11:00 t/m 21:00")).toEqual([]);
  });
});

describe("parseRanges: lines with no range in them", () => {
  it("finds nothing in a line that only says when the doors open", () => {
    // Not a bug: there is no closing time to read. src/lib/schedule.ts carries
    // the raw line through as `text` so /api/availability prints "vanaf 17:00"
    // rather than nothing at all.
    expect(parseRanges("vanaf 17:00")).toEqual([]);
  });
});

describe("parseWeek", () => {
  const line = (hours: string) => ({ day: "x", hours });

  it("leaves the rest of the week empty when the CMS holds fewer than seven rows", () => {
    const week = parseWeek([line("11:00-21:00"), line("Gesloten")]);
    expect(week).toHaveLength(7);
    expect(week[0]).toEqual([{ open: 660, close: 1260 }]);
    expect(week.slice(1)).toEqual([[], [], [], [], [], []]);
  });

  it("takes the first seven rows and ignores an eighth", () => {
    const rows = Array.from({ length: 9 }, (_, i) =>
      line(i === 7 ? "09:00-10:00" : "11:00-21:00"),
    );
    const week = parseWeek(rows);
    expect(week).toHaveLength(7);
    expect(week.every((day) => day.length === 1 && day[0].open === 660)).toBe(true);
  });

  it("survives a row whose hours nobody filled in", () => {
    expect(parseWeek([{ day: "Maandag", hours: null as unknown as string }])[0]).toEqual([]);
  });

  it("takes rows by position and not by the day's name", () => {
    // The whole codebase reads these by index, so an owner who retypes the
    // labels in English — or in the wrong order — still gets Monday first.
    const dutchPositions = parseWeek([
      { day: "Monday", hours: "11:00-21:00" },
      { day: "Tuesday", hours: "Gesloten" },
    ]);
    expect(dutchPositions[0]).toEqual([{ open: 660, close: 1260 }]);
    expect(dutchPositions[1]).toEqual([]);
  });

  it.each([null, undefined, []])("reads %o as a week of shut days", (rows) => {
    expect(parseWeek(rows)).toEqual([[], [], [], [], [], [], []]);
  });
});

describe("weekIsEmpty", () => {
  it("is true only when not one day could be read", () => {
    expect(weekIsEmpty([[], [], [], [], [], [], []])).toBe(true);
    // This is the state /api/reserve reads as "there is nothing to enforce",
    // so the difference between all-empty and one-range matters a great deal.
    expect(
      weekIsEmpty([[], [], [], [], [], [{ open: 660, close: 1260 }], []]),
    ).toBe(false);
  });
});

describe("describe", () => {
  it("says nothing about a day with no hours", () => {
    expect(describeRanges([])).toBe("");
  });

  it("uses the en dash, which is what the CMS and the site both print", () => {
    expect(describeRanges([{ open: 660, close: 1260 }])).toBe("11:00 – 21:00");
  });

  it("joins a split day with a comma", () => {
    expect(
      describeRanges([
        { open: 720, close: 960 },
        { open: 1020, close: 1320 },
      ]),
    ).toBe("12:00 – 16:00, 17:00 – 22:00");
  });

  it("shows a past-midnight close as a clock reads it", () => {
    expect(describeRanges([{ open: 1020, close: 1500 }])).toBe("17:00 – 01:00");
  });
});
