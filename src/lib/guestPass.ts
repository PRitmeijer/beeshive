import { createHmac, timingSafeEqual } from "node:crypto";
import { getPayloadClient, type SiteSettingsData } from "@/lib/payload";
import { canonicalUrl, type Locale } from "@/i18n/config";
import { nowMinutesInAmsterdam, todayInAmsterdam } from "@/lib/openingHours";
import { getDict } from "@/i18n/dictionaries";
// Owned by another agent, written against the contract quoted in
// toIcsEvent() below. Nothing here calls buildIcs(): the calendar file is
// assembled in /api/guest-pass, which is the only place a browser can be
// handed a real file.
import type { IcsEvent } from "@/lib/ics";

/**
 * Everything the guest pass needs on the server, in one place.
 *
 * The guest pass is the one page on this site that shows somebody else's
 * booking to a stranger. It gets away with that because of a single secret:
 * the token in the URL. There is no session, no login, no cookie. Whoever
 * holds the link is the audience, and the party passes that link around a
 * WhatsApp group, so "whoever holds the link" is a dozen phones by dinner
 * time and possibly a screenshot in a group chat by Friday.
 *
 * Two rules follow from that, and both are enforced here rather than in the
 * page, so there is exactly one copy of each to get wrong.
 *
 * The first is that a reservation is only ever found by its token. Not by id,
 * not by name, not by a date and a phone number. `findByToken` is the only
 * read in this file and it is a `where` equals on `guestToken` with a limit of
 * one. An id-shaped lookup would be walkable; a token-shaped one is not.
 *
 * The second is that the document never leaves this module intact.
 * `redactForGuests` is the door, and it is a whitelist, not a delete list:
 * it builds a new object out of the handful of fields the party is allowed to
 * see. Adding a field to the Reservations collection therefore cannot leak it
 * by accident — it simply will not appear until someone comes here and adds it
 * on purpose, which is the decision we want them to have to make.
 */

/**
 * The parts of a reservation row this module touches. Spelled out rather than
 * imported from the generated types for the same reason the collection file
 * spells out its own: what matters is which fields we are willing to read, and
 * a hand-written list makes that reviewable.
 */
export interface GuestResponseRow {
  /** Payload's own key for an array row. Never leaves the server: see
   *  `responseEditKey` for what the browser is given instead. */
  id?: string | null;
  name?: string | null;
  dietary?: string | null;
  drinks?: string | null;
  /** Whatever this companion wanted to add in their own words. */
  note?: string | null;
  addedAt?: string | null;
}

export interface ReservationDoc {
  id: number | string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  date?: string | null;
  time?: string | null;
  guests?: number | null;
  duration?: number | null;
  notes?: string | null;
  /**
   * The owners' own line to the party, written in the admin. The opposite
   * direction to `notes` in every way that matters: `notes` is the booker
   * writing to the kitchen in confidence, this is the house writing to a
   * dozen phones on purpose, which is why one of them is dropped below and
   * the other is not.
   */
  guestNote?: string | null;
  occasion?: string | null;
  status?: string | null;
  guestToken?: string | null;
  guestResponses?: GuestResponseRow[] | null;
}

/** The four statuses the collection stores, in the CMS's own Dutch. */
export const GUEST_PASS_STATUSES = [
  "nieuw",
  "gebeld",
  "bevestigd",
  "geannuleerd",
] as const;

export type GuestPassStatus = (typeof GUEST_PASS_STATUSES)[number];

/** One companion's answer, as the browser is allowed to see it. */
export interface GuestResponseView {
  /** First name only, exactly as for the person who booked. */
  name: string;
  dietary: string[];
  drinks: string[];
  /** Their own remark, trimmed and capped, or "" when they wrote none. */
  note: string;
}

/** A whole reservation, as the browser is allowed to see it. */
export interface GuestPassView {
  firstName: string;
  /** YYYY-MM-DD. */
  date: string;
  /** HH:MM, or "" when the row somehow holds something else. */
  time: string;
  guests: number | null;
  status: GuestPassStatus;
  /**
   * The house's line to the party, or "" — never null and never whitespace,
   * so the page can ask `houseNote ? ... : null` and be done. It is called
   * `guestNote` on the document, where the name says who it is for; here it
   * says who wrote it, because on this side of the door that is the thing a
   * reader needs to know.
   */
  houseNote: string;
  responses: GuestResponseView[];
}

/**
 * What `newGuestToken()` produces: base64url with the padding stripped, so 22
 * characters for the current sixteen bytes. The range is wider than that on
 * purpose — a token minted before the length changed must keep working — but
 * anything outside it is not a token that was ever issued, and is refused here
 * rather than being handed to the database as a query.
 */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{16,64}$/;

/** How many companions one reservation will accept. See the POST endpoint. */
export const MAX_GUEST_RESPONSES = 30;

/** Caps on what a companion may write. The endpoint enforces these. */
export const GUEST_RESPONSE_LIMITS = {
  name: 60,
  /** Per picked label, and how many labels one person may pick. */
  label: 60,
  picks: 12,
  /** The remark. Matches `guestResponses[].note`'s own maxLength. */
  note: 300,
} as const;

/**
 * The house's note, matching `guestNote`'s maxLength in the collection.
 *
 * Kept here as well as there because the redaction has to cap what it renders
 * on its own: the field's maxLength is a rule the admin enforces on the way
 * in, and a row that predates the rule, or was written by a script, or was
 * loosened later, still comes through this function.
 */
export const MAX_HOUSE_NOTE = 500;

/** The shareable address itself. Dutch keeps the bare path, English gets /en. */
export function guestPassUrl(locale: Locale, token: string): string {
  return canonicalUrl(locale, `/reservering/${encodeURIComponent(token)}`);
}

/**
 * Where the calendar file comes from.
 *
 * It is an endpoint and not a `data:` URL or a blob, and that is not a
 * preference. iOS refuses to open a `data:text/calendar` link at all, and the
 * in-app browsers this page actually lives in — WhatsApp's, Instagram's —
 * block script-driven downloads outright. A plain link to a plain URL that
 * answers with `Content-Type: text/calendar` is the only shape all of them
 * agree to hand to the calendar app.
 */
export function guestPassIcsPath(locale: Locale, token: string): string {
  // The locale rides along so the event lands in the guest's own language:
  // the endpoint builds the title and description out of the dictionary, and
  // an English party should not find "Tafel bij" in their calendar.
  return `/api/guest-pass?token=${encodeURIComponent(token)}&locale=${locale}&ics=1`;
}

/**
 * The only read of a reservation on the guest side.
 *
 * `overrideAccess: true` is doing something that looks alarming and is not.
 * The collection refuses every read without a logged-in user, and there is no
 * user here — the whole point of the page is that nobody logs in. The token in
 * the `where` clause is the authorisation: 128 bits of randomness that only
 * arrives by having been sent the link. Access control has not been skipped,
 * it has been moved into the query, which is why the query is in one function
 * that nothing else in the codebase is allowed to work around.
 */
export async function findByToken(
  token: string | null | undefined,
): Promise<ReservationDoc | null> {
  const clean = typeof token === "string" ? token.trim() : "";
  if (!TOKEN_SHAPE.test(clean)) return null;

  try {
    const payload = await getPayloadClient();
    const result = await payload.find({
      collection: "reservations",
      where: { guestToken: { equals: clean } },
      limit: 1,
      // Nothing on a reservation is a relationship, so there is nothing to
      // populate — and a depth of 0 cannot accidentally pull a related
      // document's fields into reach of the redaction below.
      depth: 0,
      overrideAccess: true,
    });
    return (result.docs[0] as ReservationDoc | undefined) ?? null;
  } catch (error) {
    // A page that cannot reach the CMS should say the link does not work, not
    // fall over. Log it, though: the two look identical from the outside.
    console.error("guest pass lookup failed", error);
    return null;
  }
}

/**
 * The first word of a name, and nothing else.
 *
 * A surname is the difference between "Sanne is coming" and knowing who Sanne
 * is, and the party already knows which Sanne. Splitting on whitespace keeps
 * "Jan-Pieter" and "de Vries" doing the right thing: the first token is a
 * given name in both, and the tussenvoegsel stays behind with the surname.
 */
function firstNameOf(value: string | null | undefined): string {
  const first = String(value ?? "").trim().split(/\s+/)[0] ?? "";
  return first.slice(0, GUEST_RESPONSE_LIMITS.name);
}

/**
 * A note as the page may render it: trimmed, capped, and "" when there is
 * nothing to say. Whitespace collapses to "" rather than to a blank line
 * under a heading, which is the whole reason this is not an inline `.trim()`.
 */
function noteText(value: string | null | undefined, max: number): string {
  return String(value ?? "").trim().slice(0, max);
}

/** The stored comma-joined answer, back as the list it was picked from. */
function splitList(value: string | null | undefined): string[] {
  return String(value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, GUEST_RESPONSE_LIMITS.picks);
}

function asStatus(value: unknown): GuestPassStatus {
  return (GUEST_PASS_STATUSES as readonly string[]).includes(String(value))
    ? (value as GuestPassStatus)
    : "nieuw";
}

/**
 * The door. Everything the guest pass renders comes through this function and
 * nothing else does.
 *
 * Deliberately dropped, with the reason, because the next person to add a
 * field to Reservations will read this list and has to decide where their
 * field belongs:
 *
 *   email        — the booker's address. Handing it to a party of ten is how
 *                  it ends up on a mailing list.
 *   phone        — same, and worse: it is a direct line to one person.
 *   notes        — free text the booker wrote to the kitchen, in confidence.
 *                  "My mother is recovering from chemo" is a note. It is not
 *                  for the group chat. Not to be confused with `guestNote`,
 *                  which is let through: see below.
 *   occasion     — the retired version of the same thing.
 *   name         — only `firstNameOf(name)` survives; the surname never does.
 *   id           — an id invites walking to the next one. Nothing on this page
 *                  needs it, so nothing on this page gets it.
 *   guestToken   — the page already has the token from its own URL; echoing
 *                  the secret back into the HTML would put it in caches and
 *                  screenshots for no gain at all.
 *   guestNote    — LET THROUGH. The owners wrote it in a field whose label in
 *                  the admin says it goes to the whole party; a note nobody
 *                  can read is not a note. It is capped here all the same.
 *   duration     — a kitchen planning number. It decides the length of the
 *                  calendar event and stops there.
 *   source       — bookkeeping.
 *   emailStatus, emailError, emailSentAt — bookkeeping, and the error text can
 *                  quote the booker's address verbatim.
 *   createdAt, updatedAt — of no interest to a guest, and updatedAt would leak
 *                  when the owners last touched the row.
 *   guestResponses[].addedAt — nobody needs to know who answered last.
 *   guestResponses[].note    — LET THROUGH, and worth saying why, because it
 *                  is the first free text on this list that is not dropped.
 *                  A companion's remark is written into a box that sits on
 *                  this very page, directly above the list it appears in, and
 *                  showing it back to the party is the entire point of asking
 *                  for it: "ik kom een half uur later" is of no use to anyone
 *                  if only the kitchen reads it. The obvious danger — someone
 *                  typing a phone number into a page that lives in a group
 *                  chat — is handled where the words are written rather than
 *                  here: /api/guest-pass refuses a remark containing a
 *                  telephone number or an e-mail address and says so, so the
 *                  guest keeps their own words instead of watching them come
 *                  back quietly mangled. Text the owners type into the row by
 *                  hand in the admin does not pass that door, and does not
 *                  need to: they are the house, correcting a typo on their own
 *                  guest list.
 *   guestResponses[].id      — Payload's row key, and no kind of secret: it is
 *                  a BSON ObjectID whose trailing counter simply increments,
 *                  so three answers to the same table are three consecutive
 *                  ids. It never leaves the server in any form. What the
 *                  browser that wrote a row is given instead is the
 *                  unguessable handle from `responseEditKey` below, in the
 *                  POST response body only.
 */
export function redactForGuests(doc: ReservationDoc): GuestPassView {
  const time = String(doc.time ?? "");
  const guests = typeof doc.guests === "number" ? doc.guests : null;

  return {
    firstName: firstNameOf(doc.name),
    date: String(doc.date ?? "").slice(0, 10),
    time: /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : "",
    guests: guests !== null && guests > 0 ? Math.floor(guests) : null,
    status: asStatus(doc.status),
    houseNote: noteText(doc.guestNote, MAX_HOUSE_NOTE),
    responses: (doc.guestResponses ?? [])
      .slice(0, MAX_GUEST_RESPONSES)
      .map((row) => ({
        name: firstNameOf(row.name),
        dietary: splitList(row.dietary),
        drinks: splitList(row.drinks),
        note: noteText(row.note, GUEST_RESPONSE_LIMITS.note),
      }))
      // A row with no name left after redaction is a row the owners emptied
      // by hand in the admin. Showing a blank line would only look broken.
      .filter((row) => row.name.length > 0),
  };
}

/**
 * The handle a companion keeps so they can come back and change their answer.
 *
 * The obvious thing to hand out is the array row's own id, and it was, and it
 * was wrong. Payload mints BSON ObjectIDs: twelve bytes of which the last
 * three are a counter that goes up by one each time, so the answers of one
 * party are consecutive numbers. Anyone who had answered once held a valid
 * "proof" that they had written the row before theirs and the row after it,
 * and could overwrite either — on a page whose whole audience is a WhatsApp
 * group.
 *
 * What is needed is a value the holder of a row id cannot compute, and the
 * cheapest one that needs no new column is a signature: HMAC-SHA256 over the
 * reservation and the row, keyed by the server's own secret. The party knows
 * the link, and may well be able to guess a neighbouring row id, but without
 * PAYLOAD_SECRET none of that produces a key — and the key is never rendered
 * into the page, only returned in the body of the POST that wrote the row.
 *
 * Being derived rather than stored is the point: there is nothing extra on the
 * document for the admin to show by accident, nothing to migrate, and nothing
 * that survives in a backup. The price is that rotating PAYLOAD_SECRET makes
 * every remembered handle stop matching, and a guest whose handle no longer
 * matches adds a second line instead of editing their first. That is a bad
 * afternoon for a table of ten, not a data loss, and it is the same thing that
 * happens when they open the link on a different phone.
 */
function editKeySecret(): string {
  // Mirrors payloadSecret() in src/payload.config.ts, including its throwaway:
  // that file already refuses to boot in production without a real secret, so
  // the fallback can only ever be reached on somebody's laptop.
  return process.env.PAYLOAD_SECRET || "dev-only-insecure-secret";
}

export function responseEditKey(
  doc: Pick<ReservationDoc, "id">,
  rowId: string | null | undefined,
): string | null {
  const id = String(rowId ?? "");
  if (!id) return null;
  return createHmac("sha256", editKeySecret())
    .update(`${doc.id}:${id}`)
    .digest("base64url");
}

/**
 * Which row a returning companion is allowed to rewrite, or -1.
 *
 * Compared with `timingSafeEqual` rather than `===`. The difference is
 * academic against a phone on café wifi, but the alternative is a comment
 * explaining why a string comparison against a MAC is fine here, and there is
 * no version of that comment that stays true when somebody moves the code.
 */
export function findResponseByEditKey(
  doc: Pick<ReservationDoc, "id">,
  rows: GuestResponseRow[],
  key: string | null | undefined,
): number {
  const offered = Buffer.from(String(key ?? ""), "utf8");
  if (offered.length === 0) return -1;

  let found = -1;
  for (let index = 0; index < rows.length; index += 1) {
    const expected = responseEditKey(doc, rows[index]?.id);
    if (!expected) continue;
    const mine = Buffer.from(expected, "utf8");
    if (mine.length === offered.length && timingSafeEqual(mine, offered)) {
      found = index;
    }
  }
  return found;
}

/** The address as the printed pages set it: street, then postcode and place. */
export function addressLines(settings: SiteSettingsData): string[] {
  const { street, postalCode, area, city } = settings.address;
  const place = area ? `${area}, ${city}` : city;
  return [street, [postalCode, place].filter(Boolean).join(" ")].filter(
    (line): line is string => Boolean(line && line.trim()),
  );
}

/** The same address on one line, for a maps query and the calendar file. */
export function addressOneLine(settings: SiteSettingsData): string {
  return [settings.siteName, ...addressLines(settings), settings.address.country]
    .filter(Boolean)
    .join(", ");
}

/**
 * Two maps links, because there is no single one that works everywhere.
 *
 * A `geo:` URI is the platform-neutral answer on paper and useless in
 * practice: Android honours it, iOS Safari ignores it entirely. iOS only hands
 * a link off to Apple Maps when the host is maps.apple.com, and that host on
 * Android is a web page in Dutch about an app you cannot install.
 *
 * So the page offers both and puts Google first. The Google `dir/?api=1` form
 * is the one that degrades best: on a phone with the app installed it opens
 * the app, and everywhere else it opens a perfectly good web map. Apple Maps
 * is offered beside it for the iPhones, which is most of them here.
 */
export function googleDirectionsUrl(settings: SiteSettingsData): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    addressOneLine(settings),
  )}`;
}

export function appleDirectionsUrl(settings: SiteSettingsData): string {
  return `https://maps.apple.com/?daddr=${encodeURIComponent(
    addressOneLine(settings),
  )}`;
}

/**
 * How many minutes Europe/Amsterdam is ahead of UTC at a given instant.
 * Formatting the instant in the café's timezone and reading the wall clock
 * back as if it were UTC gives the offset without a timezone library.
 */
const AMSTERDAM = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Amsterdam",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  hourCycle: "h23",
});

function amsterdamOffsetMinutes(at: Date): number {
  const parts = AMSTERDAM.formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asIfUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return Math.round((asIfUtc - at.getTime()) / 60_000);
}

/**
 * "2026-09-12" plus "19:30" in Amsterdam, as a real instant.
 *
 * The reservation stores a wall clock, which is what the owners and the guest
 * both mean, but a calendar entry has to be an instant or it lands an hour out
 * twice a year. Reading the offset once would be wrong on the two nights the
 * clocks change, since the offset being looked up is the one at a moment we
 * are still guessing at; reading it again at the guessed instant settles it.
 */
export function amsterdamInstant(date: string, time: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const naive = Date.parse(`${date}T${time}:00.000Z`);
  if (Number.isNaN(naive)) return null;
  const first = amsterdamOffsetMinutes(new Date(naive));
  const settled = amsterdamOffsetMinutes(new Date(naive - first * 60_000));
  return new Date(naive - settled * 60_000);
}

/** How long the table is held: the row's own answer, or the house standard. */
function sittingMinutes(
  doc: ReservationDoc,
  settings: SiteSettingsData,
): number {
  const own = typeof doc.duration === "number" ? doc.duration : 0;
  if (own >= 15) return own;
  const standard = settings.reservationDurationMinutes;
  return typeof standard === "number" && standard >= 15 ? standard : 120;
}

/**
 * The reservation as a calendar entry, against the contract in @/lib/ics:
 *
 *   interface IcsEvent { uid; title; description?; location?; start: Date;
 *                        end?: Date; url?; allDay?; organizerName?;
 *                        organizerEmail? }
 *
 * Only redacted material goes in. A calendar entry outlives the page it came
 * from — it gets synced, shared with a partner's phone, and read a year later
 * — so it says no more than the page does. The `uid` is built from the token
 * rather than the row id for the same reason the page never sees the id, and
 * it is stable, so re-adding the event updates the one already in the calendar
 * instead of laying a second one on top of it.
 *
 * The house's note goes in the description, and it is the one thing here that
 * was a real decision rather than a rule. Against it: an .ics is a photograph,
 * not a window. The owners can rewrite the note tomorrow and every calendar
 * that already has the old wording keeps it, because nobody adds an event
 * twice. For it: "we houden de grote tafel bij het raam voor jullie vrij" is
 * precisely what a person wants in front of them when the reminder goes off on
 * the way over, and it is the sort of sentence that is worth nothing at all if
 * it is only ever read once, on a phone, in a hallway, on the day the link
 * arrived. The staleness is survivable because the description ends in the
 * link to the pass, which is always current and is the last thing the reader
 * sees; a note that quietly never travelled would not have that fallback.
 * Nothing extra is disclosed by any of this: the note is already shown to
 * everyone holding the link, and the calendar audience is drawn from them.
 */
export function toIcsEvent(
  doc: ReservationDoc,
  settings: SiteSettingsData,
  locale: Locale,
): IcsEvent | null {
  const view = redactForGuests(doc);
  const token = typeof doc.guestToken === "string" ? doc.guestToken : "";
  const start = amsterdamInstant(view.date, view.time);
  if (!start || !token) return null;

  const t = getDict(locale).guestPass;
  const url = guestPassUrl(locale, token);

  return {
    uid: `${token}@debeeshive.nl`,
    title: t.icsTitle(settings.siteName),
    description: t.icsDescription(settings.siteName, url, view.houseNote),
    location: addressOneLine(settings),
    start,
    end: new Date(start.getTime() + sittingMinutes(doc, settings) * 60_000),
    url,
    organizerName: settings.siteName,
    organizerEmail: settings.contactEmail || undefined,
  };
}

/**
 * Whether the evening has been and gone, decided on the server.
 *
 * The client component must not read the clock during render — a page that
 * says "this has passed" in the HTML and "it has not" after hydration is a
 * mismatch — so this is resolved here and handed down as a boolean, the same
 * way the homepage resolves today's opening hours.
 */
export function hasPassed(
  view: GuestPassView,
  settings: SiteSettingsData,
): boolean {
  const today = todayInAmsterdam();
  if (!view.date) return false;
  if (view.date < today) return true;
  if (view.date > today) return false;
  if (!view.time) return false;

  const [hours, minutes] = view.time.split(":").map(Number);
  const standard = settings.reservationDurationMinutes;
  const grace = typeof standard === "number" && standard >= 15 ? standard : 120;
  return nowMinutesInAmsterdam() > hours * 60 + minutes + grace;
}
