import { NextResponse } from "next/server";
import { getPayloadClient, getSiteSettings } from "@/lib/payload";
import { rateLimit, readJsonBody } from "@/lib/apiGuard";
import type { ContactError } from "@/lib/contactErrors";

/**
 * Public endpoint for the contact form.
 *
 * The form used to hand off to `mailto:`, which opens whatever mail client the
 * visitor's device thinks it has — often none at all, on a phone — and left the
 * page claiming the message had been sent when nothing had. This posts it
 * instead, and the mail goes out from the server to the same address the
 * reservation requests do.
 */

const MAX = { name: 120, email: 200, message: 4000 };

const fail = (code: ContactError, status = 400) =>
  NextResponse.json({ error: code }, { status });

function str(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max + 1) : "";
}

export async function POST(request: Request) {
  if (!rateLimit(request, "contact")) return fail("rateLimited", 429);

  const read = await readJsonBody(request);
  if (!read.ok) {
    return fail(read.status === 413 ? "tooLarge" : "badRequest", read.status);
  }
  const input = read.data;

  try {
    // Honeypot, same field name the other two forms use. Answer as though it
    // went through, so a bot cannot tell it was swallowed.
    if (str(input.website, 200)) return NextResponse.json({ ok: true });

    const name = str(input.name, MAX.name);
    const email = str(input.email, MAX.email);
    const message = str(input.message, MAX.message);

    if (!name) return fail("nameRequired");
    if (!email) return fail("emailRequired");
    if (email.length > MAX.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return fail("emailInvalid");
    }
    if (!message) return fail("messageRequired");
    if (message.length > MAX.message) return fail("messageTooLong");

    const settings = await getSiteSettings();
    const to = settings.contactEmail || "info@debeeshive.nl";
    const payload = await getPayloadClient();

    // Unlike a reservation there is nothing stored here, so the send is the
    // whole job: if it fails the visitor has to be told, or they will believe
    // a message was delivered that never left the building.
    await payload.sendEmail({
      to,
      replyTo: `${name} <${email}>`,
      subject: `Bericht via de website: ${name}`,
      text: [
        `Naam:   ${name}`,
        `E-mail: ${email}`,
        "",
        "Bericht:",
        message,
      ].join("\n"),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("contact message failed", error);
    return fail("server", 500);
  }
}
