import { NextResponse } from "next/server";
import { getPayloadClient, getSiteSettings } from "@/lib/payload";
import { rateLimit, readJsonBody } from "@/lib/apiGuard";
import type { ReservationError } from "@/lib/reservationErrors";
import {
  LEAD_MINUTES,
  isBookable,
  nowMinutesInAmsterdam,
  todayInAmsterdam,
  parseWeek,
  weekIsEmpty,
  weekdayIndex,
} from "@/lib/openingHours";

/**
 * Public endpoint for reservation requests.
 *
 * Everything is validated here, on the server: the browser form is a
 * convenience, not a gate. The document is assembled field by field on
 * purpose, never spread from the request body, so a caller cannot smuggle in
 * `status`, `source` or any other field the form has no business setting.
 *
 * Refusals answer with a code from src/lib/reservationErrors.ts rather than a
 * sentence. The site is bilingual, and a Dutch sentence is not something the
 * English page can do anything sensible with.
 */

const MAX = {
  name: 120,
  email: 200,
  phone: 40,
  time: 10,
  occasion: 120,
  notes: 2000,
};

const fail = (code: ReservationError, status = 400) =>
  NextResponse.json({ error: code }, { status });

/** Trims and caps; anything that is not a string becomes an empty string. */
function str(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max + 1) : "";
}

export async function POST(request: Request) {
  if (!rateLimit(request, "reserve")) {
    return fail("rateLimited", 429);
  }

  const read = await readJsonBody(request);
  if (!read.ok) {
    return fail(read.status === 413 ? "tooLarge" : "badRequest", read.status);
  }
  const input = read.data;

  try {

    // Honeypot: a field no human ever sees, let alone fills in. Answer 200 so
    // a bot cannot tell a swallowed submission from a stored one.
    if (str(input.website, 200)) {
      return NextResponse.json({ ok: true });
    }

    const name = str(input.name, MAX.name);
    const email = str(input.email, MAX.email);
    const phone = str(input.phone, MAX.phone);
    const date = str(input.date, 10);
    const time = str(input.time, MAX.time);
    const occasion = str(input.occasion, MAX.occasion);
    const notes = str(input.notes, MAX.notes);

    if (!name) return fail("nameRequired");
    if (name.length > MAX.name) return fail("nameTooLong");

    // The phone number is how the café confirms a table, so it is no longer
    // optional — which is also why nothing asks the guest to ring up about a
    // large party any more.
    if (!phone) return fail("phoneRequired");
    if (phone.length > MAX.phone) return fail("phoneTooLong");

    if (!email) return fail("emailRequired");
    if (email.length > MAX.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return fail("emailInvalid");
    }
    if (occasion.length > MAX.occasion) return fail("occasionTooLong");
    if (notes.length > MAX.notes) return fail("notesTooLong");

    // Guests: a whole number, and a party bigger than 20 needs a phone call.
    // Kept in step with `max` on the form field and with the hint beneath it.
    const guestsRaw = input.guests;
    const guests =
      typeof guestsRaw === "number"
        ? guestsRaw
        : typeof guestsRaw === "string" && guestsRaw.trim() !== ""
          ? Number(guestsRaw)
          : NaN;
    if (!Number.isInteger(guests) || guests < 1 || guests > 20) {
      return fail("guestsInvalid");
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail("dateRequired");
    const parsed = new Date(`${date}T12:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) return fail("dateInvalid");
    // Round trip check, so 2026-02-31 is caught instead of rolling into March.
    if (parsed.toISOString().slice(0, 10) !== date) {
      return fail("dateInvalid");
    }
    if (date < todayInAmsterdam()) {
      return fail("datePast");
    }
    const horizon = new Date();
    horizon.setFullYear(horizon.getFullYear() + 1);
    if (date > horizon.toISOString().slice(0, 10)) {
      return fail("dateTooFar");
    }

    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return fail("timeInvalid");

    // The form only offers times the café is actually open for, but the form
    // is a convenience and not a gate: check the same schedule here, against
    // the same CMS rows, so a hand-rolled request cannot book a table for a
    // Tuesday when the doors are shut.
    const settings = await getSiteSettings();
    const week = parseWeek(settings.openingHours);
    if (!weekIsEmpty(week)) {
      const index = weekdayIndex(date);
      const ranges = index === null ? [] : week[index];
      if (ranges.length === 0) return fail("dayClosed");
      // Today is measured against the clock as well: a table an hour from now
      // is a phone call, and one this morning is not a booking at all.
      const notBefore =
        date === todayInAmsterdam()
          ? nowMinutesInAmsterdam() + LEAD_MINUTES
          : -1;
      if (!isBookable(ranges, time)) return fail("timeOutsideHours");
      if (!isBookable(ranges, time, notBefore)) return fail("timePassed");
    }

    const payload = await getPayloadClient();

    // The owners are told by the collection's own afterChange hook rather than
    // from here (see src/lib/outboundEmail.ts). The row is created with
    // emailStatus "pending", the hook sends the message and writes the outcome
    // back onto the row, and a failed send is then a retry the owners can do
    // from the admin. Sending from this route as well would mail every request
    // twice, which is precisely what moving the send out of it was meant to end.
    await payload.create({
      collection: "reservations",
      data: {
        name,
        email,
        phone,
        // Stored at midday UTC: a dayOnly field must not slide to the day
        // before or after when it is rendered in another timezone.
        date: parsed.toISOString(),
        time,
        guests,
        occasion: occasion || undefined,
        notes: notes || undefined,
        // Never read from the request. A request starts as "nieuw", full stop.
        status: "nieuw",
        source: "website",
      },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return fail("server", 500);
  }
}
