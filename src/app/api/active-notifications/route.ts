import { NextResponse } from "next/server";
import { getPayloadClient } from "@/lib/payload";

export async function GET() {
  try {
    const payload = await getPayloadClient();
    const now = new Date().toISOString();

    const res = await payload.find({
      collection: "notifications",
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
