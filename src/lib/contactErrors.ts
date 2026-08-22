/**
 * The vocabulary /api/contact answers with when it turns a message down.
 *
 * Same arrangement as src/lib/reservationErrors.ts, and for the same reason:
 * the server decides why, the reader's own dictionary decides the words. This
 * module imports nothing, so both sides can read it.
 */
export const CONTACT_ERRORS = [
  "rateLimited",
  "badRequest",
  "tooLarge",
  "nameRequired",
  "emailRequired",
  "emailInvalid",
  "messageRequired",
  "messageTooLong",
  "server",
] as const;

export type ContactError = (typeof CONTACT_ERRORS)[number];

export function isContactError(value: unknown): value is ContactError {
  return (
    typeof value === "string" &&
    (CONTACT_ERRORS as readonly string[]).includes(value)
  );
}
