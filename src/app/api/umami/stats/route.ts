import { NextResponse, type NextRequest } from "next/server";
import { getPayloadClient } from "@/lib/payload";
import {
  getUmamiStats,
  isRange,
  isReport,
  type UmamiRange,
  type UmamiReport,
} from "@/lib/umamiServer";

/**
 * The figures for the statistics panel in the Payload admin.
 *
 * Two things make this different from the other endpoints in this folder, and
 * both are about the API key sitting behind it.
 *
 * It is closed. Every other route here is public because it accepts something
 * from a visitor; this one hands something out, and what it hands out is bought
 * with a credential the owners are told to treat as a password. So it asks
 * Payload who is calling and refuses anyone who is not logged in. There is no
 * rate limit and no honeypot, because there is no anonymous caller to defend
 * against once that check is in place.
 *
 * And it is not a proxy. The query string chooses between four date windows and
 * five report names, all of them checked against a fixed list before anything
 * is composed; nothing a caller sends ever becomes part of an upstream URL. The
 * shape to avoid is the obvious convenience one — `?path=/websites/...` — which
 * would turn a logged-in editor account into a way to send our key at any host
 * that answers.
 *
 * Failures answer 200 with `{ configured: false, reason }`. That looks wrong
 * until you consider who reads it: this is a panel the owners keep open, and
 * "Umami is nu niet bereikbaar" in the place where a graph goes is a great deal
 * more useful than a component that has to guess what a 502 meant. The one
 * exception is the login check below, which really is an error about the
 * caller rather than about the configuration.
 */

const DEFAULT_RANGE: UmamiRange = "7d";
const DEFAULT_REPORT: UmamiReport = "all";

export async function GET(request: NextRequest) {
  try {
    const payload = await getPayloadClient();
    const { user } = await payload.auth({ headers: request.headers });
    if (!user) {
      return NextResponse.json(
        {
          configured: false,
          reason: "Log opnieuw in om de cijfers te bekijken.",
        },
        { status: 401 },
      );
    }

    // An unknown value is a mistake in the calling component, not an attack —
    // the guard above already settled that — so fall back rather than fail. The
    // answer echoes the range it actually used, so a panel showing the wrong
    // week can still say which week it is showing.
    const params = request.nextUrl.searchParams;
    const rangeParam = params.get("range");
    const reportParam = params.get("report");
    const range = isRange(rangeParam) ? rangeParam : DEFAULT_RANGE;
    const report = isReport(reportParam) ? reportParam : DEFAULT_REPORT;

    return NextResponse.json(await getUmamiStats(range, report));
  } catch {
    // getUmamiStats has its own net; this catches the two lines above it, which
    // fail when the database is down. Same contract, so the panel needs no
    // second code path.
    return NextResponse.json({
      configured: false,
      reason: "De cijfers konden niet worden opgehaald. Probeer het later opnieuw.",
    });
  }
}
