import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildIcs,
  googleCalendarUrl,
  icsFilename,
  outlookCalendarUrl,
  type IcsEvent,
} from "@/lib/ics";
import { freezeAt } from "../support/time";

/**
 * The calendar file, which is the one thing this site produces that is read by
 * software rather than by a person — and by software that is famously
 * unforgiving. Apple Calendar on iOS drops an event with no DTSTAMP and
 * reports nothing; a TZID with no VTIMEZONE beside it is refused outright; a
 * bare LF instead of a CRLF is accepted by some clients and silently ignored
 * by others. None of that is visible by opening the file in a text editor,
 * which is why it is asserted here.
 */

afterEach(() => {
  vi.useRealTimers();
});

const event = (overrides: Partial<IcsEvent> = {}): IcsEvent => ({
  uid: "abc123",
  title: "Tafel bij De Bee's Hive",
  start: new Date("2026-09-19T17:30:00.000Z"),
  ...overrides,
});

/** Physical lines, with the trailing CRLF of the file already accounted for. */
const physicalLines = (ics: string) => ics.slice(0, -2).split("\r\n");

/** The reverse of the folding, so a value can be compared with what went in. */
const unfold = (ics: string) => ics.replace(/\r\n /g, "");

const valueOf = (ics: string, property: string) =>
  unfold(ics)
    .split("\r\n")
    .find((line) => line.startsWith(`${property}:`))
    ?.slice(property.length + 1);

describe("buildIcs: the shape of the file", () => {
  const ics = () => buildIcs([event()]);

  it("ends every line with CRLF, including the last", () => {
    expect(ics().endsWith("\r\n")).toBe(true);
    expect(ics().replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("wraps everything in a VCALENDAR with the properties clients look for", () => {
    const lines = physicalLines(ics());
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines.at(-1)).toBe("END:VCALENDAR");
    expect(lines).toContain("VERSION:2.0");
    expect(lines).toContain("METHOD:PUBLISH");
    expect(lines).toContain("CALSCALE:GREGORIAN");
  });

  it("gives every event a DTSTAMP, and the same one to all of them", () => {
    // It records when the document was produced, which is one moment rather
    // than one moment per event — and an event without one is an event iOS
    // drops without saying so.
    freezeAt("2026-09-01T09:00:00Z");
    const file = buildIcs([event({ uid: "one" }), event({ uid: "two" })]);
    const stamps = physicalLines(file).filter((line) => line.startsWith("DTSTAMP:"));
    expect(stamps).toHaveLength(2);
    expect(new Set(stamps).size).toBe(1);
    expect(stamps[0]).toBe("DTSTAMP:20260901T090000Z");
  });

  it("names the calendar when asked to", () => {
    const file = buildIcs([event()], { calendarName: "De Bee's Hive" });
    expect(physicalLines(file)).toContain("X-WR-CALNAME:De Bee's Hive");
  });
});

describe("buildIcs: folding at 75 octets", () => {
  it("keeps every physical line inside the limit, measured in bytes", () => {
    // Bytes, not characters. Measuring `.length` would let a line of accented
    // text through at well over the limit, which is exactly the bug this
    // guards: `Buffer.byteLength` is the measurement that matters.
    const file = buildIcs([
      event({
        title: "Tafel ".repeat(40),
        description: "é".repeat(200),
        location: "🐝".repeat(50),
      }),
    ]);
    for (const line of physicalLines(file)) {
      expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
    }
  });

  it("begins each continuation with exactly one space", () => {
    const file = buildIcs([event({ title: "x".repeat(200) })]);
    const continuations = physicalLines(file).filter((line) => line.startsWith(" "));
    expect(continuations.length).toBeGreaterThan(0);
    for (const line of continuations) expect(line.startsWith("  ")).toBe(false);
  });

  it("unfolds back to exactly what went in", () => {
    const title = "Tafel voor acht bij De Bee's Hive in Zuilen, Utrecht ".repeat(4).trim();
    const file = buildIcs([event({ title })]);
    // The escaping puts a backslash in front of each comma; the value is
    // otherwise the original.
    expect(valueOf(file, "SUMMARY")).toBe(title.replace(/,/g, "\\,"));
  });

  it("never splits a multi-byte character in half", () => {
    const file = buildIcs([event({ title: "é".repeat(100) })]);
    // A fold that landed inside a UTF-8 sequence would show up as U+FFFD once
    // the bytes are decoded again.
    expect(Buffer.from(file, "utf8").toString("utf8")).not.toContain("�");
    expect(valueOf(file, "SUMMARY")).toBe("é".repeat(100));
  });

  it("never splits an emoji's surrogate pair", () => {
    const file = buildIcs([event({ title: "🐝".repeat(60) })]);
    expect(file).not.toContain("�");
    expect(valueOf(file, "SUMMARY")).toBe("🐝".repeat(60));
  });
});

describe("buildIcs: escaping", () => {
  it("escapes the backslash first, so it does not eat its successors", () => {
    // The input "a\,b" has to come out as "a\\\,b": one escaped backslash and
    // one escaped comma. Doing the comma first would produce "a\\,b", which
    // reads back as a literal backslash followed by a value separator.
    const file = buildIcs([event({ title: "a\\,b" })]);
    expect(valueOf(file, "SUMMARY")).toBe("a\\\\\\,b");
  });

  it("escapes commas, semicolons and newlines", () => {
    const file = buildIcs([event({ title: "een, twee; drie\nvier" })]);
    expect(valueOf(file, "SUMMARY")).toBe("een\\, twee\\; drie\\nvier");
  });

  it("strips quotes and line breaks out of a parameter value", () => {
    // A quote inside a quoted parameter has no escape at all in the grammar,
    // so the only safe thing to do with it is drop it.
    const file = buildIcs([
      event({ organizerName: 'De "Bee\'s" Hive\r\nX-EVIL:1', organizerEmail: "info@x.nl" }),
    ]);
    const organizer = unfold(file)
      .split("\r\n")
      .find((line) => line.startsWith("ORGANIZER"));
    expect(organizer).toBe('ORGANIZER;CN="De Bee\'s HiveX-EVIL:1":mailto:info@x.nl');
  });
});

describe("buildIcs: timed events", () => {
  it("writes UTC instants and never a TZID", () => {
    // A TZID without a VTIMEZONE component beside it is what Apple refuses,
    // and there is no VTIMEZONE in this file on purpose: a UTC instant needs
    // no such component and every client converts it back correctly.
    const file = buildIcs([
      event({
        start: new Date("2026-09-19T17:30:00.000Z"),
        end: new Date("2026-09-19T19:30:00.000Z"),
      }),
    ]);
    expect(physicalLines(file)).toContain("DTSTART:20260919T173000Z");
    expect(physicalLines(file)).toContain("DTEND:20260919T193000Z");
    expect(file).not.toContain("TZID");
  });

  it("gives an event with no end two hours", () => {
    // RFC 5545 defines a VEVENT with no DTEND as taking no time at all, which
    // clients render as a sliver nobody can see.
    const file = buildIcs([event({ start: new Date("2026-09-19T17:30:00.000Z") })]);
    expect(physicalLines(file)).toContain("DTEND:20260919T193000Z");
  });
});

describe("buildIcs: all-day events", () => {
  it("writes a bare date, and a DTEND on the day after", () => {
    const file = buildIcs([
      event({ allDay: true, start: new Date("2026-09-19T10:00:00.000Z") }),
    ]);
    expect(physicalLines(file)).toContain("DTSTART;VALUE=DATE:20260919");
    // DTEND is exclusive.
    expect(physicalLines(file)).toContain("DTEND;VALUE=DATE:20260920");
  });

  it("decides the day in Amsterdam rather than in UTC", () => {
    // 23:00Z in summer is already the following day in the café, and this is
    // the assertion that proves the timeZone option is actually consulted
    // rather than merely accepted.
    const file = buildIcs([
      event({ allDay: true, start: new Date("2026-09-19T23:00:00.000Z") }),
    ]);
    expect(physicalLines(file)).toContain("DTSTART;VALUE=DATE:20260920");
  });
});

describe("buildIcs: the UID", () => {
  it("qualifies a bare uid with the site's domain", () => {
    expect(physicalLines(buildIcs([event({ uid: "abc123" })]))).toContain(
      "UID:abc123@debeeshive.nl",
    );
  });

  it("leaves a uid that already has a domain alone", () => {
    expect(physicalLines(buildIcs([event({ uid: "abc@elders.nl" })]))).toContain(
      "UID:abc@elders.nl",
    );
  });

  it("strips whitespace out of it", () => {
    expect(physicalLines(buildIcs([event({ uid: " abc 123 " })]))).toContain(
      "UID:abc123@debeeshive.nl",
    );
  });
});

describe("googleCalendarUrl", () => {
  it("carries the window, the timezone and the link at the foot of the notes", () => {
    const url = new URL(
      googleCalendarUrl(
        event({
          end: new Date("2026-09-19T19:30:00.000Z"),
          description: "Tot dan",
          url: "https://debeeshive.nl/reservering/abc",
          location: "Sweder van Zuylenweg 56",
        }),
      ),
    );
    expect(url.searchParams.get("dates")).toBe("20260919T173000Z/20260919T193000Z");
    expect(url.searchParams.get("ctz")).toBe("Europe/Amsterdam");
    // Google has no field for a link, so it goes under the notes with a blank
    // line above it.
    expect(url.searchParams.get("details")).toBe(
      "Tot dan\n\nhttps://debeeshive.nl/reservering/abc",
    );
    expect(url.searchParams.get("location")).toBe("Sweder van Zuylenweg 56");
  });
});

describe("outlookCalendarUrl", () => {
  it("uses ISO instants for a timed event", () => {
    const url = new URL(
      outlookCalendarUrl(event({ end: new Date("2026-09-19T19:30:00.000Z") })),
    );
    expect(url.searchParams.get("startdt")).toBe("2026-09-19T17:30:00.000Z");
    expect(url.searchParams.get("enddt")).toBe("2026-09-19T19:30:00.000Z");
    expect(url.searchParams.get("allday")).toBeNull();
  });

  it("uses hyphenated days for an all-day event", () => {
    const url = new URL(
      outlookCalendarUrl(event({ allDay: true, start: new Date("2026-09-19T10:00:00Z") })),
    );
    expect(url.searchParams.get("allday")).toBe("true");
    expect(url.searchParams.get("startdt")).toBe("2026-09-19");
  });
});

describe("icsFilename", () => {
  it("collapses an accented spelling onto the same slug", () => {
    // "Proeverij" and "Proeverĳ" should not become two different files in
    // somebody's downloads folder.
    expect(icsFilename("Proeverij")).toBe("proeverij.ics");
    expect(icsFilename("Proëverij")).toBe("proeverij.ics");
  });

  it("turns punctuation into hyphens and trims the ends", () => {
    expect(icsFilename("  Tafel: 19:00 — De Bee's Hive!  ")).toBe(
      "tafel-19-00-de-bee-s-hive.ics",
    );
  });

  it("caps the slug and leaves no hyphen at the cut", () => {
    const name = icsFilename(`${"a".repeat(59)} beeshive`);
    expect(name).toBe(`${"a".repeat(59)}.ics`);
    expect(name).not.toContain("-.ics");
  });

  it("falls back to a name rather than producing a dotfile", () => {
    expect(icsFilename("!!!")).toBe("evenement.ics");
    expect(icsFilename("")).toBe("evenement.ics");
  });
});
