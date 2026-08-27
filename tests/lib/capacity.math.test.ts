import { beforeEach, describe, expect, it, vi } from "vitest";
import { canSeat, dayIsFull, fullDaysBetween, loadForDay } from "@/lib/capacity";
import { makeFakePayload, type FakePayload, type Row } from "../support/fakePayload";

/**
 * Counting the room.
 *
 * The form used to accept everything: fifty people could ask for eight o'clock
 * on the same Saturday and every one of them got the same thank-you page,
 * after which two owners had fifty phone calls to make and a room with forty
 * chairs in it. Everything below is about the arithmetic that stopped that,
 * and about the two refusals it produces — "this sitting is taken" and "the
 * whole day is gone" — which are different sentences to a guest because they
 * are solved by different actions.
 *
 * The mock is a factory, and it must stay one: src/lib/capacity.ts imports
 * getPayloadClient from src/lib/payload.ts, which imports @payload-config, so
 * anything short of replacing the module before it is evaluated would build
 * the whole Payload config to run a sum.
 */
const shared = vi.hoisted(() => ({ payload: null as unknown as FakePayload }));

vi.mock("@/lib/payload", () => ({
  getPayloadClient: async () => shared.payload,
  getSiteSettings: async () => {
    throw new Error("capacity.ts has no business reading the settings");
  },
}));

const DAY = "2026-09-19";

/** A stored reservation, at midday UTC exactly as the collection writes it. */
const booking = (
  time: string | null,
  guests: number | string | null,
  extra: Row = {},
): Row => ({
  id: undefined,
  date: `${DAY}T12:00:00.000Z`,
  time,
  guests,
  status: "nieuw",
  ...extra,
});

const seed = (...rows: Row[]) => {
  shared.payload = makeFakePayload({
    reservations: rows.map((row, i) => ({ ...row, id: 1 + i })),
  });
};

const FULL_DAY_SLOTS = [
  "17:00", "17:30", "18:00", "18:30", "19:00", "19:30",
  "20:00", "20:30", "21:00",
];

beforeEach(() => {
  seed();
});

describe("a table is a sitting rather than a moment", () => {
  it("holds its seats from its own half hour up to the last one it overlaps", async () => {
    seed(booking("19:00", 4));
    const loads = await loadForDay(DAY, {
      capacity: 40,
      durationMinutes: 120,
      slots: ["18:30", "19:00", "19:30", "20:00", "20:30", "21:00"],
    });
    const taken = Object.fromEntries(loads.map((s) => [s.time, s.seatsTaken]));
    expect(taken).toEqual({
      "18:30": 0,
      "19:00": 4,
      "19:30": 4,
      "20:00": 4,
      "20:30": 4,
      "21:00": 0,
    });
  });

  it("puts a party typed in at an odd minute onto the grid, not beside it", async () => {
    /**
     * The case the module's comment says cost them a Saturday. The owners type
     * bookings in by hand, and a party entered at 19:07 whose seats are
     * counted under 19:07 occupies a key nothing else ever reads: the picker
     * asks about 19:00, finds the room empty, and hands out chairs that are
     * already sat in.
     */
    seed(booking("19:07", 8));
    const loads = await loadForDay(DAY, {
      capacity: 40,
      durationMinutes: 120,
      slots: ["18:30", "19:00", "19:30", "20:00", "20:30", "21:00", "21:30"],
    });
    const taken = Object.fromEntries(loads.map((s) => [s.time, s.seatsTaken]));
    expect(taken).toEqual({
      "18:30": 0,
      "19:00": 8,
      "19:30": 8,
      "20:00": 8,
      "20:30": 8,
      "21:00": 8,
      "21:30": 0,
    });
  });
});

describe("how long a sitting lasts", () => {
  const seatsAt = async (rows: Row[], slots: string[], durationMinutes = 120) => {
    seed(...rows);
    const loads = await loadForDay(DAY, { capacity: 40, durationMinutes, slots });
    return Object.fromEntries(loads.map((s) => [s.time, s.seatsTaken]));
  };

  it("prefers the row's own duration when it has one", async () => {
    expect(await seatsAt([booking("19:00", 2, { duration: 60 })], ["19:00", "19:30", "20:00"]))
      .toEqual({ "19:00": 2, "19:30": 2, "20:00": 0 });
  });

  it("holds the slot a table starts in however short its duration says it is", async () => {
    expect(await seatsAt([booking("19:00", 2, { duration: 15 })], ["19:00", "19:30"]))
      .toEqual({ "19:00": 2, "19:30": 0 });
  });

  it.each([0, -30, null, "120"])(
    "falls through to the house standard when the row's duration is %o",
    async (duration) => {
      expect(
        await seatsAt([booking("19:00", 2, { duration })], ["20:30", "21:00"], 120),
      ).toEqual({ "20:30": 2, "21:00": 0 });
    },
  );

  it("falls through again to two hours when the CMS number is missing or nonsense", async () => {
    expect(await seatsAt([booking("19:00", 2)], ["20:30", "21:00"], 0)).toEqual({
      "20:30": 2,
      "21:00": 0,
    });
  });
});

describe("rows that contribute nothing", () => {
  it.each([
    [null, "no time at all"],
    ["", "an empty time"],
    ["19:7", "a time missing a digit"],
    ["24:00", "not a time"],
    ["7:00", "not the stored format"],
  ])("ignores a row whose time is %o (%s)", async (time, _why: string) => {
    seed(booking(time, 30));
    const loads = await loadForDay(DAY, { capacity: 40, durationMinutes: 120, slots: ["19:00"] });
    expect(loads[0].seatsTaken).toBe(0);
  });

  it.each([null, 0, -2, undefined, NaN])("ignores a row of %o guests", async (guests) => {
    seed(booking("19:00", guests as number | null));
    const loads = await loadForDay(DAY, { capacity: 40, durationMinutes: 120, slots: ["19:00"] });
    expect(loads[0].seatsTaken).toBe(0);
  });

  it("SURPRISING: counts a party size stored as a string", async () => {
    // Number("4") is a finite, positive four, so a row whose guests column
    // holds a string still occupies four chairs. Pinned because it is not
    // obvious from reading the code, and because it is the behaviour a hand-
    // edited row or an older import depends on.
    seed(booking("19:00", "4"));
    const loads = await loadForDay(DAY, { capacity: 40, durationMinutes: 120, slots: ["19:00"] });
    expect(loads[0].seatsTaken).toBe(4);
  });
});

describe("a cancelled table gives its seats back", () => {
  it("leaves the room empty", async () => {
    seed(booking("19:00", 40, { status: "geannuleerd" }));
    const loads = await loadForDay(DAY, { capacity: 40, durationMinutes: 120, slots: ["19:00"] });
    expect(loads[0].seatsTaken).toBe(0);
    expect(loads[0].full).toBe(false);
  });

  it("does so because the query says so, not because the fake was kind", async () => {
    // The mechanism as well as the behaviour. A fake that silently ignored the
    // where clause would make the assertion above pass while proving nothing.
    seed(booking("19:00", 4));
    await loadForDay(DAY, { capacity: 40, durationMinutes: 120, slots: ["19:00"] });

    const call = shared.payload.calls.find[0];
    expect(call.collection).toBe("reservations");
    expect(call.overrideAccess).toBe(true);
    expect(call.depth).toBe(0);
    expect(call.where).toEqual({
      and: [
        { date: { greater_than_equal: `${DAY}T00:00:00.000Z` } },
        { date: { less_than_equal: `${DAY}T23:59:59.999Z` } },
        { status: { not_equals: "geannuleerd" } },
      ],
    });
    // Four columns and nothing else: this is the server counting its own
    // chairs, not a page reading anybody's name.
    expect(call.select).toEqual({ date: true, time: true, guests: true, duration: true });
  });
});

describe("party size", () => {
  const opts = (partySize: number) => ({
    capacity: 40,
    durationMinutes: 120,
    slots: ["19:00"],
    partySize,
  });

  it("calls a room with two seats left full for three and not for two", async () => {
    seed(booking("19:00", 38));
    expect((await loadForDay(DAY, opts(2)))[0].full).toBe(false);
    expect((await loadForDay(DAY, opts(3)))[0].full).toBe(true);
  });

  it("calls a full room full even for one", async () => {
    seed(booking("19:00", 40));
    expect((await loadForDay(DAY, opts(1)))[0].full).toBe(true);
  });

  it.each([0, -4, undefined])("reads a party size of %o as one", async (partySize) => {
    seed(booking("19:00", 39));
    const loads = await loadForDay(DAY, {
      capacity: 40,
      durationMinutes: 120,
      slots: ["19:00"],
      partySize: partySize as number,
    });
    expect(loads[0].full).toBe(false);
  });
});

describe("overlapping sittings", () => {
  it("fills only the half hours both parties are in the room for", async () => {
    // Twenty at six and twenty at seven, in a room of forty. Seven and half
    // past seven are gone; six is not, because the second party has not sat
    // down yet, and half past eight is not, because the first has left.
    seed(booking("18:00", 20), booking("19:00", 20));
    const loads = await loadForDay(DAY, {
      capacity: 40,
      durationMinutes: 120,
      slots: ["18:00", "18:30", "19:00", "19:30", "20:00", "20:30"],
      partySize: 1,
    });
    const full = Object.fromEntries(loads.map((s) => [s.time, s.full]));
    expect(full).toEqual({
      "18:00": true,
      "18:30": true,
      "19:00": true,
      "19:30": true,
      "20:00": false,
      "20:30": false,
    });
    const taken = Object.fromEntries(loads.map((s) => [s.time, s.seatsTaken]));
    expect(taken).toEqual({
      "18:00": 20,
      "18:30": 20,
      "19:00": 40,
      "19:30": 40,
      "20:00": 20,
      "20:30": 20,
    });
  });

  it("looks ahead across the whole sitting rather than at one half hour", async () => {
    // 18:00 has twenty seats free and is still no use to a party of thirty,
    // because a sitting starting there runs into 19:00 where there are none.
    seed(booking("19:00", 40));
    const loads = await loadForDay(DAY, {
      capacity: 40,
      durationMinutes: 120,
      slots: ["18:00"],
      partySize: 1,
    });
    expect(loads[0].seatsTaken).toBe(0);
    expect(loads[0].full).toBe(true);
  });
});

describe("canSeat: which of the two refusals it is", () => {
  it("says slotFull while another sitting today would still take them", async () => {
    seed(booking("19:00", 40));
    await expect(
      canSeat(DAY, "19:00", 2, {
        capacity: 40,
        durationMinutes: 120,
        slots: FULL_DAY_SLOTS,
      }),
    ).resolves.toEqual({ ok: false, reason: "slotFull" });
  });

  it("says dayFull when nothing the day offers has room", async () => {
    seed(...FULL_DAY_SLOTS.map((time) => booking(time, 40)));
    await expect(
      canSeat(DAY, "19:00", 2, {
        capacity: 40,
        durationMinutes: 120,
        slots: FULL_DAY_SLOTS,
      }),
    ).resolves.toEqual({ ok: false, reason: "dayFull" });
  });

  it("FINDING: an empty slots list can only ever produce dayFull", async () => {
    // A caller that forgets to pass the day's slots turns every "this sitting
    // is taken" into "we are fully booked for the day" — which sends a guest
    // looking for another date when another time would have done. Pinned as it
    // behaves; reported rather than changed.
    seed(booking("19:00", 40));
    await expect(
      canSeat(DAY, "19:00", 2, { capacity: 40, durationMinutes: 120, slots: [] }),
    ).resolves.toEqual({ ok: false, reason: "dayFull" });
  });

  it("seats a party that fits", async () => {
    seed(booking("19:00", 30));
    await expect(
      canSeat(DAY, "19:00", 10, { capacity: 40, durationMinutes: 120, slots: FULL_DAY_SLOTS }),
    ).resolves.toEqual({ ok: true });
  });

  it.each([0, -1, NaN, undefined])(
    "does not so much as query the database when the capacity is %o",
    async (capacity) => {
      seed(booking("19:00", 400));
      await expect(
        canSeat(DAY, "19:00", 4, {
          capacity: capacity as number,
          durationMinutes: 120,
          slots: FULL_DAY_SLOTS,
        }),
      ).resolves.toEqual({ ok: true });
      expect(shared.payload.calls.find).toHaveLength(0);
    },
  );

  it.each(["19:7", "24:00", "half acht", ""])(
    "fails closed on %o, which is not a time",
    async (time) => {
      // The module's default answer must not be "there is room". The callers
      // that validate the format before asking lose nothing; one that forgets
      // gets a refusal it can see rather than a table nobody counted. Note
      // that "19:07" is NOT one of these — it parses perfectly well, and it is
      // /api/reserve's own grid check that refuses it.
      await expect(
        canSeat(DAY, time, 2, {
          capacity: 40,
          durationMinutes: 120,
          slots: FULL_DAY_SLOTS,
        }),
      ).resolves.toEqual({ ok: false, reason: "slotFull" });
    },
  );

  it("counts an odd minute rather than refusing it", async () => {
    // 19:07 is a time, and canSeat treats it as one: the party is judged
    // against the grid slots their sitting would cover. Refusing an off-grid
    // request is a decision /api/reserve makes for itself, before it ever
    // gets here.
    seed(booking("19:00", 40));
    await expect(
      canSeat(DAY, "19:07", 2, {
        capacity: 40,
        durationMinutes: 120,
        slots: FULL_DAY_SLOTS,
      }),
    ).resolves.toEqual({ ok: false, reason: "slotFull" });
  });

  it("reads a party of nought as a party of one", async () => {
    seed(booking("19:00", 40));
    await expect(
      canSeat(DAY, "19:00", 0, { capacity: 40, durationMinutes: 120, slots: FULL_DAY_SLOTS }),
    ).resolves.toEqual({ ok: false, reason: "slotFull" });
  });

  it("counts nothing and refuses nothing when the database will not answer", async () => {
    // The owners would rather ring one guest back than lose a Saturday's
    // bookings to a database hiccup, so an unreadable day reads as an empty one.
    shared.payload = makeFakePayload({ throwOn: ["find"] });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      canSeat(DAY, "19:00", 4, { capacity: 40, durationMinutes: 120, slots: FULL_DAY_SLOTS }),
    ).resolves.toEqual({ ok: true });
    expect(logged).toHaveBeenCalledOnce();
  });
});

describe("loadForDay", () => {
  it("reports one entry per slot anybody booked when no slots are given", async () => {
    seed(booking("20:00", 2), booking("18:00", 2));
    const loads = await loadForDay(DAY, {
      capacity: 40,
      durationMinutes: 60,
      slotMinutes: 30,
    });
    expect(loads.map((s) => s.time)).toEqual(["18:00", "18:30", "20:00", "20:30"]);
  });

  it("reports them on the grid it was given, not on a grid of its own", async () => {
    // The same two hours, counted at quarters. An hour-long sitting is in the
    // room for four of them rather than two, which is the same stretch of the
    // evening described more finely — and is exactly what stops 19:00 and
    // 19:15 from sharing a bucket and therefore always being full together.
    seed(booking("20:00", 2), booking("18:00", 2));
    const loads = await loadForDay(DAY, {
      capacity: 40,
      durationMinutes: 60,
      slotMinutes: 15,
    });
    expect(loads.map((s) => s.time)).toEqual([
      "18:00", "18:15", "18:30", "18:45",
      "20:00", "20:15", "20:30", "20:45",
    ]);
  });

  it("reports one entry per offered slot when they are given, dropping unreadable ones", async () => {
    const loads = await loadForDay(DAY, {
      capacity: 40,
      durationMinutes: 120,
      slots: ["19:00", "kwart over zeven", "19:30"],
    });
    expect(loads.map((s) => s.time)).toEqual(["19:00", "19:30"]);
  });

  it("FINDING: echoes the capacity as seatsLeft when the owners are not counting", async () => {
    // A configured capacity of nought reports "0 seats left" on an empty room
    // while simultaneously reporting full: false. Nothing renders seatsLeft
    // today, which is the only reason this is harmless. Pinned and reported.
    const loads = await loadForDay(DAY, { capacity: 0, durationMinutes: 120, slots: ["19:00"] });
    expect(loads[0]).toEqual({ time: "19:00", seatsTaken: 0, seatsLeft: 0, full: false });
  });
});

describe("dayIsFull", () => {
  const opts = (slots: string[]) => ({ capacity: 40, durationMinutes: 120, slots });

  it("is true only when every offered slot is full", async () => {
    seed(...FULL_DAY_SLOTS.map((time) => booking(time, 40)));
    await expect(dayIsFull(DAY, opts(FULL_DAY_SLOTS))).resolves.toBe(true);
  });

  it("is false while one slot has room", async () => {
    // Half-hour sittings, so each booking occupies its own slot and nothing
    // else: with a two-hour default every table bleeds four slots forward and
    // filling all but the last would fill the last one too.
    seed(
      ...FULL_DAY_SLOTS.slice(0, -1).map((time) => booking(time, 40, { duration: 30 })),
    );
    await expect(dayIsFull(DAY, opts(FULL_DAY_SLOTS))).resolves.toBe(false);
  });

  it("says a shut day is not a full day", async () => {
    // Telling a guest the café is fully booked on a Tuesday it never opens
    // only sends them looking for a table next Tuesday.
    await expect(dayIsFull(DAY, opts([]))).resolves.toBe(false);
  });

  it("is false when the owners are not counting at all", async () => {
    seed(...FULL_DAY_SLOTS.map((time) => booking(time, 400)));
    await expect(
      dayIsFull(DAY, { capacity: 0, durationMinutes: 120, slots: FULL_DAY_SLOTS }),
    ).resolves.toBe(false);
  });
});

describe("fullDaysBetween", () => {
  const window = (dates: string[], slots = FULL_DAY_SLOTS) =>
    new Map(dates.map((date) => [date, slots]));

  it("spends exactly one query on a whole quarter", async () => {
    // The promise the date picker depends on. Ninety round trips to draw one
    // calendar is a page that loads by the second.
    const dates = Array.from({ length: 90 }, (_, i) =>
      new Date(Date.UTC(2026, 8, 12, 12) + i * 86_400_000).toISOString().slice(0, 10),
    );
    await fullDaysBetween(window(dates), { capacity: 40, durationMinutes: 120 });
    expect(shared.payload.calls.find).toHaveLength(1);
    expect(shared.payload.calls.find[0].where).toEqual({
      and: [
        { date: { greater_than_equal: `${dates[0]}T00:00:00.000Z` } },
        { date: { less_than_equal: `${dates.at(-1)}T23:59:59.999Z` } },
        { status: { not_equals: "geannuleerd" } },
      ],
    });
  });

  it("answers an empty map with an empty set and no query", async () => {
    await expect(
      fullDaysBetween(new Map(), { capacity: 40, durationMinutes: 120 }),
    ).resolves.toEqual(new Set());
    expect(shared.payload.calls.find).toHaveLength(0);
  });

  it("never names a day with no slots, because a shut day is not a full one", async () => {
    seed(...FULL_DAY_SLOTS.map((time) => booking(time, 40)));
    const full = await fullDaysBetween(
      new Map([
        [DAY, FULL_DAY_SLOTS],
        ["2026-09-22", []],
      ]),
      { capacity: 40, durationMinutes: 120 },
    );
    expect(full.has(DAY)).toBe(true);
    expect(full.has("2026-09-22")).toBe(false);
  });

  it("honours the party size", async () => {
    // One long party of thirty-eight across the whole evening, so every slot
    // on offer has exactly two seats left.
    seed(booking("17:00", 38, { duration: 300 }));
    await expect(
      fullDaysBetween(window([DAY]), { capacity: 40, durationMinutes: 120, partySize: 2 }),
    ).resolves.toEqual(new Set());
    await expect(
      fullDaysBetween(window([DAY]), { capacity: 40, durationMinutes: 120, partySize: 4 }),
    ).resolves.toEqual(new Set([DAY]));
  });

  it("FINDING: groups a booking by its UTC day rather than the café's", async () => {
    // The day is read off the first ten characters of the stored timestamp.
    // Rows written by the form sit at midday UTC so it never matters, but a
    // row an owner typed in by hand at half past eleven in the evening lands
    // on the day before as far as this is concerned. Pinned and reported.
    seed({
      id: 1,
      date: "2026-09-19T23:30:00.000Z",
      time: "19:00",
      guests: 40,
      status: "nieuw",
    });
    const full = await fullDaysBetween(window([DAY, "2026-09-20"], ["19:00"]), {
      capacity: 40,
      durationMinutes: 120,
    });
    // In Amsterdam that instant is already the 20th; here it counts against
    // the 19th.
    expect(full.has(DAY)).toBe(true);
    expect(full.has("2026-09-20")).toBe(false);
  });

  it("refuses nothing when the database will not answer", async () => {
    shared.payload = makeFakePayload({ throwOn: ["find"] });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      fullDaysBetween(window([DAY]), { capacity: 40, durationMinutes: 120 }),
    ).resolves.toEqual(new Set());
    expect(logged).toHaveBeenCalledOnce();
  });

  it("does nothing at all when the owners are not counting", async () => {
    await expect(
      fullDaysBetween(window([DAY]), { capacity: 0, durationMinutes: 120 }),
    ).resolves.toEqual(new Set());
    expect(shared.payload.calls.find).toHaveLength(0);
  });
});

/**
 * The grid the seats are counted on, which is a CMS setting now.
 *
 * "Tijdstippen om de" in Site Instellingen decides how far apart the sittings
 * are, and the counting has to walk the same minutes the form is offering. It
 * did not have to before, because there was only one grid; the day it became
 * two, counting in half hours while the form offered quarters would have put
 * 19:00 and 19:15 in one bucket, so the two would have been full together and
 * the spreading the owners asked for would have been counted straight back out.
 */
describe("the grid the counting walks", () => {
  it("tells two quarters of one half hour apart", async () => {
    // Twenty at seven in a room of forty, and a party of twenty-five asking.
    // At quarters, a table at 19:00 is refused and one at 21:00 is free, which
    // is a real answer about a real evening.
    seed(booking("19:00", 20, { duration: 60 }));
    const loads = await loadForDay(DAY, {
      capacity: 40,
      durationMinutes: 60,
      slots: ["19:00", "19:15", "19:30", "19:45", "20:00", "20:15"],
      partySize: 25,
      slotMinutes: 15,
    });
    const taken = Object.fromEntries(loads.map((s) => [s.time, s.seatsTaken]));
    expect(taken).toEqual({
      "19:00": 20,
      "19:15": 20,
      "19:30": 20,
      "19:45": 20,
      "20:00": 0,
      "20:15": 0,
    });
    const full = Object.fromEntries(loads.map((s) => [s.time, s.full]));
    expect(full["19:45"]).toBe(true);
    expect(full["20:00"]).toBe(false);
  });

  it("SAFETY: a booking already stored at half past holds what it always held", async () => {
    /**
     * The property the whole granularity change rests on. Thirty is a multiple
     * of fifteen, so a row written on the old grid sits exactly on the new one,
     * and the seats it occupies are the same seats — counted more finely, over
     * the same stretch of the evening. Nothing was migrated, and this is what
     * says nothing needed to be.
     */
    seed(booking("19:30", 4));
    const halves = await loadForDay(DAY, {
      capacity: 40,
      durationMinutes: 120,
      slots: ["19:00", "19:30", "20:00", "20:30", "21:00", "21:30"],
      slotMinutes: 30,
    });
    const quarters = await loadForDay(DAY, {
      capacity: 40,
      durationMinutes: 120,
      slots: ["19:00", "19:30", "20:00", "20:30", "21:00", "21:30"],
      slotMinutes: 15,
    });
    const at = (loads: typeof halves) =>
      Object.fromEntries(loads.map((s) => [s.time, s.seatsTaken]));
    const expected = {
      "19:00": 0,
      "19:30": 4,
      "20:00": 4,
      "20:30": 4,
      "21:00": 4,
      "21:30": 0,
    };
    expect(at(halves)).toEqual(expected);
    expect(at(quarters)).toEqual(expected);
  });

  it("SAFETY: the old grid still refuses what it always refused", async () => {
    // The same row, asked the question /api/reserve asks. A full house at half
    // past seven is a full house on either grid.
    seed(booking("19:30", 40));
    for (const slotMinutes of [15, 30]) {
      await expect(
        canSeat(DAY, "19:30", 2, {
          capacity: 40,
          durationMinutes: 120,
          slots: FULL_DAY_SLOTS,
          slotMinutes,
        }),
      ).resolves.toEqual({ ok: false, reason: "slotFull" });
    }
  });

  it.each([0, -30, undefined, NaN])(
    "falls back to the module's own grid when handed %o",
    async (slotMinutes) => {
      // A caller with no settings to hand — every test above this block, and
      // anything counting outside a request — gets the shipped default rather
      // than a grid of nought minutes and an endless loop.
      seed(booking("19:00", 4));
      const loads = await loadForDay(DAY, {
        capacity: 40,
        durationMinutes: 60,
        slotMinutes: slotMinutes as number,
      });
      expect(loads.map((s) => s.time)).toEqual([
        "19:00",
        "19:15",
        "19:30",
        "19:45",
      ]);
    },
  );

  it("counts a window on the grid it was given", async () => {
    // fullDaysBetween draws the calendar, so it has to agree with the day
    // question about what "full" means or a day would be crossed off in the
    // month view and open when it was pressed.
    seed(booking("19:00", 40, { duration: 30 }));
    const quarterSlots = ["19:00", "19:15", "19:30"];
    await expect(
      fullDaysBetween(new Map([[DAY, quarterSlots]]), {
        capacity: 40,
        durationMinutes: 30,
        slotMinutes: 15,
      }),
    ).resolves.toEqual(new Set());
    await expect(
      fullDaysBetween(new Map([[DAY, ["19:00"]]]), {
        capacity: 40,
        durationMinutes: 30,
        slotMinutes: 15,
      }),
    ).resolves.toEqual(new Set([DAY]));
  });
});
