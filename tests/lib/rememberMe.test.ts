// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { forget, readRemembered, remember } from "@/lib/rememberMe";

/**
 * The three things a returning guest should not have to type again.
 *
 * The one file in the suite that needs a browser, hence the docblock at the
 * top. Everything here has to survive being wrong: the value is written by the
 * page but it lives somewhere the guest, an extension or a previous version of
 * this code can all reach, so every read treats it as a hostile string. The
 * worst outcome any failure is allowed to have is an empty form.
 */

/**
 * Asserted literally, so that bumping the version is a deliberate edit rather
 * than an accident that silently forgets every returning guest on the planet.
 */
const KEY = "beeshive:reserveren:gast:v1";

const stored = () => window.localStorage.getItem(KEY);

beforeEach(() => {
  window.localStorage.clear();
});

describe("readRemembered: hostile values", () => {
  it("answers null when nothing was ever stored", () => {
    expect(readRemembered()).toBeNull();
  });

  it.each([
    ["", "an empty slot"],
    ["{", "a write truncated halfway"],
    ["[1,2]", "an array"],
    ['"a string"', "a bare string"],
    ["null", "a JSON null"],
    ["42", "a number"],
    ['{"totally":"different"}', "an object of a shape this code never wrote"],
  ])("answers null for %o (%s)", (raw) => {
    window.localStorage.setItem(KEY, raw);
    expect(readRemembered()).toBeNull();
  });

  it("refuses an absurdly long value on its length, before parsing it", () => {
    // Three capped fields and a small number cannot approach four thousand
    // characters, so anything above it is not ours and parsing a megabyte to
    // find that out is work we can decline to do.
    window.localStorage.setItem(KEY, `{"name":"${"x".repeat(5000)}"}`);
    expect(readRemembered()).toBeNull();
  });

  it("answers null rather than throwing when the browser refuses to be read", () => {
    // Safari in private browsing has historically thrown on the mere act of
    // touching localStorage.
    vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(readRemembered()).toBeNull();
  });
});

describe("readRemembered: clamping on the way out", () => {
  const put = (record: Record<string, unknown>) =>
    window.localStorage.setItem(KEY, JSON.stringify(record));

  it("cuts each field to the same ceiling the form's own inputs carry", () => {
    put({
      name: "n".repeat(300),
      email: `${"e".repeat(300)}@x.nl`,
      phone: "0".repeat(300),
    });
    const guest = readRemembered();
    expect(guest?.name).toHaveLength(120);
    expect(guest?.email).toHaveLength(200);
    expect(guest?.phone).toHaveLength(40);
  });

  it("turns a non-string field into an empty one", () => {
    put({ name: "Sanne", email: 42, phone: null });
    expect(readRemembered()).toEqual({ name: "Sanne", email: "", phone: "", guests: undefined });
  });

  it("trims surrounding whitespace", () => {
    put({ name: "  Sanne  ", email: " a@b.nl ", phone: " 0612345678 " });
    expect(readRemembered()).toMatchObject({
      name: "Sanne",
      email: "a@b.nl",
      phone: "0612345678",
    });
  });

  it("answers null when all three contact fields are empty", () => {
    // "We have filled this in for you" over three empty boxes reads as a bug.
    put({ name: "   ", email: "", phone: null, guests: 4 });
    expect(readRemembered()).toBeNull();
  });
});

describe("readRemembered: the party size", () => {
  const put = (guests: unknown) =>
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ name: "Sanne", email: "", phone: "", guests }),
    );

  it("keeps a whole number inside the range the endpoint accepts", () => {
    put(4);
    expect(readRemembered()?.guests).toBe(4);
    put(30);
    expect(readRemembered()?.guests).toBe(30);
  });

  it.each([0, 31, 4.5, "4", NaN, null, undefined])(
    "drops %o rather than repairing it",
    (guests) => {
      // A silently corrected number is a number the guest never agreed to.
      put(guests);
      expect(readRemembered()?.guests).toBeUndefined();
    },
  );
});

describe("remember", () => {
  it("round-trips what went in", () => {
    remember({ name: "Sanne", email: "sanne@x.nl", phone: "0612345678", guests: 4 });
    expect(readRemembered()).toEqual({
      name: "Sanne",
      email: "sanne@x.nl",
      phone: "0612345678",
      guests: 4,
    });
  });

  it("leaves the key out of the stored JSON entirely for an invalid party size", () => {
    // Asserted on the raw string rather than the parsed object, because
    // `{ guests: undefined }` and no `guests` key at all are the same thing
    // once JSON.parse has been over them, and only one of the two is written.
    remember({ name: "Sanne", email: "", phone: "", guests: 99 });
    expect(stored()).toBe('{"name":"Sanne","email":"","phone":""}');
  });

  it("caps on the way in as well as on the way out", () => {
    remember({ name: "n".repeat(300), email: "", phone: "" });
    expect(JSON.parse(String(stored())).name).toHaveLength(120);
  });

  it("says nothing when the browser refuses to be written to", () => {
    // A full quota, a private window, storage switched off. The booking has
    // already been confirmed on screen; the only thing lost is the typing
    // saved next time.
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => remember({ name: "Sanne", email: "", phone: "" })).not.toThrow();
  });
});

describe("forget", () => {
  it("clears the slot", () => {
    remember({ name: "Sanne", email: "", phone: "" });
    forget();
    expect(readRemembered()).toBeNull();
    expect(stored()).toBeNull();
  });

  it("is idempotent", () => {
    expect(() => {
      forget();
      forget();
    }).not.toThrow();
  });

  it("says nothing when the browser refuses", () => {
    vi.spyOn(window.localStorage, "removeItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(() => forget()).not.toThrow();
  });
});
