import { randomBytes } from "node:crypto";

/**
 * The secret in a guest link.
 *
 * A reservation gets a shareable page — the guest forwards the link to the
 * people joining them, and everyone fills in their own name, wishes and
 * drinks. That page shows who booked, for when, and with how many. There is no
 * login in front of it and there never will be: asking a table of ten to make
 * an account is how a nice idea dies. So the link itself is the whole lock,
 * and the token is the only part of it an outsider cannot type.
 *
 * Which is why it is not a UUID. A UUID is a perfectly good random number, but
 * it *reads* as a database id, and anything that reads as an id invites
 * someone to try the next one — and to assume, wrongly, that being able to
 * guess it is harmless. A base64url blob reads as what it is: a password that
 * happens to live in a URL. Sixteen random bytes is 128 bits, well past
 * anything a bot can walk through, and lands at 22 characters once the base64
 * padding is stripped — short enough to survive being pasted into WhatsApp.
 */
export function newGuestToken(): string {
  return randomBytes(16).toString("base64url").replace(/=+$/, "");
}
