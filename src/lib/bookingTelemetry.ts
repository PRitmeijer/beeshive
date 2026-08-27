/**
 * What may be said about a booking, and why it is said in bands.
 *
 * These four functions lived inside the reservation form for as long as there
 * was one form. The flow is two screens now — availability on one, identity on
 * the other, each measuring itself — so the taxonomy had to move somewhere both
 * could read it, and the one thing it must never become is two copies that
 * drift. It imports nothing, so it costs neither screen anything to hold.
 *
 * The owners' questions about refusals are real ones — are we turning away big
 * parties, are people being caught out by the lead time, is it always the same
 * evening of the week — and none of them can be answered by a bare error code.
 * So a refusal carries the shape of the booking that was refused. What it must
 * never carry is the booking itself, and the line between those two is drawn
 * here rather than at the call sites, so it can only be drawn once.
 *
 * The exact party size is refused and the band is allowed. A number of people
 * is not personal on its own, but Umami stores it next to a timestamp and a
 * same-day visitor hash, and an exact size beside an exact evening is very
 * nearly a primary key into the reservations table — which is not a
 * hypothetical join, because the visitor figures and the bookings live in the
 * same PostgreSQL cluster and land in the same nightly backup. `3-4` answers
 * "are large parties being turned away" and destroys the join, because dozens
 * of bookings share it.
 *
 * The booked date is refused outright, in every form, and replaced by how far
 * ahead it is and which day of the week it falls on. Those two answer what the
 * owners actually ask — "do people book at the last minute", "which service is
 * filling up" — and neither can be turned back into a table. Umami already
 * records the day the event happened, which is what every trend line is
 * actually drawn from, so the evening being booked adds nothing to a graph and
 * is the other half of that key.
 *
 * Name, e-mail address, telephone number and the notes field are refused
 * absolutely and are not derived from at any point: not bucketed, not hashed,
 * not counted. There is no property below that touches them.
 *
 * Each returns an empty string when it cannot answer, and the callers leave the
 * property off entirely rather than sending one — a gap that shows in the data
 * is better than a value that was invented.
 */

export function partyBucket(size: number): string {
  if (!Number.isFinite(size) || size < 1) return "";
  if (size <= 2) return "1-2";
  if (size <= 4) return "3-4";
  if (size <= 6) return "5-6";
  if (size <= 10) return "7-10";
  return "11+";
}

const DAY_MS = 86_400_000;

/** Midday UTC, as everywhere else in this codebase, so no offset can shift a
 *  date across a boundary while it is being subtracted from another. */
const noonOf = (iso: string) => Date.parse(`${iso}T12:00:00.000Z`);

/**
 * How far ahead the booking is, in bands, and why the first band is two days
 * wide when it used to be two bands.
 *
 * It read `same_day` and `1_day` until somebody noticed what that pair was.
 * Umami stamps every event with the day it happened, which this taxonomy
 * relies on elsewhere and swears at length it never sends the booked date —
 * but "this happened on the 14th" plus "the table is tomorrow" is the 15th,
 * exactly, and "same_day" is the 14th. Those two bands were a lossless
 * reconstruction of the one field the whole taxonomy above is built to keep
 * out, sitting beside a party-size band and a same-day visitor hash.
 *
 * Collapsed into one they are no longer reversible — a `0-1_days` event on the
 * 14th is a table on the 14th or the 15th and there is no telling which — and
 * the question the owners actually ask, "do people book at the last minute",
 * is answered exactly as well by the pair as by either half of it. Every wider
 * band was already ambiguous and none of them changes.
 */
export function leadBucket(dateIso: string, todayIso: string): string {
  if (!dateIso || !todayIso) return "";
  const days = Math.round((noonOf(dateIso) - noonOf(todayIso)) / DAY_MS);
  if (!Number.isFinite(days) || days < 0) return "";
  if (days <= 1) return "0-1_days";
  if (days <= 6) return "2-6_days";
  if (days <= 14) return "1-2_weeks";
  return "2_weeks_plus";
}

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export function weekdayKey(dateIso: string): string {
  if (!dateIso) return "";
  const day = new Date(noonOf(dateIso)).getUTCDay();
  return Number.isNaN(day) ? "" : WEEKDAY_KEYS[day];
}

/**
 * How long something took, in four bands. "Slow" is the most common
 * explanation for somebody giving up on a phone and the one the site could
 * never tell apart from "changed their mind", so every request in the booking
 * path is timed. Bands rather than milliseconds because a millisecond count is
 * a hundred distinct property values in Umami's own list and nothing anyone can
 * read at a glance; four is a bar chart.
 */
export function msBucket(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "";
  if (ms < 500) return "lt500";
  if (ms < 1500) return "500_1500";
  if (ms < 4000) return "1500_4000";
  return "gt4000";
}
