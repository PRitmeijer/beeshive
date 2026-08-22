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

    // Drop the ones that have run out. The end date is picked as a day, not a
    // moment, so it is stored at midnight — comparing it directly would retire
    // a notification at the *start* of the day the owners chose, giving them a
    // banner that is never seen on its final day. Run it to the end of that
    // day instead, which is what "tot en met" means to the person typing it.
    const active = res.docs.filter((n: { endDate?: string | null }) => {
      if (!n.endDate) return true;
      const end = new Date(n.endDate);
      if (Number.isNaN(end.getTime())) return true;
      end.setUTCHours(23, 59, 59, 999);
      return end >= new Date();
    });

    return NextResponse.json({ docs: active });
  } catch {
    return NextResponse.json({ docs: [] });
  }
}
