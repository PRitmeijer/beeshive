import { describe, expect, it } from "vitest";
import {
  AUTO_CONFIRM,
  CONFIRMATION_MODES,
  DEFAULT_CONFIRMATION_MODE,
  confirmationMode,
  localeOf,
} from "@/lib/reservationMail";

/**
 * When the guest's confirmation goes out, which is the owners' decision.
 *
 *   approval  the mail waits for a human. The default, and what shipped first.
 *   auto      the row is written already at Bevestigd and the guest is told
 *             straight away.
 *   off       no mail to the guest, ever.
 *
 * The only thing that matters here is the fallback, and it matters a great
 * deal: a global that predates the field, a restored database and a settings
 * object assembled by a test all hand over `undefined`, and every one of them
 * has to mean "behave the way the café behaved yesterday" rather than "start
 * mailing guests automatically". So the answer to anything unrecognised is
 * `approval`, because of the three it is the only one that cannot surprise
 * anybody: it waits for a person.
 */

describe("confirmationMode", () => {
  it.each(CONFIRMATION_MODES)("passes %s through", (mode) => {
    expect(confirmationMode({ reservationConfirmationMode: mode })).toBe(mode);
  });

  it.each([
    [null, "a global that has never been saved"],
    [undefined, "a field that predates the setting"],
    ["", "an empty select"],
    ["AUTO", "the right word shouted"],
    ["automatisch", "the right idea in the wrong language"],
    ["approve", "a near miss"],
  ])("falls back to approval for %o (%s)", (value, _why: string) => {
    expect(confirmationMode({ reservationConfirmationMode: value as string })).toBe(
      "approval",
    );
  });

  it.each([null, undefined, {}])("falls back to approval for settings of %o", (settings) => {
    expect(confirmationMode(settings)).toBe("approval");
  });

  it("never falls back to auto", () => {
    // Stated as its own assertion because it is the whole safety argument: a
    // wrong default here mails a promise to a guest that nobody in the
    // building has made yet.
    expect(DEFAULT_CONFIRMATION_MODE).toBe("approval");
    expect(DEFAULT_CONFIRMATION_MODE).not.toBe("auto");
  });

  it("offers exactly three modes", () => {
    expect([...CONFIRMATION_MODES]).toEqual(["approval", "auto", "off"]);
  });
});

describe("AUTO_CONFIRM", () => {
  it("is the literal string both sides of the flag were written against", () => {
    // /api/reserve sets it in `context` and the status field's beforeChange
    // hook in the collection looks for it. They are two files that never
    // import each other's expectations, so the constant is asserted literally
    // rather than compared to itself: renaming it without touching both is a
    // create that silently comes back as "nieuw" with a confirmation armed.
    expect(AUTO_CONFIRM).toBe("autoConfirmReservation");
  });
});

describe("localeOf", () => {
  it("uses what the booking stored", () => {
    expect(localeOf({ id: 1, locale: "en" })).toBe("en");
    expect(localeOf({ id: 1, locale: "nl" })).toBe("nl");
  });

  it.each([null, undefined, "", "de", "EN"])(
    "falls back to Dutch for a stored locale of %o",
    (locale) => {
      expect(localeOf({ id: 1, locale })).toBe("nl");
    },
  );
});
