import { NextResponse } from "next/server";
import { getPayloadClient } from "@/lib/payload";
import { rateLimit, readJsonBody } from "@/lib/apiGuard";
import { defaultLocale, isLocale } from "@/i18n/config";
import type { ContactError } from "@/lib/contactErrors";

/**
 * Public endpoint for the contact form.
 *
 * Store first, send after.
 *
 * This form has now been wrong twice. It began as a `mailto:` link, which
 * opens whatever mail client the visitor's device believes it has — often none
 * at all, on a phone — while the page cheerfully claimed the message had been
 * sent. It was then made to post here and mail from the server, which was
 * honest but brittle: the send *was* the endpoint, so when it failed the
 * visitor was told to go away and try something else, and nothing whatsoever
 * was left behind. The owners do not have working SMTP credentials yet, which
 * means that path is not a rare accident but the ordinary case.
 *
 * So the message is written into the contact-messages collection and the
 * request answers 200 the moment it is stored. That document is the record.
 * Mailing it out is a notification about a record that already exists, and it
 * is the collection's own afterChange hook that does it (see
 * src/lib/outboundEmail.ts), writing the outcome back onto the row. A dead
 * mail server now costs the owners a look at the admin instead of costing them
 * the conversation, and the visitor is never told to try again about something
 * that has, in every sense that matters, already arrived.
 *
 * Refusals still answer with a code from src/lib/contactErrors.ts rather than
 * a sentence: the site is bilingual and the reader's own dictionary picks the
 * words. Everything the browser sends is validated here — the form is a
 * convenience, not a gate — and the document is assembled field by field so a
 * hand-rolled request cannot set `status`, `emailStatus` or `source` itself.
 */

const MAX = { name: 120, email: 200, message: 4000 };

const fail = (code: ContactError, status = 400) =>
  NextResponse.json({ error: code }, { status });

/**
 * Trims and caps one character beyond the limit, so a body that is exactly at
 * the ceiling is still distinguishable from one that overran it.
 */
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

    // Which language version the visitor was reading, so the owners know which
    // one to answer in. Anything unrecognised is Dutch, the source language.
    const localeInput = str(input.locale, 8);
    const locale = isLocale(localeInput) ? localeInput : defaultLocale;

    const payload = await getPayloadClient();

    await payload.create({
      collection: "contact-messages",
      data: {
        // Cut rather than refused. The column stops at 120 characters and
        // there is no refusal code for an overlong name, so a name that runs
        // past the ceiling would otherwise throw on write and cost the visitor
        // the whole message over the least important field on the form.
        name: name.slice(0, MAX.name),
        email,
        message,
        locale,
        // Never read from the request. A message starts as "nieuw" and its
        // mail starts in the queue, full stop.
        status: "nieuw",
        emailStatus: "pending",
        source: "website",
      },
    });

    // Stored is delivered, as far as the visitor is concerned.
    return NextResponse.json({ ok: true });
  } catch (error) {
    // The only way to get here now is a database that would not take the row,
    // which is the one failure the visitor genuinely has to hear about: there
    // is nothing waiting in the admin for the owners to find.
    console.error("contact message could not be stored", error);
    return fail("server", 500);
  }
}
