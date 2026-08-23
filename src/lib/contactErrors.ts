/**
 * The vocabulary /api/contact answers with when it turns a message down.
 *
 * Same arrangement as src/lib/reservationErrors.ts, and for the same reason:
 * the server decides why, the reader's own dictionary decides the words. This
 * module imports nothing, so both sides can read it.
 *
 * Every code below is still reachable, but `server` no longer means what it
 * used to. The route mailed the message itself once, so `server` was a mail
 * server having a bad afternoon — the commonest failure there was, and the one
 * the visitor could do least about. Now the route only stores the message and
 * the sending happens afterwards from a hook, so `server` means the database
 * refused the row: genuinely rare, and the one case where nothing is waiting
 * in the admin and the visitor really does need to hear it. The wording in
 * src/i18n/dict/contact.ts is written for that meaning.
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
