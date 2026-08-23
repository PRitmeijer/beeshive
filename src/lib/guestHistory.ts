import type { Payload } from "payload";
import { todayInAmsterdam } from "@/lib/openingHours";

/**
 * "Hebben wij elkaar al eens gezien?"
 *
 * A guest who has never sat down here does not know that the kitchen is small,
 * that the menu changes, that you order at the bar — the whole concept has to
 * be explained once, warmly, at the door. A regular who gets that same
 * explanation for the fourth time is being told, politely, that nobody
 * remembered them. Both of those are decided in the two seconds between the
 * door opening and the first sentence, so the answer has to already be on the
 * screen the owners are looking at.
 *
 * What this module can answer is narrower than the question, and the whole
 * feature rests on that difference: it counts bookings, and a booking is the
 * only thing it can see. Somebody who walked in on a quiet Tuesday and took
 * the corner table without ringing first has been here and this database has
 * never heard of them, so every number below is a floor and never a total.
 * Which is why nothing built on it may say "bezoek": "reservering" is the word
 * that is exactly true, and the names in here are chosen so that the wrong one
 * cannot drift back into the interface a year from now.
 *
 * The uncomfortable part, stated plainly. To answer that question at all, this
 * reads across every reservation anybody has ever made and compares e-mail
 * addresses and telephone numbers — the whole guest book, keyed on personal
 * data, in one pass. There is no version of that which is safe to expose to
 * the internet, and so nothing here guards itself: `historyForMany` takes a
 * `Payload` instance from its caller and reads with `overrideAccess: true`,
 * exactly like src/lib/capacity.ts does, because the collection is staff-only
 * by design and this is the server reading its own guest book.
 *
 * Which means the login is enforced *outside* this file, and there are only
 * two doors. The first is src/components/admin/GuestHistory.tsx, a server
 * component Payload renders while building the form state of a reservation —
 * that only happens inside the authenticated admin, and nothing it computes
 * travels anywhere but into that already-authorised page. The second is the
 * notification hook in src/collections/Reservations.ts, which runs on the
 * server with no request surface at all. There is deliberately no HTTP
 * endpoint. If anyone ever adds one, it must open with the same check
 * src/app/api/admin/backups/route.ts opens with — `payload.auth()` and a 401 —
 * because a URL that answers "has this e-mail address eaten here before" is a
 * lookup service for other people's dinner plans.
 *
 * The other thing worth reading before changing anything here is the shape of
 * the query. The admin agenda draws forty bookings on one screen and wants a
 * badge on every row, so a per-booking lookup would be forty round trips to
 * draw one week. `historyForMany` therefore takes the whole screenful at once
 * and spends exactly one query on it, whatever it is handed; `historyFor` is
 * that same function with a list of one.
 */

export interface GuestReservationHistory {
  /** How many earlier bookings this person has, not counting this one or any cancelled. */
  priorReservations: number;
  /** True when priorReservations is 0 — spelled out so no caller has to remember the convention. */
  isFirstReservation: boolean;
  /** YYYY-MM-DD of the earliest and the most recent earlier booking, or null. */
  firstReservation: string | null;
  lastReservation: string | null;
  /** What the match was made on, for the admin to show: "e-mailadres" | "telefoonnummer" | null. */
  matchedOn: "email" | "phone" | null;
}

/** A booking to ask about. Anything with these four properties will do. */
export interface HistorySubject {
  id: string | number;
  email?: string | null;
  phone?: string | null;
  date?: string | null;
}

/**
 * The most rows one lookup will pull back.
 *
 * The rows are tiny — four columns, no relations — and this café will not see
 * five thousand bookings for years, so in practice the cap never bites. When
 * it does, the query is sorted newest first, so what falls off the end is the
 * oldest history: the count comes out too low and `firstReservation` reads later
 * than the truth. A guest whose every booking is older than the cap will be
 * greeted as new, which is the one wrong answer this whole module exists to
 * prevent — and it is still the right trade. An admin page that takes six
 * seconds to open is a page the owners stop opening, and a badge nobody looks
 * at is worth nothing at all. Raise the number before removing the cap.
 */
const MAX_ROWS = 5000;

/** Payload stores the day at midday UTC; only the day itself is ever compared. */
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const dayOf = (value?: string | null): string | null => {
  const day = String(value ?? "").slice(0, 10);
  return ISO_DAY.test(day) ? day : null;
};

/**
 * An e-mail address reduced to the person behind it.
 *
 * Lower-cased and trimmed, because a phone keyboard capitalises the first
 * letter and a paste out of WhatsApp brings a space with it. "Jan@x.nl",
 * "jan@x.nl " and "jan@x.nl" are one guest, and treating them as three is how
 * a regular of two years ends up being told about the concept again.
 *
 * Nothing clever beyond that. Stripping dots out of a Gmail address or cutting
 * everything after a "+" would match more, and would also silently merge two
 * housemates who share a domain trick — a wrong "welkom terug" is worse than a
 * missed one, so the normalisation stops where the guesswork starts.
 */
function emailKey(value?: string | null): string | null {
  const trimmed = String(value ?? "").trim().toLowerCase();
  return trimmed.length > 2 && trimmed.includes("@") ? trimmed : null;
}

/**
 * Below this many digits it is not a telephone number, it is a typo.
 *
 * A Dutch number is ten digits with its leading zero and nine without, which
 * is what the reduction below leaves. Matching on anything shorter would mean
 * every guest who typed "06" into the field is the same person.
 */
const MIN_PHONE_DIGITS = 9;

/**
 * A telephone number reduced to the line it rings.
 *
 * The same Dutch mobile arrives here as "06-12345678", "06 12 34 56 78",
 * "+31612345678" and "0031 6 1234 5678", and all four are one guest waiting
 * for one table. So every separator goes, the international prefix and the
 * trunk zero are recognised as the same thing they always were, and what is
 * left is the subscriber number: 612345678.
 *
 * This matters more than the e-mail normalisation does, because the phone is
 * the field guests get right. They mistype an address once and then use a
 * different one next year; the number they book on is the number in their own
 * hand, and it does not change.
 *
 * Foreign numbers pass through with their country code intact, which is
 * consistent as long as the guest writes them the same way twice — good
 * enough for the handful of them, and it costs a missed match, never a wrong
 * one.
 */
function phoneKey(value?: string | null): string | null {
  let digits = String(value ?? "").replace(/\D+/g, "");
  // "00" is the old way of dialling out; "+" has already been stripped above,
  // so after this both spellings look identical.
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("31") && digits.length === 11) {
    // Country code 31 belongs to the Netherlands and nobody else, so an
    // eleven-digit number that opens with it is a Dutch one with its trunk
    // zero already gone.
    digits = digits.slice(2);
  } else if (digits.startsWith("0")) {
    digits = digits.slice(1);
  }
  return digits.length >= MIN_PHONE_DIGITS ? digits : null;
}

/** The answer for somebody we have never seen, and for somebody we cannot look up. */
const NEVER_SEEN: GuestReservationHistory = {
  priorReservations: 0,
  isFirstReservation: true,
  firstReservation: null,
  lastReservation: null,
  matchedOn: null,
};

/** Only the columns the arithmetic reads. Nothing else leaves the query. */
interface HistoryRow {
  id: string | number;
  email?: string | null;
  phone?: string | null;
  date?: string | null;
  status?: string | null;
}

/**
 * The history of one booking. A list of one through the batched lookup, so
 * there is a single copy of the matching rules to get wrong.
 */
export async function historyFor(
  subject: HistorySubject,
  payload: Payload,
): Promise<GuestReservationHistory> {
  const all = await historyForMany([subject], payload);
  return all.get(subject.id) ?? NEVER_SEEN;
}

/**
 * The history of a screenful of bookings, in one query.
 *
 * The obvious implementation is a `where` with an `in` over the normalised
 * keys, and it cannot be written: the `email` and `phone` columns hold what
 * the guest typed, and the normalisation that makes "+31 6 1234 5678" and
 * "06-12345678" the same number happens in this file, not in Postgres. An
 * `in` over the normalised values would match neither spelling, and a `like`
 * over a formatted number matches whichever formatting the caller happened to
 * guess. So the constraint is put where it can be stated truthfully — the
 * cancelled rows and everything on or after the newest day anyone is asking
 * about are excluded in SQL, four columns are selected, the row count is
 * capped — and the comparing is done here, over a set that is already small.
 * It stays one query no matter how many bookings are handed in, which is the
 * property the agenda needs.
 *
 * A database that will not answer throws, and that is on purpose. Every other
 * field in this result would be a plausible lie: an empty result set and a
 * failed query produce the same `priorReservations: 0`, and "eerste
 * reservering" is a sentence somebody then says out loud to a guest of four
 * years. capacity.ts
 * swallows its errors because an uncountable day reading as an empty one costs
 * a phone call; here the cheap failure is the caller catching this and saying
 * "niet op te zoeken", so let it.
 */
export async function historyForMany(
  subjects: HistorySubject[],
  payload: Payload,
): Promise<Map<string | number, GuestReservationHistory>> {
  const answers = new Map<string | number, GuestReservationHistory>();

  /**
   * A booking with neither an address nor a number matches nothing, and must
   * never match the other rows that also have neither: "both blank" is not a
   * resemblance. Those subjects are answered from the constant and never take
   * part in the comparison at all.
   */
  const asked = subjects.map((subject) => ({
    subject,
    email: emailKey(subject.email),
    phone: phoneKey(subject.phone),
    // A row with no readable date is judged against today. It cannot happen
    // through the form — the field is required — but a hand-typed row halfway
    // through being filled in can look like this, and "everything up to now"
    // is the only honest reading of a booking with no day on it.
    day: dayOf(subject.date) ?? todayInAmsterdam(),
  }));

  for (const entry of asked) answers.set(entry.subject.id, NEVER_SEEN);

  const matchable = asked.filter((entry) => entry.email || entry.phone);
  if (matchable.length === 0) return answers;

  // One bound serves every subject: nothing on or after the latest day being
  // asked about can be earlier than any of them. The day-by-day comparison
  // below is what actually decides; this only keeps the pull small, and is
  // deliberately generous by a day so a row stored at some other hour than the
  // usual midday UTC is not cut off by the timestamp arithmetic.
  const newestDay = matchable.reduce(
    (latest, entry) => (entry.day > latest ? entry.day : latest),
    matchable[0].day,
  );

  const found = await payload.find({
    collection: "reservations",
    // Staff-only collection, read by the server about its own guests. See the
    // module comment for where the login that permits this is enforced.
    overrideAccess: true,
    depth: 0,
    pagination: false,
    limit: MAX_ROWS,
    // Newest first, so the cap sheds the oldest history rather than the most
    // recent — the evenings a guest standing at the door is most likely to
    // be remembered by.
    sort: "-date",
    where: {
      and: [
        { date: { less_than_equal: `${newestDay}T23:59:59.999Z` } },
        /**
         * A cancelled table was never sat at; those are the seats given back,
         * and the same reasoning as in capacity.ts applies.
         *
         * The three that remain — "nieuw", "gebeld", "bevestigd" — are all
         * counted, and that is the judgement call in this file. Strictly, only
         * "bevestigd" is a table anybody sat at. But the owners confirm by
         * ringing the guest, and the row that gets moved along afterwards is
         * the exception rather than the rule: counting only confirmed
         * bookings would look at a guest book full of "nieuw" and report that
         * every single guest is here for the first time, which is both wrong
         * and useless. An uncancelled request whose day has passed is, in this
         * café, a table that was sat at. The failure that leaves is a guest
         * who asked, was never called back and never came, counted once —
         * rare, and it errs towards warmth.
         */
        { status: { not_equals: "geannuleerd" } },
      ],
    },
    select: { email: true, phone: true, date: true, status: true },
  });

  const rows = (found.docs as unknown as HistoryRow[]) || [];

  const byEmail = new Map<string, HistoryRow[]>();
  const byPhone = new Map<string, HistoryRow[]>();
  for (const row of rows) {
    const email = emailKey(row.email);
    if (email) byEmail.set(email, [...(byEmail.get(email) ?? []), row]);
    const phone = phoneKey(row.phone);
    if (phone) byPhone.set(phone, [...(byPhone.get(phone) ?? []), row]);
  }

  for (const entry of asked) {
    if (!entry.email && !entry.phone) continue;

    /**
     * "Earlier" is measured against this booking's own day, not against
     * today. A table typed in for next month must not count the other tables
     * next month as things that already happened — the owners open a booking
     * to find out what to say when these people walk in, and on that evening
     * only the evenings before it exist.
     *
     * Strictly earlier, so two tables booked for the same day count once and
     * not twice. And a row can never be its own history, which matters as soon
     * as two subjects on the same screen are the same guest.
     */
    const earlier = (row: HistoryRow) => {
      const day = dayOf(row.date);
      return (
        day !== null &&
        day < entry.day &&
        String(row.id) !== String(entry.subject.id)
      );
    };

    /**
     * E-mail first, telephone second, and never the two added together.
     *
     * The address is the stronger signal: it is unique to a person where a
     * number is shared by a household, and it is what the guest chose to be
     * reached on. Only when it turns up nothing is the number tried — which is
     * the case this catches most often, the regular who booked under a typo'd
     * address from the same phone. `matchedOn` then carries which of the two
     * it was, because the owners will one day be looking at a "welkom terug"
     * that is plainly wrong, and the first thing they need is what the admin
     * thought made these two rows one person.
     */
    let earlierBookings = entry.email
      ? (byEmail.get(entry.email) ?? []).filter(earlier)
      : [];
    let matchedOn: GuestReservationHistory["matchedOn"] = earlierBookings.length
      ? "email"
      : null;

    if (!earlierBookings.length && entry.phone) {
      earlierBookings = (byPhone.get(entry.phone) ?? []).filter(earlier);
      matchedOn = earlierBookings.length ? "phone" : null;
    }

    if (!earlierBookings.length) continue;

    const days = earlierBookings
      .map((row) => dayOf(row.date))
      .filter((day): day is string => day !== null)
      .sort();

    answers.set(entry.subject.id, {
      priorReservations: earlierBookings.length,
      isFirstReservation: false,
      firstReservation: days[0] ?? null,
      lastReservation: days[days.length - 1] ?? null,
      matchedOn,
    });
  }

  return answers;
}
