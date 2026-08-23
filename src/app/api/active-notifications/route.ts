import { NextResponse, type NextRequest } from "next/server";
import { resolveLocale } from "@/i18n/config";
import { getActiveNotifications } from "@/lib/notifications";

/**
 * The live notifications, for anything that asks after the page has loaded.
 *
 * The query itself lives in src/lib/notifications.ts, because the layout runs
 * it on the server too: the bar has to be in the first HTML or the page visibly
 * jumps down when it arrives.
 */
export async function GET(request: NextRequest) {
  // Titles and messages are localized; anything unrecognised falls back to the
  // default locale rather than erroring.
  const locale = resolveLocale(
    request.nextUrl.searchParams.get("locale") || undefined,
  );
  return NextResponse.json({ docs: await getActiveNotifications(locale) });
}
