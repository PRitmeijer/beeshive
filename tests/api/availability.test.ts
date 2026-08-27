import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/availability/route";
import { makeFakePayload, type FakePayload, type Row } from "../support/fakePayload";
import { settingsFixture } from "../support/settings";
import { freezeAt } from "../support/time";

/**
 * What the booking form is allowed to ask before anybody fills it in.
 *
 * The same single mock as the reserve tests, for the same reason: the schedule
 * resolution and the seat counting underneath this route are the things being
 * tested, so they run for real against an in-memory database.
 *
 * Every test takes a private rate-limit bucket from a unique
 * `x-forwarded-for`, because the counters in src/lib/apiGuard.ts live for as
 * long as the process does.
 */
const shared = vi.hoisted(() => ({
  payload: null as unknown as FakePayload,
  settings: null as unknown as ReturnType<typeof settingsFixture>,
  settingsCalls: [] as (string | undefined)[],
  fail: false,
}));

vi.mock("@/lib/payload", () => ({
  getPayloadClient: async () => shared.payload,
  getSiteSettings: async (locale?: string) => {
    shared.settingsCalls.push(locale);
    if (shared.fail) throw new Error("site settings unavailable");
    return shared.settings;
  },
}));

const NOW = "2026-09-12T10:00:00.000Z"; // 12:00 in Amsterdam, a Saturday
const TODAY = "2026-09-12";
const NEXT_SATURDAY = "2026-09-19";
const A_TUESDAY = "2026-09-15";

let counter = 0;
let identity = "";

const ask = async (query: string) => {
  const request = new NextRequest(`http://localhost/api/availability?${query}`, {
    headers: { "x-forwarded-for": identity },
  });
  const response = await GET(request);
  return { status: response.status, json: (await response.json()) as Row };
};

const reservationFinds = () =>
  shared.payload.calls.find.filter((call) => call.collection === "reservations");

beforeEach(() => {
  counter += 1;
  identity = `availability-test-${String(counter)}`;
  shared.payload = makeFakePayload();
  shared.settings = settingsFixture("nl");
  shared.settingsCalls = [];
  shared.fail = false;
  freezeAt(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the guards", () => {
  it("allows a hundred and twenty questions and refuses the hundred and twenty-first", async () => {
    // A picker asks every time somebody changes their mind about a date, and
    // one visitor deciding between four Saturdays is not an attack — hence a
    // limit of 120 here where the writing endpoints have five bookings.
    for (let i = 0; i < 120; i += 1) await ask(`date=${NEXT_SATURDAY}`);
    const { status, json } = await ask(`date=${NEXT_SATURDAY}`);
    expect(status).toBe(429);
    expect(json).toEqual({ error: "rateLimited" });
  });

  it.each([
    ["", "no question at all"],
    ["date=2026-9-1", "a malformed date"],
    ["date=morgen", "a word"],
    [`from=${TODAY}`, "a start with no end"],
    [`to=${TODAY}`, "an end with no start"],
    [`from=${NEXT_SATURDAY}&to=${TODAY}`, "the two ends the wrong way round"],
  ])("refuses %o (%s)", async (query) => {
    const { status, json } = await ask(query);
    expect(status).toBe(400);
    expect(json).toEqual({ error: "badRequest" });
  });

  it("answers a window of exactly the horizon and refuses one day more", async () => {
    // The booking sheet on phones asks about every day the owners opened and
    // no fewer, so the cap has to be inclusive.
    const day = (offset: number) =>
      new Date(new Date(`${TODAY}T12:00:00.000Z`).getTime() + offset * 86_400_000)
        .toISOString()
        .slice(0, 10);

    await expect(ask(`from=${TODAY}&to=${day(91)}`)).resolves.toMatchObject({ status: 200 });
    await expect(ask(`from=${TODAY}&to=${day(92)}`)).resolves.toMatchObject({ status: 400 });
  });
});

describe("with online booking switched off", () => {
  it("says so in one field and reads no schedule at all", async () => {
    shared.settings = settingsFixture("nl", { reservationsEnabled: false });
    const { status, json } = await ask(`date=${NEXT_SATURDAY}`);
    expect(status).toBe(200);
    expect(json).toEqual({ reservationsEnabled: false, days: [], slots: [] });
    expect(shared.payload.calls.find).toHaveLength(0);
  });
});

describe("asking about one day", () => {
  it("describes an open day and its sittings", async () => {
    const { status, json } = await ask(`date=${NEXT_SATURDAY}`);
    expect(status).toBe(200);
    expect(json).toMatchObject({
      reservationsEnabled: true,
      date: NEXT_SATURDAY,
      closed: false,
      hours: "11:00 – 21:00",
      full: false,
    });
    const slots = json.slots as { time: string; full: boolean }[];
    // Quarter hours out of the box: eleven to eight, thirty-seven sittings.
    expect(slots).toHaveLength(37);
    expect(slots[0]).toEqual({ time: "11:00", full: false });
    expect(slots[1]).toEqual({ time: "11:15", full: false });
    expect(slots.at(-1)).toEqual({ time: "20:00", full: false });
  });

  it("offers the grid the owners set rather than one of its own", async () => {
    // The setting the whole picker hangs off. It has to reach this route, or
    // the form draws quarter hours from the same CMS while the endpoint counts
    // seats for half hours and the two disagree about what is on offer.
    shared.settings = settingsFixture("nl", { reservationSlotMinutes: "30" });
    const { json } = await ask(`date=${NEXT_SATURDAY}`);
    const slots = json.slots as { time: string; full: boolean }[];
    expect(slots).toHaveLength(19);
    expect(slots.map((slot) => slot.time)).not.toContain("11:15");
    expect(slots.map((slot) => slot.time)).toContain("11:30");
  });

  it("says a Tuesday is shut, with no sittings", async () => {
    const { json } = await ask(`date=${A_TUESDAY}`);
    // The line the owners typed comes back as it was typed, so the page can
    // print "Gesloten" rather than an empty space under the day.
    expect(json).toMatchObject({ closed: true, hours: "Gesloten" });
    expect(json.slots).toEqual([]);
  });

  it("prints the line the owners typed when no range can be read out of it", async () => {
    // "vanaf 17:00" yields no bookable range, so the day is shut for booking —
    // but printing nothing at all reads as an error rather than as an evening
    // service.
    shared.settings = settingsFixture("nl", {
      openingHours: [
        { day: "Maandag", hours: "11:00 – 21:00" },
        { day: "Dinsdag", hours: "vanaf 17:00" },
        { day: "Woensdag", hours: "Gesloten" },
        { day: "Donderdag", hours: "11:00 – 21:00" },
        { day: "Vrijdag", hours: "11:00 – 21:00" },
        { day: "Zaterdag", hours: "11:00 – 21:00" },
        { day: "Zondag", hours: "Gesloten" },
      ],
    });
    const { json } = await ask(`date=${A_TUESDAY}`);
    expect(json).toMatchObject({ closed: true, hours: "vanaf 17:00" });
  });

  it("measures today against the clock and every other day from opening", async () => {
    // 12:00 in the café, an hour of notice: today starts at 13:00 and next
    // Saturday still starts at 11:00.
    const today = await ask(`date=${TODAY}`);
    expect((today.json.slots as Row[])[0]).toEqual({ time: "13:00", full: false });

    const later = await ask(`date=${NEXT_SATURDAY}`);
    expect((later.json.slots as Row[])[0]).toEqual({ time: "11:00", full: false });
  });

  it("marks the day full only when every sitting is", async () => {
    // Half-hour bookings of the whole room, on a day whose sittings are half
    // hours: a two-hour sitting bleeds forward across the ones in between, so
    // these nineteen tables leave nothing for anybody.
    shared.settings = settingsFixture("nl", { reservationSlotMinutes: "30" });
    const slots = [
      "11:00", "11:30", "12:00", "12:30", "13:00", "13:30", "14:00", "14:30",
      "15:00", "15:30", "16:00", "16:30", "17:00", "17:30", "18:00", "18:30",
      "19:00", "19:30", "20:00",
    ];
    shared.payload = makeFakePayload({
      reservations: slots.map((time, i) => ({
        id: i + 1,
        date: `${NEXT_SATURDAY}T12:00:00.000Z`,
        time,
        guests: 40,
        status: "nieuw",
      })),
    });
    const full = await ask(`date=${NEXT_SATURDAY}`);
    expect(full.json.full).toBe(true);

    // Give the evening's seats back and the day is not full any more. It takes
    // four cancellations rather than one because a two-hour sitting bleeds
    // forward over four half hours, so the last slot is held by the tables
    // that started before it as much as by its own.
    for (const row of shared.payload.rows("reservations")) {
      if (String(row.time) >= "18:30") row.status = "geannuleerd";
    }
    const partly = await ask(`date=${NEXT_SATURDAY}`);
    expect(partly.json.full).toBe(false);
  });

  it("asks about the party that is actually booking", async () => {
    // It used to ask about a party of one whoever was booking, so a guest
    // booking for ten was told half past seven was free, was refused by
    // /api/reserve, asked again, and was told the same thing again.
    shared.payload = makeFakePayload({
      reservations: [
        {
          id: 1,
          date: `${NEXT_SATURDAY}T12:00:00.000Z`,
          time: "19:00",
          guests: 38,
          status: "nieuw",
        },
      ],
    });
    const one = await ask(`date=${NEXT_SATURDAY}&guests=1`);
    const ten = await ask(`date=${NEXT_SATURDAY}&guests=10`);
    const at = (json: Row, time: string) =>
      (json.slots as { time: string; full: boolean }[]).find((s) => s.time === time);

    expect(at(one.json, "19:00")?.full).toBe(false);
    expect(at(ten.json, "19:00")?.full).toBe(true);
  });

  it("withholds a note the owners chose not to show", async () => {
    shared.payload.rows("opening-exceptions").push({
      id: 1,
      date: `${NEXT_SATURDAY}T12:00:00.000Z`,
      closed: true,
      note: "Privéfeest",
      showOnSite: false,
    });
    const { json } = await ask(`date=${NEXT_SATURDAY}`);
    // The day still counts as shut — only the wording is held back.
    expect(json).toMatchObject({ closed: true, note: null });
  });

  it("shows a note the owners did choose to show", async () => {
    shared.payload.rows("opening-exceptions").push({
      id: 1,
      date: `${NEXT_SATURDAY}T12:00:00.000Z`,
      hours: "16:00 - 22:00",
      note: "Later open vandaag",
      showOnSite: true,
    });
    const { json } = await ask(`date=${NEXT_SATURDAY}`);
    expect(json).toMatchObject({ note: "Later open vandaag", hours: "16:00 – 22:00" });
  });
});

describe("asking about a window", () => {
  it("answers one entry per day, both ends included", async () => {
    const { json } = await ask(`from=${TODAY}&to=2026-09-15`);
    const days = json.days as Row[];
    expect(days.map((day) => day.date)).toEqual([
      "2026-09-12",
      "2026-09-13",
      "2026-09-14",
      "2026-09-15",
    ]);
    expect(days[1]).toMatchObject({ closed: true }); // Sunday
    expect(days[2]).toMatchObject({ closed: false }); // Monday
  });

  it("calls today closed once its last sitting has gone, though the café is open", async () => {
    // The late-evening case: the doors are open, and there is nothing left to
    // book, which is what a date picker needs to know.
    freezeAt("2026-09-12T18:30:00.000Z"); // 20:30 in the café
    const { json } = await ask(`from=${TODAY}&to=${TODAY}`);
    expect((json.days as Row[])[0]).toMatchObject({
      closed: true,
      // The hours are still printed: the café has not shut, it has stopped
      // taking bookings for tonight.
      hours: "11:00 – 21:00",
    });
  });

  it("spends one reservations query on the whole window", async () => {
    // The promise that keeps the picker from loading by the second.
    await ask(`from=${TODAY}&to=2026-12-11`);
    expect(reservationFinds()).toHaveLength(1);
  });

  it("marks a full day full", async () => {
    shared.payload = makeFakePayload({
      reservations: ["11:00", "13:00", "15:00", "17:00", "19:00"].map((time, i) => ({
        id: i + 1,
        date: `${NEXT_SATURDAY}T12:00:00.000Z`,
        time,
        guests: 40,
        status: "nieuw",
      })),
    });
    const { json } = await ask(`from=${NEXT_SATURDAY}&to=${NEXT_SATURDAY}`);
    expect((json.days as Row[])[0]).toMatchObject({ full: true, closed: false });
  });

  /**
   * The four states the month calendar draws, and the three of them this route
   * is responsible for.
   *
   * The picker greys a day out for one of four reasons and they must not look
   * alike, because a guest acts on them differently: open is pressable, closed
   * means the café is shut, full means it is open and has nothing left for a
   * party this size, and beyond the horizon means the diary is not open that
   * far yet. The last of those is the form's own bound — this endpoint simply
   * refuses a window that reaches past it, which the guards above pin — so what
   * has to come out of one answer here is the other three, told apart.
   */
  describe("the states a calendar draws a day in", () => {
    const bookOut = (date: string) =>
      makeFakePayload({
        reservations: ["11:00", "13:00", "15:00", "17:00", "19:00"].map(
          (time, i) => ({
            id: i + 1,
            date: `${date}T12:00:00.000Z`,
            time,
            guests: 40,
            status: "nieuw",
          }),
        ),
      });

    it("tells open, closed and full apart in one answer", async () => {
      // Saturday the 19th booked solid, Sunday the 20th shut, Monday the 21st
      // ordinary. Three days, three different squares.
      shared.payload = bookOut(NEXT_SATURDAY);
      const { json } = await ask(`from=${NEXT_SATURDAY}&to=2026-09-21`);
      const days = json.days as Row[];
      expect(
        days.map((day) => [day.date, day.closed, day.full]),
      ).toEqual([
        [NEXT_SATURDAY, false, true],
        ["2026-09-20", true, false],
        ["2026-09-21", false, false],
      ]);
    });

    it("never calls a shut day full, whoever is asking", async () => {
      // Telling a guest the café is fully booked on a Sunday it never opens
      // only sends them looking for a table next Sunday.
      const { json } = await ask(`from=2026-09-20&to=2026-09-20&guests=20`);
      expect((json.days as Row[])[0]).toMatchObject({ closed: true, full: false });
    });

    it("answers full for a party the room cannot take and open for one it can", async () => {
      // The same evening, the same seats, two different guests: thirty-eight of
      // the forty chairs are spoken for all day, so the calendar is crossed off
      // for a party of four and open for a pair.
      shared.payload = makeFakePayload({
        reservations: [
          {
            id: 1,
            date: `${NEXT_SATURDAY}T12:00:00.000Z`,
            time: "11:00",
            guests: 38,
            status: "nieuw",
            duration: 600,
          },
        ],
      });
      const pair = await ask(`from=${NEXT_SATURDAY}&to=${NEXT_SATURDAY}&guests=2`);
      const four = await ask(`from=${NEXT_SATURDAY}&to=${NEXT_SATURDAY}&guests=4`);
      expect((pair.json.days as Row[])[0]).toMatchObject({ full: false });
      expect((four.json.days as Row[])[0]).toMatchObject({ full: true });
    });

    it("carries the owners' note for the day it belongs to", async () => {
      // An afwijkende dag saying "Live muziek vanaf 20:00" is very often the
      // whole reason somebody picked that square, so the calendar has to be
      // able to print it beside the date.
      shared.payload.rows("opening-exceptions").push({
        id: 1,
        date: `${NEXT_SATURDAY}T12:00:00.000Z`,
        hours: "16:00 - 22:00",
        note: "Live muziek vanaf 20:00",
        showOnSite: true,
      });
      const { json } = await ask(`from=${NEXT_SATURDAY}&to=${NEXT_SATURDAY}`);
      expect((json.days as Row[])[0]).toMatchObject({
        note: "Live muziek vanaf 20:00",
        closed: false,
      });
    });

    it("draws a month in one query", async () => {
      // What the calendar asks for now: the month it is showing, not the whole
      // quarter. Still one query, because thirty-one round trips to redraw a
      // grid is a picker that stutters every time somebody pages a month.
      await ask(`from=2026-10-01&to=2026-10-31`);
      expect(reservationFinds()).toHaveLength(1);
      expect((await ask(`from=2026-10-01&to=2026-10-31`)).status).toBe(200);
    });
  });

  it("carries the ranges themselves, not only the sentence describing them", async () => {
    // The booking sheet on phones builds its whole date list and every time in
    // it out of this answer, and reading the times back out of "11:00 – 21:00"
    // would be parsing our own prose.
    const { json } = await ask(`from=${NEXT_SATURDAY}&to=${NEXT_SATURDAY}`);
    expect((json.days as Row[])[0].ranges).toEqual([{ open: 660, close: 1260 }]);
  });
});

describe("the language", () => {
  it("reads the CMS and resolves the schedule in the asked-for language", async () => {
    await ask(`date=${NEXT_SATURDAY}&locale=en`);
    expect(shared.settingsCalls).toEqual(["en"]);
    expect(
      shared.payload.calls.find.find((call) => call.collection === "opening-exceptions")?.locale,
    ).toBe("en");
  });

  it("falls back to Dutch for anything else", async () => {
    await ask(`date=${NEXT_SATURDAY}&locale=de`);
    expect(shared.settingsCalls).toEqual(["nl"]);
  });
});

describe("privacy", () => {
  /**
   * Nothing here is secret — the opening hours are on the front page and a
   * slot being full is what a guest would be told on the phone — but that is
   * only true while no name, address, party size or seat count leaves the
   * route. This walks the whole answer rather than checking the fields it
   * happens to remember, so a future addition has to be deliberate.
   */
  const seeded = () =>
    makeFakePayload({
      reservations: [
        {
          id: 1,
          date: `${NEXT_SATURDAY}T12:00:00.000Z`,
          time: "19:00",
          guests: 12,
          status: "nieuw",
          name: "Sanne de Vries",
          email: "sanne@x.nl",
          phone: "0612345678",
          notes: "moeder herstelt van chemo",
        },
      ],
    });

  it.each([
    [`date=${NEXT_SATURDAY}`, "one day"],
    [`from=${TODAY}&to=${NEXT_SATURDAY}`, "a window"],
  ])("says nothing about anybody when asked about %s (%s)", async (query) => {
    shared.payload = seeded();
    const { json } = await ask(query);
    const serialised = JSON.stringify(json);
    for (const secret of ["Sanne", "de Vries", "sanne@x.nl", "0612345678", "chemo"]) {
      expect(serialised).not.toContain(secret);
    }
    // No seat counts either: whether there is room is the whole answer.
    expect(serialised).not.toContain("seatsTaken");
    expect(serialised).not.toContain("seatsLeft");
    expect(serialised).not.toContain("guests");
  });
});

describe("when the CMS cannot be reached", () => {
  it("answers with a code rather than a stack trace", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    shared.fail = true;
    const { status, json } = await ask(`date=${NEXT_SATURDAY}`);
    expect(status).toBe(500);
    expect(json).toEqual({ error: "server" });
    expect(logged).toHaveBeenCalled();
  });
});
