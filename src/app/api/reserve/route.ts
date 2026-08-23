import { NextResponse } from "next/server";
import { getPayloadClient, getSiteSettings } from "@/lib/payload";
import { rateLimit, readJsonBody } from "@/lib/apiGuard";
import type { ReservationError } from "@/lib/reservationErrors";
import { canSeat } from "@/lib/capacity";
import { loadSchedule } from "@/lib/schedule";
import {
  isBookable,
  nowMinutesInAmsterdam,
  slotsFor,
  todayInAmsterdam,
  weekIsEmpty,
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
 *
 * Two things it deliberately no longer does. It does not read the seven weekly
 * CMS rows itself — src/lib/schedule.ts does, and folds the repeating rules and
 * the one-off exceptions in, so a table on the last Sunday of the month is
 * accepted and one on a closed Boxing Day is not. And it does not send the
 * mail: the row is created with `emailStatus` "pending" and the collection's
 * own afterChange hook takes it from there (see src/lib/outboundEmail.ts), so a
 * mail server having a bad afternoon can no longer fail a booking that is
 * already safely stored.
 */

const MAX = {
  name: 120,
  email: 200,
  phone: 40,
  time: 10,
  occasion: 120,
  notes: 2000,
};

/** Used whenever the CMS number is missing or nonsense. */
const FALLBACK = {
  maxPartySize: 20,
  leadMinutes: 60,
  horizonDays: 90,
  durationMinutes: 120,
};

const fail = (code: ReservationError, status = 400) =>
  NextResponse.json({ error: code }, { status });

/** Trims and caps; anything that is not a string becomes an empty string. */
function str(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max + 1) : "";
}

/** A CMS number that is actually a number, or the fallback. */
function count(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
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

    const settings = await getSiteSettings();

    // The owners can take the form out of service — a long closure, a kitchen
    // rebuild — and while it is off nothing is accepted, however the request
    // got here.
    if (settings.reservationsEnabled === false) {
      return fail("reservationsClosed", 503);
    }

    const name = str(input.name, MAX.name);
    const email = str(input.email, MAX.email);
    const phone = str(input.phone, MAX.phone);
    const date = str(input.date, 10);
    const time = str(input.time, MAX.time);
    // The form stopped asking which occasion it was — the guests found the
    // question odd, and what they want to say fits under Opmerkingen. Old
    // bundles cached in somebody's browser still send it, so it is still read
    // and still stored, but nothing requires it and nothing asks again.
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

    // Guests: a whole number, and no larger than the party the owners are
    // willing to take through a form. Bigger than that is a conversation, and
    // the number lives in the CMS so they can change their minds about it
    // without a deploy.
    const maxParty = count(settings.reservationMaxPartySize, FALLBACK.maxPartySize);
    const guestsRaw = input.guests;
    const guests =
      typeof guestsRaw === "number"
        ? guestsRaw
        : typeof guestsRaw === "string" && guestsRaw.trim() !== ""
          ? Number(guestsRaw)
          : NaN;
    if (!Number.isInteger(guests) || guests < 1 || guests > maxParty) {
      return fail("guestsInvalid");
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail("dateRequired");
    const parsed = new Date(`${date}T12:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) return fail("dateInvalid");
    // Round trip check, so 2026-02-31 is caught instead of rolling into March.
    if (parsed.toISOString().slice(0, 10) !== date) {
      return fail("dateInvalid");
    }
    const today = todayInAmsterdam();
    if (date < today) {
      return fail("datePast");
    }
    // The same horizon the date picker draws. It used to be a year here and
    // ninety days there, which meant a request the form could never produce
    // was accepted anyway — and a booking that far out is a diary entry
    // nobody will remember making.
    const horizonDays = count(settings.reservationHorizonDays, FALLBACK.horizonDays);
    const horizon = new Date(
      new Date(`${today}T12:00:00.000Z`).getTime() + horizonDays * 86_400_000,
    );
    if (date > horizon.toISOString().slice(0, 10)) {
      return fail("dateTooFar");
    }

    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return fail("timeInvalid");

    // The form only offers days and times the café is actually open for, but
    // the form is a convenience and not a gate: the same schedule is resolved
    // here — week, repeating rules and exceptions together — so a hand-rolled
    // request cannot book a table on a Tuesday when the doors are shut, and a
    // day the owners opened by hand is accepted like any other.
    const { input: schedule, days } = await loadSchedule(date, date, undefined, settings);
    const day = days[0];

    // An empty week is a CMS nobody has filled in yet, not a café that never
    // opens. Enforcing hours nobody typed would refuse every request, so when
    // there is nothing to enforce and no rule or exception spoke about this
    // day, the request is taken and the owners sort it out on the phone.
    const enforce = !(weekIsEmpty(schedule.week) && day?.source === "week");

    const leadMinutes = count(settings.reservationLeadMinutes, FALLBACK.leadMinutes);
    // Today is measured against the clock as well: a table an hour from now is
    // a phone call, and one this morning is not a booking at all.
    const notBefore =
      date === today ? nowMinutesInAmsterdam() + leadMinutes : -1;

    if (enforce && day) {
      if (day.closed || day.ranges.length === 0) return fail("dayClosed");
      if (!isBookable(day.ranges, time)) return fail("timeOutsideHours");
      if (!isBookable(day.ranges, time, notBefore)) return fail("timePassed");
    }

    // Seats. Everything above this line is about whether the café is open;
    // this is about whether there is anywhere to sit once it is.
    const capacity = Number(settings.reservationCapacity);
    if (Number.isFinite(capacity) && capacity > 0 && day) {
      const seated = await canSeat(date, time, guests, {
        capacity,
        durationMinutes: count(
          settings.reservationDurationMinutes,
          FALLBACK.durationMinutes,
        ),
        // Judged against everything the day could still offer, so "this
        // sitting is taken" and "the whole day is gone" stay different
        // answers — one is solved by another time, the other is not.
        slots: slotsFor(day.ranges, notBefore),
      });
      if (!seated.ok) return fail(seated.reason, 409);
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
        emailStatus: "pending",
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("reservation request failed", error);
    return fail("server", 500);
  }
}
