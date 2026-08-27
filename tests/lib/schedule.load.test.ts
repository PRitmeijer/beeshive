import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseWeek, weekIsEmpty } from "@/lib/openingHours";
import { loadExceptions, loadSchedule, resolveDay } from "@/lib/schedule";
import { makeFakePayload, type FakePayload } from "../support/fakePayload";
import { settingsFixture, STOCK_WEEK_NL } from "../support/settings";

/**
 * The two functions in src/lib/schedule.ts that talk to the CMS.
 *
 * `vi.hoisted` is what gets a per-test fake into a factory that runs before
 * this file's own top-level code. Declaring the holder at module scope does
 * not work — the factory is hoisted above the declaration — and it is worth
 * knowing that before spending twenty minutes on the resulting
 * "cannot access before initialization".
 */
const shared = vi.hoisted(() => ({
  payload: null as unknown as FakePayload,
  settings: null as unknown as ReturnType<typeof import("../support/settings").settingsFixture>,
  settingsCalls: [] as (string | undefined)[],
}));

vi.mock("@/lib/payload", () => ({
  getPayloadClient: async () => shared.payload,
  getSiteSettings: async (locale?: string) => {
    shared.settingsCalls.push(locale);
    return shared.settings;
  },
}));

beforeEach(() => {
  shared.payload = makeFakePayload();
  shared.settings = settingsFixture("nl");
  shared.settingsCalls = [];
});

describe("loadExceptions", () => {
  it.each([
    ["12-09-2026", "2026-09-14"],
    ["2026-09-12", "2026-9-14"],
    ["", ""],
  ])("answers nothing for %o to %o without asking the database", async (from, to) => {
    // A bad date must not reach Postgres. Asserting the empty answer alone
    // would pass just as well if the query had been made and matched nothing.
    await expect(loadExceptions(from, to)).resolves.toEqual([]);
    expect(shared.payload.calls.find).toHaveLength(0);
  });

  it("asks once for the whole window, widened to either end of the day", async () => {
    await loadExceptions("2026-09-12", "2026-12-11", "en");

    expect(shared.payload.calls.find).toHaveLength(1);
    const call = shared.payload.calls.find[0];
    expect(call.collection).toBe("opening-exceptions");
    expect(call.depth).toBe(0);
    expect(call.pagination).toBe(false);
    expect(call.limit).toBe(400);
    expect(call.locale).toBe("en");
    // The literal strings, because the widening is the point: the rows sit at
    // midday UTC, and a row somebody wrote at midnight before that convention
    // existed still has to be found.
    expect(call.where).toEqual({
      and: [
        { date: { greater_than_equal: "2026-09-12T00:00:00.000Z" } },
        { date: { less_than_equal: "2026-12-11T23:59:59.999Z" } },
      ],
    });
  });

  it("hands the rows back untouched", async () => {
    shared.payload.rows("opening-exceptions").push(
      { id: 1, date: "2026-12-25T12:00:00.000Z", closed: true, note: "Eerste Kerstdag" },
      { id: 2, date: "2027-12-25T12:00:00.000Z", closed: true, note: "buiten het venster" },
    );

    const rows = await loadExceptions("2026-12-01", "2026-12-31");
    expect(rows).toHaveLength(1);
    expect(rows[0].note).toBe("Eerste Kerstdag");
  });

  it("serves the normal week when the collection cannot be read", async () => {
    // Wrong on Christmas Day and right on the other three hundred and sixty
    // four — which is the trade this catch was written to make. It must be
    // loud in the log, though: the two look identical from outside.
    shared.payload = makeFakePayload({ throwOn: ["find"] });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(loadExceptions("2026-12-01", "2026-12-31")).resolves.toEqual([]);
    expect(logged).toHaveBeenCalledOnce();
  });
});

describe("loadSchedule", () => {
  it("does not read the global again when it was handed one", async () => {
    // The homepage renders half of itself out of the same settings object, so
    // a second read of the global here would be a real regression rather than
    // a tidiness point.
    await loadSchedule("2026-09-12", "2026-09-12", "nl", settingsFixture("nl"));
    expect(shared.settingsCalls).toHaveLength(0);
  });

  it("reads the global exactly once, in the asked-for language, when it was not", async () => {
    await loadSchedule("2026-09-12", "2026-09-12", "en");
    expect(shared.settingsCalls).toEqual(["en"]);
  });

  it("builds an empty week from a CMS nobody has filled in", async () => {
    // This is the state /api/reserve reads as "there is nothing to enforce",
    // so it has to arrive as a genuinely empty week rather than as seven days
    // of stock hours.
    const { input } = await loadSchedule(
      "2026-09-12",
      "2026-09-12",
      "nl",
      settingsFixture("nl", { openingHours: [] }),
    );
    expect(weekIsEmpty(input.week)).toBe(true);
    expect(input.weekHours).toEqual([]);
  });

  it("takes the first seven rows and no more", async () => {
    const nine = [...STOCK_WEEK_NL, { day: "Achtste", hours: "09:00-10:00" }, { day: "Negende", hours: "09:00-10:00" }];
    const { input } = await loadSchedule(
      "2026-09-12",
      "2026-09-12",
      "nl",
      settingsFixture("nl", { openingHours: nine }),
    );
    expect(input.week).toHaveLength(7);
    expect(input.weekHours).toHaveLength(7);
    expect(input.week).toEqual(parseWeek(nine));
  });

  it("returns days that agree with resolveDay over the same input", async () => {
    shared.payload.rows("opening-exceptions").push({
      id: 1,
      date: "2026-09-13T12:00:00.000Z",
      hours: "12:00 - 18:00",
      note: "Laatste zondag",
    });

    const { input, days } = await loadSchedule("2026-09-12", "2026-09-14");
    expect(days.map((day) => day.date)).toEqual([
      "2026-09-12",
      "2026-09-13",
      "2026-09-14",
    ]);
    for (const day of days) {
      expect(day).toEqual(resolveDay(day.date, input));
    }
    // And the exception really did come through, so the agreement above is
    // about something rather than about two empty weeks.
    expect(days[1].source).toBe("exception");
    expect(days[1].ranges).toEqual([{ open: 720, close: 1080 }]);
  });

  it("carries the recurring rules out of the settings", async () => {
    const { input } = await loadSchedule(
      "2026-03-29",
      "2026-03-29",
      "nl",
      settingsFixture("nl", {
        recurringOpenings: [
          { ordinal: "last", weekday: "sunday", hours: "12:00 - 20:00", note: "Extra open" },
        ],
      }),
    );
    expect(input.recurring).toHaveLength(1);
    expect(resolveDay("2026-03-29", input).source).toBe("recurring");
  });
});
