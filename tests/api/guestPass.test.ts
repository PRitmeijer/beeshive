import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/guest-pass/route";
import { MAX_GUEST_RESPONSES, responseEditKey } from "@/lib/guestPass";
import { SKIP_OUTBOUND_EMAIL } from "@/lib/outboundEmail";
import { makeFakePayload, type FakePayload, type Row } from "../support/fakePayload";
import { settingsFixture } from "../support/settings";
import { freezeAt } from "../support/time";

/**
 * The two things the guest pass needs a server for: the calendar file, and one
 * companion's answer.
 *
 * Both are authorised by the token and nothing else. There is no login here
 * and there never will be — asking a table of ten to make an account is how a
 * nice idea dies — so most of what is asserted below is about how narrow the
 * write is: which fields it touches, which it cannot, and what a guest holding
 * one valid handle is and is not allowed to do with it.
 */
const shared = vi.hoisted(() => ({
  payload: null as unknown as FakePayload,
  settings: null as unknown as ReturnType<typeof settingsFixture>,
}));

vi.mock("@/lib/payload", () => ({
  getPayloadClient: async () => shared.payload,
  getSiteSettings: async (locale?: string) => shared.settings,
}));

const NOW = "2026-09-12T10:00:00.000Z";
const TOKEN = "abcdefghijklmnopqrstuv";

let counter = 0;
let identity = "";

const reservation = (overrides: Row = {}): Row => ({
  id: 1,
  name: "Sanne de Vries",
  email: "sanne@x.nl",
  phone: "0612345678",
  notes: "moeder herstelt van chemo",
  date: "2026-09-19T12:00:00.000Z",
  time: "19:30",
  guests: 6,
  status: "bevestigd",
  guestToken: TOKEN,
  guestNote: "de grote tafel bij het raam",
  guestResponses: [],
  ...overrides,
});

const get = async (query: string) => {
  const response = await GET(
    new Request(`http://localhost/api/guest-pass?${query}`, {
      headers: { "x-forwarded-for": identity },
    }),
  );
  return response;
};

const post = async (payload: Record<string, unknown> | string, headers: Record<string, string> = {}) => {
  const response = await POST(
    new Request("http://localhost/api/guest-pass", {
      method: "POST",
      body: typeof payload === "string" ? payload : JSON.stringify(payload),
      headers: { "x-forwarded-for": identity, ...headers },
    }),
  );
  return { response, status: response.status, json: (await response.json()) as Row };
};

const rows = () => shared.payload.rows("reservations")[0].guestResponses as Row[];

beforeEach(() => {
  counter += 1;
  identity = `guest-pass-test-${String(counter)}`;
  shared.payload = makeFakePayload({ reservations: [reservation()] });
  shared.settings = settingsFixture("nl");
  freezeAt(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET: the calendar file", () => {
  it("answers 404 for no token, without querying anything", async () => {
    const response = await get("");
    expect(response.status).toBe(404);
    expect(shared.payload.calls.find).toHaveLength(0);
  });

  it("answers 404 for a token of the wrong shape, without querying anything", async () => {
    const response = await get("token=nope");
    expect(response.status).toBe(404);
    expect(shared.payload.calls.find).toHaveLength(0);
  });

  it("answers 404 for a well-formed token nobody was ever issued", async () => {
    expect((await get(`token=${"z".repeat(22)}`)).status).toBe(404);
  });

  it("hands back a calendar file no cache and no crawler may keep", async () => {
    const response = await get(`token=${TOKEN}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/calendar; charset=utf-8");
    expect(response.headers.get("Content-Disposition")).toMatch(
      /^attachment; filename=".+\.ics"$/,
    );
    // A guest link is a private page in a public URL.
    expect(response.headers.get("Cache-Control")).toBe("no-store, private");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow, noarchive");

    const body = await response.text();
    expect(body).toContain("BEGIN:VCALENDAR");
    expect(body).toContain(`UID:${TOKEN}@debeeshive.nl`);
    expect(body.endsWith("\r\n")).toBe(true);
  });

  it("carries nothing about the booker into the file", async () => {
    const body = await (await get(`token=${TOKEN}`)).text();
    for (const secret of ["de Vries", "sanne@x.nl", "0612345678", "chemo"]) {
      expect(body).not.toContain(secret);
    }
  });

  it.each([
    [{ date: null }, "a date the owners emptied"],
    [{ time: "" }, "a time the owners emptied"],
  ])("refuses to build a file from %o (%s)", async (overrides, _why: string) => {
    shared.payload = makeFakePayload({ reservations: [reservation(overrides)] });
    const response = await get(`token=${TOKEN}`);
    // An .ics without an instant is a file no calendar will accept, so this is
    // a refusal rather than a broken download.
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "badRequest" });
  });

  it("writes the event in the language the link was opened in", async () => {
    const nl = await (await get(`token=${TOKEN}&locale=nl`)).text();
    const en = await (await get(`token=${TOKEN}&locale=en`)).text();
    expect(nl).not.toBe(en);
    expect(en).toContain("/en/reservering/");
  });

  it("refuses the sixty-first download", async () => {
    for (let i = 0; i < 60; i += 1) await get(`token=${TOKEN}`);
    expect((await get(`token=${TOKEN}`)).status).toBe(429);
  });
});

describe("POST: the guards", () => {
  it("refuses the twenty-first answer", async () => {
    // Generous for a party sharing one café wifi, and no more than that.
    for (let i = 0; i < 20; i += 1) await post({ token: TOKEN, name: "Jan" });
    const { status, json } = await post({ token: TOKEN, name: "Jan" });
    expect(status).toBe(429);
    expect(json).toEqual({ error: "rateLimited" });
  });

  it("refuses an oversized body", async () => {
    const { status, json } = await post({ token: TOKEN, name: "Jan" }, { "content-length": "40000" });
    expect(status).toBe(413);
    expect(json).toEqual({ error: "tooLarge" });
  });

  it("refuses a body that is not JSON", async () => {
    const { status, json } = await post("not json");
    expect(status).toBe(400);
    expect(json).toEqual({ error: "badRequest" });
  });

  it("refuses an unknown token", async () => {
    const { status, json } = await post({ token: "z".repeat(22), name: "Jan" });
    expect(status).toBe(404);
    expect(json).toEqual({ error: "notFound" });
  });

  it("stops listening when the owners switch the guest pass off", async () => {
    // Turning the switch off has to stop the endpoint listening, not merely
    // stop the page asking: the form would otherwise keep working for anybody
    // who still had it open.
    shared.settings = settingsFixture("nl", { guestPassEnabled: false });
    const { status, json } = await post({ token: TOKEN, name: "Jan" });
    expect(status).toBe(403);
    expect(json).toEqual({ error: "disabled" });
  });

  it("refuses a cancelled evening", async () => {
    shared.payload = makeFakePayload({ reservations: [reservation({ status: "geannuleerd" })] });
    const { status, json } = await post({ token: TOKEN, name: "Jan" });
    expect(status).toBe(403);
    expect(json).toEqual({ error: "closed" });
  });

  it("refuses an evening that has been and gone", async () => {
    freezeAt("2026-09-19T20:30:00.000Z"); // 22:30 in the café, an hour past the sitting
    const { status, json } = await post({ token: TOKEN, name: "Jan" });
    expect(status).toBe(403);
    expect(json).toEqual({ error: "closed" });
  });

  it.each([undefined, "", "   ", 42])("refuses a name of %o", async (name) => {
    const { status, json } = await post({ token: TOKEN, name });
    expect(status).toBe(400);
    expect(json).toEqual({ error: "nameRequired" });
  });

  it("refuses a sixty-one character name rather than truncating it", async () => {
    // `str` returns null over the cap, and the input on the page carries the
    // same maxLength, so the only way to reach this is by hand.
    const { status, json } = await post({ token: TOKEN, name: "x".repeat(61) });
    expect(status).toBe(400);
    expect(json).toEqual({ error: "nameRequired" });
  });
});

describe("POST: what a companion may say", () => {
  it("keeps only labels the owners configured", async () => {
    await post({
      token: TOKEN,
      name: "Jan",
      dietary: ["Vegetarisch", "Geen slakken", ""],
      drinks: ["Bier"],
    });
    expect(rows()[0]).toMatchObject({ dietary: "Vegetarisch", drinks: "Bier" });
  });

  it("accepts a label from the other language's list", async () => {
    // The endpoint has no business guessing which page the request came from,
    // and accepting either spelling is both simpler and stricter than trusting
    // a `locale` field in the body.
    await post({ token: TOKEN, name: "Jan", dietary: ["Vegetarian"] });
    expect(rows()[0].dietary).toBe("Vegetarian");
  });

  it("collapses duplicates", async () => {
    await post({ token: TOKEN, name: "Jan", dietary: ["Vegetarisch", "Vegetarisch"] });
    expect(rows()[0].dietary).toBe("Vegetarisch");
  });

  it("caps the number of picks at twelve", async () => {
    const labels = Array.from({ length: 20 }, (_, i) => `Wens ${String(i)}`);
    shared.settings = settingsFixture("nl", {
      guestPassDietary: labels.map((label) => ({ label })),
    });
    await post({ token: TOKEN, name: "Jan", dietary: labels });
    expect(String(rows()[0].dietary).split(", ")).toHaveLength(12);
  });

  it("drops everything when the owners configured no list at all", async () => {
    // A list nobody filled in is a question the kitchen never agreed to ask.
    shared.settings = settingsFixture("nl", { guestPassDietary: [], guestPassDrinks: [] });
    await post({ token: TOKEN, name: "Jan", dietary: ["Vegetarisch"], drinks: ["Bier"] });
    expect(rows()[0]).toMatchObject({ dietary: "", drinks: "" });
  });

  it.each([undefined, "not an array", 42, {}])(
    "reads picks of %o as none at all",
    async (dietary) => {
      await post({ token: TOKEN, name: "Jan", dietary });
      expect(rows()[0].dietary).toBe("");
    },
  );

  it("accepts an answer with nothing written in the free-text line", async () => {
    // Somebody with nothing to add is the normal case, not a failed
    // submission. Note that `str` hands back null rather than "" for an empty
    // line, and the redaction turns it back into "" on the way out, so what
    // the guest sees is an empty note either way.
    const { status, json } = await post({ token: TOKEN, name: "Jan", note: "" });
    expect(status).toBe(200);
    expect(rows()[0].note).toBeNull();
    expect((json.responses as Row[])[0].note).toBe("");
  });

  it("drops a note over three hundred characters rather than storing part of it", async () => {
    await post({ token: TOKEN, name: "Jan", note: "x".repeat(301) });
    expect(rows()[0].note).toBeNull();
  });
});

describe("POST: the write, and the whole of it", () => {
  it("names exactly one field on the document", async () => {
    /**
     * Where the entire security argument lives. A guest cannot move the
     * status, change the party size or rewrite the booker's phone number,
     * because none of those words appear in the payload — and this asserts the
     * key list rather than the fields it happens to think of.
     */
    await post({ token: TOKEN, name: "Jan", dietary: ["Vegetarisch"] });

    expect(shared.payload.calls.update).toHaveLength(1);
    const call = shared.payload.calls.update[0];
    expect(Object.keys(call.data)).toEqual(["guestResponses"]);
    expect(call.collection).toBe("reservations");
    expect(call.overrideAccess).toBe(true);
    expect(call.depth).toBe(0);
    // The flag that keeps the collection's outbound mail hooks out of it: a
    // companion writing down that they do not eat fish is not a new
    // reservation, and must not arm the guest's confirmation either.
    expect(call.context).toEqual({ [SKIP_OUTBOUND_EMAIL]: true });
  });

  it("leaves the answers that were already there alone", async () => {
    shared.payload = makeFakePayload({
      reservations: [
        reservation({ guestResponses: [{ id: "row-0", name: "Els", dietary: "Vegetarisch" }] }),
      ],
    });
    await post({ token: TOKEN, name: "Jan" });
    expect(rows()).toHaveLength(2);
    expect(rows()[0]).toMatchObject({ id: "row-0", name: "Els", dietary: "Vegetarisch" });
  });

  it("answers with the code and nothing else when the write fails", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    shared.payload.update = async () => {
      throw new Error("connection reset by peer");
    };
    const { status, json } = await post({ token: TOKEN, name: "Jan" });
    expect(status).toBe(500);
    expect(json).toEqual({ error: "server" });
    expect(logged).toHaveBeenCalled();
  });
});

describe("POST: coming back to change an answer", () => {
  it("edits the row in place when the handle matches", async () => {
    const first = await post({ token: TOKEN, name: "Jan", dietary: ["Vegetarisch"] });
    expect(rows()).toHaveLength(1);

    const again = await post({
      token: TOKEN,
      name: "Jan",
      dietary: ["Vegetarian"],
      responseKey: first.json.responseKey,
    });
    expect(again.status).toBe(200);
    expect(rows()).toHaveLength(1);
    expect(rows()[0].dietary).toBe("Vegetarian");
  });

  it("REGRESSION: a handle for another reservation writes a new line instead", async () => {
    /**
     * The vulnerability the HMAC replaced the array id to close. Payload's
     * array ids are consecutive, so an answered guest held a plausible "proof"
     * for their neighbour's row and could overwrite it — on a page whose whole
     * audience is a WhatsApp group.
     */
    await post({ token: TOKEN, name: "Els", dietary: ["Vegetarisch"] });
    const neighbours = await post({
      token: TOKEN,
      name: "Jan",
      responseKey: responseEditKey({ id: 999 }, rows()[0].id as string),
    });

    expect(neighbours.status).toBe(200);
    expect(rows()).toHaveLength(2);
    expect(rows()[0]).toMatchObject({ name: "Els", dietary: "Vegetarisch" });
  });

  it("treats a handle that matches nothing as a phone that has forgotten", async () => {
    await post({ token: TOKEN, name: "Els" });
    await post({ token: TOKEN, name: "Jan", responseKey: "not-a-key-at-all" });
    expect(rows()).toHaveLength(2);
  });
});

describe("POST: the cap on companions", () => {
  const full = () =>
    Array.from({ length: MAX_GUEST_RESPONSES }, (_, i) => ({
      id: `row-${String(i)}`,
      name: `Gast${String(i)}`,
    }));

  it("refuses a thirty-first companion", async () => {
    // The array is unbounded otherwise and the link is public to whoever holds
    // it. Thirty is past the largest table in the place.
    shared.payload = makeFakePayload({ reservations: [reservation({ guestResponses: full() })] });
    const { status, json } = await post({ token: TOKEN, name: "Nummer 31" });
    expect(status).toBe(409);
    expect(json).toEqual({ error: "full" });
  });

  it("still lets somebody at the cap edit their own answer", async () => {
    // An edit replaces rather than appends, so the cap has nothing to say
    // about it.
    shared.payload = makeFakePayload({ reservations: [reservation({ guestResponses: full() })] });
    const { status } = await post({
      token: TOKEN,
      name: "Gast0 opnieuw",
      responseKey: responseEditKey({ id: 1 }, "row-0"),
    });
    expect(status).toBe(200);
    expect(rows()).toHaveLength(MAX_GUEST_RESPONSES);
    expect(rows()[0].name).toBe("Gast0 opnieuw");
  });
});

describe("POST: what comes back", () => {
  it("carries the handle, the redacted list and nothing else", async () => {
    shared.payload = makeFakePayload({
      reservations: [
        reservation({ guestResponses: [{ id: "row-0", name: "Els de Boer", note: "tot dan" }] }),
      ],
    });
    const { response, json } = await post({ token: TOKEN, name: "Jan Jansen" });

    expect(Object.keys(json).sort()).toEqual(["ok", "responseKey", "responses"]);
    expect(json.ok).toBe(true);
    expect(typeof json.responseKey).toBe("string");

    const serialised = JSON.stringify(json.responses);
    // The list comes back through the same redaction the page uses, so a
    // browser can never learn more from answering than from arriving.
    for (const secret of ["de Boer", "Jansen", "sanne@x.nl", "0612345678", "row-0"]) {
      expect(serialised).not.toContain(secret);
    }
    expect(response.headers.get("Cache-Control")).toBe("no-store, private");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow, noarchive");
  });
});
