/**
 * An iCalendar writer, written out by hand.
 *
 * The whole of it exists because the alternative is a dependency, and every
 * .ics library on npm carries a timezone database, a recurrence engine and a
 * parser we would never call. What a visitor gets from this site is one
 * evening, already resolved to a real instant by src/lib/events.ts, so the
 * only hard part left is the file format itself — and the file format is
 * fussy in a small number of very specific ways.
 *
 * Those ways, in the order they break things:
 *
 *   - Lines end in CRLF. Not LF. A file with bare newlines is read by some
 *     clients and silently rejected by others, which is the worst kind of bug
 *     to have in a download button.
 *   - Lines are folded at 75 OCTETS, not characters. Fold in the middle of a
 *     multi-byte sequence and a title with an é in it arrives as mojibake.
 *     A continuation line begins with one space, and that space counts toward
 *     the 75, which is why the second and later chunks get 74.
 *   - Inside a TEXT value, a comma, a semicolon and a backslash are all
 *     structural and have to be escaped, and a newline becomes a literal \n.
 *     The backslash has to be escaped first or it eats the escapes added
 *     after it.
 *   - DTSTAMP is required on every VEVENT. Apple Calendar on iOS drops an
 *     event without one on the floor and reports nothing.
 *   - UID must be stable and globally unique. Stable is what makes a second
 *     download of the same evening update the entry the visitor already has
 *     rather than duplicate it, so the caller passes an id derived from the
 *     event and its date, and we hang @debeeshive.nl off the end of it.
 *   - An all-day event is DTSTART;VALUE=DATE with no time at all, and its
 *     DTEND is the day AFTER the last one. Give it a time and Apple shows a
 *     midnight-to-midnight block instead of a banner across the top.
 *   - METHOD:PUBLISH tells a client this is an announcement rather than an
 *     invitation it should RSVP to.
 *
 * Timed events are written in UTC, with the trailing Z. The tempting
 * alternative — DTSTART;TZID=Europe/Amsterdam — is only legal if the file
 * also carries a matching VTIMEZONE component, and a TZID without one is
 * precisely the thing Apple Calendar refuses to import. A UTC instant needs
 * no such component and every client on earth converts it back into the
 * visitor's own clock correctly.
 */

export interface IcsEvent {
  uid: string;
  title: string;
  description?: string;
  location?: string;
  /** A real UTC instant, not a wall-clock time pretending to be one. */
  start: Date;
  end?: Date;
  url?: string;
  allDay?: boolean;
  organizerName?: string;
  organizerEmail?: string;
}

export interface IcsOptions {
  /** Shown as the name of the calendar by clients that subscribe to a feed. */
  calendarName?: string;
  /**
   * Which calendar an all-day date belongs to. Only all-day events consult
   * it: a VALUE=DATE has no offset of its own, so "the 4th of March" has to
   * be decided from somewhere, and for this café it is Amsterdam.
   */
  timeZone?: string;
}

/** The café's own clock, and the domain the UIDs are hung off. */
const DEFAULT_TZ = "Europe/Amsterdam";
const UID_DOMAIN = "debeeshive.nl";

/**
 * An evening with no stated end. RFC 5545 permits a VEVENT with neither
 * DTEND nor DURATION and defines it as taking no time at all, which clients
 * render as a zero-width sliver a visitor cannot see. Two hours is the
 * honest guess for a café evening and it is at least visible.
 */
const DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000;

/** Octets this character occupies once encoded as UTF-8. */
function utf8Length(char: string): number {
  const code = char.codePointAt(0) ?? 0;
  if (code < 0x80) return 1;
  if (code < 0x800) return 2;
  if (code < 0x10000) return 3;
  return 4;
}

/**
 * Fold one content line to 75 octets. Iterating the string with for..of walks
 * code points rather than UTF-16 units, so an emoji made of a surrogate pair
 * is never torn in half either.
 */
function foldLine(line: string): string {
  const chunks: string[] = [];
  let current = "";
  let octets = 0;
  let limit = 75;

  for (const char of line) {
    const size = utf8Length(char);
    if (octets + size > limit) {
      chunks.push(current);
      current = "";
      octets = 0;
      // The leading space on a continuation line is itself one of the 75.
      limit = 74;
    }
    current += char;
    octets += size;
  }
  chunks.push(current);

  return chunks.join("\r\n ");
}

/** Escape a TEXT value. The backslash goes first or it eats its successors. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * Escape a parameter value such as the CN on an ORGANIZER. Parameters are
 * quoted rather than backslash-escaped, and a quote inside one has no escape
 * at all in the grammar, so the only safe thing to do with it is drop it.
 */
function quoteParam(value: string): string {
  return `"${value.replace(/["\r\n]/g, "")}"`;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** 20260304T190000Z */
function utcStamp(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/** The calendar day an instant falls on, seen from `timeZone`: 20260304. */
function dateStamp(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return parts.replace(/-/g, "");
}

/** The same, one day later, for the exclusive DTEND of an all-day event. */
function nextDateStamp(date: Date, timeZone: string): string {
  return dateStamp(new Date(date.getTime() + 86400000), timeZone);
}

/** Anything without an @ is ours; anything with one is left alone. */
function qualifyUid(uid: string): string {
  const clean = uid.replace(/[\s]/g, "");
  return clean.includes("@") ? clean : `${clean}@${UID_DOMAIN}`;
}

function lines(event: IcsEvent, stamp: string, timeZone: string): string[] {
  const out: string[] = ["BEGIN:VEVENT"];
  out.push(`UID:${qualifyUid(event.uid)}`);
  out.push(`DTSTAMP:${stamp}`);

  if (event.allDay) {
    out.push(`DTSTART;VALUE=DATE:${dateStamp(event.start, timeZone)}`);
    // DTEND is exclusive: the day after the last day the event covers.
    const last = event.end ?? event.start;
    out.push(`DTEND;VALUE=DATE:${nextDateStamp(last, timeZone)}`);
  } else {
    out.push(`DTSTART:${utcStamp(event.start)}`);
    const end = event.end ?? new Date(event.start.getTime() + DEFAULT_DURATION_MS);
    out.push(`DTEND:${utcStamp(end)}`);
  }

  out.push(`SUMMARY:${escapeText(event.title)}`);
  if (event.description) out.push(`DESCRIPTION:${escapeText(event.description)}`);
  if (event.location) out.push(`LOCATION:${escapeText(event.location)}`);
  if (event.url) out.push(`URL;VALUE=URI:${event.url}`);
  if (event.organizerEmail) {
    const cn = event.organizerName ? `;CN=${quoteParam(event.organizerName)}` : "";
    out.push(`ORGANIZER${cn}:mailto:${event.organizerEmail}`);
  }

  // SEQUENCE and STATUS are what let a re-download of the same UID be read as
  // "this again, unchanged" rather than as a conflicting second copy.
  out.push("SEQUENCE:0");
  out.push("STATUS:CONFIRMED");
  out.push("TRANSP:OPAQUE");
  out.push("END:VEVENT");
  return out;
}

export function buildIcs(events: IcsEvent[], opts: IcsOptions = {}): string {
  const timeZone = opts.timeZone || DEFAULT_TZ;
  // One DTSTAMP for the whole file: it records when this document was
  // produced, which is one moment, not one moment per event.
  const stamp = utcStamp(new Date());

  const out: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//De Bee's Hive//Agenda//NL",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  if (opts.calendarName) {
    // Not standard, but it is what Apple and Google both read to name a
    // subscribed calendar, and there is no standard property that does it.
    out.push(`X-WR-CALNAME:${escapeText(opts.calendarName)}`);
    out.push(`NAME:${escapeText(opts.calendarName)}`);
  }
  out.push(`X-WR-TIMEZONE:${timeZone}`);

  for (const event of events) out.push(...lines(event, stamp, timeZone));
  out.push("END:VCALENDAR");

  // Folded last, so nothing above has to think about line length, and with a
  // trailing CRLF because a file that ends mid-line is a truncated file.
  return out.map(foldLine).join("\r\n") + "\r\n";
}

/** ISO instant without punctuation, which is what both web calendars want. */
function webStamp(date: Date, allDay: boolean, timeZone: string): string {
  return allDay ? dateStamp(date, timeZone) : utcStamp(date);
}

export function googleCalendarUrl(event: IcsEvent, opts: IcsOptions = {}): string {
  const timeZone = opts.timeZone || DEFAULT_TZ;
  const start = webStamp(event.start, Boolean(event.allDay), timeZone);
  const end = event.allDay
    ? nextDateStamp(event.end ?? event.start, timeZone)
    : utcStamp(event.end ?? new Date(event.start.getTime() + DEFAULT_DURATION_MS));

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${start}/${end}`,
  });
  // Google has no field for a link, so it goes at the foot of the notes.
  const details = [event.description, event.url].filter(Boolean).join("\n\n");
  if (details) params.set("details", details);
  if (event.location) params.set("location", event.location);
  params.set("ctz", timeZone);

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function outlookCalendarUrl(event: IcsEvent, opts: IcsOptions = {}): string {
  const timeZone = opts.timeZone || DEFAULT_TZ;
  // outlook.live.com is the personal-account host; the office.com deeplink is
  // the same route but only resolves for a work or school tenant, which is
  // not what a visitor to a café website is signed into.
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: event.title,
  });

  if (event.allDay) {
    params.set("allday", "true");
    params.set("startdt", isoDate(event.start, timeZone));
    params.set("enddt", isoDate(event.end ?? event.start, timeZone));
  } else {
    params.set("startdt", event.start.toISOString());
    params.set(
      "enddt",
      (event.end ?? new Date(event.start.getTime() + DEFAULT_DURATION_MS)).toISOString(),
    );
  }

  const body = [event.description, event.url].filter(Boolean).join("\n\n");
  if (body) params.set("body", body);
  if (event.location) params.set("location", event.location);

  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}

/** 2026-03-04, for the two places that want a hyphenated day. */
function isoDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * A filename a visitor can recognise in their downloads folder. Accents are
 * decomposed and their marks dropped rather than transliterated, because
 * "proeverij" and "proeverij" should not become two different files, and
 * anything left that is not a letter or a digit becomes a hyphen — Windows,
 * macOS and Android disagree about which punctuation is legal in a filename
 * and agree about nothing else.
 */
export function icsFilename(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return `${slug || "evenement"}.ics`;
}
