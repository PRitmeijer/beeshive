import { NextResponse, type NextRequest } from "next/server";
import { getPayloadClient } from "@/lib/payload";
import { resolveLocale } from "@/i18n/config";

export async function GET(request: NextRequest) {
  try {
    // Titles and messages are localized; anything unrecognised falls back to
    // the default locale rather than erroring.
    const locale = resolveLocale(
      request.nextUrl.searchParams.get("locale") || undefined,
    );
    const payload = await getPayloadClient();
    const now = new Date().toISOString();

    const res = await payload.find({
      collection: "notifications",
      locale,
      where: {
        active: { equals: true },
        or: [
          { startDate: { exists: false } },
          { startDate: { less_than_equal: now } },
        ],
      },
      limit: 5,
    });

    // Filter out expired notifications
    const active = res.docs.filter((n: any) => {
      if (!n.endDate) return true;
      return new Date(n.endDate) >= new Date();
    });

    return NextResponse.json({ docs: active });
  } catch {
    return NextResponse.json({ docs: [] });
  }
}
