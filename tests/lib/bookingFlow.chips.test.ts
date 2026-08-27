import { describe, expect, it } from "vitest";
import {
  dateChips,
  nextOpenAfter,
  openDates,
  relativeDay,
  timesFor,
  type DayFacts,
  type Horizon,
} from "@/lib/bookingFlow";
import { parseRanges, type BookingRules } from "@/lib/openingHours";

/**
 * The three days the accordion offers before anybody opens a calendar.
 *
 * This is the single largest claim the redesign makes — that hiding a
 * thirty-one square grid behind one tap costs most guests nothing, because the
 * day they want is one of three rows above it — and it is the claim that fails
 * silently. A chip that offers a shut Monday is a guest sent to a dead end by
 * the very control that was meant to save them the trouble, and nothing in the
 * browser says so: the page looks right, the tap works, and the answer comes
 * back wrong one screen later.
 *
 * None of the interesting cases can be seen by opening the site either. Today
 * after the last sitting has gone, a fortnight of closures, a day open but full
 * for six and free for two, and the horizon landing mid-week are all states
 * somebody would have to wait for.
 */

const RULES: BookingRules = {
  leadMinutes: 60,
  horizonDays: 90,
  maxPartySize: 20,
  slotMinutes: 15,
  lastSittingMinutes: 60,
};

/** A Tuesday, for no reason except that the café is shut on Mondays. */
const TODAY = "2026-08-25";
const HORIZON: Horizon = { today: TODAY, last: "2026-11-23" };

const OPEN = parseRanges("11:00 – 21:00");
const EVENING = parseRanges("17:00 – 23:00");

const day = (date: string, over: Partial<DayFacts> = {}): DayFacts => ({
  date,
  ranges: OPEN,
  closed: false,
  full: false,
  note: null,
  ...over,
});

/** A fortnight from today, all of it open all day. */
const fortnight = (over: (date: string) => Partial<DayFacts> = () => ({})) =>
  Array.from({ length: 14 }, (_, i) => {
    const date = new Date(Date.parse(`${TODAY}T12:00:00.000Z`) + i * 86_400_000)
      .toISOString()
      .slice(0, 10);
    return day(date, over(date));
  });

describe("openDates", () => {
  it("offers every day the café can take the party", () => {
    expect(openDates(fortnight(), HORIZON, 12 * 60, RULES)).toHaveLength(14);
  });

  it("leaves out the days the owners marked shut", () => {
    const days = fortnight((date) =>
      date === "2026-08-26" ? { closed: true, ranges: [] } : {},
    );
    expect(openDates(days, HORIZON, 12 * 60, RULES)).not.toContain("2026-08-26");
  });

  it("leaves out a day the endpoint says is full for this party", () => {
    // The whole reason `full` is a field of its own: the café is open, the
    // hours are exactly as printed, and there is not a table in it for six.
    const days = fortnight((date) =>
      date === "2026-08-29" ? { full: true } : {},
    );
    expect(openDates(days, HORIZON, 12 * 60, RULES)).not.toContain("2026-08-29");
  });

  it("drops today once its last sitting is inside the lead time", () => {
    // Twenty past eight, an hour's notice wanted, and the last table of a
    // 21:00 close goes at 20:00. Today is over as far as booking goes.
    const open = openDates(fortnight(), HORIZON, 20 * 60 + 20, RULES);
    expect(open[0]).toBe("2026-08-26");
  });

  it("keeps today while there is still a sitting the kitchen can take", () => {
    expect(openDates(fortnight(), HORIZON, 17 * 60, RULES)[0]).toBe(TODAY);
  });

  it("refuses anything past the horizon, inclusive of the horizon itself", () => {
    const days = [day("2026-11-23"), day("2026-11-24")];
    expect(openDates(days, HORIZON, 12 * 60, RULES)).toEqual(["2026-11-23"]);
  });

  it("refuses a day the schedule still carries from before today", () => {
    // A resolved window handed over by a page held in the ISR cache begins at
    // whatever "today" was when it was rendered, which can be last night.
    expect(openDates([day("2026-08-24")], HORIZON, 12 * 60, RULES)).toEqual([]);
  });
});

describe("dateChips", () => {
  it("is the first three open days and no more", () => {
    expect(dateChips(fortnight(), HORIZON, 12 * 60, RULES)).toEqual([
      "2026-08-25",
      "2026-08-26",
      "2026-08-27",
    ]);
  });

  it("slides the next day up when one in the middle is shut", () => {
    const days = fortnight((date) =>
      date === "2026-08-26" ? { closed: true, ranges: [] } : {},
    );
    expect(dateChips(days, HORIZON, 12 * 60, RULES)).toEqual([
      "2026-08-25",
      "2026-08-27",
      "2026-08-28",
    ]);
  });

  it("offers fewer than three rather than inventing one", () => {
    expect(
      dateChips([day(TODAY), day("2026-08-26")], HORIZON, 12 * 60, RULES),
    ).toHaveLength(2);
  });

  it("offers none at all when the whole window is shut", () => {
    const days = fortnight(() => ({ closed: true, ranges: [] }));
    expect(dateChips(days, HORIZON, 12 * 60, RULES)).toEqual([]);
  });

  it("offers none when every day is full for this party", () => {
    // Which is a different sentence from "we are shut", and the band has to be
    // able to tell them apart to say the right one.
    const days = fortnight(() => ({ full: true }));
    expect(dateChips(days, HORIZON, 12 * 60, RULES)).toEqual([]);
  });
});

describe("relativeDay", () => {
  it("calls this evening's remaining sittings tonight", () => {
    const times = timesFor(day(TODAY, { ranges: EVENING }), TODAY, 16 * 60, RULES);
    expect(relativeDay(TODAY, HORIZON, times)).toBe("tonight");
  });

  it("TRAP: says today, not tonight, when what is left is lunch", () => {
    // A café open from eleven has plenty of days whose remaining sittings are
    // the middle of the afternoon, and "Vanavond" over a 12:15 table is the
    // sort of small lie that makes somebody stop believing the rest of it.
    // Eleven o'clock, an hour's notice: the first table left is at noon.
    const times = timesFor(day(TODAY), TODAY, 11 * 60, RULES);
    expect(times[0]).toBe("12:00");
    expect(relativeDay(TODAY, HORIZON, times)).toBe("today");
  });

  it("calls the next day tomorrow", () => {
    expect(relativeDay("2026-08-26", HORIZON, ["19:00"])).toBe("tomorrow");
  });

  it("calls everything after that by its weekday", () => {
    expect(relativeDay("2026-08-27", HORIZON, ["19:00"])).toBe("other");
  });

  it("does not call an empty day tonight for want of a first sitting", () => {
    expect(relativeDay(TODAY, HORIZON, [])).toBe("today");
  });
});

describe("nextOpenAfter", () => {
  it("is the way forward out of every dead end", () => {
    const days = fortnight((date) =>
      date <= "2026-08-28" ? { full: true } : {},
    );
    expect(nextOpenAfter(days, "2026-08-26", HORIZON, 12 * 60, RULES)).toBe(
      "2026-08-29",
    );
  });

  it("is strictly after the day being asked about", () => {
    expect(nextOpenAfter(fortnight(), TODAY, HORIZON, 12 * 60, RULES)).toBe(
      "2026-08-26",
    );
  });

  it("is nothing at all when there is nothing to offer", () => {
    const days = fortnight(() => ({ full: true }));
    expect(nextOpenAfter(days, TODAY, HORIZON, 12 * 60, RULES)).toBeNull();
  });
});
