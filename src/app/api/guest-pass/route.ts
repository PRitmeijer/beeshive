import { NextResponse } from "next/server";
import { getPayloadClient, getSiteSettings } from "@/lib/payload";
import { rateLimit, readJsonBody, str } from "@/lib/apiGuard";
import { defaultLocale, locales, parseLocale } from "@/i18n/config";
import {
  GUEST_RESPONSE_LIMITS,
  MAX_GUEST_RESPONSES,
  findByToken,
  hasPassed,
  redactForGuests,
  toIcsEvent,
  type GuestResponseRow,
} from "@/lib/guestPass";
import { buildIcs, icsFilename } from "@/lib/ics";

/**
 * The two things the guest pass needs a server for.
 *
 * GET with `ics=1` hands back the calendar file. It is an endpoint rather than
 * a `data:` URL or a blob because this page is opened from inside WhatsApp
 * more often than not: iOS will not open a `data:text/calendar` link at all,
 * and the in-app browsers block a script-driven download. A plain link to a
 * plain URL answering with `Content-Type: text/calendar` is the only shape
 * every phone agrees to hand to the calendar app.
 *
 * POST records one companion's answer. Everything about it is deliberately
 * narrow: it appends a row to `guestResponses` and touches nothing else on the
 * document, ever. Not the name, not the date, not the status, not the e-mail
 * bookkeeping. A guest can say who they are and what they do not eat; that is
 * the entire vocabulary.
 *
 * Both of them are authorised by the token and nothing else, which is why both
 * of them go through `findByToken` in src/lib/guestPass.ts rather than reading
 * the collection themselves. There is no login here and there never will be.
 */

/** Answers are short. This is generous for a party sharing one café wifi. */
const POST_LIMIT = 20;
/** A calendar file is a link people tap twice. Nothing to protect, just a cap. */
const GET_LIMIT = 60;

type Failure =
  | "rateLimited"
  | "tooLarge"
  | "badRequest"
  | "notFound"
  | "disabled"
  | "closed"
  | "full"
  | "nameRequired"
  | "server";

/**
 * Refusals answer with a code, not a sentence, exactly as /api/reserve does:
 * the site is bilingual and the browser owns the wording.
 */
const fail = (code: Failure, status: number) =>
  NextResponse.json({ error: code }, { status });

/**
 * A guest link is a private page in a public URL, so nothing it serves may be
 * cached by anything in between, and nothing may index it. The page itself
 * carries the same instruction as a meta tag; this is the header half.
 */
const PRIVATE_HEADERS = {
  "Cache-Control": "no-store, private",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};

/**
 * Every label the owners have configured, in both languages at once.
 *
 * A companion is only allowed to send back a label that is actually on offer,
 * which means free text never reaches the admin. The catch is that the labels
 * are localised: the English page sends "Vegetarian" where the Dutch one sends
 * "Vegetarisch", and the endpoint has no business guessing which page the
 * request came from. Accepting either is both simpler and stricter than
 * trusting a `locale` field in the body would be.
 *
 * When nothing is configured the set is empty, and an empty set refuses
 * everything — which is right: a list nobody filled in is a question the
 * kitchen never agreed to ask.
 */
async function allowedLabels(): Promise<{
  dietary: Set<string>;
  drinks: Set<string>;
}> {
  const dietary = new Set<string>();
  const drinks = new Set<string>();
  for (const locale of locales) {
    const settings = await getSiteSettings(locale);
    for (const row of settings.guestPassDietary ?? []) {
      if (row?.label) dietary.add(row.label.trim());
    }
    for (const row of settings.guestPassDrinks ?? []) {
      if (row?.label) drinks.add(row.label.trim());
    }
  }
  return { dietary, drinks };
}

/** The picks that survive: known labels, deduplicated, and capped in number. */
function keepPicks(value: unknown, allowed: Set<string>): string[] {
  if (!Array.isArray(value)) return [];
  const kept: string[] = [];
  for (const item of value) {
    const label = str(item, GUEST_RESPONSE_LIMITS.label);
    if (label && allowed.has(label) && !kept.includes(label)) kept.push(label);
    if (kept.length >= GUEST_RESPONSE_LIMITS.picks) break;
  }
  return kept;
}

export async function GET(request: Request) {
  if (!rateLimit(request, "guest-pass-ics", GET_LIMIT)) {
    return fail("rateLimited", 429);
  }

  const url = new URL(request.url);
  // Never an id, in either direction. The token is the only key this endpoint
  // knows how to read a reservation by.
  const doc = await findByToken(url.searchParams.get("token"));
  if (!doc) return fail("notFound", 404);

  const locale = parseLocale(url.searchParams.get("locale") ?? "") ?? defaultLocale;
  const settings = await getSiteSettings(locale);

  try {
    const event = toIcsEvent(doc, settings, locale);
    // A reservation whose date or time the owners have emptied cannot be an
    // instant, and an .ics without one is a file no calendar will accept.
    if (!event) return fail("badRequest", 409);

    return new Response(buildIcs([event], { calendarName: settings.siteName }), {
      headers: {
        ...PRIVATE_HEADERS,
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="${icsFilename(event.title)}"`,
      },
    });
  } catch (error) {
    console.error("guest pass calendar failed", error);
    return fail("server", 500);
  }
}

export async function POST(request: Request) {
  if (!rateLimit(request, "guest-pass", POST_LIMIT)) {
    return fail("rateLimited", 429);
  }

  const read = await readJsonBody(request);
  if (!read.ok) {
    return fail(read.status === 413 ? "tooLarge" : "badRequest", read.status);
  }
  const input = read.data;

  try {
    const doc = await findByToken(
      typeof input.token === "string" ? input.token : null,
    );
    if (!doc) return fail("notFound", 404);

    // The switch in Site Instellingen is a real switch: turning it off stops
    // the page asking, and has to stop the endpoint listening as well, or the
    // form would keep working for anyone who still had it open.
    const settings = await getSiteSettings(defaultLocale);
    if (!settings.guestPassEnabled) return fail("disabled", 403);

    // A cancelled or finished evening is a closed book. The page hides the
    // form in both cases; this is the same rule, on the side that matters.
    const view = redactForGuests(doc);
    if (view.status === "geannuleerd" || hasPassed(view, settings)) {
      return fail("closed", 403);
    }

    const name = str(input.name, GUEST_RESPONSE_LIMITS.name);
    if (!name) return fail("nameRequired", 400);

    const allowed = await allowedLabels();
    const dietary = keepPicks(input.dietary, allowed.dietary);
    const drinks = keepPicks(input.drinks, allowed.drinks);

    /**
     * The write, and the whole of it.
     *
     * `guestResponses` is rebuilt from the rows already stored and handed back
     * as the only key in `data`. Payload keeps an array row it recognises by
     * its `id`, so the existing answers survive untouched, and no other field
     * on the document is named at all — a guest cannot move the status, change
     * the party size or rewrite the booker's phone number, because none of
     * those words appear here.
     *
     * `overrideAccess: true` is safe for the same reason it is safe in
     * findByToken: the collection wants a logged-in user and there is none,
     * and the 128-bit token that got us this far IS the authorisation. It was
     * checked one line at a time above — the token matched a row, the feature
     * is on, the evening has not been and gone — and the payload written below
     * is built field by field from validated input rather than spread from the
     * request body.
     *
     * The collection's own afterChange hook only sends the owners' mail while
     * `emailStatus` is still "pending", so a response arriving here cannot
     * mail anybody a second time.
     */
    const rows: GuestResponseRow[] = (doc.guestResponses ?? []).map((row) => ({
      ...row,
    }));

    // Only the browser that wrote a row is told its id (below), so holding one
    // is proof of having written it. That is what turns "I already answered"
    // into an edit instead of a second, contradictory line on the list.
    const responseId = str(input.responseId, 64);
    const existing = responseId
      ? rows.findIndex((row) => String(row.id ?? "") === responseId)
      : -1;

    const answer = {
      name,
      dietary: dietary.join(", "),
      drinks: drinks.join(", "),
      addedAt: new Date().toISOString(),
    };

    if (existing >= 0) {
      rows[existing] = { ...rows[existing], ...answer };
    } else {
      // A cap, because the array is unbounded otherwise and the link is public
      // to whoever holds it. Thirty is past the largest table in the place.
      if (rows.length >= MAX_GUEST_RESPONSES) return fail("full", 409);
      rows.push(answer);
    }

    const payload = await getPayloadClient();
    const updated = (await payload.update({
      collection: "reservations",
      id: doc.id,
      data: { guestResponses: rows },
      overrideAccess: true,
      depth: 0,
    })) as { guestResponses?: GuestResponseRow[] | null };

    const stored = updated.guestResponses ?? [];
    const written = existing >= 0 ? stored[existing] : stored[stored.length - 1];

    return NextResponse.json(
      {
        ok: true,
        responseId: written?.id ? String(written.id) : null,
        // The list comes back through the same redaction the page uses, so the
        // browser can never learn more from answering than from arriving.
        responses: redactForGuests({ ...doc, guestResponses: stored }).responses,
      },
      { headers: PRIVATE_HEADERS },
    );
  } catch (error) {
    console.error("guest pass response failed", error);
    return fail("server", 500);
  }
}
