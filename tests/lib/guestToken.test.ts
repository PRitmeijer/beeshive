import { describe, expect, it } from "vitest";
import { newGuestToken } from "@/lib/guestToken";

/**
 * The secret in a guest link.
 *
 * There is no login in front of the guest pass and there never will be, so the
 * token IS the lock. Two properties keep it working: it has to be unguessable,
 * and it has to survive being pasted into a WhatsApp message and a URL path
 * without anything mangling it.
 */

/** The shape src/lib/guestPass.ts insists on before it will make a query. */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{16,64}$/;

describe("newGuestToken", () => {
  it("is twenty-two base64url characters", () => {
    // Sixteen random bytes is 128 bits, well past anything a bot can walk
    // through, and lands at twenty-two characters once the padding is stripped.
    const token = newGuestToken();
    expect(token).toHaveLength(22);
    expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it("carries nothing that a URL or a chat app would rewrite", () => {
    for (let i = 0; i < 500; i += 1) {
      const token = newGuestToken();
      expect(token).not.toContain("=");
      expect(token).not.toContain("+");
      expect(token).not.toContain("/");
      expect(encodeURIComponent(token)).toBe(token);
    }
  });

  it("draws ten thousand distinct tokens", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10_000; i += 1) seen.add(newGuestToken());
    expect(seen.size).toBe(10_000);
  });

  it("satisfies the shape the guest pass checks before it queries", () => {
    // The two files have to agree about what a token looks like, or the pass
    // refuses tokens it just minted — and the refusal happens before the
    // database is asked, so it would look like a link that had never existed.
    for (let i = 0; i < 500; i += 1) {
      expect(TOKEN_SHAPE.test(newGuestToken())).toBe(true);
    }
  });
});
