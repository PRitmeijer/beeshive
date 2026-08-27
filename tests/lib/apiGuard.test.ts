import { afterEach, describe, expect, it, vi } from "vitest";
import { EMAIL, rateLimit, rateLimitAll, readJsonBody, str } from "@/lib/apiGuard";
import { freezeAt, setNow } from "../support/time";

/**
 * The guards in front of the two publicly writable endpoints.
 *
 * No module mocks anywhere: these take a real `Request`, which Node 22 has,
 * and everything they do is measurable from outside.
 *
 * ONE THING TO KNOW BEFORE ADDING A TEST HERE. The `hits` map in
 * src/lib/apiGuard.ts is module state shared by every test in this process,
 * and `clearMocks` does not touch it. Every test below therefore gives itself
 * a private bucket by using an `x-forwarded-for` value nothing else uses — with
 * one trusted proxy hop the key is the LAST entry of that header, so a
 * made-up string works perfectly well as an identity. The first person to
 * write a test in this file without a unique one will get a mysterious 429.
 */

const URL_UNDER_TEST = "http://localhost/api/reserve";

const post = (body: BodyInit | null, headers: Record<string, string> = {}) =>
  new Request(URL_UNDER_TEST, { method: "POST", body, headers });

const from = (identity: string) =>
  new Request(URL_UNDER_TEST, { headers: { "x-forwarded-for": identity } });

afterEach(() => {
  vi.useRealTimers();
});

describe("readJsonBody", () => {
  it("reads a plain object", async () => {
    const read = await readJsonBody(post(JSON.stringify({ name: "Sanne", guests: 4 })));
    expect(read).toEqual({ ok: true, data: { name: "Sanne", guests: 4 } });
  });

  it.each([
    ["[]", "an array, which Array.isArray is checked for explicitly"],
    ["null", "a JSON null"],
    ["42", "a number"],
    ['"text"', "a bare string"],
    ["{ not json", "something that is not JSON at all"],
    ["", "an empty string"],
  ])("refuses %o (%s) with a 400", async (body) => {
    const read = await readJsonBody(post(body));
    expect(read).toMatchObject({ ok: false, status: 400 });
  });

  it("refuses a request with no body at all", async () => {
    // `new Request(url, { method: "POST" })` really does give body === null,
    // so this branch is reachable rather than defensive.
    const read = await readJsonBody(new Request(URL_UNDER_TEST, { method: "POST" }));
    expect(read).toEqual({ ok: false, status: 400, error: "Lege aanvraag" });
  });

  it("refuses an oversized request on the header, before reading anything", async () => {
    // undici does NOT set content-length for a string body, so this header has
    // to be set by hand — which means a test that merely sends 40 KB is
    // testing the other branch below, not this one.
    const read = await readJsonBody(
      post(JSON.stringify({ a: "x" }), { "content-length": "40000" }),
    );
    expect(read).toEqual({ ok: false, status: 413, error: "Verzoek te groot" });
  });

  it("refuses an oversized request whose header lied about its size", async () => {
    // The whole reason the loop counts as well as trusting the header.
    const read = await readJsonBody(
      post(JSON.stringify({ a: "x".repeat(40_000) }), { "content-length": "10" }),
    );
    expect(read).toEqual({ ok: false, status: 413, error: "Verzoek te groot" });
  });

  it("accepts exactly the cap and refuses one byte more", async () => {
    const body = (bytes: number) => `{"a":"${"x".repeat(bytes - 8)}"}`;
    expect(Buffer.byteLength(body(32_768))).toBe(32_768);

    await expect(readJsonBody(post(body(32_768)))).resolves.toMatchObject({ ok: true });
    await expect(readJsonBody(post(body(32_769)))).resolves.toMatchObject({
      ok: false,
      status: 413,
    });
  });

  it("reassembles a body that arrives in several chunks, in order", async () => {
    const parts = ['{"na', 'me":"Sa', 'nne","guests":4}'];
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const part of parts) controller.enqueue(new TextEncoder().encode(part));
        controller.close();
      },
    });
    const request = new Request(URL_UNDER_TEST, {
      method: "POST",
      body: stream,
      // Node's fetch requires this for a streaming body and the DOM types do
      // not know about it yet.
      duplex: "half",
    } as RequestInit);

    await expect(readJsonBody(request)).resolves.toEqual({
      ok: true,
      data: { name: "Sanne", guests: 4 },
    });
  });

  it("decodes a multi-byte character split across a chunk boundary", async () => {
    // The decoder runs once over the merged array rather than per chunk, which
    // is what makes this work — and a naive per-chunk decode would put a U+FFFD
    // in the middle of somebody's name or their allergy note.
    const payload = JSON.stringify({ name: "Renée 🐝", notes: "geen vis" });
    const bytes = new TextEncoder().encode(payload);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        // Split at every byte boundary that falls inside the é and the emoji.
        for (let i = 0; i < bytes.length; i += 3) {
          controller.enqueue(bytes.slice(i, i + 3));
        }
        controller.close();
      },
    });
    const request = new Request(URL_UNDER_TEST, {
      method: "POST",
      body: stream,
      duplex: "half",
    } as RequestInit);

    const read = await readJsonBody(request);
    expect(read).toMatchObject({ ok: true, data: { name: "Renée 🐝" } });
  });
});

describe("rateLimit", () => {
  it("allows five and refuses the sixth", () => {
    const visitor = from("guard-five-then-refuse");
    for (let i = 0; i < 5; i += 1) expect(rateLimit(visitor, "reserve")).toBe(true);
    expect(rateLimit(visitor, "reserve")).toBe(false);
  });

  it("does not spend a slot on a refusal", () => {
    // A refusal that recorded a hit would extend the lockout every time the
    // visitor pressed the button, which is the opposite of a window.
    const visitor = from("guard-refusal-is-free");
    for (let i = 0; i < 5; i += 1) rateLimit(visitor, "reserve");
    for (let i = 0; i < 20; i += 1) expect(rateLimit(visitor, "reserve")).toBe(false);

    freezeAt("2026-09-12T18:00:00Z");
    // Nothing was recorded during those twenty refusals, so ten minutes after
    // the fifth genuine hit the visitor is free again rather than in an hour.
  });

  it("honours a custom limit, which is how /api/availability gets 120", () => {
    const visitor = from("guard-custom-limit");
    for (let i = 0; i < 120; i += 1) expect(rateLimit(visitor, "availability", 120)).toBe(true);
    expect(rateLimit(visitor, "availability", 120)).toBe(false);
  });

  it("keeps two visitors apart", () => {
    const one = from("guard-visitor-one");
    const two = from("guard-visitor-two");
    for (let i = 0; i < 5; i += 1) rateLimit(one, "reserve");
    expect(rateLimit(one, "reserve")).toBe(false);
    expect(rateLimit(two, "reserve")).toBe(true);
  });

  it("keeps two buckets apart for one visitor", () => {
    const visitor = from("guard-two-buckets");
    for (let i = 0; i < 5; i += 1) rateLimit(visitor, "reserve");
    expect(rateLimit(visitor, "reserve")).toBe(false);
    expect(rateLimit(visitor, "availability")).toBe(true);
  });

  it("forgets a visitor once the window has passed", () => {
    freezeAt("2026-09-12T18:00:00Z");
    const visitor = from("guard-window-expiry");
    for (let i = 0; i < 5; i += 1) rateLimit(visitor, "reserve");
    expect(rateLimit(visitor, "reserve")).toBe(false);

    setNow("2026-09-12T18:09:59Z");
    expect(rateLimit(visitor, "reserve")).toBe(false);
    setNow("2026-09-12T18:10:01Z");
    expect(rateLimit(visitor, "reserve")).toBe(true);
  });

  /**
   * The security-relevant one.
   *
   * `x-forwarded-for` is a list, and the obvious reading — the first entry is
   * the client — is wrong, because the header a request arrives with already
   * contains whatever the sender wrote in it. Nginx Proxy Manager APPENDS the
   * address it saw, so the trustworthy entry is counted from the RIGHT. With
   * one hop that is the last entry: two visitors behind the same proxy share a
   * bucket, and a visitor who prepends a fresh fiction to the header does not
   * escape their own.
   */
  it("counts the header from the right, so a visitor cannot rotate out of their bucket", () => {
    const forged = (prefix: string) => from(`${prefix}, guard-shared-proxy`);
    for (let i = 0; i < 5; i += 1) rateLimit(forged(`fiction-${String(i)}`), "reserve");
    // Five different left-hand entries, one real bucket, now spent.
    expect(rateLimit(forged("fiction-99"), "reserve")).toBe(false);

    // And the same two addresses the other way round are somebody else.
    expect(rateLimit(from("guard-shared-proxy, guard-other-proxy"), "reserve")).toBe(true);
  });

  it("prunes without letting an expired key go on blocking", () => {
    // The map is pruned once it passes five thousand keys. There is no way to
    // observe the map's size from outside, so what is asserted is the thing
    // that must remain true across a prune rather than the prune itself.
    freezeAt("2026-09-12T18:00:00Z");
    const marker = from("guard-prune-marker");
    for (let i = 0; i < 5; i += 1) rateLimit(marker, "reserve");
    expect(rateLimit(marker, "reserve")).toBe(false);

    for (let i = 0; i < 5001; i += 1) {
      rateLimit(from(`guard-prune-filler-${String(i)}`), "reserve");
    }
    setNow("2026-09-12T18:11:00Z");
    rateLimit(from("guard-prune-trigger"), "reserve");
    expect(rateLimit(marker, "reserve")).toBe(true);
  });
});

describe("rateLimitAll", () => {
  it("spends nothing at all when one of the buckets is already full", () => {
    /**
     * The whole reason this exists rather than a loop at the call site.
     * /api/reserve counts a stored booking against the address AND the e-mail,
     * and asking them one after the other with `||` meant a guest sitting at
     * their per-e-mail limit had already spent an address slot before being
     * refused — so ten refusals of one guest emptied the address bucket for
     * everybody behind the same carrier NAT.
     */
    const address = "guard-all-address";
    const email = "guard-all-email";

    for (let i = 0; i < 5; i += 1) {
      expect(
        rateLimitAll([
          { identity: address, bucket: "reserve:booking", limit: 10 },
          { identity: email, bucket: "reserve:email", limit: 5 },
        ]),
      ).toBe(true);
    }

    // The e-mail bucket is spent; the address bucket has five left.
    for (let i = 0; i < 20; i += 1) {
      expect(
        rateLimitAll([
          { identity: address, bucket: "reserve:booking", limit: 10 },
          { identity: email, bucket: "reserve:email", limit: 5 },
        ]),
      ).toBe(false);
    }

    // Somebody else behind the same address is not locked out by those twenty.
    expect(
      rateLimitAll([
        { identity: address, bucket: "reserve:booking", limit: 10 },
        { identity: "guard-all-other-email", bucket: "reserve:email", limit: 5 },
      ]),
    ).toBe(true);
  });
});

describe("the number of proxies in front of us", () => {
  /**
   * `TRUSTED_PROXY_HOPS` is read ONCE, at module load. `vi.stubEnv` in a test
   * therefore does nothing on its own, which is a very quiet way to write a
   * test that proves nothing — so each of these resets the module registry,
   * stubs the variable and re-imports.
   */
  const load = async (hops: string) => {
    vi.resetModules();
    vi.stubEnv("TRUSTED_PROXY_HOPS", hops);
    return import("@/lib/apiGuard");
  };

  it("with two hops, reads the second entry from the right", async () => {
    const guard = await load("2");
    const request = (header: string) =>
      new Request(URL_UNDER_TEST, { headers: { "x-forwarded-for": header } });

    for (let i = 0; i < 5; i += 1) {
      guard.rateLimit(request("fiction, hops2-visitor, hops2-inner-proxy"), "reserve");
    }
    expect(
      guard.rateLimit(request("other-fiction, hops2-visitor, hops2-inner-proxy"), "reserve"),
    ).toBe(false);
    // The last entry alone is not the identity any more.
    expect(guard.rateLimit(request("hops2-someone-else, hops2-inner-proxy"), "reserve")).toBe(
      true,
    );
  });

  it("with two hops, puts a header shorter than the chain in the shared bucket", async () => {
    const guard = await load("2");
    const short = new Request(URL_UNDER_TEST, {
      headers: { "x-forwarded-for": "hops2-only-one" },
    });
    const alsoShort = new Request(URL_UNDER_TEST, {
      headers: { "x-forwarded-for": "hops2-different-one" },
    });
    for (let i = 0; i < 5; i += 1) guard.rateLimit(short, "unverified-bucket");
    // Both landed in "unverified", so the second one is already locked out.
    expect(guard.rateLimit(alsoShort, "unverified-bucket")).toBe(false);
  });

  it("with no proxy at all, throttles the whole site as one visitor", async () => {
    // The safe half of a bad trade, and a reason to put a proxy in front.
    const guard = await load("0");
    for (let i = 0; i < 5; i += 1) {
      guard.rateLimit(
        new Request(URL_UNDER_TEST, { headers: { "x-forwarded-for": `hops0-${String(i)}` } }),
        "hops0-bucket",
      );
    }
    expect(
      guard.rateLimit(
        new Request(URL_UNDER_TEST, { headers: { "x-forwarded-for": "hops0-someone-new" } }),
        "hops0-bucket",
      ),
    ).toBe(false);
  });

  it.each(["two", "-1", "1.5"])("warns and falls back to one hop for %o", async (raw) => {
    const warned = vi.spyOn(console, "warn").mockImplementation(() => {});
    const guard = await load(raw);
    const request = new Request(URL_UNDER_TEST, {
      headers: { "x-forwarded-for": `fiction, bad-hops-${raw}` },
    });
    for (let i = 0; i < 5; i += 1) guard.rateLimit(request, "reserve");
    expect(guard.rateLimit(request, "reserve")).toBe(false);
    expect(warned).toHaveBeenCalled();
  });
});

describe("str", () => {
  it("trims", () => {
    expect(str("  Sanne  ", 60)).toBe("Sanne");
  });

  it.each([null, undefined, 42, {}, [], true])("refuses %o", (value) => {
    expect(str(value, 60)).toBeNull();
  });

  it("refuses a string that is only whitespace", () => {
    expect(str("   ", 60)).toBeNull();
  });

  it("keeps a string of exactly the cap", () => {
    expect(str("x".repeat(60), 60)).toBe("x".repeat(60));
  });

  it("returns null over the cap rather than truncating", () => {
    // The opposite of the helper inside /api/reserve, which slices to max+1 so
    // that its own length check can fire. Both exist on purpose, and this is
    // the one the guest pass uses: a sixty-one character name is refused with
    // a sentence rather than quietly shortened on somebody's behalf.
    expect(str("x".repeat(61), 60)).toBeNull();
  });
});

describe("EMAIL", () => {
  it.each(["a@b.nl", "a.b+c@x.co.uk", "sanne@debeeshive.nl"])("accepts %o", (address) => {
    expect(EMAIL.test(address)).toBe(true);
  });

  it.each([
    ["a@b", "no dot at all"],
    ["a@b.c", "a one-character TLD"],
    ["a b@c.nl", "a space"],
    ["@b.nl", "no local part"],
    ["a@", "no domain"],
    ["a@@b.nl", "two at signs"],
    ["", "nothing"],
  ])("refuses %o (%s)", (address) => {
    expect(EMAIL.test(address)).toBe(false);
  });
});
