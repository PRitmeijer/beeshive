import { afterEach, beforeEach, vi } from "vitest";

/**
 * Freezing the clock, and the four dates worth freezing it on.
 *
 * Half of the booking code asks what time it is: the lead time compares now
 * against a sitting, `todayInAmsterdam()` decides which dates are in the past,
 * and the guest pass decides whether an evening has been and gone. None of
 * that is testable against a moving clock, and none of it is interesting on an
 * ordinary Tuesday in June — the cases that break things are the two nights a
 * year the clocks move and the moment near midnight when Amsterdam is already
 * on tomorrow and UTC is not.
 *
 * `toFake: ["Date"]` rather than Vitest's default set is deliberate. The
 * default also replaces setTimeout and queueMicrotask, and a great many of
 * these tests await real promises; there is no reason to make the event loop a
 * variable when only the clock is under test. Intl is not mocked and must not
 * be: the code formats a (now frozen) `new Date()` through a real Intl
 * formatter against the real timezone database, which is precisely the
 * machinery the DST cases exist to exercise.
 */
export function freezeAt(instant: string): void {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(instant));
}

/** The same, wired into a describe block so no test can forget to thaw. */
export function useFrozenClock(instant: string): void {
  beforeEach(() => freezeAt(instant));
  afterEach(() => vi.useRealTimers());
}

/** Move the frozen clock without re-freezing it. */
export function setNow(instant: string): void {
  vi.setSystemTime(new Date(instant));
}

/**
 * The dates every time-sensitive file in this suite reaches for, computed
 * rather than remembered, and named so the same magic string is not retyped in
 * six files with one of them subtly wrong.
 *
 * 2026-03-29 is three test subjects in one date: the night the clocks go
 * forward (02:00 never happens), the last Sunday of March, and the *fifth*
 * Sunday of March. 2026-10-25 is the night the clocks go back, when one wall
 * clock reading covers two instants, and is the last Sunday of October while
 * being only the fourth. 2026-02-22 is the awkward one for the ordinal
 * arithmetic — the last Sunday of February with six days of month left after
 * it — and 2028-02-29 is the leap day.
 */
export const SPRING_FORWARD = "2026-03-29";
export const FALL_BACK = "2026-10-25";
export const LAST_SUNDAY_THAT_IS_FOURTH = "2026-02-22";
export const LEAP_DAY = "2028-02-29";

/**
 * Run a function again under a different process timezone, then put it back.
 *
 * The suite runs under TZ=UTC and the owners' laptop is in Europe/Amsterdam,
 * so "it works on my machine" is a real hazard here rather than a joke. Every
 * clock read in the booking path passes Europe/Amsterdam to Intl explicitly,
 * which means the process timezone must not be able to change any answer —
 * and the only way to say that in a test is to change it and look.
 *
 * Node re-reads process.env.TZ when it is assigned, so this needs no reload of
 * anything; the value is restored in a finally so a failing assertion cannot
 * leave the rest of the file running in Kiritimati.
 */
export function underProcessTz<T>(tz: string, fn: () => T): T {
  const before = process.env.TZ;
  process.env.TZ = tz;
  try {
    return fn();
  } finally {
    process.env.TZ = before;
  }
}

/** Two timezones chosen to be as far from Amsterdam as the map allows. */
export const ABSURD_TIMEZONES = ["Pacific/Kiritimati", "America/Los_Angeles"];
