import { NextResponse, type NextRequest } from "next/server";
import { getPayloadClient } from "@/lib/payload";
import { readJsonBody, str } from "@/lib/apiGuard";
import {
  configuredLocales,
  copyLocale,
  countMissingTranslations,
  LocaleCopyError,
} from "@/lib/localeCopy";

/**
 * The endpoint behind the "Vertalingen" panel in the admin.
 *
 * It lives under /api/admin rather than inside Payload's own /api because it
 * is not a collection operation and has no business appearing in the REST or
 * GraphQL surface; but it is still Payload doing the work, under the
 * permissions of the person who pressed the button. `payload.auth` reads the
 * same signed cookie the admin already carries, so there is no second session
 * to keep in step and no token to leak — and an unauthenticated request gets
 * 401 before it can learn whether a collection exists.
 *
 * Two shapes of protection matter here and they are not the same thing:
 *
 *   - *authentication*, which is the cookie, and
 *   - *authorisation*, which is left entirely to Payload. Every read and write
 *     in src/lib/localeCopy.ts runs with `overrideAccess: false` and the user
 *     attached, so an editor who cannot update the menu cannot update it
 *     through here either.
 *
 * The Origin check on top of that is for cross-site request forgery. Payload's
 * session cookie is SameSite=Lax, which already stops a form on another site
 * from carrying it into a POST, but the check costs one comparison and does
 * not depend on a default staying what it is.
 */

function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  // Same-origin fetches from the admin send an Origin header; a server-to-server
  // call with a stolen cookie is the case this is aimed at, and a missing
  // Origin is treated as suspect rather than as permission.
  if (!origin) return false;
  try {
    const from = new URL(origin);
    return from.host === request.nextUrl.host;
  } catch {
    return false;
  }
}

/**
 * How much English is still missing, per collection.
 *
 * Cached in module memory for a minute: the nav panel asks on every admin page
 * load, and the answer is two reads of every translatable collection. A minute
 * is short enough that pressing the copy button and looking at the nav feels
 * connected, and long enough that clicking around the admin does not re-scan
 * the database twenty times.
 */
const REPORT_TTL_MS = 60 * 1000;
let reportCache: { at: number; key: string; body: unknown } | null = null;

export async function GET(request: NextRequest) {
  const payload = await getPayloadClient();
  const { user } = await payload.auth({ headers: request.headers });
  if (!user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const locales = configuredLocales(payload);
  const from = str(request.nextUrl.searchParams.get("from"), 10) ?? locales[0];
  const to = str(request.nextUrl.searchParams.get("to"), 10) ?? locales[1];
  if (!from || !to || !locales.includes(from) || !locales.includes(to)) {
    return NextResponse.json({ error: "Onbekende taal" }, { status: 400 });
  }

  const key = `${user.id}:${from}:${to}`;
  if (reportCache && reportCache.key === key && Date.now() - reportCache.at < REPORT_TTL_MS) {
    return NextResponse.json(reportCache.body);
  }

  try {
    const collections = await countMissingTranslations(payload, user, from, to);
    const body = {
      from,
      to,
      collections: collections.filter((entry) => entry.scanned && entry.missing > 0),
    };
    reportCache = { at: Date.now(), key, body };
    return NextResponse.json(body);
  } catch {
    // The panel is a convenience. It must never be the thing that makes the
    // admin look broken, so a failed scan reports nothing rather than an error.
    return NextResponse.json({ from, to, collections: [] });
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Ongeldige aanvraag" }, { status: 403 });
  }

  const payload = await getPayloadClient();
  const { user } = await payload.auth({ headers: request.headers });
  if (!user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const body = await readJsonBody(request);
  if (!body.ok) {
    return NextResponse.json({ error: body.error }, { status: body.status });
  }

  const { collection, global, id, from, to, overwrite } = body.data;

  const fromCode = str(from, 10);
  const toCode = str(to, 10);
  if (!fromCode || !toCode) {
    return NextResponse.json({ error: "Geen taal opgegeven" }, { status: 400 });
  }

  const collectionSlug = str(collection, 100);
  const globalSlug = str(global, 100);
  if (!collectionSlug && !globalSlug) {
    return NextResponse.json({ error: "Geen document opgegeven" }, { status: 400 });
  }

  // The id is whatever Payload's adapter uses — Postgres hands out numbers
  // here — so it is passed through rather than coerced, but only after being
  // narrowed to the two types that can be one.
  const docId =
    typeof id === "number" || typeof id === "string" ? id : undefined;

  try {
    const result = await copyLocale({
      payload,
      user,
      collection: collectionSlug ?? undefined,
      global: globalSlug ?? undefined,
      id: docId,
      from: fromCode,
      to: toCode,
      overwrite: overwrite === true,
    });

    return NextResponse.json({
      filled: result.filled,
      kept: result.kept,
    });
  } catch (error) {
    // Two kinds of failure end up here and only one of them is ours.
    // `copyLocale` throws `LocaleCopyError` for the things it checked itself,
    // and those messages are already written in Dutch for the owners. Anything
    // else is Payload refusing the write — nearly always a required field that
    // is empty in both languages — and its message is English and technical,
    // so it goes in `detail` for the browser console while the panel shows a
    // sentence somebody can act on.
    if (error instanceof LocaleCopyError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      {
        error:
          "Overnemen is niet gelukt. Meestal komt dat doordat een verplicht veld "
          + "in beide talen leeg is; vul dat eerst in en probeer het opnieuw.",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 400 },
    );
  }
}
