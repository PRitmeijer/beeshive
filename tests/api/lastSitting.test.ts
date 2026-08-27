import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/reserve/route";
import { GET } from "@/app/api/availability/route";
import {
  dayIn,
  readWindowDays,
  timeAnswer,
  timesFor,
  type Horizon,
} from "@/lib/bookingFlow";
import { dateAfter, resolveBookingRules } from "@/lib/openingHours";
import { makeFakePayload, type FakePayload, type Row } from "../support/fakePayload";
import { settingsFixture } from "../support/settings";
import { freezeAt } from "../support/time";

/**
 * The gap before closing, followed from the CMS field to every place that acts
 * on it.
 *
 * There are tests either side of this one already: src/lib/openingHours.ts is
 * walked minute by minute at every gap in tests/lib/openingHours.slots.test.ts,
 * and `resolveBookingRules` is pinned field by field in
 * tests/lib/openingHours.rules.test.ts. Both prove the library is right about a
 * number it is handed. Neither proves that anybody hands it the number.
 *
 * That distinction is not academic here. The bug this file exists to catch has
 * shipped in this codebase twice — the lead time was honoured by /api/reserve
 * and hard-coded at sixty by the form and by /api/availability, and the spacing
 * of the sittings went the same way — and it is invisible to a library test by
 * construction: every function keeps working perfectly, and the call sites
 * quietly ask them the wrong question. What a guest sees is a form offering
 * 20:00 and an endpoint refusing it, or the reverse, and what the owners see is
 * "er ging iets mis aan onze kant" in an inbox.
 *
 * So every test below is end to end and none of them runs at the shipped hour.
 * The gap is set to NINETY throughout, on a café that closes at 21:00, which
 * moves the last sitting from 20:00 to 19:30 — and 20:00 is therefore the one
 * time that separates "this call site reads the CMS" from "this call site is
 * still using the module constant". Read a failure here as: somebody stopped
 * passing `rules.lastSittingMinutes` at the call site named in the title.
 *
 * The route tests mock exactly one module, src/lib/payload.ts, as the reserve
 * and availability suites do — the schedule resolution and the seat arithmetic
 * underneath run for real, or this would prove only that a stub returns what it
 * was told to. The flow tests take the endpoint's own answer as their input,
 * which is what makes the last group a comparison rather than two assertions.
 */
const shared = vi.hoisted(() => ({
  payload: null as unknown as FakePayload,
  settings: null as unknown as ReturnType<typeof settingsFixture>,
}));

vi.mock("@/lib/payload", () => ({
  getPayloadClient: async () => shared.payload,
  getSiteSettings: async () => shared.settings,
}));

const NOW = "2026-09-12T10:00:00.000Z"; // 12:00 in Amsterdam, a Saturday
const TODAY = "2026-09-12";
const NEXT_SATURDAY = "2026-09-19";

/**
 * A café that serves evenings only, every day, closing at nine.
 *
 * A short day is the point: on the stock week's 11:00 – 21:00 a ninety-minute
 * gap still leaves a wall of thirty-odd sittings, and the one that matters is
 * lost in it. Five in the afternoon until nine at night is eleven sittings on
 * the quarter-hour grid, the last of which is either 19:30 or 20:00 depending
 * entirely on whether the setting arrived.
 */
const EVENING_WEEK = Array.from({ length: 7 }, (_, i) => ({
  day: String(i),
  hours: "17:00 – 21:00",
}));

/** The gap the owners set here, and the one nobody may fall back to. */
const WIDE_GAP = 90;

/** What 17:00 – 21:00 offers at a ninety-minute gap, on the quarter. */
const AT_NINETY = [
  "17:00", "17:15", "17:30", "17:45", "18:00", "18:15",
  "18:30", "18:45", "19:00", "19:15", "19:30",
];

const evening = (overrides: Record<string, unknown> = {}) =>
  settingsFixture("nl", {
    openingHours: EVENING_WEEK,
    reservationLastSittingMinutes: WIDE_GAP,
    ...overrides,
  });

let counter = 0;
let identity = "";
let email = "";

const post = async (overrides: Record<string, unknown> = {}) => {
  const request = new Request("http://localhost/api/reserve", {
    method: "POST",
    body: JSON.stringify({
      name: "Sanne",
      email,
      phone: "0612345678",
      guests: 4,
      date: NEXT_SATURDAY,
      time: "19:30",
      ...overrides,
    }),
    headers: { "x-forwarded-for": identity },
  });
  const response = await POST(request);
  return {
    status: response.status,
    json: (await response.json()) as Record<string, unknown>,
  };
};

const ask = async (query: string) => {
  const request = new NextRequest(`http://localhost/api/availability?${query}`, {
    headers: { "x-forwarded-for": identity },
  });
  const response = await GET(request);
  return { status: response.status, json: (await response.json()) as Row };
};

/** The times /api/availability offers for one day, in order. */
const offered = async (date: string, query = "") =>
  ((await ask(`date=${date}${query}`)).json.slots as { time: string }[]).map(
    (slot) => slot.time,
  );

/**
 * Thirty-eight of the forty chairs, held from five o'clock to half past seven
 * and not one quarter longer.
 *
 * The gap is what this fixture is really about. At ninety minutes the day's
 * last sitting is 19:30, so this booking covers every sitting the café is
 * offering and the room has nothing left. At sixty the day runs on to 20:00,
 * and 19:45 and 20:00 are empty — which is why the seat count is one of the
 * places the gap has to reach. Get it wrong and the endpoint tells a guest to
 * try another time on an evening that has none, instead of telling them to try
 * another day.
 */
const HELD_TILL_HALF_SEVEN = (): FakePayload =>
  makeFakePayload({
    reservations: [
      {
        id: 1,
        date: `${NEXT_SATURDAY}T12:00:00.000Z`,
        time: "17:00",
        guests: 38,
        status: "nieuw",
        duration: 165,
      },
    ],
  });

beforeEach(() => {
  counter += 1;
  identity = `last-sitting-${String(counter)}`;
  email = `gap${String(counter)}@x.nl`;
  shared.payload = makeFakePayload();
  shared.settings = evening();
  freezeAt(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("/api/reserve judges a time by the gap the owners set", () => {
  it("refuses eight o'clock, which the shipped hour would have taken", async () => {
    // The whole finding in one assertion. 20:00 is a perfectly good sitting at
    // a sixty-minute gap and is not one at ninety, so this passes if and only
    // if `isBookable` is being handed `rules.lastSittingMinutes` rather than
    // the module constant. It is a sentence about the time, not a 500: the
    // guest is told the café is not serving then.
    const { status, json } = await post({ time: "20:00" });
    expect(status).toBe(400);
    expect(json).toEqual({ error: "timeOutsideHours" });
    expect(shared.payload.calls.create).toHaveLength(0);
  });

  it("takes half past eight when the owners set a gap NARROWER than the shipped hour", async () => {
    /**
     * The one direction the ninety-minute fixture cannot see.
     *
     * This route asks `isBookable` twice: once for "is that inside the hours"
     * and once, with the lead time folded in, for "has it already gone". At any
     * gap WIDER than the shipped sixty the first call is the tighter of the two,
     * so it refuses everything the second one would have refused and a second
     * call still using the constant is unobservable — a mutation reverting only
     * that second call left the whole suite green.
     *
     * Below sixty the order reverses. At thirty, 20:30 is a sitting the owners
     * have plainly offered; a `timePassed` gate still measuring against the
     * constant makes the last sitting 20:00 and turns that booking away with a
     * sentence about the hour having gone by — on a table four hours in the
     * future, which is not a thing a guest can do anything about.
     *
     * Not today's date, deliberately: with `notBefore` at -1 the lead time
     * cannot account for the refusal, so a failure here is the gap and nothing
     * else.
     */
    shared.settings = evening({ reservationLastSittingMinutes: 30 });
    const { status, json } = await post({ time: "20:30" });
    expect(json).not.toEqual({ error: "timePassed" });
    expect(status).toBe(200);
    expect(shared.payload.calls.create[0].data.time).toBe("20:30");
  });

  it("takes half past seven, which is the last sitting at ninety", async () => {
    // The mirror, and it is not decoration: an endpoint that refused everything
    // after six would satisfy the test above and turn away every booking the
    // café could take. Both ends of the day the owners asked for are pinned.
    const { status } = await post({ time: "19:30" });
    expect(status).toBe(200);
    expect(shared.payload.calls.create[0].data.time).toBe("19:30");
  });

  it("refuses the sitting after the last one, whatever the party", async () => {
    // 19:45 exists on the quarter-hour grid and inside the opening hours, so
    // nothing but the gap can refuse it.
    const { json } = await post({ time: "19:45", guests: 2 });
    expect(json).toEqual({ error: "timeOutsideHours" });
  });

  it("counts the seats over the sittings the gap leaves, not the shipped hour's", async () => {
    /**
     * The third call site in this route, and the one that fails quietly rather
     * than loudly: it decides which of two refusals the guest gets.
     *
     * Every sitting on offer at ninety is held by the party of thirty-eight, so
     * the honest answer is "the whole day has gone" — try another day. Counted
     * against the shipped hour the day appears to run on to 20:00, two empty
     * sittings the form is not offering turn up in the list, and the guest is
     * told to pick another time on this evening instead. They would then look
     * at a time band with nothing in it after 19:30.
     */
    shared.payload = HELD_TILL_HALF_SEVEN();
    const { status, json } = await post({ time: "19:30", guests: 4 });
    expect(status).toBe(409);
    expect(json).toEqual({ error: "dayFull" });
  });

  it("and calls the same evening's refusal a full sitting at the shipped hour", async () => {
    /**
     * The same seats and the same request with the gap left alone, which is
     * what makes the test above a test of the gap and not of the seat count.
     * At sixty the day really does run to 20:00, 19:45 and 20:00 really are
     * free, and "pick another time" is the true answer. Two settings, two
     * different and both correct refusals.
     */
    shared.settings = settingsFixture("nl", { openingHours: EVENING_WEEK });
    shared.payload = HELD_TILL_HALF_SEVEN();
    const { status, json } = await post({ time: "19:30", guests: 4 });
    expect(status).toBe(409);
    expect(json).toEqual({ error: "slotFull" });
  });
});

describe("/api/availability offers by the gap the owners set", () => {
  it("ends the day at half past seven when asked about one date", async () => {
    const times = await offered(NEXT_SATURDAY);
    expect(times).toEqual(AT_NINETY);
    expect(times.at(-1)).toBe("19:30");
    // Named rather than left to the array comparison, because these two are
    // the ones a forgotten argument puts back on the screen.
    expect(times).not.toContain("19:45");
    expect(times).not.toContain("20:00");
  });

  it("still ends today at half past seven, with the lead time on top", async () => {
    // Today is measured from the clock as well as from the gap, and the two are
    // read in the same call. Twelve o'clock plus an hour's notice starts the
    // day at 17:00 anyway on this week, so what is being watched is the far end.
    const times = await offered(TODAY);
    expect(times.at(-1)).toBe("19:30");
  });

  it("marks the window's day full only because the gap ends it at half past seven", async () => {
    /**
     * The window branch answers days rather than times — the calendar draws
     * squares, not chips — so the list it built is visible here only through
     * what it decided about them. Thirty-eight chairs held to half past seven
     * empty a day whose last sitting is 19:30 and leave two sittings in a day
     * whose last is 20:00, so `full` is the list, reported.
     */
    shared.payload = HELD_TILL_HALF_SEVEN();
    const { json } = await ask(
      `from=${NEXT_SATURDAY}&to=${NEXT_SATURDAY}&guests=4`,
    );
    expect((json.days as Row[])[0]).toMatchObject({ full: true, closed: false });
  });

  it("leaves the same day open when the gap is the shipped hour", async () => {
    // The mirror of it, for the same reason as in the route above: without this
    // the assertion is satisfied by a window branch that calls every day full.
    shared.settings = settingsFixture("nl", { openingHours: EVENING_WEEK });
    shared.payload = HELD_TILL_HALF_SEVEN();
    const { json } = await ask(
      `from=${NEXT_SATURDAY}&to=${NEXT_SATURDAY}&guests=4`,
    );
    expect((json.days as Row[])[0]).toMatchObject({ full: false });
  });

  it("empties a day whose whole evening falls inside a gap the owners overdid", async () => {
    /**
     * Ten hours before closing, on a four-hour evening. It is a setting the
     * field accepts and a mistake a person makes once, and the answer is a day
     * with nothing on it rather than a crash — which is what the changelog
     * promises the owners in as many words. Both branches say so: no sittings
     * on the day question, and a square the calendar will not offer on the
     * window one.
     */
    shared.settings = evening({ reservationLastSittingMinutes: 600 });
    expect(await offered(NEXT_SATURDAY)).toEqual([]);

    const { json } = await ask(`from=${NEXT_SATURDAY}&to=${NEXT_SATURDAY}`);
    expect((json.days as Row[])[0]).toMatchObject({
      closed: true,
      // The doors do open: the hours are printed exactly as they were typed,
      // because the café is not shut, it is not taking bookings.
      hours: "17:00 – 21:00",
    });
  });
});

describe("the form and the endpoint describe the same evening", () => {
  /**
   * The comparison the two groups above cannot make on their own.
   *
   * Each of them proves one side reads the CMS. This one proves the two sides
   * agree, and it does it the way the browser does: the window answer comes out
   * of /api/availability, goes through `readWindowDays` exactly as
   * BookingFlow.tsx passes it, and the flow's own arithmetic runs on it with
   * the rules `resolveBookingRules` produced from the same settings. If the
   * form's last chip and the endpoint's last slot are the same string at a gap
   * of ninety, no guest is being offered a table that will be refused.
   */
  const horizon = (): Horizon => ({ today: TODAY, last: dateAfter(TODAY, 90) });
  const NOON = 12 * 60;

  const flowDays = async () => {
    const { json } = await ask(`from=${TODAY}&to=${dateAfter(TODAY, 13)}`);
    return readWindowDays(json.days);
  };

  it("offers the same times in the flow as the endpoint sends", async () => {
    const rules = resolveBookingRules(shared.settings);
    const days = await flowDays();
    const mine = timesFor(dayIn(days, NEXT_SATURDAY), TODAY, NOON, rules);

    expect(mine).toEqual(AT_NINETY);
    expect(mine).toEqual(await offered(NEXT_SATURDAY));
    expect(mine.at(-1)).toBe("19:30");
  });

  it("ends the last band of chips where the endpoint ends the list", async () => {
    // `timeAnswer` is what the time band actually renders, and it groups the
    // times into services with `sittings()` on the way — a second reader of the
    // same number, and one that has been caught disagreeing with the first.
    const rules = resolveBookingRules(shared.settings);
    const answer = timeAnswer(
      NEXT_SATURDAY,
      await flowDays(),
      horizon(),
      NOON,
      rules,
    );
    expect(answer.kind).toBe("times");
    if (answer.kind !== "times") return;
    // One service, headed by the hours themselves, and no stray band of
    // leftovers under a blank line beside it.
    expect(answer.sittings).toHaveLength(1);
    expect(answer.sittings[0].heading).toBe("17:00 – 21:00");
    expect(answer.sittings[0].times).toEqual(AT_NINETY);
  });

  it("agrees with the endpoint about the time the endpoint will refuse", async () => {
    /**
     * The disagreement itself, stated as the property it really is: a time the
     * flow does not offer is a time /api/reserve refuses, and a time the flow
     * offers is one it takes. Walked over the four sittings either side of the
     * boundary, because the boundary is the only place the two can part.
     */
    const rules = resolveBookingRules(shared.settings);
    const days = await flowDays();
    const mine = timesFor(dayIn(days, NEXT_SATURDAY), TODAY, NOON, rules);

    for (const time of ["19:00", "19:15", "19:30", "19:45", "20:00"]) {
      counter += 1;
      identity = `last-sitting-pair-${String(counter)}`;
      email = `pair${String(counter)}@x.nl`;
      const { status } = await post({ time });
      expect([time, mine.includes(time)]).toEqual([time, status === 200]);
    }
  });
});
