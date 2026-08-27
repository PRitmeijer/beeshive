import { describe, expect, it } from "vitest";
import { forget, readRemembered, remember } from "@/lib/rememberMe";

/**
 * The same module with no browser at all — this file deliberately runs in the
 * default node environment, unlike its jsdom companion next to it.
 *
 * It is not a hypothetical. src/lib/rememberMe.ts is imported by a
 * `"use client"` component, and a client component still renders on the server
 * for the first paint, where `window` does not exist. Every function has to be
 * a quiet no-op there rather than a throw, or the reservation page 500s before
 * anybody sees a field.
 */
describe("with no window to talk to", () => {
  it("has genuinely no window, so this file is testing what it says it is", () => {
    expect(typeof window).toBe("undefined");
  });

  it("remembers nothing", () => {
    expect(readRemembered()).toBeNull();
  });

  it("stores nothing, quietly", () => {
    expect(() =>
      remember({ name: "Sanne", email: "sanne@x.nl", phone: "0612345678" }),
    ).not.toThrow();
  });

  it("forgets nothing, quietly", () => {
    expect(() => forget()).not.toThrow();
  });
});
