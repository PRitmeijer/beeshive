import { NextResponse } from "next/server";
import { getPayloadClient } from "@/lib/payload";
import { EMAIL, rateLimit, readJsonBody, str } from "@/lib/apiGuard";

// Deliberately identical whether the address was already on the list or not.
// Two different answers turn this into an oracle for testing which addresses
// are subscribed, and the endpoint is unauthenticated.
const DONE = { message: "Bedankt, je aanmelding is verwerkt" };


/**
 * PostgreSQL's `unique_violation`. Payload wraps the driver's error, so the
 * code can arrive either on the error itself or one level down in `cause`;
 * both are checked rather than guessing which layer threw. SQLite reports the
 * same condition through a message rather than a code, which is why the text
 * is matched too.
 */
function isUniqueViolation(error: unknown): boolean {
  const seen = new Set<unknown>();
  let node: unknown = error;
  while (node && typeof node === "object" && !seen.has(node)) {
    seen.add(node);
    const e = node as { code?: unknown; message?: unknown; cause?: unknown };
    if (e.code === "23505") return true;
    if (
      typeof e.message === "string" &&
      /unique constraint|UNIQUE constraint failed|duplicate key value/i.test(
        e.message,
      )
    ) {
      return true;
    }
    node = e.cause;
  }
  return false;
}

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

    // The read above and the write below are two statements, not one
    // transaction. Someone who double-taps the button — or the same address
    // submitted from a phone and a laptop a moment apart — clears the `find`
    // twice, and the second `create` hits the unique index on `email`. That is
    // not a failure from the subscriber's point of view: they are on the list.
    // So only the create is wrapped, a unique violation is answered with the
    // same DONE as a first-time signup, and anything else is re-thrown to the
    // outer catch, which is still the one that logs and returns a 500.
    try {
      await payload.create({
        collection: "mailing-list",
        data: {
          email,
          name: name || undefined,
          subscribedAt: new Date().toISOString(),
          active: true,
        },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }

    return NextResponse.json(DONE);
  } catch (error) {
    console.error("subscribe failed", error);
    return NextResponse.json({ error: "Er ging iets mis" }, { status: 500 });
  }
}
