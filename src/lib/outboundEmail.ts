import type {
  CollectionAfterChangeHook,
  Field,
  Payload,
  PayloadRequest,
  SelectField,
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
 *
 * One collection may owe more than one message. A reservation owes the owners
 * a heads-up the moment it arrives and the guest a confirmation the moment the
 * owners say yes, and those two have nothing to do with each other: they go to
 * different people, at different times, and either can fail while the other
 * succeeded. So each message keeps a bookkeeping trio of its very own, named
 * when the fields and the hook are built, and every sentence above holds once
 * per trio rather than once per collection. Two badges in the sidebar, two
 * retries, two honest answers to "did that go out?". What the trios must never
 * do is read each other's status, which is why the field names are threaded
 * through instead of being written out in the body of the send.
 *
 * SKIP_OUTBOUND_EMAIL, on the other hand, stays one flag for all of them, and
 * that is deliberate too. It marks a write that must not announce itself, and
 * a write that must not announce itself must not announce itself twice.
 */

/** The flag that marks a write which must not announce itself. */
export const SKIP_OUTBOUND_EMAIL = "skipOutboundEmail";

export type EmailState = "pending" | "sent" | "failed" | "skipped";

/** Declared order, because it is the order the owners read in the dropdown. */
const EMAIL_STATES: EmailState[] = ["pending", "sent", "failed", "skipped"];

const STATE_LABELS: Record<EmailState, string> = {
  pending: "In de wachtrij",
  sent: "Verstuurd",
  failed: "Mislukt",
  skipped: "Niet verstuurd",
};

/**
 * Which three columns hold one message's bookkeeping.
 *
 * A second message on the same collection cannot share the first one's fields
 * without the two of them settling on top of each other, so the names travel
 * together as one object and are handed to both halves of the arrangement: the
 * fields that store the state, and the hook that reads and writes it. Getting
 * them out of step is the one mistake this shape is meant to make impossible,
 * which is why they are a single value rather than three arguments.
 */
export interface EmailFieldNames {
  status: string;
  error: string;
  sentAt: string;
}

/** The original three, still the answer for any collection with one message. */
const DEFAULT_FIELD_NAMES: EmailFieldNames = {
  status: "emailStatus",
  error: "emailError",
  sentAt: "emailSentAt",
};

interface EmailStateOverrides {
  /** The three column names, when this is not a collection's only message. */
  names?: EmailFieldNames;
  /** Dutch label, when a collection wants to name the mail it sends. */
  label?: string;
  /** Replaces the standard admin explanation. */
  description?: string;
  defaultValue?: EmailState;
  /**
   * Renames single entries in the dropdown.
   *
   * "Niet verstuurd" is honest for a message that was owed and then turned out
   * not to be, which is what "skipped" means for the owners' notification. For
   * a mail that is only owed once somebody presses Bevestigd it reads as a
   * fault report on a row where nothing has gone wrong yet, and the owners
   * would spend a fortnight looking for the breakage. Per-value, because the
   * other three still mean exactly what they say.
   */
  optionLabels?: Partial<Record<EmailState, string>>;
  /** Names the other two fields, so a second trio is not three anonymous
   *  repeats of "Foutmelding" and "Verstuurd op" further down the sidebar. */
  errorLabel?: string;
  sentAtLabel?: string;
  /**
   * Takes the trio out of the admin without taking it out of the database.
   *
   * For a message that is built but deliberately not part of a release yet.
   * Three sidebar panels reporting on a mail that cannot be sent are three
   * invitations to file a bug against a feature nobody switched on — and the
   * columns must stay, because the day it is switched on the rows that were
   * written meanwhile have to still make sense.
   */
  hidden?: boolean;
}

/**
 * The status of one outgoing mail belonging to this document. Never localized:
 * it is bookkeeping, not content, and it holds the same one answer whichever
 * language the row is read in.
 *
 * Typed as the select it is rather than as a `Field`, so that a collection
 * which needs to hang a hook on this one field can spread it and add one
 * without the union getting in the way. The arming hook in Reservations.ts is
 * the reason that matters.
 */
export const emailStateField = (
  overrides: EmailStateOverrides = {},
): SelectField => ({
  name: (overrides.names ?? DEFAULT_FIELD_NAMES).status,
  label: overrides.label ?? "Verzendstatus",
  type: "select",
  options: EMAIL_STATES.map((value) => ({
    label: overrides.optionLabels?.[value] ?? STATE_LABELS[value],
    value,
  })),
  defaultValue: overrides.defaultValue ?? "pending",
  admin: {
    hidden: overrides.hidden ?? false,
    position: "sidebar",
    description:
      overrides.description ??
      "Of het bijbehorende mailtje de deur uit is. Een mislukt bericht kan opnieuw verstuurd worden door de status terug op \"In de wachtrij\" te zetten en op te slaan.",
  },
});

/** What went wrong, in the mail server's own words. Only filled on a failure. */
export const emailErrorField = (overrides: EmailStateOverrides = {}): Field => ({
  name: (overrides.names ?? DEFAULT_FIELD_NAMES).error,
  label: overrides.errorLabel ?? "Foutmelding",
  type: "textarea",
  admin: {
    hidden: overrides.hidden ?? false,
    position: "sidebar",
    readOnly: true,
    description:
      "Wat de mailserver terugmeldde. Handig om door te sturen als het blijft misgaan.",
  },
});

/** When the mail actually left, as opposed to when the row was created. */
export const emailSentAtField = (overrides: EmailStateOverrides = {}): Field => ({
  name: (overrides.names ?? DEFAULT_FIELD_NAMES).sentAt,
  label: overrides.sentAtLabel ?? "Verstuurd op",
  type: "date",
  admin: {
    hidden: overrides.hidden ?? false,
    position: "sidebar",
    readOnly: true,
    date: { pickerAppearance: "dayAndTime" },
  },
});

/** The three bookkeeping fields together, for spreading into a field list. */
export const outboundEmailFields = (
  overrides: EmailStateOverrides = {},
): Field[] => [
  emailStateField(overrides),
  emailErrorField(overrides),
  emailSentAtField(overrides),
];

type Builder<T, R> = (doc: T, payload: Payload) => R | Promise<R>;

export interface OutboundEmailOptions<T> {
  /** Where it goes. Returning nothing parks the document at "Niet verstuurd". */
  to: Builder<T, string | null | undefined>;
  subject: Builder<T, string>;
  /** Plain text. These mails are read on a phone behind the bar. */
  body: Builder<T, string>;
  /** Usually the guest, so hitting reply answers the right person. */
  replyTo?: Builder<T, string | null | undefined>;
  /** Which three columns this message keeps its bookkeeping in. Leave it out
   *  and it is the collection's only message, in the original three. */
  fields?: EmailFieldNames;
  /**
   * What the owners are told when `to` comes back empty.
   *
   * The default sends them to Site Instellingen, which is exactly right for a
   * notification addressed to the house and exactly wrong for a mail addressed
   * to a guest: there is no setting on that screen that will conjure up an
   * e-mail address the guest never gave. A message that knows better says so
   * itself, in the sidebar, where the row is already open.
   */
  skipReason?: string;
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
 * One delivery at a time per document, and it took a measurement to learn why.
 *
 * Two messages on one row used to be something that could not happen at the
 * same moment: the owners' notification armed on the create, and the guest's
 * confirmation armed on a much later update, hours or days afterwards.
 * Automatic confirmation ended that. In `auto` the endpoint writes both
 * `pending` columns on the same create, so both hooks fire on the same write,
 * both wake off the same commit, and both finish by recording their outcome.
 *
 * Recording the outcome is the part that does not survive the overlap.
 * `settle()` below calls `payload.update`, and a Payload update is not a patch
 * of the columns handed to it: the operation merges that data over the document
 * it read when it started and writes the whole row back. Two settles that
 * overlap are therefore two read-modify-write cycles on one row, and whichever
 * finishes second carries a copy of the other's column from before the other
 * had written it.
 *
 * This was not reasoned about, it was run. Two concurrent `payload.update`
 * calls against one reservation, one setting the owner trio and one setting the
 * confirmation trio, on this schema and this adapter: `emailStatus` came back
 * "sent" and `confirmationEmailStatus` came back "pending" — a confirmation
 * that really had been sent, on a row still saying it was owed.
 *
 * Which is worse than a lost note, because "pending" is the arming state. The
 * next unrelated save — an owner fixing a typo in the notes a week later —
 * hands the row back to this module, which reads "pending", believes the mail
 * is owed, and sends the guest a second confirmation. That is precisely the
 * double-send SKIP_OUTBOUND_EMAIL exists to prevent, arriving through a door
 * the flag does not cover.
 *
 * The fix is the smallest one that removes the overlap instead of trying to win
 * it: deliveries for the same document queue behind one another. The second one
 * then does its re-read after the first has committed, sees the row as it
 * really is, and writes a merge that already contains the first one's column.
 *
 * A promise chain in a Map rather than a lock, because there is nothing here
 * that could deadlock — every delivery already swallows its own failures, so a
 * link can never be left unresolved. The key carries the collection as well as
 * the id, since ids are only unique within one.
 *
 * What this does not protect against is two processes. The chain lives in this
 * module's memory, exactly as the rate limiter's map does next door, so a
 * second container would have a second chain and the two could overlap again.
 * That is the same single-long-lived-server assumption the rest of this file
 * already rests on, written down here rather than discovered later.
 */
const deliveries = new Map<string, Promise<void>>();

function afterPreviousDelivery(key: string, work: () => Promise<void>): void {
  const previous = deliveries.get(key) ?? Promise.resolve();
  // `work` swallows everything, but the chain must not be breakable even so:
  // one rejected link would strand every delivery queued behind it.
  const next = previous.then(work, work);
  deliveries.set(key, next);
  // Keeps the map from growing a key per document for the life of the process.
  // Only the tail clears itself, so a delivery queued in the meantime keeps the
  // chain it is waiting on.
  void next.finally(() => {
    if (deliveries.get(key) === next) deliveries.delete(key);
  });
}

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

    const names = options.fields ?? DEFAULT_FIELD_NAMES;
    /** This message's own status, and never the other message's. */
    const stateOf = (row: unknown) =>
      (row as Record<string, unknown> | null | undefined)?.[names.status] as
        | EmailState
        | null
        | undefined;

    if (stateOf(doc) !== "pending") return doc;

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

      let record: T;
      try {
        record = (await payload.findByID({
          collection: slug,
          id,
          depth: 0,
          overrideAccess: true,
        })) as unknown as T;
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
      if (stateOf(record) !== "pending") return;

      try {
        const to = await options.to(record, payload);
        if (!to) {
          await settle({
            [names.status]: "skipped",
            [names.error]:
              options.skipReason ??
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
          [names.status]: "sent",
          [names.error]: null,
          [names.sentAt]: new Date().toISOString(),
        });
      } catch (error) {
        console.error(`${slug} email send failed`, error);
        await settle({
          [names.status]: "failed",
          [names.error]: error instanceof Error ? error.message : String(error),
        });
      }
    };

    // Started, not awaited. The commit this is waiting for cannot happen until
    // the hook has returned, so awaiting it here would be waiting on itself.
    // `deliver` swallows everything, which is what makes this safe to abandon.
    //
    // Queued behind any delivery already running for this same document rather
    // than started outright: in automatic mode both mails arm on one write, and
    // two overlapping settles leave one of them recorded as still owed. See
    // `afterPreviousDelivery` above for the measurement.
    afterPreviousDelivery(`${slug}:${id}`, deliver);

    return doc;
  };
}
