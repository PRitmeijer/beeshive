import { describe, expect, it } from "vitest";
import {
  DEFAULT_BOOKING_RULES,
  HORIZON_DAYS,
  LAST_SITTING_BEFORE_CLOSE,
  LEAD_MINUTES,
  MAX_HORIZON_DAYS,
  MAX_PARTY_SIZE,
  PARTY_SIZE_CEILING,
  SLOT_MINUTES,
  SLOT_MINUTES_CHOICES,
  gapRule,
  resolveBookingRules,
} from "@/lib/openingHours";

/**
 * The five numbers the owners set, sanitised once for everybody.
 *
 * They used to be sanitised three times — by the form, by /api/availability
 * and by /api/reserve — and the three disagreed: the form offered ninety days
 * where the endpoint accepted whatever the CMS said, and a party of thirty-five
 * passed every check only to be refused by the collection as a 500. So this is
 * the one place the clamping happens, and these tests are about the edges,
 * because the edges are where the disagreements were.
 *
 * The spacing of the sittings is the odd one out: a choice from a list rather
 * than a number in a range, so it is not clamped at all. Everything below the
 * clamps is about why.
 *
 * The fifth is the newest — the gap between the last bookable sitting and
 * closing time, which was a constant of sixty until the café asked for ninety
 * on the nights they close at nine. It is clamped like the lead time it
 * mirrors, and for the same reason a nought has to survive the sanitiser.
 */

const rules = (overrides: Record<string, unknown>) =>
  resolveBookingRules(overrides);

describe("resolveBookingRules: nothing set", () => {
  it("falls back to the shipped defaults", () => {
    expect(rules({})).toEqual({
      leadMinutes: LEAD_MINUTES,
      horizonDays: HORIZON_DAYS,
      maxPartySize: MAX_PARTY_SIZE,
      slotMinutes: SLOT_MINUTES,
      lastSittingMinutes: LAST_SITTING_BEFORE_CLOSE,
    });
    // Asserted literally as well, because "nothing changes for this café on the
    // day the setting ships" is the whole promise of the default, and comparing
    // the constant to itself would not keep it.
    expect(rules({}).lastSittingMinutes).toBe(60);
    expect(DEFAULT_BOOKING_RULES).toEqual(rules({}));
  });

  it.each([null, undefined, "", "   ", false, [], {}, "geen idee", NaN])(
    "reads %o as unset rather than as a number",
    (value) => {
      expect(
        rules({
          reservationLeadMinutes: value,
          reservationHorizonDays: value,
          reservationMaxPartySize: value,
          reservationSlotMinutes: value,
          reservationLastSittingMinutes: value,
        }),
      ).toEqual(DEFAULT_BOOKING_RULES);
    },
  );
});

describe("resolveBookingRules: a nought that was meant", () => {
  /**
   * The distinction this whole sanitiser exists for. "No notice at all" is a
   * setting the owners can and do choose, so a lead time of nought has to
   * survive — while an empty field has to mean the default. `Number(null)`,
   * `Number("")` and `Number([])` are every one of them a finite nought, which
   * is how an unfilled field once came back as a deliberate zero and was then
   * clamped up to the minimum: a horizon of one day and a form refusing a
   * table for two.
   */
  it("keeps a lead time of nought", () => {
    expect(rules({ reservationLeadMinutes: 0 }).leadMinutes).toBe(0);
    expect(rules({ reservationLeadMinutes: "0" }).leadMinutes).toBe(0);
  });

  it("keeps a gap before closing of nought", () => {
    // Nought means the last table may be booked for closing time itself. It is
    // a strange thing to want and a coherent one, and an owner who clears the
    // hour must not be handed it straight back — which is exactly what the
    // lead time used to do before this sanitiser told an empty field apart
    // from a deliberate zero.
    expect(rules({ reservationLastSittingMinutes: 0 }).lastSittingMinutes).toBe(0);
    expect(rules({ reservationLastSittingMinutes: "0" }).lastSittingMinutes).toBe(
      0,
    );
  });

  it("does not let a horizon or a party size fall to nought", () => {
    expect(rules({ reservationHorizonDays: 0 }).horizonDays).toBe(1);
    expect(rules({ reservationMaxPartySize: 0 }).maxPartySize).toBe(1);
  });
});

describe("resolveBookingRules: the clamps", () => {
  it.each([
    [-5, 0],
    [0, 0],
    [180, 180],
    [24 * 60, 1440],
    [24 * 60 + 1, 1440],
  ])("clamps a lead time of %i to %i", (given, expected) => {
    expect(rules({ reservationLeadMinutes: given }).leadMinutes).toBe(expected);
  });

  it.each([
    [-1, 1],
    [7, 7],
    [MAX_HORIZON_DAYS, MAX_HORIZON_DAYS],
    // An owner who opens the horizon to half a year gets a quarter, which is
    // the same answer /api/availability gives for the same window.
    [365, MAX_HORIZON_DAYS],
  ])("clamps a horizon of %i to %i", (given, expected) => {
    expect(rules({ reservationHorizonDays: given }).horizonDays).toBe(expected);
  });

  it.each([
    [6, 6],
    [PARTY_SIZE_CEILING, PARTY_SIZE_CEILING],
    // The `guests` field in the collection stops at thirty. Above it every
    // check in /api/reserve used to pass and payload.create then threw, so a
    // party of thirty-five was a 500 for the guest.
    [35, PARTY_SIZE_CEILING],
  ])("clamps a largest party of %i to %i", (given, expected) => {
    expect(rules({ reservationMaxPartySize: given }).maxPartySize).toBe(expected);
  });

  it.each([
    [-30, 0],
    [0, 0],
    [90, 90],
    [24 * 60, 1440],
    // A day is the ceiling, and it is a ceiling on the arithmetic rather than a
    // judgement about any particular evening: this one number covers a week of
    // days that are not the same length, so clamping it against a day's own
    // hours would mean handing that day back sittings the owners asked not to
    // have. A gap nothing fits inside empties the day instead, which every
    // screen already has a sentence for.
    [24 * 60 + 1, 1440],
    [10_000, 1440],
  ])("clamps a gap before closing of %i to %i", (given, expected) => {
    expect(rules({ reservationLastSittingMinutes: given }).lastSittingMinutes).toBe(
      expected,
    );
  });

  it("floors a fraction rather than rounding it", () => {
    expect(rules({ reservationMaxPartySize: 7.9 }).maxPartySize).toBe(7);
  });

  it("reads a number the CMS stored as a string", () => {
    expect(rules({ reservationHorizonDays: " 14 " }).horizonDays).toBe(14);
  });
});

describe("resolveBookingRules: the spacing of the sittings", () => {
  it("offers exactly two grids, finest first", () => {
    // Finest first is load-bearing: the Reservations collection reads the head
    // of this list to decide which times its `time` field will accept, because
    // a field validator cannot read the global to find out which grid is in
    // force today.
    expect([...SLOT_MINUTES_CHOICES]).toEqual([15, 30]);
    expect(SLOT_MINUTES).toBe(SLOT_MINUTES_CHOICES[0]);
  });

  it.each([
    ["15", 15],
    ["30", 30],
    [15, 15],
    [30, 30],
    [" 30 ", 30],
  ])("reads a stored %o as %i", (given, expected) => {
    expect(rules({ reservationSlotMinutes: given }).slotMinutes).toBe(expected);
  });

  it.each([20, 0, -15, 45, 7.5, "kwartier", true])(
    "reads %o as nothing said rather than clamping it",
    (given) => {
      /**
       * The one place this sanitiser deliberately does not behave like the
       * other three. A range clamp would turn a stored 20 into 30 — a grid the
       * select cannot produce, quietly handed to the form while /api/reserve
       * was told the same thing and both were wrong about what the guest could
       * choose. Anything that is not one of the two offered grids is treated as
       * an empty field, which is the only answer that keeps the form, both
       * endpoints and the collection walking the same minutes.
       */
      expect(rules({ reservationSlotMinutes: given }).slotMinutes).toBe(
        SLOT_MINUTES,
      );
    },
  );

  it("leaves the other four alone", () => {
    // The spacing is read from its own field, so setting it cannot disturb the
    // lead time, the horizon, the largest party or the gap before closing.
    expect(rules({ reservationSlotMinutes: "30" })).toEqual({
      ...DEFAULT_BOOKING_RULES,
      slotMinutes: 30,
    });
  });
});

describe("resolveBookingRules: the gap before closing", () => {
  it("changes nothing else when it is the only field set", () => {
    // The café's own request, as data: closing at nine, ninety minutes, and
    // every other rule exactly where it was.
    expect(rules({ reservationLastSittingMinutes: 90 })).toEqual({
      ...DEFAULT_BOOKING_RULES,
      lastSittingMinutes: 90,
    });
  });

  it("reads a number the CMS stored as a string", () => {
    expect(rules({ reservationLastSittingMinutes: " 90 " }).lastSittingMinutes).toBe(
      90,
    );
  });

  it("floors a fraction rather than rounding it", () => {
    expect(rules({ reservationLastSittingMinutes: 90.9 }).lastSittingMinutes).toBe(
      90,
    );
  });
});

/**
 * The judgement `slotsFor`, `isBookable` and `sittings()` all defer to.
 *
 * It is exported for the third of those, which lives in another module and had
 * been applying the number raw — so a value the two here read as an hour, it
 * read as "no time matches anything", and the same day came out as thirteen
 * sittings on one screen and a strip of chips under a blank heading on the
 * next. What the number means when it is unusable is a decision, and a decision
 * two readers must not each take for themselves; being exported, it is now part
 * of the contract and worth stating on its own.
 */
describe("gapRule", () => {
  it("leaves a number a person could have meant exactly as it is", () => {
    expect(gapRule(90)).toBe(90);
    // Nought is a real setting — a bar taking a last order on the hour — and a
    // sanitiser that treats it as missing hands back the hour just removed.
    expect(gapRule(0)).toBe(0);
  });

  it("reads a gap that is not a number as the shipped hour", () => {
    // Not the clamp minimum, which would be nought: a NaN is an accident, and
    // treating an accident as "sittings right up to closing time" would seat a
    // party at nine on a kitchen that shuts at nine.
    expect(gapRule(Number.NaN)).toBe(LAST_SITTING_BEFORE_CLOSE);
    expect(gapRule(Number.POSITIVE_INFINITY)).toBe(LAST_SITTING_BEFORE_CLOSE);
  });

  it("refuses to let a gap below nought offer tables after closing", () => {
    expect(gapRule(-30)).toBe(0);
  });

  it("stops at a day, which empties any day rather than reversing one", () => {
    expect(gapRule(1e9)).toBe(24 * 60);
    expect(gapRule(24 * 60)).toBe(24 * 60);
  });

  it("floors a fraction, so no sitting lands off the minute", () => {
    expect(gapRule(90.9)).toBe(90);
  });

  it("agrees with resolveBookingRules about every one of them", () => {
    // The two are separate on purpose — one sanitises a raw CMS value, the
    // other a number already resolved — and they would be worth nothing if
    // they disagreed about what the same number means.
    for (const given of [0, 90, 90.9, 1e9]) {
      expect(gapRule(given)).toBe(
        rules({ reservationLastSittingMinutes: given }).lastSittingMinutes,
      );
    }
  });
});
