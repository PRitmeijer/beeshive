import { NextResponse } from "next/server";
import { getPayloadClient } from "@/lib/payload";
import { rateLimit, readJsonBody } from "@/lib/apiGuard";

/**
 * Public endpoint for reservation requests.
 *
 * Everything is validated here, on the server: the browser form is a
 * convenience, not a gate. The document is assembled field by field on
 * purpose, never spread from the request body, so a caller cannot smuggle in
 * `status`, `source` or any other field the form has no business setting.
 */

const MAX = {
  name: 120,
  email: 200,
  phone: 40,
  time: 10,
  occasion: 120,
  notes: 2000,
};

const bad = (message: string) =>
  NextResponse.json({ error: message }, { status: 400 });

/** Trims and caps; anything that is not a string becomes an empty string. */
function str(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max + 1) : "";
}

/** Today in Amsterdam as YYYY-MM-DD, so "vandaag" means the guest's today. */
function todayInAmsterdam(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function POST(request: Request) {
  if (!rateLimit(request, "reserve")) {
    return NextResponse.json(
      { error: "Te veel aanvragen. Probeer het over een paar minuten opnieuw." },
      { status: 429 },
    );
  }

  const read = await readJsonBody(request);
  if (!read.ok) {
    return NextResponse.json({ error: read.error }, { status: read.status });
  }
  const input = read.data;

  try {

    // Honeypot: a field no human ever sees, let alone fills in. Answer 200 so
    // a bot cannot tell a swallowed submission from a stored one.
    if (str(input.website, 200)) {
      return NextResponse.json({ message: "Aanvraag ontvangen" });
    }

    const name = str(input.name, MAX.name);
    const email = str(input.email, MAX.email);
    const phone = str(input.phone, MAX.phone);
    const date = str(input.date, 10);
    const time = str(input.time, MAX.time);
    const occasion = str(input.occasion, MAX.occasion);
    const notes = str(input.notes, MAX.notes);

    if (!name) return bad("Vul je naam in");
    if (name.length > MAX.name) return bad("Je naam is te lang");

    if (!email) return bad("Vul je e-mailadres in");
    if (email.length > MAX.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return bad("Vul een geldig e-mailadres in");
    }

    if (phone.length > MAX.phone) return bad("Je telefoonnummer is te lang");
    if (occasion.length > MAX.occasion) return bad("De gelegenheid is te lang");
    if (notes.length > MAX.notes) {
      return bad("Je opmerking is te lang, houd het onder 2000 tekens");
    }

    // Guests: a whole number, and a party bigger than 30 needs a phone call.
    const guestsRaw = input.guests;
    const guests =
      typeof guestsRaw === "number"
        ? guestsRaw
        : typeof guestsRaw === "string" && guestsRaw.trim() !== ""
          ? Number(guestsRaw)
          : NaN;
    if (!Number.isInteger(guests) || guests < 1 || guests > 30) {
      return bad("Vul een aantal personen in tussen 1 en 30");
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad("Kies een datum");
    const parsed = new Date(`${date}T12:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) return bad("Kies een geldige datum");
    // Round trip check, so 2026-02-31 is caught instead of rolling into March.
    if (parsed.toISOString().slice(0, 10) !== date) {
      return bad("Kies een geldige datum");
    }
    if (date < todayInAmsterdam()) {
      return bad("Kies een datum vanaf vandaag");
    }
    const horizon = new Date();
    horizon.setFullYear(horizon.getFullYear() + 1);
    if (date > horizon.toISOString().slice(0, 10)) {
      return bad("Kies een datum binnen een jaar, bel ons voor later");
    }

    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return bad("Kies een tijd");

    const payload = await getPayloadClient();

    await payload.create({
      collection: "reservations",
      data: {
        name,
        email,
        phone: phone || undefined,
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

    // No notification mail is sent: this project has no email adapter
    // configured in payload.config.ts. Once one is added, send the owners a
    // heads up here (and keep the guest reply worded as a received request,
    // not as a confirmation).

    return NextResponse.json({ message: "Aanvraag ontvangen" });
  } catch {
    return NextResponse.json(
      { error: "Er ging iets mis. Probeer het opnieuw." },
      { status: 500 },
    );
  }
}
