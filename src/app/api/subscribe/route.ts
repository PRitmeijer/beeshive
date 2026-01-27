import { NextResponse } from "next/server";
import { getPayloadClient } from "@/lib/payload";

export async function POST(request: Request) {
  try {
    const { email, name } = await request.json();

    if (!email) {
      return NextResponse.json(
        { error: "Email is vereist" },
        { status: 400 }
      );
    }

    const payload = await getPayloadClient();

    // Check if already subscribed
    const existing = await payload.find({
      collection: "mailing-list",
      where: { email: { equals: email } },
      limit: 1,
    });

    if (existing.docs.length > 0) {
      return NextResponse.json({ message: "Al aangemeld" });
    }

    await payload.create({
      collection: "mailing-list",
      data: {
        email,
        name: name || undefined,
        subscribedAt: new Date().toISOString(),
        active: true,
      },
    });

    return NextResponse.json({ message: "Succesvol aangemeld" });
  } catch {
    return NextResponse.json(
      { error: "Er ging iets mis" },
      { status: 500 }
    );
  }
}
