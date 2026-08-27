import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addressLines,
  addressOneLine,
  amsterdamInstant,
  appleDirectionsUrl,
  findByToken,
  findResponseByEditKey,
  googleDirectionsUrl,
  GUEST_PASS_STATUSES,
  guestPassIcsPath,
  guestPassUrl,
  hasPassed,
  redactForGuests,
  responseEditKey,
  reviewAskUrl,
  toIcsEvent,
  type ReservationDoc,
} from "@/lib/guestPass";
import { passStage } from "@/lib/guestPassStage";
import { makeFakePayload, type FakePayload, type Row } from "../support/fakePayload";
import { settingsFixture } from "../support/settings";
import { freezeAt } from "../support/time";

/**
 * The one page on this site that shows somebody else's booking to a stranger.
 *
 * It gets away with that because of a single secret — the token in the URL —
 * and two rules that live in this module rather than in the page, so there is
 * exactly one copy of each to get wrong: a reservation is only ever found by
 * its token, and the document never leaves here intact. Both are tested as
 * rules rather than as examples, which is why the redaction test asserts the
 * whole key list rather than picking out the fields it happens to remember.
 */
const shared = vi.hoisted(() => ({ payload: null as unknown as FakePayload }));

vi.mock("@/lib/payload", () => ({
  getPayloadClient: async () => shared.payload,
  getSiteSettings: async () => {
    throw new Error("guestPass.ts is handed its settings, it does not fetch them");
  },
}));

const TOKEN = "abcdefghijklmnopqrstuv"; // twenty-two base64url characters

const doc = (overrides: Partial<ReservationDoc> = {}): ReservationDoc => ({
  id: 1,
  name: "Sanne de Vries",
  email: "sanne@x.nl",
  phone: "0612345678",
  date: "2026-09-19T12:00:00.000Z",
  time: "19:30",
  guests: 4,
  status: "bevestigd",
  guestToken: TOKEN,
  ...overrides,
});

beforeEach(() => {
  shared.payload = makeFakePayload();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("findByToken", () => {
  it.each([
    [null, "nothing"],
    [undefined, "nothing at all"],
    ["", "an empty string"],
    ["short", "too short to be a token"],
    ["x".repeat(65), "longer than any token ever minted"],
    ["has space", "a space"],
    ["tok/en+", "characters base64url does not use"],
  ])("answers null for %o (%s) without querying anything", async (token, _why: string) => {
    // The shape check has to happen before the database, or a malformed token
    // is a query — and a query is a thing an attacker can time.
    await expect(findByToken(token)).resolves.toBeNull();
    expect(shared.payload.calls.find).toHaveLength(0);
  });

  it("looks a valid token up by token, once, and never by id", async () => {
    shared.payload = makeFakePayload({
      reservations: [{ id: 1, guestToken: TOKEN, name: "Sanne" }],
    });
    const found = await findByToken(` ${TOKEN} `);
    expect(found?.name).toBe("Sanne");

    expect(shared.payload.calls.find).toHaveLength(1);
    const call = shared.payload.calls.find[0];
    expect(call.collection).toBe("reservations");
    expect(call.where).toEqual({ guestToken: { equals: TOKEN } });
    expect(call.limit).toBe(1);
    expect(call.depth).toBe(0);
    expect(call.overrideAccess).toBe(true);
    expect(JSON.stringify(call.where)).not.toContain("id");
  });

  it("answers null when the token matches nothing", async () => {
    await expect(findByToken(TOKEN)).resolves.toBeNull();
  });

  it("answers null and says so in the log when the database will not answer", async () => {
    // A page that cannot reach the CMS should say the link does not work
    // rather than fall over — but the two look identical from the outside, so
    // the log entry is the only way anybody finds out which happened.
    shared.payload = makeFakePayload({ throwOn: ["find"] });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(findByToken(TOKEN)).resolves.toBeNull();
    expect(logged).toHaveBeenCalledOnce();
  });
});

describe("redactForGuests: the door", () => {
  it("hands over exactly seven fields and no others", () => {
    /**
     * Written as a whitelist because the function is one. Adding a field to
     * the Reservations collection must not be able to leak it by accident —
     * it should simply not appear until somebody comes here and adds it on
     * purpose, and this assertion is what forces that decision to be made.
     */
    const view = redactForGuests(
      doc({
        notes: "moeder herstelt van chemo",
        guestNote: "de grote tafel bij het raam",
        duration: 150,
        guestResponses: [{ id: "row-1", name: "Jan Jansen", addedAt: "2026-09-01" }],
      } as Partial<ReservationDoc>),
    );

    expect(Object.keys(view).sort()).toEqual([
      "date",
      "firstName",
      "guests",
      "houseNote",
      "responses",
      "status",
      "time",
    ]);
    expect(Object.keys(view.responses[0]).sort()).toEqual([
      "dietary",
      "drinks",
      "name",
      "note",
    ]);
  });

  it("carries none of the booker's private material anywhere in the answer", () => {
    const view = redactForGuests(
      doc({
        notes: "moeder herstelt van chemo",
        guestResponses: [{ id: "row-1", name: "Jan", addedAt: "2026-09-01T10:00:00Z" }],
      } as Partial<ReservationDoc>),
    );
    const serialised = JSON.stringify(view);
    for (const secret of [
      "sanne@x.nl",
      "0612345678",
      "chemo",
      "verjaardag",
      TOKEN,
      "row-1",
      "2026-09-01T10:00:00Z",
    ]) {
      expect(serialised).not.toContain(secret);
    }
    // The surname goes with them; the party already knows which Sanne.
    expect(serialised).not.toContain("de Vries");
  });

  it.each([
    ["Jan-Pieter de Vries", "Jan-Pieter"],
    ["  sanne  ", "sanne"],
    ["", ""],
    [null, ""],
  ])("reduces the name %o to %o", (name, expected) => {
    expect(redactForGuests(doc({ name })).firstName).toBe(expected);
  });

  it("caps a single very long word", () => {
    expect(redactForGuests(doc({ name: "x".repeat(200) })).firstName).toHaveLength(60);
  });

  it("slices the day out of a stored timestamp", () => {
    expect(redactForGuests(doc({ date: "2026-09-19T12:00:00.000Z" })).date).toBe(
      "2026-09-19",
    );
  });

  it.each([
    ["19:30", "19:30"],
    ["7:30", ""],
    ["24:00", ""],
    ["", ""],
    [null, ""],
  ])("renders the time %o as %o", (time, expected) => {
    expect(redactForGuests(doc({ time })).time).toBe(expected);
  });

  it.each([
    [0, null],
    [-1, null],
    [null, null],
    [4.7, 4],
    [4, 4],
  ])("renders %o guests as %o", (guests, expected) => {
    expect(redactForGuests(doc({ guests })).guests).toBe(expected);
  });

  it.each(["onbekend", "", null, undefined])(
    "falls back to nieuw for a status of %o",
    (status) => {
      expect(redactForGuests(doc({ status })).status).toBe("nieuw");
    },
  );

  it("trims the house note, empties whitespace and caps it", () => {
    expect(redactForGuests(doc({ guestNote: "  aan het raam  " })).houseNote).toBe(
      "aan het raam",
    );
    expect(redactForGuests(doc({ guestNote: "   " })).houseNote).toBe("");
    expect(redactForGuests(doc({ guestNote: "x".repeat(900) })).houseNote).toHaveLength(500);
  });

  it("truncates a list of companions at thirty", () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({ name: `Gast${String(i)}` }));
    expect(redactForGuests(doc({ guestResponses: rows })).responses).toHaveLength(30);
  });

  it("drops a companion whose name redacts to nothing", () => {
    // A row the owners emptied by hand in the admin. Showing a blank line
    // would only look broken.
    const view = redactForGuests(
      doc({ guestResponses: [{ name: "   " }, { name: "Jan" }] }),
    );
    expect(view.responses.map((row) => row.name)).toEqual(["Jan"]);
  });

  it("splits the stored comma-joined picks back into a list, capped at twelve", () => {
    const view = redactForGuests(
      doc({
        guestResponses: [
          { name: "Jan", dietary: "a, b,  , c" },
          {
            name: "Els",
            drinks: Array.from({ length: 20 }, (_, i) => `d${String(i)}`).join(", "),
          },
        ],
      }),
    );
    expect(view.responses[0].dietary).toEqual(["a", "b", "c"]);
    expect(view.responses[1].drinks).toHaveLength(12);
  });
});

describe("responseEditKey", () => {
  it.each([null, undefined, ""])("answers null for a row id of %o", (rowId) => {
    expect(responseEditKey({ id: 1 }, rowId)).toBeNull();
  });

  it("is stable for one pair", () => {
    expect(responseEditKey({ id: 1 }, "row-1")).toBe(responseEditKey({ id: 1 }, "row-1"));
  });

  it("differs for the neighbouring row, which is the whole point", () => {
    /**
     * Payload mints BSON ObjectIDs whose last three bytes are a counter, so
     * the answers of one party are consecutive numbers. Handing out the row id
     * as the edit handle meant anybody who had answered once held a valid
     * proof for the row before theirs and the row after it — on a page whose
     * whole audience is a WhatsApp group.
     */
    expect(responseEditKey({ id: 1 }, "row-1")).not.toBe(responseEditKey({ id: 1 }, "row-2"));
  });

  it("differs for the same row on another reservation", () => {
    expect(responseEditKey({ id: 1 }, "row-1")).not.toBe(responseEditKey({ id: 2 }, "row-1"));
  });

  it("changes when the server's secret does", () => {
    const before = responseEditKey({ id: 1 }, "row-1");
    vi.stubEnv("PAYLOAD_SECRET", "a-different-secret");
    expect(responseEditKey({ id: 1 }, "row-1")).not.toBe(before);
  });
});

describe("findResponseByEditKey", () => {
  const rows = [{ id: "row-1", name: "Jan" }, { id: "row-2", name: "Els" }];

  it.each([null, undefined, ""])("answers -1 for a key of %o", (key) => {
    expect(findResponseByEditKey({ id: 1 }, rows, key)).toBe(-1);
  });

  it("finds the row the key was made for", () => {
    expect(findResponseByEditKey({ id: 1 }, rows, responseEditKey({ id: 1 }, "row-2"))).toBe(1);
  });

  it("REGRESSION: refuses a key computed against a different reservation", () => {
    // The vulnerability this replaced an array id to close: one answered guest
    // overwriting their neighbour's row.
    expect(findResponseByEditKey({ id: 1 }, rows, responseEditKey({ id: 2 }, "row-2"))).toBe(
      -1,
    );
  });

  it("skips rows with no id", () => {
    expect(findResponseByEditKey({ id: 1 }, [{ name: "Jan" }], "anything")).toBe(-1);
  });

  it("answers -1 for a key of the wrong length rather than throwing", () => {
    // What the length guard in front of timingSafeEqual is for: that function
    // throws outright on buffers of different sizes.
    expect(() => findResponseByEditKey({ id: 1 }, rows, "short")).not.toThrow();
    expect(findResponseByEditKey({ id: 1 }, rows, "short")).toBe(-1);
  });
});

describe("amsterdamInstant", () => {
  it.each([
    ["2026-09-12", "19:30", "2026-09-12T17:30:00.000Z", "summer, UTC+2"],
    ["2026-01-12", "19:30", "2026-01-12T18:30:00.000Z", "winter, UTC+1"],
  ])("turns %s %s into %s (%s)", (date, time, instant) => {
    expect(amsterdamInstant(date, time)?.toISOString()).toBe(instant);
  });

  it("settles on an instant for a wall clock that never existed", () => {
    // 02:30 on the spring-forward night did not happen. Whatever this returns
    // has to be stable, because an .ics is written once and read a year later:
    // the two-pass offset settle lands it on 03:30 local.
    const settled = amsterdamInstant("2026-03-29", "02:30");
    expect(settled?.toISOString()).toBe("2026-03-29T01:30:00.000Z");
  });

  it("picks the later of the two instants a repeated wall clock covers", () => {
    // 02:30 happened twice on the autumn night. This chooses the second, once
    // the clocks have gone back.
    expect(amsterdamInstant("2026-10-25", "02:30")?.toISOString()).toBe(
      "2026-10-25T01:30:00.000Z",
    );
  });

  it.each([
    ["12-09-2026", "19:30"],
    ["2026-09-12", "7:30"],
    ["2026-09-12", "24:00"],
    ["", ""],
  ])("answers null for %o %o", (date, time) => {
    expect(amsterdamInstant(date, time)).toBeNull();
  });
});

describe("hasPassed", () => {
  const settings = settingsFixture("nl");
  const view = (date: string, time = "19:00") => redactForGuests(doc({ date, time }));

  it("is true for yesterday and false for tomorrow", () => {
    freezeAt("2026-09-19T10:00:00Z");
    expect(hasPassed(view("2026-09-18"), settings)).toBe(true);
    expect(hasPassed(view("2026-09-20"), settings)).toBe(false);
  });

  it("is false for today with no readable time on the row", () => {
    // Late in the evening, but still the 19th in the café: a row whose time
    // the owners emptied has no instant to have passed.
    freezeAt("2026-09-19T20:00:00Z");
    expect(hasPassed(redactForGuests(doc({ date: "2026-09-19", time: null })), settings)).toBe(
      false,
    );
  });

  it("keeps the evening open for the length of the sitting and no longer", () => {
    // 19:00 plus the two-hour default: at 20:59 the table is still theirs, at
    // 21:01 the evening has been and gone.
    freezeAt("2026-09-19T18:59:00Z"); // 20:59 in Amsterdam
    expect(hasPassed(view("2026-09-19"), settings)).toBe(false);
    freezeAt("2026-09-19T19:01:00Z"); // 21:01
    expect(hasPassed(view("2026-09-19"), settings)).toBe(true);
  });

  it("falls back to two hours when the CMS duration is nonsense", () => {
    const short = settingsFixture("nl", { reservationDurationMinutes: 5 });
    freezeAt("2026-09-19T18:59:00Z");
    expect(hasPassed(view("2026-09-19"), short)).toBe(false);
  });

  it.each([
    ["2026-03-29", "2026-03-29T18:59:00Z", "2026-03-29T19:01:00Z"],
    ["2026-10-25", "2026-10-25T19:59:00Z", "2026-10-25T20:01:00Z"],
  ])("holds on both clock-change nights: %s", (date, stillOpen, gone) => {
    freezeAt(stillOpen);
    expect(hasPassed(view(date), settings)).toBe(false);
    freezeAt(gone);
    expect(hasPassed(view(date), settings)).toBe(true);
  });
});

describe("passStage: which of its three faces the page wears", () => {
  /**
   * The reason this is a function at all.
   *
   * It used to be a boolean inside the JSX of GuestPassClient, which meant no
   * test in the suite could reach it: flipping `isPast && !cancelled` to plain
   * `isPast` broke nothing at all, while quietly thanking every party who had
   * rung up to call the evening off. The three lines were pulled out here so
   * that the ordering in them could be held down by something other than the
   * next reader's attention. This block is that something.
   */
  const view = (status: string) => redactForGuests(doc({ status }));

  it("REGRESSION: a cancelled evening whose date has gone by is cancelled, never thanked", () => {
    // The row that is both, and the one sentence this page must never
    // produce. Swap the two lines in passStage() and this is the case that
    // comes back "thanking": both facts are true of it at once, so nothing
    // but the order decides which of them the guest is shown.
    expect(passStage(view("geannuleerd"), true)).toBe("cancelled");
  });

  it.each([
    ["nieuw", false, "upcoming", "asked for, still to come"],
    ["gebeld", false, "upcoming", "rung about, still to come"],
    ["bevestigd", false, "upcoming", "the ordinary evening ahead"],
    ["geannuleerd", false, "cancelled", "called off before the day"],
    ["nieuw", true, "thanking", "never confirmed, but they may well have come"],
    ["gebeld", true, "thanking", "same, and thanks cost nothing"],
    ["bevestigd", true, "thanking", "the evening the whole thank-you is for"],
    ["geannuleerd", true, "cancelled", "called off, and the date since gone"],
  ])("reads %o with isPast=%o as %o (%s)", (status, isPast, stage, _why: string) => {
    expect(passStage(view(status), isPast)).toBe(stage);
  });

  it("thanks nobody whose row says geannuleerd, whichever way the clock has gone", () => {
    for (const isPast of [false, true]) {
      expect(passStage(view("geannuleerd"), isPast)).not.toBe("thanking");
    }
  });

  it("has an answer for every status the collection stores", () => {
    // Written off GUEST_PASS_STATUSES rather than off a list typed out here,
    // so a fifth status added to the collection arrives in this test on its
    // own instead of being quietly left to fall through to "upcoming".
    for (const status of GUEST_PASS_STATUSES) {
      expect(["upcoming", "cancelled", "thanking"]).toContain(
        passStage(view(status), false),
      );
      expect(["upcoming", "cancelled", "thanking"]).toContain(
        passStage(view(status), true),
      );
    }
  });

  it("takes the whole of its timing from the caller and reads no clock itself", () => {
    // The page decides `isPast` on the server, against the café's own clock,
    // and hands it down. A second reading in here would be the hydration
    // mismatch that whole arrangement exists to avoid.
    const evening = redactForGuests(doc({ date: "2026-09-19", time: "19:00" }));
    freezeAt("2027-01-01T12:00:00Z");
    expect(passStage(evening, false)).toBe("upcoming");
  });
});

describe("reviewAskUrl: who is asked for a review, and who is not", () => {
  /**
   * Three rules, and every one of them is the kind of thing that gets quietly
   * inverted a year later by somebody simplifying a condition. They are tested
   * as rules rather than as one happy path: the evening has to be over, the
   * booking has to have been confirmed, and the owners have to have asked for
   * this by filling the field in.
   */
  const LISTING = "https://maps.app.goo.gl/6VEMHL3Jq9vgAWnw8";
  const settings = settingsFixture("nl", { googleReviewUrl: LISTING });
  const view = (status: string) => redactForGuests(doc({ status }));

  it("asks a confirmed party, once their evening has been and gone", () => {
    expect(reviewAskUrl(view("bevestigd"), true, settings)).toBe(LISTING);
  });

  it("says nothing at all while the evening is still ahead of them", () => {
    // The party is on its way, or halfway through the main course. There is
    // nothing to review yet and asking would read as being shown the door.
    expect(reviewAskUrl(view("bevestigd"), false, settings)).toBe("");
  });

  it.each([
    ["nieuw", "a table that may never have been given"],
    ["gebeld", "rung about, but never actually confirmed"],
    ["geannuleerd", "called off, and never to be thanked for anything"],
  ])("holds the ask for a row left at %o (%s)", (status, _why: string) => {
    expect(reviewAskUrl(view(status), true, settings)).toBe("");
  });

  it.each([
    ["", "the owners cleared the field"],
    ["   ", "and this is what clearing it often actually leaves"],
    [null, "the CMS has never been saved"],
    [undefined, "the key is not there at all"],
  ])("draws no block when the URL is %o (%s)", (url, _why: string) => {
    // The field's description in the admin says an empty value means the
    // owners do not want the block. That has to be true here as well as on
    // the contact page, or the setting is a lie.
    const empty = settingsFixture("nl", { googleReviewUrl: url });
    expect(reviewAskUrl(view("bevestigd"), true, empty)).toBe("");
  });

  it("hands back the URL trimmed, as it was pasted", () => {
    const padded = settingsFixture("nl", { googleReviewUrl: ` ${LISTING} ` });
    expect(reviewAskUrl(view("bevestigd"), true, padded)).toBe(LISTING);
  });

  it("takes its timing from hasPassed and keeps none of its own", () => {
    // A party still at the table at half past eight must not be thanked for a
    // visit they are in the middle of, and the one place that decides where
    // the line falls is hasPassed().
    const evening = redactForGuests(doc({ date: "2026-09-19", time: "19:00" }));

    freezeAt("2026-09-19T18:59:00Z"); // 20:59 in Amsterdam: still their table
    expect(reviewAskUrl(evening, hasPassed(evening, settings), settings)).toBe("");

    freezeAt("2026-09-19T19:01:00Z"); // 21:01: the sitting has run out
    expect(reviewAskUrl(evening, hasPassed(evening, settings), settings)).toBe(
      LISTING,
    );
  });

  it("never asks a cancelled party, however long ago the date was", () => {
    freezeAt("2027-01-01T12:00:00Z");
    const off = redactForGuests(doc({ status: "geannuleerd", date: "2026-09-19" }));
    expect(hasPassed(off, settings)).toBe(true);
    expect(reviewAskUrl(off, true, settings)).toBe("");
  });
});

describe("toIcsEvent", () => {
  const settings = settingsFixture("nl");

  it.each([
    [{ guestToken: null }, "no token"],
    [{ date: "kerst" }, "a date nobody can read"],
    [{ time: "half acht" }, "a time nobody can read"],
  ])("answers null for a row with %o (%s)", (overrides, _why: string) => {
    expect(toIcsEvent(doc(overrides as Partial<ReservationDoc>), settings, "nl")).toBeNull();
  });

  it("builds a stable uid out of the token", () => {
    // Stable, so re-adding the event updates the one already in the calendar
    // instead of laying a second one on top of it — and built from the token
    // rather than the row id for the same reason the page never sees the id.
    expect(toIcsEvent(doc(), settings, "nl")?.uid).toBe(`${TOKEN}@debeeshive.nl`);
  });

  it("ends the event at the row's own duration, then the house standard, then two hours", () => {
    const start = amsterdamInstant("2026-09-19", "19:30")!.getTime();
    const minutes = (row: Partial<ReservationDoc>, s = settings) =>
      (toIcsEvent(doc(row), s, "nl")!.end!.getTime() - start) / 60_000;

    expect(minutes({ duration: 150 })).toBe(150);
    expect(minutes({})).toBe(120);
    expect(minutes({}, settingsFixture("nl", { reservationDurationMinutes: 90 }))).toBe(90);
    expect(minutes({ duration: 5 }, settingsFixture("nl", { reservationDurationMinutes: 0 }))).toBe(
      120,
    );
  });

  it("carries the guest-pass link and the house note into the description", () => {
    const event = toIcsEvent(
      doc({ guestNote: "de grote tafel bij het raam" }),
      settings,
      "nl",
    );
    expect(event?.description).toContain(guestPassUrl("nl", TOKEN));
    expect(event?.description).toContain("de grote tafel bij het raam");
    expect(event?.url).toBe(guestPassUrl("nl", TOKEN));
  });

  it("leaks nothing about the booker", () => {
    // A calendar entry outlives the page it came from: it gets synced, shared
    // with a partner's phone, and read a year later. It says no more than the
    // page does.
    const event = toIcsEvent(
      doc({ notes: "moeder herstelt van chemo" } as Partial<ReservationDoc>),
      settings,
      "nl",
    );
    const text = [event?.title, event?.description, event?.location].join(" | ");
    for (const secret of ["de Vries", "sanne@x.nl", "0612345678", "chemo", "verjaardag"]) {
      expect(text).not.toContain(secret);
    }
  });

  it("writes the event in the reader's own language", () => {
    const nl = toIcsEvent(doc(), settings, "nl");
    const en = toIcsEvent(doc(), settings, "en");
    expect(nl?.title).not.toBe(en?.title);
    expect(en?.url).toContain("/en/reservering/");
  });
});

describe("the address, and the two maps links", () => {
  it("prints street, then postcode and place", () => {
    expect(addressLines(settingsFixture("nl"))).toEqual([
      "Sweder van Zuylenweg 56",
      "3553 HG Zuilen, Utrecht",
    ]);
  });

  it("collapses rather than printing blanks when a part is missing", () => {
    const noStreet = settingsFixture("nl", {
      address: { street: "", city: "Utrecht", area: "", postalCode: "", country: "Nederland" },
    });
    expect(addressLines(noStreet)).toEqual(["Utrecht"]);
  });

  it("puts the whole thing on one line for a maps query", () => {
    expect(addressOneLine(settingsFixture("nl"))).toBe(
      "De Bee's Hive, Sweder van Zuylenweg 56, 3553 HG Zuilen, Utrecht, Nederland",
    );
  });

  it("encodes the address exactly once in each link", () => {
    const settings = settingsFixture("nl");
    const encoded = encodeURIComponent(addressOneLine(settings));
    expect(googleDirectionsUrl(settings)).toBe(
      `https://www.google.com/maps/dir/?api=1&destination=${encoded}`,
    );
    expect(appleDirectionsUrl(settings)).toBe(`https://maps.apple.com/?daddr=${encoded}`);
    expect(googleDirectionsUrl(settings)).not.toContain("%25");
  });
});

describe("the shareable addresses", () => {
  it("keeps base64url punctuation intact", () => {
    const punctuated = "ab-cd_ef-gh_ij-klmn";
    expect(guestPassUrl("nl", punctuated)).toBe(
      `https://debeeshive.nl/reservering/${punctuated}`,
    );
  });

  it("puts the English pass under /en", () => {
    expect(guestPassUrl("en", TOKEN)).toBe(`https://debeeshive.nl/en/reservering/${TOKEN}`);
  });

  it("carries the locale into the calendar endpoint", () => {
    expect(guestPassIcsPath("en", TOKEN)).toBe(
      `/api/guest-pass?token=${TOKEN}&locale=en&ics=1`,
    );
  });
});
