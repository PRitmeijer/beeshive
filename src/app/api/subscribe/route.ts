import { NextResponse } from "next/server";
import { getPayloadClient } from "@/lib/payload";
import { EMAIL, rateLimit, readJsonBody, str } from "@/lib/apiGuard";

// Deliberately identical whether the address was already on the list or not.
// Two different answers turn this into an oracle for testing which addresses
// are subscribed, and the endpoint is unauthenticated.
const DONE = { message: "Bedankt, je aanmelding is verwerkt" };

export async function POST(request: Request) {
  if (!rateLimit(request, "subscribe")) {
    return NextResponse.json(
      { error: "Te veel aanvragen. Probeer het over een paar minuten opnieuw." },
      { status: 429 },
    );
  }

  const body = await readJsonBody(request);
  if (!body.ok) {
    return NextResponse.json({ error: body.error }, { status: body.status });
  }

  // Honeypot, same field name the reservation form uses.
  if (typeof body.data.website === "string" && body.data.website.trim()) {
    return NextResponse.json(DONE);
  }

  const email = str(body.data.email, 200);
  if (!email || !EMAIL.test(email)) {
    return NextResponse.json(
      { error: "Vul een geldig e-mailadres in" },
      { status: 400 },
    );
  }

  const name = str(body.data.name, 120);

  try {
    const payload = await getPayloadClient();

    const existing = await payload.find({
      collection: "mailing-list",
      where: { email: { equals: email } },
      limit: 1,
    });
    if (existing.docs.length > 0) return NextResponse.json(DONE);

    await payload.create({
      collection: "mailing-list",
      data: {
        email,
        name: name || undefined,
        subscribedAt: new Date().toISOString(),
        active: true,
      },
    });

    return NextResponse.json(DONE);
  } catch (error) {
    console.error("subscribe failed", error);
    return NextResponse.json({ error: "Er ging iets mis" }, { status: 500 });
  }
}
