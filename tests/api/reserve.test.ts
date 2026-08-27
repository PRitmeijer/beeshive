import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RESERVATION_ERRORS } from "@/lib/reservationErrors";
import { AUTO_CONFIRM, CONFIRMATION_MAIL_RELEASED } from "@/lib/reservationMail";
import { POST } from "@/app/api/reserve/route";
import { makeFakePayload, type FakePayload, type Row } from "../support/fakePayload";
import { settingsFixture } from "../support/settings";
import { freezeAt } from "../support/time";

/**
 * /api/reserve, every branch of it.
 *
 * Exactly ONE module is mocked — src/lib/payload.ts — and everything
 * underneath the route runs for real: the schedule resolution with its
 * exceptions and repeating rules, the seat arithmetic, the rate limiters, the
 * body reader, the guest-pass link. That is the difference between a test that
 * proves this endpoint refuses a Tuesday and a test that proves it calls a
 * function which a stub said returned "closed". Mocking `loadSchedule` or
 * `canSeat` here would make these tests pass forever regardless of what the
 * booking rules actually do, which is the exact failure the owner asked to be
 * protected from.
 *
 * TWO THINGS TO KNOW BEFORE ADDING A TEST.
 *
 * The rate limiters in src/lib/apiGuard.ts keep their counters in module scope
 * for the life of the process, so every test below gets a private bucket from
 * `identity()` — a unique `x-forwarded-for` — and a unique e-mail address,
 * because a stored booking is counted against both. Reuse either and you will
 * get a mysterious 429 in a test about something else entirely.
 *
 * And the clock is frozen for the whole file at midday on Saturday the 12th of
 * September 2026, which the stock CMS week has open. 2026-09-19 is the
 * following Saturday and is what most of these book.
 */
const shared = vi.hoisted(() => ({
  payload: null as unknown as FakePayload,
  settings: null as unknown as ReturnType<typeof settingsFixture>,
  settingsCalls: [] as (string | undefined)[],
}));

vi.mock("@/lib/payload", () => ({
  getPayloadClient: async () => shared.payload,
  getSiteSettings: async (locale?: string) => {
    shared.settingsCalls.push(locale);
    return shared.settings;
  },
}));

const NOW = "2026-09-12T10:00:00.000Z"; // 12:00 in Amsterdam, a Saturday
const TODAY = "2026-09-12";
const NEXT_SATURDAY = "2026-09-19";
const A_TUESDAY = "2026-09-15";

const ALWAYS_OPEN = Array.from({ length: 7 }, (_, i) => ({
  day: String(i),
  hours: "11:00 – 21:00",
}));

let counter = 0;
let identity = "";
let email = "";

const body = (overrides: Record<string, unknown> = {}) => ({
  name: "Sanne",
  email,
  phone: "0612345678",
  guests: 4,
  date: NEXT_SATURDAY,
  time: "19:00",
  ...overrides,
});

const post = async (
  payload: Record<string, unknown> | string | null,
  headers: Record<string, string> = {},
) => {
  const request = new Request("http://localhost/api/reserve", {
    method: "POST",
    body: typeof payload === "string" || payload === null ? payload : JSON.stringify(payload),
    headers: { "x-forwarded-for": identity, ...headers },
  });
  const response = await POST(request);
  return { status: response.status, json: (await response.json()) as Record<string, unknown> };
};

/** A booking already in the database, as the collection would have written it. */
const stored = (overrides: Row = {}): Row => ({
  id: 500,
  email,
  date: `${NEXT_SATURDAY}T12:00:00.000Z`,
  time: "19:00",
  guests: 2,
  status: "nieuw",
  createdAt: NOW,
  guestToken: "storedtokenaaaaaaaaaa",
  ...overrides,
});

beforeEach(() => {
  counter += 1;
  identity = `reserve-test-${String(counter)}`;
  email = `guest${String(counter)}@x.nl`;
  shared.payload = makeFakePayload();
  shared.settings = settingsFixture("nl");
  shared.settingsCalls = [];
  freezeAt(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

const reservationFinds = () =>
  shared.payload.calls.find.filter((call) => call.collection === "reservations");

describe("the guards in front of everything", () => {
  it("refuses the sixty-first attempt from one visitor", async () => {
    // The flood guard counts every request whatever becomes of it, and is set
    // high enough that no real guest can reach it — a guest correcting a typo,
    // being told twice that their time is full and then booking has made four
    // requests, not four attempts at a limit of five.
    for (let i = 0; i < 60; i += 1) await post(body({ name: "" }));
    const { status, json } = await post(body());
    expect(status).toBe(429);
    expect(json).toEqual({ error: "rateLimited" });
  });

  it("refuses an oversized body on the declared length", async () => {
    const { status, json } = await post(body(), { "content-length": "40000" });
    expect(status).toBe(413);
    expect(json).toEqual({ error: "tooLarge" });
  });

  it.each([
    ["not json at all", "something that is not JSON"],
    ["[]", "an array"],
    ["null", "a JSON null"],
  ])("refuses %o (%s)", async (raw) => {
    const { status, json } = await post(raw);
    expect(status).toBe(400);
    expect(json).toEqual({ error: "badRequest" });
  });

  it("refuses a request with no body", async () => {
    const { status, json } = await post(null);
    expect(status).toBe(400);
    expect(json).toEqual({ error: "badRequest" });
  });
});

describe("the switch in the CMS", () => {
  it("refuses everything while online booking is off, and writes nothing", async () => {
    shared.settings = settingsFixture("nl", { reservationsEnabled: false });
    const { status, json } = await post(body());
    expect(status).toBe(503);
    expect(json).toEqual({ error: "reservationsClosed" });
    expect(shared.payload.calls.create).toHaveLength(0);
  });
});

describe("the fields, in the order the form asks for them", () => {
  const refuses = async (overrides: Record<string, unknown>, code: string) => {
    const { status, json } = await post(body(overrides));
    expect(json).toEqual(expect.objectContaining({ error: code }));
    expect(status).toBe(400);
  };

  it.each([
    [{ name: undefined }, "absent"],
    [{ name: "" }, "empty"],
    [{ name: "   " }, "only whitespace"],
    [{ name: 42 }, "not even a string"],
  ])("refuses a name that is %o (%s) with nameRequired", async (overrides, _why: string) => {
    await refuses(overrides, "nameRequired");
  });

  it("refuses a name of a hundred and twenty-one characters", async () => {
    // The route's own `str` slices to max+1 precisely so this check can fire.
    await refuses({ name: "x".repeat(121) }, "nameTooLong");
  });

  it("asks for the phone number before the e-mail address", async () => {
    // The order is the contract the form's field order follows: a guest who
    // left both blank is told about the first empty box, not the second.
    await refuses({ phone: undefined, email: undefined }, "phoneRequired");
  });

  it("refuses a phone number of forty-one characters", async () => {
    await refuses({ phone: "0".repeat(41) }, "phoneTooLong");
  });

  it("refuses a missing e-mail address", async () => {
    await refuses({ email: undefined }, "emailRequired");
  });

  it.each([
    ["nope", "no at sign"],
    ["a@b", "no dot"],
    [`${"x".repeat(200)}@x.nl`, "longer than the column allows"],
  ])("refuses the address %o (%s) as emailInvalid", async (address) => {
    // There is no emailTooLong code, so an over-long address has to come back
    // as invalid rather than as a 500 from the collection.
    await refuses({ email: address }, "emailInvalid");
  });

  it("refuses a note of two thousand and one characters", async () => {
    await refuses({ notes: "x".repeat(2001) }, "notesTooLong");
  });
});

describe("the party size", () => {
  it.each([0, -1, 2.5, "abc", "", null, undefined, 21])(
    "refuses %o with the largest party beside the code",
    async (guests) => {
      const { status, json } = await post(body({ guests }));
      expect(status).toBe(400);
      // The number travels with the refusal because the sentence names it, and
      // the sentence used to name a stale copy of it.
      expect(json).toEqual({ error: "guestsInvalid", max: 20 });
    },
  );

  it("accepts twenty at the boundary, and a number sent as a string", async () => {
    await expect(post(body({ guests: 20 }))).resolves.toMatchObject({ status: 200 });
    expect(shared.payload.calls.create[0].data.guests).toBe(20);

    shared.payload = makeFakePayload();
    const { json } = await post(body({ guests: "4", email: `other${String(counter)}@x.nl` }));
    expect(json.ok).toBe(true);
    expect(shared.payload.calls.create[0].data.guests).toBe(4);
  });

  it("honours a largest party the owners lowered", async () => {
    shared.settings = settingsFixture("nl", { reservationMaxPartySize: 6 });
    const { status, json } = await post(body({ guests: 7 }));
    expect(status).toBe(400);
    expect(json).toEqual({ error: "guestsInvalid", max: 6 });
  });
});

describe("the date", () => {
  it.each([
    [undefined, "absent"],
    ["12-09-2026", "the Dutch way round"],
    ["2026-9-12", "a one-digit month"],
    ["morgen", "a word"],
  ])("refuses %o (%s) with dateRequired", async (date, _why: string) => {
    const { status, json } = await post(body({ date }));
    expect(status).toBe(400);
    expect(json).toEqual({ error: "dateRequired" });
  });

  it("refuses a day that does not exist, caught by the round trip", async () => {
    // 2026-02-31 is a perfectly well-formed string and `new Date` rolls it
    // over into the 3rd of March. Without the round-trip check the booking
    // would be stored on a day nobody asked for.
    const { status, json } = await post(body({ date: "2026-02-31" }));
    expect(status).toBe(400);
    expect(json).toEqual({ error: "dateInvalid" });
  });

  it("refuses a month that does not exist, caught as NaN", async () => {
    const { status, json } = await post(body({ date: "2026-13-01" }));
    expect(status).toBe(400);
    expect(json).toEqual({ error: "dateInvalid" });
  });

  it("refuses yesterday", async () => {
    const { status, json } = await post(body({ date: "2026-09-11" }));
    expect(status).toBe(400);
    expect(json).toEqual({ error: "datePast" });
  });

  it("measures today by the café's clock and not the server's", async () => {
    /**
     * Half past midnight in Amsterdam, still the previous day in UTC. A server
     * reading its own clock would accept a booking for a date that has already
     * begun and refuse one for the date the guest is standing in.
     */
    freezeAt("2026-09-12T22:30:00.000Z");
    shared.settings = settingsFixture("nl", { openingHours: ALWAYS_OPEN });

    const refused = await post(body({ date: "2026-09-12" }));
    expect(refused.json).toEqual({ error: "datePast" });

    const accepted = await post(body({ date: "2026-09-13" }));
    expect(accepted.status).toBe(200);
  });

  it("accepts the last day of the horizon and refuses the first day past it", async () => {
    shared.settings = settingsFixture("nl", { openingHours: ALWAYS_OPEN });
    const day = (offset: number) =>
      new Date(`${TODAY}T12:00:00.000Z`).getTime() + offset * 86_400_000;
    const iso = (offset: number) => new Date(day(offset)).toISOString().slice(0, 10);

    const accepted = await post(body({ date: iso(90) }));
    expect(accepted.status).toBe(200);

    const refused = await post(body({ date: iso(91), email: `far${String(counter)}@x.nl` }));
    expect(refused.status).toBe(400);
    // The number comes back beside the code, because the sentence names it.
    expect(refused.json).toEqual({ error: "dateTooFar", days: 90 });
  });

  it("honours a horizon the owners shortened", async () => {
    shared.settings = settingsFixture("nl", {
      openingHours: ALWAYS_OPEN,
      reservationHorizonDays: 7,
    });
    const { status, json } = await post(body({ date: "2026-09-30" }));
    expect(status).toBe(400);
    expect(json).toEqual({ error: "dateTooFar", days: 7 });
  });
});

describe("the time", () => {
  it.each(["7:00", "19:0", "24:00", "19:60", undefined, "", "half acht"])(
    "refuses %o with timeInvalid",
    async (time) => {
      const { status, json } = await post(body({ time }));
      expect(status).toBe(400);
      expect(json).toEqual({ error: "timeInvalid" });
    },
  );

  it("refuses an off-grid minute even when there are no hours to enforce", async () => {
    /**
     * The regression this endpoint was fixed for. `isBookable` walks the grid,
     * but that call sits behind `enforce`, which is false whenever the seven
     * weekly CMS rows are empty — the state deliberately let through so the
     * owners can sort it out on the phone. On that one path a hand-rolled
     * "19:07" used to walk past every check here, reach payload.create, and be
     * thrown out by the field's own validate as a 500 for the guest and a
     * stack trace for the owners, over a typo in a time.
     */
    shared.settings = settingsFixture("nl", { openingHours: [] });
    const { status, json } = await post(body({ time: "19:07", date: A_TUESDAY }));
    expect(status).toBe(400);
    expect(json).toEqual({ error: "timeInvalid" });
    expect(shared.payload.calls.create).toHaveLength(0);
  });

  it("refuses an off-grid minute on the ordinary path too", async () => {
    const { json } = await post(body({ time: "19:07" }));
    expect(json).toEqual({ error: "timeInvalid" });
  });

  /**
   * The grid is a CMS setting, and this is the endpoint half of it.
   *
   * Four places have to agree about which minutes exist, or the form offers a
   * table this route then refuses: the form's own list, `isBookable` as this
   * route calls it, the check a few lines above it that runs before any
   * schedule is resolved, and the `time` field in the Reservations collection.
   * The collection accepts the finest grid the CMS can be set to, because a
   * field validator cannot read the global; the tighter of the two is enforced
   * here, against the same number the form drew its times from.
   */
  describe("the grid the owners set", () => {
    it("takes a quarter past when the sittings are quarter hours", async () => {
      const { status } = await post(body({ time: "19:15" }));
      expect(status).toBe(200);
      expect(shared.payload.calls.create[0].data.time).toBe("19:15");
    });

    it("refuses the same quarter past when they are half hours", async () => {
      shared.settings = settingsFixture("nl", { reservationSlotMinutes: "30" });
      const { status, json } = await post(body({ time: "19:15" }));
      expect(status).toBe(400);
      expect(json).toEqual({ error: "timeInvalid" });
      expect(shared.payload.calls.create).toHaveLength(0);
    });

    it("refuses it before the schedule is even consulted", async () => {
      // The path with no hours to enforce, which is where a hand-rolled time
      // used to walk past every check and be thrown out by payload.create as a
      // 500. The grid is judged on its own, on every path.
      shared.settings = settingsFixture("nl", {
        openingHours: [],
        reservationSlotMinutes: "30",
      });
      const { status, json } = await post(
        body({ time: "19:15", date: A_TUESDAY }),
      );
      expect(status).toBe(400);
      expect(json).toEqual({ error: "timeInvalid" });
      expect(shared.payload.calls.create).toHaveLength(0);
    });

    it.each(["19:00", "19:30"])(
      "takes %o whichever grid the owners have chosen",
      async (time) => {
        // The subset property, at the endpoint. Half hours are a strict subset
        // of quarter hours, which is why moving the setting needed no data
        // migration: every time already in the diary is still a time this
        // route accepts.
        for (const slot of ["15", "30"]) {
          shared.settings = settingsFixture("nl", {
            reservationSlotMinutes: slot,
          });
          const { status } = await post(
            body({ time, email: `grid${slot}-${String(counter)}@x.nl` }),
          );
          expect(status).toBe(200);
        }
      },
    );
  });
});

describe("the day the doors are shut", () => {
  it("refuses a Tuesday against the stock week", async () => {
    const { status, json } = await post(body({ date: A_TUESDAY }));
    expect(status).toBe(400);
    expect(json).toEqual({ error: "dayClosed" });
  });

  it("refuses a day a repeating rule closed", async () => {
    shared.settings = settingsFixture("nl", {
      recurringOpenings: [
        { ordinal: "third", weekday: "saturday", closed: true, note: "Elke derde zaterdag dicht" },
      ],
    });
    const { json } = await post(body({ date: NEXT_SATURDAY }));
    expect(json).toEqual({ error: "dayClosed" });
  });

  it("refuses a day an exception closed, which proves the exceptions are consulted", async () => {
    shared.payload.rows("opening-exceptions").push({
      id: 1,
      date: `${NEXT_SATURDAY}T12:00:00.000Z`,
      closed: true,
      note: "Privéfeest",
    });
    const { json } = await post(body({ date: NEXT_SATURDAY }));
    expect(json).toEqual({ error: "dayClosed" });
  });

  it("accepts a Sunday a repeating rule opened", async () => {
    // The whole reason the schedule module exists: "elke laatste zondag van de
    // maand zijn we open" used to live in a note the site could not read, so
    // the form refused the date on the day they were standing behind the bar.
    shared.settings = settingsFixture("nl", {
      recurringOpenings: [
        { ordinal: "last", weekday: "sunday", hours: "12:00 - 20:00", note: "Extra open" },
      ],
    });
    const { status } = await post(body({ date: "2026-09-27", time: "17:00" }));
    expect(status).toBe(200);
  });
});

describe("the time the café is not serving", () => {
  it("refuses an hour before the doors open", async () => {
    const { json } = await post(body({ time: "10:00" }));
    expect(json).toEqual({ error: "timeOutsideHours" });
  });

  it("refuses a sitting inside the hours but past the last one", async () => {
    // Nobody books a table for the minute the lights go off.
    const { json } = await post(body({ time: "20:30" }));
    expect(json).toEqual({ error: "timeOutsideHours" });
  });
});

describe("the lead time", () => {
  it("refuses a table too soon from now and accepts the next one", async () => {
    // The clock is at 12:00 in the café. With an hour of notice a table at
    // 12:30 is a phone call and one at 13:00 is a booking.
    freezeAt("2026-09-12T10:00:00.000Z");
    const refused = await post(body({ date: TODAY, time: "12:30" }));
    expect(refused.json).toEqual({ error: "timePassed" });

    const accepted = await post(body({ date: TODAY, time: "13:00" }));
    expect(accepted.status).toBe(200);
  });

  it("honours a lead time the owners removed entirely", async () => {
    // Nought is a setting they can and do choose, and a sanitiser that treated
    // it as missing quietly gave them back the hour they had just removed.
    shared.settings = settingsFixture("nl", { reservationLeadMinutes: 0 });
    const { status } = await post(body({ date: TODAY, time: "12:30" }));
    expect(status).toBe(200);
  });

  it("honours a lead time the owners lengthened", async () => {
    shared.settings = settingsFixture("nl", { reservationLeadMinutes: 240 });
    const { json } = await post(body({ date: TODAY, time: "15:30" }));
    expect(json).toEqual({ error: "timePassed" });
  });
});

describe("the seats", () => {
  const at = (time: string, guests: number, id: number): Row => ({
    id,
    date: `${NEXT_SATURDAY}T12:00:00.000Z`,
    time,
    guests,
    status: "nieuw",
    createdAt: "2026-01-01T00:00:00.000Z",
  });

  it("says slotFull while another sitting that evening would take them", async () => {
    shared.payload = makeFakePayload({ reservations: [at("19:00", 40, 1)] });
    const { status, json } = await post(body({ guests: 2 }));
    expect(status).toBe(409);
    expect(json).toEqual({ error: "slotFull" });
  });

  it("says dayFull when nothing the day still offers has room", async () => {
    const everySlot = [
      "11:00", "11:30", "12:00", "12:30", "13:00", "13:30", "14:00", "14:30",
      "15:00", "15:30", "16:00", "16:30", "17:00", "17:30", "18:00", "18:30",
      "19:00", "19:30", "20:00",
    ];
    shared.payload = makeFakePayload({
      reservations: everySlot.map((time, i) => at(time, 40, i + 1)),
    });
    const { status, json } = await post(body({ guests: 2 }));
    expect(status).toBe(409);
    expect(json).toEqual({ error: "dayFull" });
  });

  it("judges today against the slots that are still to come", async () => {
    /**
     * Only the past sittings have room, so a guest asking about a full evening
     * is told the DAY is gone rather than being sent to a lunchtime that has
     * already been and gone. This is what proves the route passes
     * slotsFor(ranges, notBefore) rather than the whole day's grid.
     */
    freezeAt("2026-09-12T15:00:00.000Z"); // 17:00 in the café
    const evening = ["18:00", "18:30", "19:00", "19:30", "20:00"];
    shared.payload = makeFakePayload({
      reservations: evening.map((time, i) => ({
        id: i + 1,
        date: `${TODAY}T12:00:00.000Z`,
        time,
        guests: 40,
        status: "nieuw",
        createdAt: "2026-01-01T00:00:00.000Z",
      })),
    });
    const { status, json } = await post(body({ date: TODAY, time: "19:00", guests: 2 }));
    expect(status).toBe(409);
    expect(json).toEqual({ error: "dayFull" });
  });

  it("does not count the room at all when the owners set no capacity", async () => {
    shared.settings = settingsFixture("nl", { reservationCapacity: 0 });
    shared.payload = makeFakePayload({ reservations: [at("19:00", 400, 1)] });
    const { status } = await post(body());
    expect(status).toBe(200);
    // One reservations query rather than two: the duplicate check is always
    // made, the seat count is not.
    expect(reservationFinds()).toHaveLength(1);
  });

  it("gives a cancelled party's seats back", async () => {
    shared.payload = makeFakePayload({
      reservations: [at("19:00", 40, 1)].map((row) => ({ ...row, status: "geannuleerd" })),
    });
    const { status } = await post(body({ guests: 4 }));
    expect(status).toBe(200);
  });
});

/**
 * The two throttles that are counted at the write rather than at the door.
 *
 * `ATTEMPTS`, tested at the top of this file, stands in front of the body
 * reader and counts every request whatever becomes of it. These two are the
 * other kind: they sit past every refusal, so a guest who mistypes an address,
 * is told their sitting is full and then dithers past the lead time has spent
 * nothing at all. That is the promise, and it is the reason they are counted
 * where they are.
 *
 * The address is the second key because the first one is weak here: Dutch
 * mobile puts thousands of subscribers behind one carrier NAT address, so an IP
 * bucket sized for a household is shared by a town.
 *
 * Both are exercised by driving them, because until this block existed nothing
 * did: the whole rateLimitAll call could be deleted and every test in this file
 * still passed.
 */
describe("the throttles on a booking that succeeds", () => {
  it("takes five bookings from one address and refuses the sixth", async () => {
    // Five different sittings, so the duplicate guard reads them as five
    // bookings rather than one pressed repeatedly.
    for (const time of ["19:00", "19:15", "19:30", "19:45", "20:00"]) {
      const { status } = await post(body({ time }));
      expect(status).toBe(200);
    }
    expect(shared.payload.calls.create).toHaveLength(5);

    const sixth = await post(body({ time: "18:00" }));
    expect(sixth.status).toBe(429);
    expect(sixth.json).toEqual({ error: "rateLimited" });
    // Refused before the row was written, not after: a booking that answers
    // 429 and stores a table anyway is the worst of both.
    expect(shared.payload.calls.create).toHaveLength(5);
  });

  it("counts Anne@ and anne@ as one address", async () => {
    // The bucket is lower-cased so a guest cannot have five more bookings by
    // holding shift. What is stored is untouched — see the booking tests.
    for (const time of ["19:00", "19:15", "19:30", "19:45", "20:00"]) {
      await post(body({ time, email: email.toUpperCase() }));
    }
    const sixth = await post(body({ time: "18:00" }));
    expect(sixth.status).toBe(429);
  });

  it("takes ten bookings from one address block and refuses the eleventh", async () => {
    // Ten different guests behind one carrier NAT address, each well inside
    // their own per-address five, so it is the IP bucket and nothing else that
    // answers on the eleventh. Tables for two, so eleven of them are twenty-two
    // of the forty chairs and the seat count has nothing to say about any of
    // them — at four apiece the eleventh comes back 409 for want of a seat and
    // this test proves nothing about throttling at all.
    for (let i = 0; i < 10; i += 1) {
      const { status } = await post(
        body({ guests: 2, email: `party${String(i)}-${String(counter)}@x.nl` }),
      );
      expect(status).toBe(200);
    }
    expect(shared.payload.calls.create).toHaveLength(10);

    const eleventh = await post(
      body({ guests: 2, email: `party10-${String(counter)}@x.nl` }),
    );
    expect(eleventh.status).toBe(429);
    expect(eleventh.json).toEqual({ error: "rateLimited" });
    expect(shared.payload.calls.create).toHaveLength(10);
  });

  it("charges a guest nothing for a booking that was refused", async () => {
    /**
     * The whole reason these two are counted here and not at the door. Five
     * refusals — a party too large, a shut Tuesday, a time off the grid, a
     * date in the past and a missing name — and the sixth request, the one
     * that is actually a booking, still goes through.
     */
    await post(body({ guests: 99 }));
    await post(body({ date: A_TUESDAY }));
    await post(body({ time: "19:07" }));
    await post(body({ date: "2020-01-01" }));
    await post(body({ name: "" }));
    expect(shared.payload.calls.create).toHaveLength(0);

    const { status } = await post(body());
    expect(status).toBe(200);
  });

  it("does not spend the address bucket on a guest the e-mail bucket refuses", async () => {
    /**
     * The bug the two buckets were folded into one `rateLimitAll` call for.
     * They used to be asked one after the other with `||`, and passing a bucket
     * is what records in it — so a guest already at their per-address limit had
     * spent one of the ten IP slots before the address bucket refused them, on
     * that attempt and on every further one. Ten refusals of one guest also
     * emptied the shared bucket for everybody else behind the same carrier NAT.
     */
    for (const time of ["19:00", "19:15", "19:30", "19:45", "20:00"]) {
      await post(body({ time }));
    }
    // Four more from the same address, every one of them refused.
    for (const time of ["18:00", "18:15", "18:30", "18:45"]) {
      expect((await post(body({ time }))).status).toBe(429);
    }
    // Somebody else behind the same address block. Five bookings have been
    // written from this IP, so there are five of the ten left — and there would
    // have been one if the refusals above had been recorded against it.
    for (let i = 0; i < 5; i += 1) {
      const { status } = await post(
        body({ email: `neighbour${String(i)}-${String(counter)}@x.nl` }),
      );
      expect(status).toBe(200);
    }
  });
});

describe("the same booking sent twice", () => {
  it("answers the second press with the first booking rather than writing another", async () => {
    /**
     * A phone on 4G in the café's basement submits at 19:58, the row is
     * written, and the answer is lost on the way back. The guest presses the
     * button again — which used to leave the owners with two tables for eight
     * on Saturday at eight and sixteen of forty seats taken by one party.
     */
    shared.payload = makeFakePayload({ reservations: [stored()] });
    const { status, json } = await post(body());
    expect(status).toBe(200);
    expect(json).toEqual({
      ok: true,
      guestPassUrl: "https://debeeshive.nl/reservering/storedtokenaaaaaaaaaa",
    });
    expect(shared.payload.calls.create).toHaveLength(0);
  });

  it("ignores the party size when deciding it is the same booking", async () => {
    // The same address at the same table at the same hour is one booking
    // whether they said six or eight.
    shared.payload = makeFakePayload({ reservations: [stored({ guests: 8 })] });
    const { json } = await post(body({ guests: 2 }));
    expect(json.ok).toBe(true);
    expect(shared.payload.calls.create).toHaveLength(0);
  });

  it("writes a second row once the window has passed", async () => {
    shared.payload = makeFakePayload({
      reservations: [stored({ createdAt: "2026-09-12T09:30:00.000Z" })],
    });
    const { status } = await post(body());
    expect(status).toBe(200);
    expect(shared.payload.calls.create).toHaveLength(1);
  });

  it("does not read a cancelled row as the same booking", async () => {
    shared.payload = makeFakePayload({ reservations: [stored({ status: "geannuleerd" })] });
    await post(body());
    expect(shared.payload.calls.create).toHaveLength(1);
  });

  it("is asked before the seats are counted", async () => {
    /**
     * Deliberately in front of the seat count, because the first request's own
     * seats are already in the room: for a party that nearly fills the place,
     * checking the chairs first would answer the second press with "dat
     * tijdstip is helaas vol" — about a table they have got.
     */
    shared.settings = settingsFixture("nl", { reservationCapacity: 20 });
    shared.payload = makeFakePayload({ reservations: [stored({ guests: 20 })] });
    const { status, json } = await post(body({ guests: 20 }));
    expect(status).toBe(200);
    expect(json.ok).toBe(true);
  });

  it("writes the booking anyway when the lookup fails", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const real = shared.payload.find;
    let seen = 0;
    shared.payload.find = async (args: Row) => {
      seen += 1;
      // The exceptions read comes first; make only the duplicate check fail.
      if (args.collection === "reservations" && seen > 1) throw new Error("no");
      return real.call(shared.payload, args);
    };
    const { status } = await post(body());
    expect(status).toBe(200);
    expect(logged).toHaveBeenCalled();
  });
});

describe("the honeypot", () => {
  it("answers as though it worked, writes nothing, and hands over no link", async () => {
    /**
     * A field no human ever sees. The 200 is so a bot cannot tell a swallowed
     * submission from a stored one — and the guest pass link is deliberately
     * absent, because nothing was written, so there is no token to build one
     * from and minting one anyway would hand a spam robot a live page
     * belonging to nobody.
     */
    const { status, json } = await post(body({ website: "https://cheap-pills.example" }));
    expect(status).toBe(200);
    expect(json).toEqual({ ok: true });
    expect("guestPassUrl" in json).toBe(false);
    expect(shared.payload.calls.create).toHaveLength(0);
  });
});

describe("a booking that goes through", () => {
  it("answers with the guest's own link", async () => {
    const { status, json } = await post(body());
    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    expect(String(json.guestPassUrl)).toMatch(
      /^https:\/\/debeeshive\.nl\/reservering\/[A-Za-z0-9_-]{16,64}$/,
    );
  });

  it("assembles the document field by field, and lets nothing else in", async () => {
    /**
     * The security test. The document is never spread from the request body,
     * so a caller cannot smuggle in a status, a source, a token or an id — and
     * the assertion is on the whole key list rather than on the fields this
     * test happens to remember, so a future `...input` would fail it.
     */
    await post(
      body({
        status: "bevestigd",
        source: "admin",
        guestToken: "attacker-chosen-token",
        emailStatus: "sent",
        id: 1,
        createdAt: "2020-01-01T00:00:00.000Z",
        confirmationEmailStatus: "sent",
      }),
    );

    const data = shared.payload.calls.create[0].data;
    expect(Object.keys(data).sort()).toEqual([
      "date",
      "email",
      "emailStatus",
      "guests",
      "locale",
      "name",
      "notes",
      "phone",
      "source",
      "status",
      "time",
    ]);
    expect(data.status).toBe("nieuw");
    expect(data.source).toBe("website");
    expect(data.emailStatus).toBe("pending");
    expect(data.id).toBeUndefined();
    expect(data.guestToken).toBeUndefined();
  });

  it("stores the day at midday UTC", async () => {
    // A day-only field must not slide to the day before or after when it is
    // rendered in another timezone.
    await post(body());
    expect(shared.payload.calls.create[0].data.date).toBe(`${NEXT_SATURDAY}T12:00:00.000Z`);
  });

  it("stores an empty note as absent rather than as an empty string", async () => {
    await post(body({ notes: "   " }));
    expect(shared.payload.calls.create[0].data.notes).toBeUndefined();
  });

  it("ignores a retired occasion sent by an old cached bundle", async () => {
    // "Gelegenheid" was dropped once it was clear no guest had ever filled it
    // in. A browser still holding the bundle that asked can go on sending it;
    // the value is neither stored nor refused, which is the quietest of the
    // three possible answers and the only one that costs the guest nothing.
    const { status } = await post(body({ occasion: "verjaardag" }));
    expect(status).toBe(200);
    expect(shared.payload.calls.create[0].data.occasion).toBeUndefined();
  });

  it("trims and keeps a note that was written", async () => {
    await post(body({ notes: "  geen vis, graag een kinderstoel  " }));
    expect(shared.payload.calls.create[0].data.notes).toBe(
      "geen vis, graag een kinderstoel",
    );
  });
});

describe("the language the form was filled in in", () => {
  it("stores en for an English booking and hands back an English link", async () => {
    /**
     * It used to be resolved here, spent on the link and then thrown away, so
     * every row arrived as Nederlands: an English party got a Dutch
     * confirmation with a Dutch link unless an owner remembered to change the
     * field before pressing Bevestigd — and by then the request that knew the
     * answer is long gone.
     */
    const { json } = await post(body({ locale: "en" }));
    expect(shared.payload.calls.create[0].data.locale).toBe("en");
    expect(String(json.guestPassUrl)).toContain("/en/reservering/");
  });

  it.each(["de", "", undefined, "EN", 42])(
    "falls back to Dutch for a locale of %o",
    async (locale) => {
      const { json } = await post(body({ locale }));
      expect(shared.payload.calls.create[0].data.locale).toBe("nl");
      expect(String(json.guestPassUrl)).not.toContain("/en/");
    },
  );
});

describe("when the confirmation goes out", () => {
  const created = () => shared.payload.calls.create[0];

  it("leaves the create untouched in approval, which is the default", async () => {
    await post(body());
    expect(created().data.status).toBe("nieuw");
    expect(created().data.confirmationEmailStatus).toBeUndefined();
    expect(created().context).toBeUndefined();
  });

  it("leaves the create untouched with the mail switched off entirely", async () => {
    shared.settings = settingsFixture("nl", { reservationConfirmationMode: "off" });
    await post(body());
    expect(created().data.status).toBe("nieuw");
    expect(created().data.confirmationEmailStatus).toBeUndefined();
    expect(created().context).toBeUndefined();
  });

  /**
   * Both halves of the release switch are tested, and exactly one of them runs.
   *
   * The confirmation mail is finished and deliberately held back — see
   * CONFIRMATION_MAIL_RELEASED — so today the second of these is the live one.
   * Writing the first as a skip rather than deleting it is the whole point: the
   * day the constant is flipped, the behaviour it guards is already covered,
   * and nobody has to remember what auto was supposed to do. Flip it and this
   * pair swaps over on its own.
   */
  it.runIf(CONFIRMATION_MAIL_RELEASED)("confirms the row AND arms the confirmation in auto", async () => {
    /**
     * The two have to move together. The confirmation opens "Het is rond. We
     * houden een tafel voor jullie vrij" — send that while the admin still
     * lists the request as untouched and the guest is holding a promise nobody
     * in the building has made. Worse, the shared guest page renders the
     * status, so the party would open the link in that mail and read "Nieuw"
     * underneath it.
     */
    shared.settings = settingsFixture("nl", { reservationConfirmationMode: "auto" });
    await post(body());
    expect(created().data.status).toBe("bevestigd");
    expect(created().data.confirmationEmailStatus).toBe("pending");
    // The flag is what lets the status past the field's own beforeChange hook,
    // which otherwise stores "nieuw" on every create whatever was submitted.
    expect(created().context).toEqual({ [AUTO_CONFIRM]: true });
  });

  it.skipIf(CONFIRMATION_MAIL_RELEASED)("ignores auto entirely while the mail is held back", async () => {
    // The setting is hidden in the admin, but hiding a field does not stop a
    // value already stored in the global from being read — so the hold has to
    // bite in the code, not in the interface. A café whose settings row still
    // says "auto" must take bookings exactly as one on "approval" does.
    shared.settings = settingsFixture("nl", { reservationConfirmationMode: "auto" });
    await post(body());
    expect(created().data.status).toBe("nieuw");
    expect(created().data.confirmationEmailStatus).toBeUndefined();
    expect(created().context).toBeUndefined();
  });

  it("falls back to approval for a mode nobody recognises", async () => {
    shared.settings = settingsFixture("nl", { reservationConfirmationMode: "automatisch" });
    await post(body());
    expect(created().data.status).toBe("nieuw");
  });
});

describe("the guest pass switch", () => {
  it("hands over no link at all when the pass is off", async () => {
    // Absent rather than null: the form reads absent as "say nothing", which
    // leaves the success screen exactly as it was before any of this.
    shared.settings = settingsFixture("nl", { guestPassEnabled: false });
    const { status, json } = await post(body());
    expect(status).toBe(200);
    expect(json).toEqual({ ok: true });
    expect("guestPassUrl" in json).toBe(false);
  });

  it("survives a created document that somehow has no token", async () => {
    shared.payload.create = async (args: Row) => ({ id: 1, ...(args.data as Row) });
    const { status, json } = await post(body());
    expect(status).toBe(200);
    expect(json).toEqual({ ok: true });
  });
});

describe("the escape hatch for a CMS nobody has filled in", () => {
  it("accepts a Tuesday when there are no hours to enforce", async () => {
    // Enforcing hours nobody typed would refuse every request, so when there
    // is nothing to enforce and no rule or exception spoke about this day, the
    // request is taken and the owners sort it out on the phone.
    shared.settings = settingsFixture("nl", { openingHours: [] });
    const { status } = await post(body({ date: A_TUESDAY }));
    expect(status).toBe(200);
  });

  it("switches enforcement back on the moment an exception speaks about the day", async () => {
    shared.settings = settingsFixture("nl", { openingHours: [] });
    shared.payload.rows("opening-exceptions").push({
      id: 1,
      date: `${A_TUESDAY}T12:00:00.000Z`,
      closed: true,
      note: "Dicht",
    });
    const { status, json } = await post(body({ date: A_TUESDAY }));
    expect(status).toBe(400);
    expect(json).toEqual({ error: "dayClosed" });
  });
});

describe("when the write itself fails", () => {
  it("answers with the code and nothing of the exception", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    shared.payload.create = async () => {
      throw new Error("connection to the database was reset by peer");
    };
    const { status, json } = await post(body());
    expect(status).toBe(500);
    expect(json).toEqual({ error: "server" });
    expect(JSON.stringify(json)).not.toContain("reset by peer");
    expect(logged).toHaveBeenCalled();
  });
});

describe("every refusal this endpoint can make", () => {
  it("answers with a code the browser has wording for", async () => {
    /**
     * The list in src/lib/reservationErrors.ts is the specification, and each
     * of its codes is provoked by at least one test above. This one is the
     * belt: whatever comes back from any of them, it is a code the dictionary
     * can say — a refusal with a code the form does not know is an empty red
     * box in front of somebody trying to book a table.
     */
    const answers = await Promise.all([
      post("not json"),
      post(body({ name: "" })),
      post(body({ guests: 0 })),
      post(body({ date: "2026-02-31" })),
      post(body({ time: "19:07" })),
      post(body({ date: A_TUESDAY })),
    ]);
    for (const { json } of answers) {
      expect(RESERVATION_ERRORS).toContain(json.error);
    }
  });
});
