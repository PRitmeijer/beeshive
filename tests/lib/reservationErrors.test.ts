import { describe, expect, it } from "vitest";
import { getDict } from "@/i18n/dictionaries";
import { locales } from "@/i18n/config";
import {
  RESERVATION_ERRORS,
  isReservationError,
  type ReservationError,
} from "@/lib/reservationErrors";

/**
 * The vocabulary /api/reserve refuses in, and the promise that both languages
 * can say all of it.
 *
 * The endpoint answers with a code rather than a sentence because the site is
 * bilingual and a Dutch sentence is not something the English page can do
 * anything sensible with. That arrangement has one failure mode, and it is
 * silent: a twenty-fifth code ships, the server refuses a booking, and the
 * browser shows an empty box. The last block in this file is four lines long
 * and is the only thing standing between that and a release.
 */

describe("isReservationError", () => {
  it.each(RESERVATION_ERRORS)("accepts %s", (code) => {
    expect(isReservationError(code)).toBe(true);
  });

  it.each([
    ["", "the empty string"],
    ["nope", "a word that is not a code"],
    ["RATELIMITED", "the right code shouted"],
    ["rateLimited ", "the right code with a trailing space"],
    [null, "null"],
    [undefined, "undefined"],
    [0, "a number"],
    [{}, "an object"],
    [[], "an array"],
  ])("refuses %o (%s)", (value, _why: string) => {
    expect(isReservationError(value)).toBe(false);
  });
});

describe("RESERVATION_ERRORS", () => {
  it("holds no duplicates", () => {
    expect(new Set(RESERVATION_ERRORS).size).toBe(RESERVATION_ERRORS.length);
  });

  it("still holds the codes the endpoint and the form were written against", () => {
    // Not the whole list — that would only be this constant written twice —
    // but the handful whose absence would break a specific screen: the seat
    // refusals the guest acts on, the switch the owners flip, and the two that
    // carry a number beside them.
    for (const code of [
      "slotFull",
      "dayFull",
      "reservationsClosed",
      "guestsInvalid",
      "dateTooFar",
      "timeOutsideHours",
      "timePassed",
    ] satisfies ReservationError[]) {
      expect(RESERVATION_ERRORS).toContain(code);
    }
  });
});

describe("every code has wording in every language", () => {
  it.each(locales)("%s can say all of them", (locale) => {
    const errors = getDict(locale).reservationForm.errors as Record<string, unknown>;
    for (const code of RESERVATION_ERRORS) {
      const wording = errors[code];
      // Two of them are functions, because the sentence names a number the
      // endpoint measured against — the horizon in days, the largest party.
      if (typeof wording === "function") continue;
      expect(typeof wording, `${locale}.${code}`).toBe("string");
      expect(String(wording).trim(), `${locale}.${code}`).not.toBe("");
    }
  });

  it("has no wording for a code the server can never send", () => {
    // The other direction, which catches the tidying-up half of the same
    // mistake: a code removed from the endpoint but left in both dictionaries
    // is dead copy that reads as a supported refusal.
    for (const locale of locales) {
      const errors = getDict(locale).reservationForm.errors as Record<string, unknown>;
      expect(Object.keys(errors).sort()).toEqual([...RESERVATION_ERRORS].sort());
    }
  });
});
