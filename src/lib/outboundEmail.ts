import type {
  CollectionAfterChangeHook,
  Field,
  Payload,
  PayloadRequest,
  TypeWithID,
} from "payload";

/**
 * Store first, send second — and send only once the store is real.
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
 * On PostgreSQL that story needs one more sentence, and it cost us a bug to
 * learn it. A Payload write runs inside a transaction, afterChange runs inside
 * that transaction, and the row the hook is holding does not exist for anyone
 * outside it yet. Under SQLite there was no transaction and nothing to notice;
 * here, a bookkeeping write opened on a second connection cannot see the row
 * it means to update (a create answers "Not Found" and the outcome is never
 * recorded) and, on an update, sits waiting on the row lock the first
 * connection is still holding — a deadlock that ends in a hung request and a
 * connection left idle in transaction until the pool runs dry.
 *
 * Joining the caller's transaction with `req` fixes both of those and buys a
 * worse problem: the mail would then go out from inside a transaction that
 * might still roll back, and a rollback takes the row, the "failed" status and
 * the error text with it — leaving a message in the owners' inbox about a
 * reservation the database has no memory of. Evidence that a mail was sent
 * must outlive the write that prompted it.
 *
 * So the send happens after the commit, which is the only moment at which the
 * question "is this row real?" has an answer. The hook itself does almost
 * nothing: it schedules the delivery and returns immediately, because the
 * commit it is waiting for cannot happen until it does. The scheduled half
 * waits for the request's transaction to settle, re-reads the document on a
 * connection of its own — a read that both proves the row committed and hands
 * the message builders the values that were actually stored — sends, and
 * records the outcome in a transaction that belongs to nobody else. A row that
 * rolled back is simply not there on the re-read, and no mail goes out about
 * it.
 *
 * What that shape costs: the mail leaves after the visitor's request has been
 * answered, so a process that dies in the seconds between the commit and the
 * send loses the notification. It does not lose the reservation, and the row
 * is sitting at "In de wachtrij" — which is exactly what the admin already
 * presents as "not sent yet", and re-saving it sends it. That is a failure
 * mode the owners can see and fix; a rolled-back audit trail is not. It does
 * assume a long-lived server, which this is: the site runs as a container, not
 * as a function that freezes the moment it has replied.
 *
 * The trap in all of this is re-entrancy. The only way to record the outcome
 * is to change the same document, which runs the hook again — this time on a
 * document whose status is "sent", which would be harmless, except that the
 * failure path writes "failed" and the skipped path writes "skipped" and any
 * of them could be one typo away from writing "pending" and mailing forever.
 * Rather than rely on the status check to break the loop, the bookkeeping
 * update carries an explicit flag in `context`, and the hook leaves
 * immediately when it sees that flag on the request — before it schedules
 * anything, so the guard still holds now that the work is deferred. The status
 * check is then a filter, not a fuse. Anything else that writes to one of
 * these documents without meaning to announce it — the guest pass endpoint
 * appending a companion's answer, for one — passes the same flag.
 *
 * The hook also never throws. Payload surfaces a thrown afterChange as a
 * failed save, which would mean a mail outage rolling back into the admin as
 * "your change was not saved" — the exact opposite of what this module is for.
 */

/** The flag that marks a write which must not announce itself. */
export const SKIP_OUTBOUND_EMAIL = "skipOutboundEmail";

export type EmailState = "pending" | "sent" | "failed" | "skipped";

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
 * How long the deferred half is prepared to wait for the caller's transaction
 * to settle. Every writer in this codebase commits within a request, so this
 * is not a timeout anybody should ever hit; it exists so that a caller holding
 * a transaction open — a script, a future batch import — costs one unsent
 * notification and a line in the log rather than a task that waits for ever.
 */
const COMMIT_WAIT_MS = 30_000;

/** Short enough to be invisible next to an SMTP round trip. */
const COMMIT_POLL_MS = 10;

/**
 * Resolves once the write that fired the hook is over, either way.
 *
 * Payload clears `req.transactionID` in both `commitTransaction` and
 * `killTransaction`, and does so only after the database has answered, so its
 * absence is the one honest signal that nothing is open on that connection any
 * more. It says nothing about *which* way the write went — that question is
 * answered by re-reading the document, which is the next thing the caller
 * does. A request with no transaction at all (`disableTransaction`, or a
 * database adapter without them) resolves on the first check.
 */
async function transactionSettled(req: PayloadRequest): Promise<boolean> {
  const deadline = Date.now() + COMMIT_WAIT_MS;
  while (req.transactionID !== undefined) {
    if (Date.now() > deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, COMMIT_POLL_MS));
  }
  return true;
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
    // Our own bookkeeping write coming back around — or somebody else's write
    // that has no business announcing itself. Leave before anything else, so
    // the reasoning below never has to wonder about it, and so that nothing is
    // scheduled either.
    if (req.context?.[SKIP_OUTBOUND_EMAIL]) return doc;

    const current = doc as T & { emailStatus?: EmailState | null };
    if (current.emailStatus !== "pending") return doc;

    const { payload } = req;
    const slug = collection.slug;
    const id = doc.id;

    /**
     * Records the outcome, on a connection of its own.
     *
     * Deliberately not joined to the request's transaction: by the time this
     * runs there is none left to join, and that is the point. A note saying a
     * mail failed has to survive independently of the write it was about.
     */
    const settle = async (data: Record<string, unknown>) => {
      try {
        await payload.update({
          collection: slug,
          id,
          data,
          overrideAccess: true,
          context: { [SKIP_OUTBOUND_EMAIL]: true },
        });
      } catch (error) {
        // The mail is not the problem any more, the database is. Nothing left
        // to do but say so: the document itself is still intact.
        console.error(`${slug} email bookkeeping failed`, error);
      }
    };

    /** Everything that must not happen until the row is really there. */
    const deliver = async () => {
      if (!(await transactionSettled(req))) {
        console.error(
          `${slug} email not sent: the write to ${id} was still open after ${COMMIT_WAIT_MS}ms`,
        );
        return;
      }

      let record: T & { emailStatus?: EmailState | null };
      try {
        record = (await payload.findByID({
          collection: slug,
          id,
          depth: 0,
          overrideAccess: true,
        })) as unknown as T & { emailStatus?: EmailState | null };
      } catch (error) {
        // Almost always a rollback: the row the hook was holding never made it
        // to disk, so there is nothing to announce and nowhere to write that
        // down either. Said out loud, because the alternative reading — the
        // database is unreachable — looks identical from here.
        console.error(
          `${slug} email not sent: ${id} is not there after commit`,
          error,
        );
        return;
      }

      // Checked again on the stored values rather than on the in-flight
      // document: between the hook firing and the commit landing, a second
      // save may already have settled this one.
      if (record.emailStatus !== "pending") return;

      try {
        const to = await options.to(record, payload);
        if (!to) {
          await settle({
            emailStatus: "skipped",
            emailError:
              "Geen ontvanger ingesteld (Site Instellingen -> Contact).",
          });
          return;
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
        console.error(`${slug} email send failed`, error);
        await settle({
          emailStatus: "failed",
          emailError: error instanceof Error ? error.message : String(error),
        });
      }
    };

    // Started, not awaited. The commit this is waiting for cannot happen until
    // the hook has returned, so awaiting it here would be waiting on itself.
    // `deliver` swallows everything, which is what makes a bare `void` safe.
    void deliver();

    return doc;
  };
}
