import { getPayloadClient } from "@/lib/payload";
import { SLOT_MINUTES, formatTime, timeToMinutes } from "./openingHours";

/**
 * How many seats are already spoken for, and therefore when to stop saying yes.
 *
 * The form used to accept everything. Fifty people could ask for eight o'clock
 * on the same Saturday and every one of them would get the same thank-you
 * page, after which two owners had fifty phone calls to make and a room with
 * forty chairs in it. So the room is counted here.
 *
 * A table is not a moment, it is a sitting: `reservationDurationMinutes` (two
 * hours out of the box) is how long the chairs stay occupied. A party of four
 * at 19:00 therefore takes four seats out of every slot their two hours run
 * through, and a booking that would push any of those slots past the room's
 * capacity is refused. A row may carry its own `duration` when the owners know
 * a table will be longer or shorter than usual; the setting is only the
 * default.
 *
 * The slots are the same ones the form offers — quarter hours or half hours,
 * as the owners set them in Site Instellingen — and `slotMinutes` is how that
 * setting reaches the arithmetic. It has to: seats counted in half hours while
 * the form offers quarters would put 19:00 and 19:15 in one bucket, so the two
 * would always be full together and the whole point of quarter hours, which is
 * spreading the arrivals, would be counted away.
 *
 * Everything is counted in memory from a single query for the day. Reservation
 * rows are small, there are a handful per day, and asking the database once per
 * candidate slot would be forty queries to draw one date picker.
 *
 * Cancelled requests do not occupy anything: "geannuleerd" is precisely the
 * status that gives the seats back.
 */

export interface SlotLoad {
  /** HH:MM, on the grid the form offers. */
  time: string;
  seatsTaken: number;
  seatsLeft: number;
  /**
   * Whether a new booking could start here at all. Unlike `seatsTaken`, which
   * is about this slot alone, this looks ahead across the whole sitting: a
   * table at 19:00 is no use if the room is full at 20:00.
   */
  full: boolean;
}

export interface CapacityOptions {
  /** Seats in the room. Nought or less means the owners are not counting. */
  capacity: number;
  durationMinutes: number;
  /**
   * The day's bookable sittings, from the resolved schedule. Without them "the
   * whole day is full" cannot be told apart from "the café is shut", and only
   * the single slot can be judged.
   */
  slots?: string[];
  /** Seats being asked for. One is the question "is there any room at all". */
  partySize?: number;
  /**
   * How far apart the sittings sit, as the owners set it. Left off, the
   * module's own default stands — which is what the tests and any caller that
   * has no settings to hand rely on.
   */
  slotMinutes?: number;
}

/** The grid this question is being asked on. */
const grid = (opts: CapacityOptions): number =>
  Number.isFinite(opts.slotMinutes) && (opts.slotMinutes ?? 0) > 0
    ? (opts.slotMinutes as number)
    : SLOT_MINUTES;

/** Only the parts of a stored reservation the arithmetic needs. */
interface Booking {
  time?: string | null;
  guests?: number | null;
  duration?: number | null;
}

/** The same, carrying the day it sits on, as a window of them must. */
interface DayBooking extends Booking {
  date?: string | null;
}

const DEFAULT_DURATION = 120;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** A sitting has to cover at least the slot it starts in. */
function sittingMinutes(
  booking: Booking,
  fallback: number,
  slotMinutes: number,
): number {
  const own = typeof booking.duration === "number" ? booking.duration : 0;
  const minutes = own > 0 ? own : fallback > 0 ? fallback : DEFAULT_DURATION;
  return Math.max(slotMinutes, minutes);
}

/**
 * Every reservation between two dates that still holds its seats.
 *
 * Read through the local API with access overridden: the collection is staff
 * only by design, and this is the server counting its own chairs, not a
 * visitor reading anybody's name. Nothing but the four columns below leaves
 * this function, and only the arithmetic ever sees them.
 *
 * A whole window at once, because the date picker asks about a quarter of a
 * year in one breath and ninety round trips to draw one calendar is a page
 * that loads by the second.
 */
async function bookingsBetween(
  fromIso: string,
  toIso: string,
): Promise<DayBooking[]> {
  if (!ISO.test(fromIso) || !ISO.test(toIso)) return [];
  try {
    const payload = await getPayloadClient();
    const res = await payload.find({
      collection: "reservations",
      overrideAccess: true,
      depth: 0,
      pagination: false,
      limit: 2000,
      where: {
        and: [
          // Stored at midday UTC; the whole day is taken either side of it so
          // an older row written at midnight still counts.
          { date: { greater_than_equal: `${fromIso}T00:00:00.000Z` } },
          { date: { less_than_equal: `${toIso}T23:59:59.999Z` } },
          { status: { not_equals: "geannuleerd" } },
        ],
      },
      select: { date: true, time: true, guests: true, duration: true },
    });
    return (res.docs as DayBooking[]) || [];
  } catch (error) {
    // A count that cannot be made is not a reason to refuse a table. The
    // owners would rather ring one guest back than lose a Saturday's bookings
    // to a database hiccup, so an unreadable day reads as an empty one.
    console.error("reservation load unavailable, counting nothing", error);
    return [];
  }
}

/** One day of them. */
const bookingsFor = (isoDate: string) => bookingsBetween(isoDate, isoDate);

/**
 * The slots a sitting is in the room for, as keys on the grid.
 *
 * Keyed to the grid rather than to the sitting's own start, because the two are
 * not always the same. Everything the form offers lands on the grid, but the
 * owners type reservations in by hand as well, and a party entered at 19:07
 * whose seats are counted under 19:07 occupies a key nothing else ever reads:
 * the picker asks about 19:00, finds the room empty, and hands out forty chairs
 * that are already sat in. A table from 19:07 to 21:07 is in the room for part
 * of the slot 19:07 falls in and part of the one 21:07 falls in, and takes its
 * seats out of both.
 */
function coveredSlots(
  start: number,
  minutes: number,
  slotMinutes: number,
): number[] {
  const end = start + minutes;
  const slots: number[] = [];
  for (
    let t = Math.floor(start / slotMinutes) * slotMinutes;
    t < end;
    t += slotMinutes
  ) {
    slots.push(t);
  }
  return slots;
}

/** Seats taken per slot, keyed by minutes from midnight. */
function seatsBySlot(
  bookings: Booking[],
  durationMinutes: number,
  slotMinutes: number,
): Map<number, number> {
  const taken = new Map<number, number>();
  for (const booking of bookings) {
    const start = timeToMinutes(String(booking.time ?? ""));
    if (start === null) continue;
    const seats = Number(booking.guests);
    if (!Number.isFinite(seats) || seats <= 0) continue;
    const covered = coveredSlots(
      start,
      sittingMinutes(booking, durationMinutes, slotMinutes),
      slotMinutes,
    );
    for (const t of covered) {
      taken.set(t, (taken.get(t) ?? 0) + seats);
    }
  }
  return taken;
}

/** Seats left in the tightest slot a sitting starting here would cover. */
function roomFrom(
  taken: Map<number, number>,
  start: number,
  opts: CapacityOptions,
): number {
  const step = grid(opts);
  const duration = Math.max(step, opts.durationMinutes || DEFAULT_DURATION);
  let left = opts.capacity;
  // The same walk `seatsBySlot` used to put the seats there, so the question
  // and the answer cannot land on different keys.
  for (const t of coveredSlots(start, duration, step)) {
    left = Math.min(left, opts.capacity - (taken.get(t) ?? 0));
  }
  return left;
}

/** Whether the owners are counting at all. */
const counting = (opts: CapacityOptions) =>
  Number.isFinite(opts.capacity) && opts.capacity > 0;

/**
 * The day's occupancy. Given `slots`, one entry per slot the café offers —
 * which is what the time picker wants. Without them, one entry per slot that
 * anybody has actually booked, and a time that is missing is a time nobody has
 * taken.
 */
export async function loadForDay(
  isoDate: string,
  opts: CapacityOptions,
): Promise<SlotLoad[]> {
  const taken = seatsBySlot(
    await bookingsFor(isoDate),
    opts.durationMinutes,
    grid(opts),
  );
  const seats = Math.max(1, opts.partySize ?? 1);

  const times = opts.slots?.length
    ? opts.slots
        .map(timeToMinutes)
        .filter((t): t is number => t !== null)
    : [...taken.keys()].sort((a, b) => a - b);

  return times.map((start) => {
    const seatsTaken = taken.get(start) ?? 0;
    return {
      time: formatTime(start),
      seatsTaken,
      seatsLeft: counting(opts) ? Math.max(0, opts.capacity - seatsTaken) : opts.capacity,
      full: counting(opts) ? roomFrom(taken, start, opts) < seats : false,
    };
  });
}

/**
 * Whether nothing on this day can be booked any more.
 *
 * A shut day is not a full one, and answers false: the caller has a better
 * word for that, and telling a guest the café is fully booked on a Tuesday it
 * never opens would only send them looking for a table next Tuesday.
 */
export async function dayIsFull(
  isoDate: string,
  opts: CapacityOptions,
): Promise<boolean> {
  if (!counting(opts) || !opts.slots?.length) return false;
  const loads = await loadForDay(isoDate, opts);
  return loads.length > 0 && loads.every((slot) => slot.full);
}

/**
 * Whether one party can be seated at one time, and if not, which of the two
 * refusals it is: this sitting has no room, or the whole day has none. The
 * difference matters to the guest — the first is answered by picking another
 * time, the second by picking another day.
 */
export async function canSeat(
  isoDate: string,
  time: string,
  guests: number,
  opts: CapacityOptions,
): Promise<{ ok: true } | { ok: false; reason: "slotFull" | "dayFull" }> {
  if (!counting(opts)) return { ok: true };

  const start = timeToMinutes(time);
  // A time that is not a time cannot be checked against anything, and the
  // module's default answer must not be "there is room": the callers that
  // validate the format before asking lose nothing, and one that forgets to
  // gets a refusal it can see rather than a table nobody counted.
  if (start === null) return { ok: false, reason: "slotFull" };

  const seats = Math.max(1, guests);
  const taken = seatsBySlot(
    await bookingsFor(isoDate),
    opts.durationMinutes,
    grid(opts),
  );

  if (roomFrom(taken, start, opts) >= seats) return { ok: true };

  // Refused. Is there any other sitting today that would take them?
  const elsewhere = (opts.slots || []).some((slot) => {
    const t = timeToMinutes(slot);
    return t !== null && roomFrom(taken, t, opts) >= seats;
  });
  return { ok: false, reason: elsewhere ? "slotFull" : "dayFull" };
}

/**
 * Which of a window's days have nothing left to give, in one query.
 *
 * The date picker needs this for every day it draws at once, and each day has
 * its own bookable hours — the last Sunday of the month is shorter than a
 * Saturday — so the slots are passed in per date rather than worked out here.
 * A date with no slots is a closed day, and a closed day is not a full one: it
 * simply does not appear in the answer.
 */
export async function fullDaysBetween(
  slotsByDate: Map<string, string[]>,
  opts: CapacityOptions,
): Promise<Set<string>> {
  const full = new Set<string>();
  const dates = [...slotsByDate.keys()].filter((d) => slotsByDate.get(d)?.length);
  if (!counting(opts) || dates.length === 0) return full;

  dates.sort();
  const bookings = await bookingsBetween(dates[0], dates[dates.length - 1]);

  const byDate = new Map<string, Booking[]>();
  for (const booking of bookings) {
    const day = String(booking.date ?? "").slice(0, 10);
    if (!day) continue;
    byDate.set(day, [...(byDate.get(day) ?? []), booking]);
  }

  const seats = Math.max(1, opts.partySize ?? 1);
  for (const date of dates) {
    const taken = seatsBySlot(
      byDate.get(date) ?? [],
      opts.durationMinutes,
      grid(opts),
    );
    const slots = slotsByDate.get(date) ?? [];
    const anyRoom = slots.some((slot) => {
      const t = timeToMinutes(slot);
      return t !== null && roomFrom(taken, t, opts) >= seats;
    });
    if (!anyRoom) full.add(date);
  }
  return full;
}
