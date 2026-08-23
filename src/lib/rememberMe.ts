/**
 * The three things a returning guest should not have to type again: their
 * name, their e-mail address and their phone number. Somebody who books a
 * table once a month has typed those thirty-six times by the end of three
 * years, and every one of those times was the site asking a question it had
 * already been answered.
 *
 * This is a cookie in the way the request was meant and deliberately not a
 * cookie in the way the browser means it, for two reasons that are worth
 * writing down because they will look like an oversight otherwise.
 *
 * The first is what a cookie costs the page it sits on. A cookie is sent up
 * with every single request for this origin, which is exactly what makes it
 * useful for a session and exactly what makes it wrong here: to fill the form
 * from a cookie the reservation page would have to read the request while
 * rendering, and a page that reads the request is a dynamic page. The frontend
 * was moved off `force-dynamic` onto a sixty-second revalidate window this
 * month, because `Cache-Control: no-store` was quietly costing the site both
 * its CDN and the browser's own back/forward cache — press back after looking
 * at the menu and the whole page was fetched again. Restoring three fields is
 * not worth giving that back. Reading localStorage after mount costs the render
 * nothing, keeps the page static, and undoes none of it.
 *
 * The second is the sentence we get to put under the checkbox. Nothing here is
 * stored on our side, nothing is sent anywhere, and nothing travels with a
 * request the guest did not ask to make — the values sit in this browser until
 * this browser fills them into a booking that was going to be submitted
 * anyway. That is a plain, true, checkable thing to say, and it is only true of
 * localStorage; a cookie would be leaving the device on every page view whether
 * anybody booked or not.
 *
 * The trade-off, stated rather than hidden: localStorage is per-origin and
 * per-browser, so this does not follow a guest to their laptop, to another
 * browser, or out of a private window. That is a limitation of the mechanism
 * and simultaneously the whole of what was asked for — a fast checkout "from
 * the same device". Anything that followed them between devices would need an
 * account, and asking a café's regulars to make an account is how a small
 * kindness turns into a chore.
 *
 * What is stored is contact details and, at most, the usual size of the party.
 * Nothing about a particular booking: not the date, not the time, not the
 * notes, not the guest-pass token. A date is the clearest case — a remembered
 * one is stale within a week and a form that opens on a Saturday that has been
 * and gone is worse than a form that opens empty, because the guest has to
 * notice before they can correct it. The notes are the case that matters most:
 * an allergy, a wheelchair, a child's high chair, "we come for Ans's
 * eightieth". Those are facts about the people at that table on that evening,
 * and quietly carrying them into a booking made for different people is at best
 * embarrassing and at worst a kitchen cooking around an allergy nobody in the
 * room has. The party size is on the edge of this and is kept because it is a
 * habit rather than an event — the couple who always come as two — and because
 * it is visible in a field the guest is looking at before they submit.
 *
 * Everything below has to survive being wrong. The value is written by the
 * page but it lives somewhere the guest, an extension, or a previous version of
 * this code can all reach, so every read treats it as a hostile string: it may
 * be absent, truncated mid-JSON, an object of a shape we have never used, or
 * eight megabytes long. It is also imported by a `"use client"` component that
 * still renders on the server, where `window` does not exist at all, so every
 * function here is a no-op rather than a throw when there is no browser to talk
 * to. The worst outcome any failure is allowed to have is an empty form.
 */

/**
 * The version is in the key rather than in the value, so a future change to
 * the shape simply stops finding anything instead of half-reading a record it
 * only partly understands. The old key is left to be evicted by the browser;
 * hunting it down would mean keeping a list of every shape we have ever
 * written, to delete a few hundred bytes nobody is looking at.
 */
const KEY = "beeshive:reserveren:gast:v1";

/**
 * The same ceilings the form's own inputs carry, so a value that comes back out
 * of storage cannot be longer than one that could have been typed in. They are
 * repeated here rather than imported because this module is the thing standing
 * between a rendered field and a string of unknown provenance, and that guard
 * should not depend on a component for its limits.
 */
const LIMITS = { name: 120, email: 200, phone: 40 } as const;

/**
 * A ceiling on the raw string before it is handed to JSON.parse. Three capped
 * fields and a small number cannot approach this, so anything above it is not
 * ours; parsing a megabyte to discover that is work we can decline to do.
 */
const MAX_RAW = 4000;

/** The most and fewest people /api/reserve will accept, so the rest is noise. */
const MIN_GUESTS = 1;
const MAX_GUESTS = 20;

export interface RememberedGuest {
  name: string;
  email: string;
  phone: string;
  /** Optional: an old record may not have one, and a guest may clear it. */
  guests?: number;
}

/**
 * Trim and cut to length, and treat anything that is not a string as an empty
 * one. Applied on the way in and again on the way out: the write-side cap is
 * the courtesy, the read-side cap is the guard, and only the second of the two
 * protects a form from a value some other version of this code once wrote.
 */
function clamp(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/**
 * A party size only survives if it is a whole number in the range the booking
 * endpoint accepts. Anything else — a string, a NaN, forty — is dropped rather
 * than repaired, because a silently corrected number is a number the guest
 * never agreed to.
 */
function clampGuests(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isInteger(value)) return undefined;
  if (value < MIN_GUESTS || value > MAX_GUESTS) return undefined;
  return value;
}

/**
 * Whether there is a browser to talk to at all, and whether it is willing.
 * Safari in private browsing has historically thrown on the mere act of
 * touching localStorage, and a device with storage disabled by policy does the
 * same, so even reaching for the object is inside the try.
 */
function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * What this device remembers, or null. Never called during render — see the
 * note in ReservationForm about hydration — and never throws, whatever is in
 * the slot.
 */
export function readRemembered(): RememberedGuest | null {
  const store = storage();
  if (!store) return null;

  let raw: string | null;
  try {
    raw = store.getItem(KEY);
  } catch {
    return null;
  }
  if (!raw || raw.length > MAX_RAW) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // A truncated write, or something another script put here under a key that
    // happens to collide. Either way it is not a guest.
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  const record = parsed as Record<string, unknown>;
  const guest: RememberedGuest = {
    name: clamp(record.name, LIMITS.name),
    email: clamp(record.email, LIMITS.email),
    phone: clamp(record.phone, LIMITS.phone),
    guests: clampGuests(record.guests),
  };

  // A record with nothing in any of the three fields is not worth announcing
  // to the guest: the line saying "we have filled this in for you" above three
  // empty boxes reads as a bug. Treated as nothing rather than cleaned up,
  // because a read is not the place to be writing.
  if (!guest.name && !guest.email && !guest.phone) return null;
  return guest;
}

/**
 * Store, or overwrite, what this device knows. Only ever called after a
 * booking has actually been accepted, so the values have been through the
 * server's own validation on the way past.
 */
export function remember(guest: RememberedGuest): void {
  const store = storage();
  if (!store) return;

  const record: RememberedGuest = {
    name: clamp(guest.name, LIMITS.name),
    email: clamp(guest.email, LIMITS.email),
    phone: clamp(guest.phone, LIMITS.phone),
  };
  const guests = clampGuests(guest.guests);
  if (guests !== undefined) record.guests = guests;

  try {
    store.setItem(KEY, JSON.stringify(record));
  } catch {
    // A full quota, a private window, storage switched off. The booking has
    // already been made and confirmed on screen; the only thing lost is the
    // typing saved next time, and that is not worth an error in front of
    // somebody who has just successfully reserved a table.
  }
}

/** Forget this device. Idempotent, and as quiet about failing as the rest. */
export function forget(): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(KEY);
  } catch {
    // Nothing to tell anybody. The next read caps and validates whatever is
    // still there, so a slot that refused to clear cannot become a broken form.
  }
}
