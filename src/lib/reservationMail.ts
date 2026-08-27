import type { Payload } from "payload";
import { canonicalUrl, resolveLocale, type Locale } from "@/i18n/config";
import { getDict } from "@/i18n/dictionaries";

/**
 * The confirmation the guest gets once the owners say yes.
 *
 * Everything else this site sends is addressed to the house: a form came in,
 * somebody is waiting. This one goes the other way, to a person who is not
 * looking at the site, will read it once on a phone, and may well forward it
 * to eleven other people before Friday. So it is written as a message and not
 * as a record — no aligned label column, short lines, a blank line between
 * paragraphs — and it names the café out loud where the site itself can say
 * "we", for the same reason `icsTitle` in the guest pass does: there is no
 * page around it to say where it came from.
 *
 * The words live here rather than in src/i18n/dict because half of them are
 * conditional, and the rule that drops a paragraph belongs next to the
 * paragraph it drops: the invitation to add wishes on the guest page is a lie
 * the moment the owners switch that page off, and an address block with
 * nothing in it is two blank lines under a heading. Keeping the copy and its
 * conditions in one module is what makes those rules readable at all. If this
 * mail ever grows a sibling, the pair belongs in a dictionary namespace of
 * their own.
 *
 * Note what this module is not allowed to reach for. It is imported by
 * src/collections/Reservations.ts, so it may not import @/lib/guestPass or
 * @/lib/payload: both of those fetch a Payload instance, which means the
 * config, which means the collection that imported this. It is handed a
 * `Payload` instead — the same arrangement @/lib/guestHistory documents — and
 * builds the guest link out of @/i18n/config, which imports nothing at all.
 *
 * The consequence of not being able to call `getSiteSettings()` is that
 * nothing here gets the merged defaults: a raw `findGlobal` returns whatever
 * is actually stored, which for a field nobody has filled in is an empty
 * string, and for a checkbox nobody has ever saved is NULL. Every value
 * therefore falls back at the point where it is used, the way `ownersAddress()`
 * in the collection already does — including the booleans, which is why
 * `guestPassEnabled` falls back with `??` and not through `Boolean()`. The one
 * block that cannot be faked is the address, and it collapses rather than
 * printing blanks.
 *
 * That collapse is the rare case and not the normal one, whatever an earlier
 * version of this paragraph claimed. The defaults in src/lib/payload.ts do
 * carry `street` and `postalCode` empty, but those defaults are not what this
 * reads: the stored site_settings row has all four parts of the address filled
 * in — "Sweder van Zuylenweg 56", "3553 HG", "Zuilen", "Utrecht" — and it is
 * the stored row a raw `findGlobal` hands back. So the address block is printed
 * in very nearly every confirmation that leaves the building, and it has to
 * read the same way as the guest pass that the same mail links to.
 */

/**
 * When the confirmation goes out, which is the owners' decision and not ours.
 *
 * It began as one behaviour — the mail leaves the moment somebody presses
 * Bevestigd — and that is still the right default, because it is how the café
 * actually works: they ring the guest back, they look at the booking, and only
 * then do they promise a table. But two other answers are just as legitimate
 * for a café that has changed its mind about how much it wants to be in the
 * loop, and neither of them should need a developer.
 *
 *   approval  the mail waits for a human. The default, and what shipped first.
 *   auto      the booking is accepted on the spot: the row is written already
 *             at Bevestigd and the guest is told straight away.
 *   off       no mail to the guest, ever. The owners ring people themselves,
 *             which is how this worked before any of it existed.
 *
 * `auto` confirms the booking outright rather than merely mailing about it,
 * and that pairing is deliberate. The confirmation opens "Het is rond. We
 * houden een tafel voor jullie vrij" — send that while the admin still lists
 * the request as untouched and the guest is holding a promise nobody in the
 * building has made. Worse, the shared guest page renders the status, so the
 * party would open the link in that mail and read "Nieuw" underneath it. The
 * two have to move together or they contradict each other in front of the
 * people they are addressed to.
 *
 * What makes accepting on the spot safe at all is that the seat count in
 * @/lib/capacity already runs before the row is written. `auto` therefore
 * cannot overbook the room; it only removes the pause in which a human would
 * have looked. That is the sentence the owners need in the CMS description,
 * because it is the question they will actually have.
 */
export const CONFIRMATION_MODES = ["approval", "auto", "off"] as const;

export type ConfirmationMode = (typeof CONFIRMATION_MODES)[number];

export const DEFAULT_CONFIRMATION_MODE: ConfirmationMode = "approval";

/**
 * The mode as it is really set, or the default for anything else.
 *
 * Anything else covers more than a typo. A global that predates the field, a
 * restored database, a settings object assembled by a test — all of them hand
 * over `undefined`, and every one of them has to mean "behave the way the café
 * behaved yesterday" rather than "start mailing guests automatically". So the
 * fallback is `approval` and never `auto`: of the three, it is the only one
 * that cannot surprise anybody, because it waits for a person.
 */
export function confirmationMode(
  settings: { reservationConfirmationMode?: string | null } | null | undefined,
): ConfirmationMode {
  const value = settings?.reservationConfirmationMode;
  return (CONFIRMATION_MODES as readonly string[]).includes(String(value))
    ? (value as ConfirmationMode)
    : DEFAULT_CONFIRMATION_MODE;
}

/**
 * Whether the guest confirmation is part of this release at all.
 *
 * It is not, yet, and that is a deliberate hold rather than an unfinished
 * feature. The whole thing works — the modes, the arming, the copy, the
 * bookkeeping — but it writes to guests, and writing to guests is the one thing
 * on this site that cannot be taken back. It wants testing against a real mail
 * server, with a real inbox to look at, before two owners who have never seen
 * it are handed a dropdown that can start it.
 *
 * So it ships switched off and out of sight: the setting is hidden in Site
 * Instellingen, the bookkeeping fields are hidden on the reservation, and
 * nothing arms and nothing sends. Off AND hidden, because a visible control
 * that quietly does nothing is worse than no control — somebody sets it to
 * "automatisch", watches a booking come in, sees no mail, and reports a bug
 * against a feature that was never on.
 *
 * A constant and not a setting, which is the point: a setting is exactly the
 * thing being withheld, and gating the feature behind the field it is meant to
 * hide would be circular. Being a constant it is also readable from the field
 * hooks, which cannot afford a database read.
 *
 * TO SHIP IT: flip this to true. That un-hides the setting and the bookkeeping,
 * and restores every mode. Nothing else has to change, and nothing that was
 * stored while it was off is lost — a reservation confirmed during the hold
 * simply never had a mail, which is what its bookkeeping already says.
 */
export const CONFIRMATION_MAIL_RELEASED = false;

/**
 * The mode as the code should act on it, which is not always the mode the CMS
 * holds.
 *
 * `confirmationMode()` above answers "what does the setting say" and is left
 * alone deliberately — it is the pure reading of a stored value, and the tests
 * pin it as such. This answers the question every caller actually has, which is
 * "so do I send anything", and while the feature is held back the answer is no
 * whatever the setting says.
 *
 * One wrapper rather than the gate repeated at each decision point. There are
 * three of them — the arming hook, the send itself, and the endpoint's
 * automatic branch — and three copies of a release flag is two chances to
 * forget it on the day it is flipped.
 */
export function effectiveConfirmationMode(
  settings: { reservationConfirmationMode?: string | null } | null | undefined,
): ConfirmationMode {
  return CONFIRMATION_MAIL_RELEASED ? confirmationMode(settings) : "off";
}

/**
 * The flag /api/reserve sets on a create it wants accepted without a human.
 *
 * It exists because the `status` field's own beforeChange hook stores "nieuw"
 * on every create no matter what was submitted, and that hook is not paranoia
 * — field-level access is bypassed by the local API, which is exactly how
 * /api/reserve writes, so the hook is the last thing standing between a public
 * form and a booking that declares itself confirmed. Passing
 * `status: "bevestigd"` in the create data alone would simply be overwritten,
 * silently, and the confirmation would never arm.
 *
 * So the exception is made narrow and explicit rather than by loosening the
 * rule. Only a caller that has already read the mode out of the CMS sets this,
 * only on a create, and everything else in the codebase keeps the old
 * guarantee: a request starts at "nieuw", full stop. The hook is deliberately
 * not allowed to read the global itself — that would be a query on every
 * single write to the collection, to re-answer a question the endpoint has
 * already answered.
 */
export const AUTO_CONFIRM = "autoConfirmReservation";

/**
 * The parts of a reservation this mail reads, spelled out rather than pulled
 * from the generated types, so that what leaves the building towards a guest
 * is a list somebody chose. The collection keeps its own list for the same
 * reason.
 */
export interface ConfirmationReservation {
  id: number | string;
  name?: string | null;
  email?: string | null;
  /** Stored at midday UTC; only the first ten characters are ever a date. */
  date?: string | null;
  time?: string | null;
  guests?: number | null;
  /** The owners' line to the party, if they wrote one. */
  guestNote?: string | null;
  guestToken?: string | null;
  locale?: string | null;
}

/** The handful of settings the mail speaks with, as stored (so: possibly blank). */
interface StoredSettings {
  siteName?: string | null;
  phone?: string | null;
  guestPassEnabled?: boolean | null;
  address?: {
    street?: string | null;
    postalCode?: string | null;
    area?: string | null;
    city?: string | null;
  } | null;
}

/** Only ever falls back to the same values src/lib/payload.ts ships as its
 *  Dutch defaults, so a guest is never told something that was never true. */
const FALLBACK_SITE_NAME = "De Bee's Hive";
const FALLBACK_PHONE = "030 785 2199";
/**
 * The shared page is on unless somebody switched it off, and an absent value is
 * not somebody switching it off.
 *
 * Both the checkbox in the CMS and the defaults in src/lib/payload.ts ship it
 * true, so this is the same value again rather than a third opinion. It is
 * written out as a constant because the mistake it replaces was invisible:
 * `Boolean(settings.guestPassEnabled)` reads a NULL — a global saved before the
 * field existed, a restored database, a global nobody has ever pressed save on
 * — as off, which is the opposite of what every other layer says. The site
 * would go on rendering the guest page and accepting answers on it while the
 * confirmation quietly dropped the link and both paragraphs that invite the
 * party to use it. No error, no badge: just the most important line of the mail
 * missing.
 */
const FALLBACK_GUEST_PASS_ENABLED = true;

/**
 * Which language this guest booked in.
 *
 * Stored on the row rather than guessed, because by the time this runs the
 * request that knew the answer is days old. A row from before the field
 * existed, or one typed in by hand, answers Dutch — which is the language of
 * the café, of the phone call the owners just made, and of everything else the
 * owners see.
 */
export function localeOf(doc: ConfirmationReservation): Locale {
  return resolveLocale(doc.locale ?? undefined);
}

/**
 * Site Instellingen, in the guest's own language and with Payload's Dutch
 * fallback left switched on. `getSiteSettings()` suppresses that fallback on
 * purpose, because an English page showing a Dutch sentence is a bug. Here it
 * is the opposite: the address and the phone number are not translated, they
 * are simply typed into the Dutch tab, and an English reader needs them just
 * as much.
 */
async function storedSettings(payload: Payload, locale: Locale): Promise<StoredSettings> {
  try {
    return (await payload.findGlobal({
      slug: "site-settings",
      locale,
      depth: 0,
      overrideAccess: true,
    })) as StoredSettings;
  } catch (error) {
    // Not worth losing a confirmation over: the date, the time and the table
    // are all on the document, and those are the sentences that matter.
    console.error("site settings unavailable for confirmation mail", error);
    return {};
  }
}

/**
 * The street and the postcode, or nothing at all.
 *
 * A copy of `addressLines()` in @/lib/guestPass rather than an import of it,
 * because that module drags the whole config in behind it (see the note at the
 * top). Both are a few lines of joining, and both must stay agreed: whichever
 * one changes, change the other.
 *
 * They stopped agreeing once, and it showed. This one preferred the city and
 * could therefore never print the district, so a party that had been sent
 * "3553 HG Utrecht" in the mail opened the page that same mail links to and
 * read "3553 HG Zuilen, Utrecht" — and then saved a calendar entry that sided
 * with the page. Two spellings of one address about one table in one evening,
 * with the mail outvoted. District first, the way the printed pages set it, is
 * what the guest pass has always done and what this now copies.
 *
 * The single deliberate difference is the guard on a blank city. Over there the
 * settings have been through `getSiteSettings()`, so `city` is at worst the
 * Dutch default; here it is whatever the row happens to hold, and joining an
 * area to an empty city would leave "Zuilen, " with the comma hanging.
 */
function addressLines(settings: StoredSettings): string[] {
  const address = settings.address ?? {};
  const area = address.area || "";
  const city = address.city || "";
  const place = area && city ? `${area}, ${city}` : area || city;
  return [
    address.street || "",
    [address.postalCode || "", place].filter(Boolean).join(" "),
  ].filter((line) => line.trim().length > 0);
}

/** The first word of the name, the way the guest pass greets people. */
function firstNameOf(value: string | null | undefined): string {
  return String(value ?? "").trim().split(/\s+/)[0] ?? "";
}

interface WrittenDate {
  /** "zaterdag 12 september 2026" */
  long: string;
  /** The same without the year, for the subject line, where the year is noise
   *  next to a date three weeks away. */
  longNoYear: string;
  /** "Zaterdag" — the caller lowercases it if its sentence needs that. */
  weekday: string;
}

/**
 * The date written out, without ever asking the server what day it is.
 *
 * `date` is stored at midday UTC precisely so that a day-only value cannot
 * slide into yesterday on a container whose TZ nobody set. Slicing to
 * YYYY-MM-DD and re-parsing at midday keeps that property, and reading the
 * names out of the dictionary rather than out of Intl keeps the mail spelling
 * "zaterdag" the same way the guest pass does — which matters, because the
 * guest is about to open both.
 */
function writeDate(value: string | null | undefined, locale: Locale): WrittenDate {
  const dict = getDict(locale);
  const iso = String(value ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    // Unreachable through the form, which will not accept a booking without a
    // date, but a mail that says the raw value is still a mail the guest can
    // ring about. Silence would be worse.
    return { long: iso, longNoYear: iso, weekday: "" };
  }
  const d = new Date(`${iso}T12:00:00.000Z`);
  const weekday = dict.weekdays[(d.getUTCDay() + 6) % 7];
  const day = String(d.getUTCDate());
  const month = dict.months[d.getUTCMonth()];
  // The dictionary capitalises its weekdays because the opening hours table
  // starts a row with them. Written into a sentence, Dutch drops that capital
  // and English keeps it, and every use of the long date here is mid-sentence.
  const inSentence = locale === "en" ? weekday : weekday.toLowerCase();
  return {
    long: `${inSentence} ${day} ${month} ${d.getUTCFullYear()}`,
    longNoYear: `${inSentence} ${day} ${month}`,
    weekday,
  };
}

/**
 * The full https link to the party's own page.
 *
 * Built here rather than imported from `guestPassUrl()` in @/lib/guestPass for
 * the cycle reason at the top of this file, and identical to it on purpose: it
 * is the same one line, `canonicalUrl(locale, "/reservering/<token>")`, so a
 * change to the route has to be made in both places.
 */
function guestPageUrl(locale: Locale, token: string): string {
  return canonicalUrl(locale, `/reservering/${encodeURIComponent(token)}`);
}

/** Whether the three paragraphs about the shared page have anything to point
 *  at. A withdrawn guest page still renders, but stops asking for wishes. */
function guestPageOffered(doc: ConfirmationReservation, settings: StoredSettings): boolean {
  const offered = settings.guestPassEnabled ?? FALLBACK_GUEST_PASS_ENABLED;
  return offered && Boolean(doc.guestToken);
}

/** "4 personen" / "1 persoon", or "" when the row somehow has no number. */
function guestsWord(doc: ConfirmationReservation, locale: Locale): string {
  const n = typeof doc.guests === "number" ? doc.guests : 0;
  return n > 0 ? getDict(locale).guestPass.guestsValue(n) : "";
}

/**
 * The subject line, which deliberately does not carry the guest's name.
 *
 * Free text out of a form has no business in a mail header, and a subject that
 * reads the same in every inbox is the one a party recognises when they go
 * looking for it on the night.
 */
export async function confirmationSubject(
  doc: ConfirmationReservation,
  payload: Payload,
): Promise<string> {
  const locale = localeOf(doc);
  const settings = await storedSettings(payload, locale);
  const siteName = settings.siteName || FALLBACK_SITE_NAME;
  const when = writeDate(doc.date, locale);
  const time = doc.time || "";
  return locale === "en"
    ? `Your table at ${siteName} is ready — ${when.longNoYear} at ${time}`
    : `Jullie tafel bij ${siteName} staat klaar — ${when.longNoYear} om ${time}`;
}

/**
 * The mail itself, as paragraphs.
 *
 * Assembled as a list of blocks that are then joined with a blank line, so a
 * paragraph that does not apply takes its own empty line with it instead of
 * leaving a hole. The URL sits alone on its line with no full stop after it:
 * several mail apps pull a trailing dot into the link, and the person that
 * breaks it for is the one who was trying to share the table.
 */
export async function confirmationBody(
  doc: ConfirmationReservation,
  payload: Payload,
): Promise<string> {
  const locale = localeOf(doc);
  const settings = await storedSettings(payload, locale);
  const siteName = settings.siteName || FALLBACK_SITE_NAME;
  const phone = settings.phone || FALLBACK_PHONE;
  const when = writeDate(doc.date, locale);
  const time = doc.time || "";
  const guests = guestsWord(doc, locale);
  const houseNote = String(doc.guestNote ?? "").trim();
  const lines = addressLines(settings);
  const url = guestPageOffered(doc, settings)
    ? guestPageUrl(locale, String(doc.guestToken))
    : "";

  const blocks = locale === "en" ? englishBlocks() : dutchBlocks();

  return blocks.filter((block) => block.length > 0).join("\n\n");

  function dutchBlocks(): string[] {
    return [
      `Hoi ${firstNameOf(doc.name)},`,
      // Two whole sentences rather than one with a hole in it: a table for a
      // party whose size the row has lost is still a table, and "een tafel
      // voor niet doorgegeven" is not something anybody would write.
      guests
        ? `Het is rond. We houden ${when.long} om ${time} een tafel voor ${guests} voor jullie vrij. Leuk dat jullie komen.`
        : `Het is rond. We houden ${when.long} om ${time} een tafel voor jullie vrij. Leuk dat jullie komen.`,
      // Bare, with no heading above it: the whole mail is already in the
      // owners' own voice, so a label would only make their sentence look like
      // an attachment to it.
      houseNote,
      url ? "Alles over jullie avond staat op je eigen pagina:" : "",
      url,
      url
        ? "Daar kun je doorgeven wat er verder nog is: een allergie, iets wat iemand niet eet, een kinderstoel, een verjaardag. Wat daar staat, leest de keuken voordat jullie komen."
        : "",
      url
        ? "Stuur die link gerust door aan iedereen die meekomt — hij is om te delen. Dan kan ieder zijn eigen wensen erbij zetten, en weet iedereen hoe laat en waar."
        : "",
      lines.length > 0 ? ["Je vindt ons hier:", ...lines].join("\n") : "",
      `Bellen kan op ${phone}.`,
      "Komt er iets tussen, wordt het later, of komt er iemand bij? Bel ons even of stuur gewoon een antwoord op dit mailtje. Hoe eerder we het weten, hoe makkelijker we schuiven — en met een tafel die vrijkomt maak je iemand anders blij.",
      // Dutch weekdays lose their capital in the middle of a sentence and
      // English ones keep it, which is why the two closings are written out
      // separately instead of one of them lowercasing the other.
      `Tot ${when.weekday.toLowerCase()},\n${siteName}`,
    ];
  }

  function englishBlocks(): string[] {
    return [
      `Hi ${firstNameOf(doc.name)},`,
      guests
        ? `It's all set. We're keeping a table for ${guests} on ${when.long} at ${time}. Lovely that you're coming.`
        : `It's all set. We're keeping a table for you on ${when.long} at ${time}. Lovely that you're coming.`,
      houseNote,
      url ? "Everything about your evening lives on your own page:" : "",
      url,
      url
        ? "That's where you can pass on anything else: an allergy, something someone doesn't eat, a high chair, a birthday. Whatever's on that page, the kitchen reads before you arrive."
        : "",
      url
        ? "Do send the link on to everyone who's joining — it's meant to be shared. Then each of them can add what they'd like, and everyone knows when and where."
        : "",
      lines.length > 0 ? ["You'll find us here:", ...lines].join("\n") : "",
      `You can call us on ${phone}.`,
      "Something come up, running late, or one more coming along? Give us a ring or just reply to this email. The sooner we know, the easier it is to shuffle things — and a table that comes free makes someone else's evening.",
      `See you ${when.weekday},\n${siteName}`,
    ];
  }
}
