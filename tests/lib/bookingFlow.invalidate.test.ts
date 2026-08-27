import { describe, expect, it } from "vitest";
import {
  invalidationFor,
  type DayFacts,
  type Horizon,
} from "@/lib/bookingFlow";
import { parseRanges, type BookingRules } from "@/lib/openingHours";

/**
 * What a change of party size does to an answer already given.
 *
 * The worst remaining moment in the whole flow is somebody who books for two,
 * gets as far as the details screen, comes back and raises it to six. The rule
 * the owners agreed is that nothing is ever wiped in silence and no stale time
 * is ever left on screen, and those two pull in opposite directions: the safe
 * thing is to clear everything, the kind thing is to keep whatever still holds.
 *
 * The three outcomes are the compromise, and they are worth testing rather than
 * eyeballing because getting them wrong is invisible from the outside. Clearing
 * too much is a guest silently sent back two steps. Clearing too little is a
 * booking submitted against a sitting the endpoint has already decided it will
 * refuse — which the guest finds out about after typing their name, their
 * e-mail address and their telephone number.
 *
 * The cause beside the verdict is tested just as hard, and for a reason that is
 * not tidiness. The verdict is what the accordion *does*; the cause is what it
 * *says*, and the sentence is the whole of what a guest who cannot see the
 * screen is told. Six quite different things used to come back as the bare word
 * `clear_both` and the accordion answered all six with "zit vol voor 2
 * personen", so a Tuesday the café is shut was announced as a full house. A
 * cause quietly regressing to the wrong one of the six would put that sentence
 * straight back with nothing visibly broken.
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

const day = (over: Partial<DayFacts> = {}): DayFacts[] => [
  {
    date: SATURDAY,
    ranges: parseRanges("17:00 – 23:00"),
    closed: false,
    full: false,
    note: null,
    ...over,
  },
];

const ask = (
  chosen: { date: string; time: string },
  days: DayFacts[],
  full: string[] = [],
) => invalidationFor(chosen, days, HORIZON, 12 * 60, RULES, new Set(full));

describe("invalidationFor", () => {
  it("keeps a date and a time the new party size can still have", () => {
    expect(ask({ date: SATURDAY, time: "19:00" }, day())).toEqual({
      verdict: "keep",
    });
  });

  it("keeps the date and clears the time when that sitting has gone", () => {
    // Rule two, and the commonest of the three: the evening is still on, one
    // half-hour of it is not, and the guest keeps everything except the half
    // hour. Announced with the party size in it, because for six is the whole
    // reason it changed.
    expect(ask({ date: SATURDAY, time: "19:00" }, day(), ["19:00"])).toEqual({
      verdict: "clear_time",
      cause: "time_taken",
    });
  });

  it("clears both when the day itself has nothing left for the party", () => {
    expect(ask({ date: SATURDAY, time: "19:00" }, day({ full: true }))).toEqual({
      verdict: "clear_both",
      cause: "day_full",
    });
  });

  it("clears both when the day turns out to be shut, and says so", () => {
    // The one that was announced as "vol" for a while, which is a false
    // statement and the only thing a screen-reader guest was told. Nobody
    // booked the tables on a Tuesday the café was never open.
    expect(
      ask({ date: SATURDAY, time: "19:00" }, day({ closed: true, ranges: [] })),
    ).toEqual({ verdict: "clear_both", cause: "day_closed" });
  });

  it("tells an open day with no sittings left apart from a full one", () => {
    // Today, after the last sitting has gone by. The café is open and there is
    // room; there is simply no longer anything to book, and no party size on
    // earth reopens it — so the sentence must not name one.
    expect(
      ask(
        { date: TODAY, time: "19:00" },
        [
          {
            date: TODAY,
            ranges: parseRanges("09:00 – 12:00"),
            closed: false,
            full: false,
            note: null,
          },
        ],
      ),
    ).toEqual({ verdict: "clear_both", cause: "day_over" });
  });

  it("goes on saying that when the window answer calls the same day closed", () => {
    /**
     * /api/availability answers `closed: day.closed || times.length === 0`,
     * deliberately, because the month calendar needs one field to grey a square
     * with — so an evening whose sittings have gone arrives from the wire with
     * `closed` true and its opening hours still in it.
     *
     * Judged on that flag, the spoken line about tonight changed from "we
     * kunnen niets meer aannemen" to "we zijn dicht" the moment the fetch
     * landed, about a day nothing had happened to and a café that was open and
     * serving. It is judged on the hours instead, which are the schedule's own
     * and say the one thing the seat count cannot change. `timeAnswer` reads
     * them the same way, so the sentence heard and the sentence printed are one
     * sentence.
     */
    expect(
      ask(
        { date: TODAY, time: "19:00" },
        [
          {
            date: TODAY,
            ranges: parseRanges("09:00 – 12:00"),
            closed: true,
            full: false,
            note: null,
          },
        ],
      ),
    ).toEqual({ verdict: "clear_both", cause: "day_over" });
  });

  it("clears the time when the new day does not offer that hour at all", () => {
    // Days differ from one another. A Sunday that shuts at six has no half
    // past nine on it, and carrying one over from a Saturday is a booking the
    // endpoint will refuse for `timeOutsideHours`. Not "vol": nobody took it,
    // and it is not going to free up either.
    expect(
      ask(
        { date: SATURDAY, time: "21:30" },
        day({ ranges: parseRanges("12:00 – 18:00") }),
      ),
    ).toEqual({ verdict: "clear_time", cause: "time_outside_hours" });
  });

  it("keeps a date that has no time chosen yet", () => {
    expect(ask({ date: SATURDAY, time: "" }, day())).toEqual({
      verdict: "keep",
    });
  });

  it("keeps everything when nothing has been chosen at all", () => {
    expect(ask({ date: "", time: "" }, day())).toEqual({ verdict: "keep" });
  });

  it("TRAP: keeps the answer while the endpoint has not spoken about the day", () => {
    // The one case where doing nothing is right. A party-size change throws
    // every seat count away and both requests are moments from landing; a
    // function that read "I know nothing about this day" as "this day is no
    // good" would clear the guest's date every single time they nudged the
    // number, before anybody had said anything was wrong with it.
    expect(ask({ date: SATURDAY, time: "19:00" }, [])).toEqual({
      verdict: "keep",
    });
  });

  it("clears both for a day that has fallen behind today", () => {
    // A page held in the ISR cache overnight, opened in the morning.
    expect(ask({ date: "2026-08-24", time: "19:00" }, day())).toEqual({
      verdict: "clear_both",
      cause: "date_past",
    });
  });

  it("clears both for a day past the horizon", () => {
    expect(ask({ date: "2026-12-31", time: "19:00" }, day())).toEqual({
      verdict: "clear_both",
      cause: "beyond_horizon",
    });
  });

  it("TRAP: a day whose every remaining sitting is taken is full, not free-at-another-time", () => {
    /**
     * The day-scope availability answer names every taken half hour rather
     * than raising the day's `full` flag, so the flag can still be false on a
     * day that has nothing left at all. The closed/full/no-times test ran
     * before the taken sittings were looked at and returned `clear_time`,
     * which re-opens the time band on a day with no times in it and tells the
     * guest to pick another one. There is nothing to pick.
     */
    expect(
      ask({ date: SATURDAY, time: "19:00" }, day(), [
        "17:00",
        "17:15",
        "17:30",
        "17:45",
        "18:00",
        "18:15",
        "18:30",
        "18:45",
        "19:00",
        "19:15",
        "19:30",
        "19:45",
        "20:00",
        "20:15",
        "20:30",
        "20:45",
        "21:00",
        "21:15",
        "21:30",
        "21:45",
        "22:00",
      ]),
    ).toEqual({ verdict: "clear_both", cause: "day_full" });
  });

  it("still clears only the time while one sitting on that day survives", () => {
    // The other side of the same boundary: one free half hour is enough for
    // the day to stand, and clearing it as well would send a guest back two
    // steps for a table that is there.
    expect(
      ask({ date: SATURDAY, time: "19:00" }, day(), ["19:00", "19:15"]),
    ).toEqual({ verdict: "clear_time", cause: "time_taken" });
  });
});
