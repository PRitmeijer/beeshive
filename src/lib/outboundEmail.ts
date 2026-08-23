import type {
  CollectionAfterChangeHook,
  Field,
  Payload,
  TypeWithID,
} from "payload";

/**
 * Store first, send second.
 *
 * The owners do not have working SMTP credentials yet, and even once they do,
 * a mail server has bad afternoons. A contact message that fails to send is a
 * lost conversation: nobody knows it existed, least of all the visitor, who
 * saw a thank-you page. So nothing here treats sending as the point. The
 * document is written first and is the record; the mail is a notification
 * about a record that already exists, and whether it went out is a field on
 * that record like any other.
 *
 * That gives the owners something they can act on. A row sitting at "Mislukt"
 * with the error underneath it is a to-do, and setting it back to "In de
 * wachtrij" and saving is a retry — no console, no deploy, no developer.
 *
 * The trap in all of this is re-entrancy. The hook runs after a change, and
 * the only way to record the outcome is to change the same document, which
 * runs the hook again — this time on a document whose status is "sent", which
 * would be harmless, except that the failure path writes "failed" and the
 * skipped path writes "skipped" and any of them could be one typo away from
 * writing "pending" and mailing forever. Rather than rely on the status check
 * to break the loop, the bookkeeping update carries an explicit flag in
 * `context`, and the hook leaves immediately when it sees that flag on the
 * request. The status check is then a filter, not a fuse.
 *
 * The hook also never throws. Payload surfaces a thrown afterChange as a
 * failed save, which would mean a mail outage rolling back into the admin as
 * "your change was not saved" — the exact opposite of what this module is for.
 */

export type EmailState = "pending" | "sent" | "failed" | "skipped";

/** Marks the hook's own bookkeeping write, so it does not answer itself. */
const GUARD = "skipOutboundEmail";

interface EmailStateOverrides {
  /** Dutch label, when a collection wants to name the mail it sends. */
  label?: string;
  /** Replaces the standard admin explanation. */
  description?: string;
  defaultValue?: EmailState;
}

/**
 * The status of the outgoing mail belonging to this document. Never localized:
 * it is bookkeeping, not content, and there is only one of it per row.
 */
export const emailStateField = (overrides: EmailStateOverrides = {}): Field => ({
  name: "emailStatus",
  label: overrides.label ?? "Verzendstatus",
  type: "select",
  options: [
    { label: "In de wachtrij", value: "pending" },
    { label: "Verstuurd", value: "sent" },
    { label: "Mislukt", value: "failed" },
    { label: "Niet verstuurd", value: "skipped" },
  ],
  defaultValue: overrides.defaultValue ?? "pending",
  admin: {
    position: "sidebar",
    description:
      overrides.description ??
      "Of het bijbehorende mailtje de deur uit is. Een mislukt bericht kan opnieuw verstuurd worden door de status terug op \"In de wachtrij\" te zetten en op te slaan.",
  },
});

/** What went wrong, in the mail server's own words. Only filled on a failure. */
export const emailErrorField = (): Field => ({
  name: "emailError",
  label: "Foutmelding",
  type: "textarea",
  admin: {
    position: "sidebar",
    readOnly: true,
    description:
      "Wat de mailserver terugmeldde. Handig om door te sturen als het blijft misgaan.",
  },
});

/** When the mail actually left, as opposed to when the row was created. */
export const emailSentAtField = (): Field => ({
  name: "emailSentAt",
  label: "Verstuurd op",
  type: "date",
  admin: {
    position: "sidebar",
    readOnly: true,
    date: { pickerAppearance: "dayAndTime" },
  },
});

/** The three bookkeeping fields together, for spreading into a field list. */
export const outboundEmailFields = (
  overrides: EmailStateOverrides = {},
): Field[] => [emailStateField(overrides), emailErrorField(), emailSentAtField()];

type Builder<T, R> = (doc: T, payload: Payload) => R | Promise<R>;

export interface OutboundEmailOptions<T> {
  /** Where it goes. Returning nothing parks the document at "Niet verstuurd". */
  to: Builder<T, string | null | undefined>;
  subject: Builder<T, string>;
  /** Plain text. These mails are read on a phone behind the bar. */
  body: Builder<T, string>;
  /** Usually the guest, so hitting reply answers the right person. */
  replyTo?: Builder<T, string | null | undefined>;
}

/**
 * Builds the afterChange hook that turns a "pending" document into a sent one.
 *
 * The builders receive the document and the payload instance, because the
 * message almost always needs something the document does not carry — the
 * contact address from Site Instellingen, most of all, which the owners can
 * change themselves without a deploy.
 */
export function sendOnChange<T extends TypeWithID = TypeWithID>(
  options: OutboundEmailOptions<T>,
): CollectionAfterChangeHook<T> {
  return async ({ collection, doc, req }) => {
    // Our own bookkeeping write coming back around. Leave before anything
    // else, so the reasoning below never has to wonder about it.
    if (req.context?.[GUARD]) return doc;

    const record = doc as T & { emailStatus?: EmailState | null };
    if (record.emailStatus !== "pending") return doc;

    const { payload } = req;

    /** Records the outcome without waking the hook up again. */
    const settle = async (data: Record<string, unknown>) => {
      try {
        await payload.update({
          collection: collection.slug,
          id: doc.id,
          data,
          overrideAccess: true,
          context: { [GUARD]: true },
        });
      } catch (error) {
        // The mail is not the problem any more, the database is. Nothing left
        // to do but say so: the document itself is still intact.
        console.error(`${collection.slug} email bookkeeping failed`, error);
      }
    };

    try {
      const to = await options.to(record, payload);
      if (!to) {
        await settle({
          emailStatus: "skipped",
          emailError: "Geen ontvanger ingesteld (Site Instellingen -> Contact).",
        });
        return doc;
      }

      const replyTo = options.replyTo
        ? await options.replyTo(record, payload)
        : undefined;

      await payload.sendEmail({
        to,
        ...(replyTo ? { replyTo } : {}),
        subject: await options.subject(record, payload),
        text: await options.body(record, payload),
      });

      await settle({
        emailStatus: "sent",
        emailError: null,
        emailSentAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error(`${collection.slug} email send failed`, error);
      await settle({
        emailStatus: "failed",
        emailError: error instanceof Error ? error.message : String(error),
      });
    }

    return doc;
  };
}
