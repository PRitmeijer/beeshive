/**
 * The vocabulary /api/reserve answers with when it turns a request down.
 *
 * The endpoint used to reply with a finished Dutch sentence, which the English
 * page could only either print untranslated or throw away. It sends one of
 * these codes instead: the reason is decided on the server, the wording is
 * decided in the reader's language by `t.reservationForm.errors`.
 *
 * This module deliberately imports nothing, so both the route handler and the
 * browser bundle can read the same list.
 */
export const RESERVATION_ERRORS = [
  "rateLimited",
  "badRequest",
  "tooLarge",
  "nameRequired",
  "nameTooLong",
  "phoneRequired",
  "emailInvalid",
  "phoneTooLong",
  "occasionTooLong",
  "notesTooLong",
  "guestsInvalid",
  "dateRequired",
  "dateInvalid",
  "datePast",
  "dateTooFar",
  "timeInvalid",
  "dayClosed",
  "timeOutsideHours",
  "timePassed",
  "server",
] as const;

export type ReservationError = (typeof RESERVATION_ERRORS)[number];

/** Narrows whatever came back over the wire to a code we have wording for. */
export function isReservationError(value: unknown): value is ReservationError {
  return (
    typeof value === "string" &&
    (RESERVATION_ERRORS as readonly string[]).includes(value)
  );
}
