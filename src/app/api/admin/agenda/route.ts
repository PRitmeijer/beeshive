import { NextResponse, type NextRequest } from "next/server";
import { getPayloadClient } from "@/lib/payload";
import { loadSchedule } from "@/lib/schedule";
import { describe, todayInAmsterdam } from "@/lib/openingHours";
// `loadEvents` next door would be the obvious call, but it reads published
// events only. The owners plan in here, and an evening that exists as a
// concept is exactly what they are looking for, so the rows are fetched here
// and only the expansion is borrowed.
import { expandOccurrences, type EventDoc } from "@/lib/events";
import {
  historyForMany,
  type GuestVisitHistory,
  type HistorySubject,
} from "@/lib/guestHistory";
import { getUmamiStats } from "@/lib/umamiServer";
import { defaultLocale } from "@/i18n/config";
import type {
  AgendaEvent,
  AgendaOpening,
  AgendaReservation,
  AgendaResponse,
  AgendaStats,
} from "@/components/admin/AgendaDay";

/**
 * Everything the agenda in the admin draws, for one window of days.
 *
 * This is the only endpoint in the project that hands out guest names, so it
 * begins by asking Payload who is calling and refuses anyone who is not logged
 * in. That check is not a formality here: Payload treats a custom admin view as
 * a public route (see isCustomAdminView in @payloadcms/next), so nothing above
 * this line has already established that there is a session — the view guards
 * itself and so does this. Nothing is read, counted or looked up before that
 * answer comes back, and the four sentences this file can reply with are fixed
 * Dutch strings: a caller who is refused learns nothing about who ate here,
 * and a caller who trips a bug gets the same sentence whatever broke.
 *
 * It answers three questions at once because the calendar asks all three about
 * the same window and one round trip on a phone by the bed is worth more than
 * three tidy endpoints: what the doors do that day, which tables are booked,
 * and what is on. A single-day window additionally carries the "Vandaag" panel:
 * the counters that only mean anything for one date at a time.
 *
 * Since every booking now also says whether the guest has eaten here before,
 * the answer carries a second kind of secret: not just tonight's names, but the
 * fact that a name has been here five times since 2023. That is the same
 * session's business as the names themselves, which is why it rides along on
 * this endpoint rather than getting one of its own — one guard, one refusal.
 *
 * The window is capped. A month view asks for about six weeks, the week view
 * for seven days; anything past four months is a caller with a bug in it, and
 * unbounded windows are how a calendar becomes a way to dump the whole
 * reservations table through one request.
 *
 * All the date arithmetic is done at midday UTC, exactly as src/lib/schedule.ts
 * and the opening-exceptions rows do it: midday is far enough from either edge
 * of the day that no timezone offset and no daylight saving jump can push a
 * date onto its neighbour.
 */

export const dynamic = "force-dynamic";

/** Roughly four months: the month view needs six weeks, nothing needs more. */
const MAX_WINDOW_DAYS = 120;

/** A calendar window cannot hold more tables than a very good year does. */
const MAX_ROWS = 2000;

const DAY_MS = 86_400_000;

const isIso = (value: string | null): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

/** Midday UTC for a YYYY-MM-DD string, or null if it is not one. */
function midday(isoDate: string): Date | null {
  const d = new Date(`${isoDate}T12:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const TZ = "Europe/Amsterdam";

const PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function partsOf(at: Date) {
  const parts = PARTS.formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return get;
}

/** The calendar date an instant falls on, as the café would name it. */
function amsterdamDate(at: Date): string {
  const get = partsOf(at);
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** The clock an instant shows on the wall here. */
function amsterdamTime(at: Date): string {
  const get = partsOf(at);
  return `${get("hour")}:${get("minute")}`;
}

/**
 * The two instants an Amsterdam calendar day sits between.
 *
 * The counters below are about what came in "today", and today ends at
 * midnight here rather than at 22:00 or 23:00 UTC. The offset is sampled at the
 * UTC midnight of the date rather than at the answer, which would only differ
 * for a clock change that happened at midnight — they happen at 02:00 and
 * 03:00 local, so it never actually arises. src/lib/umamiServer.ts does the
 * same arithmetic for the same reason.
 */
function amsterdamDayWindow(isoDate: string): { start: string; end: string } {
  const guess = Date.parse(`${isoDate}T00:00:00Z`);
  const get = partsOf(new Date(guess));
  const asIfUtc = Date.UTC(
    Number(get("year")),
    Number(get("month")) - 1,
    Number(get("day")),
    Number(get("hour")),
    Number(get("minute")),
    Number(get("second")),
  );
  const start = guess - (asIfUtc - guess);
  return {
    start: new Date(start).toISOString(),
    end: new Date(start + DAY_MS - 1).toISOString(),
  };
}

/** A reservation as the database keeps it, before the calendar reshapes it. */
interface ReservationRow {
  id: unknown;
  name?: string | null;
  email?: string | null;
  date?: string | null;
  time?: string | null;
  guests?: number | null;
  status?: string | null;
  notes?: string | null;
  phone?: string | null;
}

/**
 * "Zijn ze hier eerder geweest?", asked once for the whole window.
 *
 * The question the owners actually have at half past five is whether the table
 * at seven needs the tour — what the place is, how the kitchen works, that the
 * quiz is on Thursday — or whether it is Mieke again and the right thing is to
 * say so. src/lib/guestHistory.ts knows the answer; the only thing that matters
 * here is that it is asked in one breath. A month is six weeks of bookings, and
 * a lookup per booking would turn opening the calendar into forty round trips
 * to Postgres on a phone connection.
 *
 * Rows with neither an e-mail address nor a telephone number are left out
 * rather than sent along, because "we found nothing" and "there was nothing to
 * look for" are different answers and only the first one may be shown to an
 * owner as "eerste bezoek". Both fields are required on the form, so in
 * practice this only skips the odd row typed in by hand.
 *
 * And the whole thing is allowed to fail quietly. The history is the pleasant
 * extra; the names, the times and the covers are the reason the page exists,
 * and an evening service should not lose them because a query about 2023 fell
 * over. What the owners see then is the calendar exactly as it was last week,
 * with no marks on it.
 */
async function guestHistory(
  payload: Awaited<ReturnType<typeof getPayloadClient>>,
  rows: ReservationRow[],
): Promise<Map<string | number, GuestVisitHistory>> {
  const subjects: HistorySubject[] = rows
    .filter((row) => row.email || row.phone)
    .map((row) => ({
      // Stringified on the way in so the map can be read with the same key on
      // the way out, whatever type the database hands ids back as.
      id: String(row.id),
      email: row.email ?? null,
      phone: row.phone ?? null,
      date: String(row.date ?? "").slice(0, 10) || null,
    }));

  if (subjects.length === 0) return new Map();

  try {
    return await historyForMany(subjects, payload);
  } catch (error) {
    console.error("gastgeschiedenis kon niet worden opgehaald", error);
    return new Map();
  }
}

/**
 * A row that spans the whole window, in one query.
 *
 * Both collections store their date at midday UTC, but rows written before
 * that convention existed may sit anywhere in the day, so the window is
 * widened to whole UTC days at either end and narrowed again when the day is
 * read back off the string.
 */
function withinDays(from: string, to: string) {
  return {
    and: [
      { date: { greater_than_equal: `${from}T00:00:00.000Z` } },
      { date: { less_than_equal: `${to}T23:59:59.999Z` } },
    ],
  };
}

export async function GET(request: NextRequest) {
  let payload;
  try {
    payload = await getPayloadClient();
  } catch {
    return NextResponse.json(
      { error: "De agenda kon niet worden geladen. Probeer het later opnieuw." },
      { status: 503 },
    );
  }

  const { user } = await payload.auth({ headers: request.headers });
  if (!user) {
    return NextResponse.json(
      { error: "Log opnieuw in om de agenda te bekijken." },
      { status: 401 },
    );
  }

  const today = todayInAmsterdam();
  const params = request.nextUrl.searchParams;
  const fromParam = params.get("from");
  const toParam = params.get("to");
  const from = isIso(fromParam) ? fromParam : today;
  const to = isIso(toParam) ? toParam : from;

  const start = midday(from);
  const end = midday(to);
  if (!start || !end || end.getTime() < start.getTime()) {
    return NextResponse.json(
      { error: "Die periode klopt niet: de einddatum ligt voor de begindatum." },
      { status: 400 },
    );
  }
  if ((end.getTime() - start.getTime()) / DAY_MS >= MAX_WINDOW_DAYS) {
    return NextResponse.json(
      { error: `Vraag hooguit ${MAX_WINDOW_DAYS} dagen tegelijk op.` },
      { status: 400 },
    );
  }

  try {
    // The exception rows are fetched again here even though loadSchedule has
    // already read them, because it hands back what a *day* looks like and
    // this view needs what a *document* is: the id behind the band is what
    // turns "gesloten" in the calendar into the form that says so.
    const [schedule, exceptions, reservationDocs, eventDocs] = await Promise.all([
      loadSchedule(from, to, defaultLocale),
      payload.find({
        collection: "opening-exceptions",
        where: withinDays(from, to),
        depth: 0,
        pagination: false,
        limit: MAX_WINDOW_DAYS,
      }),
      payload.find({
        collection: "reservations",
        where: withinDays(from, to),
        sort: "date",
        depth: 0,
        limit: MAX_ROWS,
        // The collection's own access rules stay the authority rather than
        // being bypassed by the local API: everything here is staff-only, and
        // that should keep being true if those rules are ever tightened.
        overrideAccess: false,
        user,
      }),
      payload.find({
        collection: "events",
        // Concepts are included on purpose. An evening that is planned but not
        // yet published is exactly the thing the owners are looking for when
        // they open the week, and the card says "Concept" so it cannot be
        // mistaken for something the public can see.
        depth: 0,
        limit: MAX_ROWS,
        sort: "startDate",
      }),
    ]);

    const exceptionIdByDate = new Map<string, string>();
    for (const row of exceptions.docs as { id: unknown; date?: string | null }[]) {
      const day = String(row.date ?? "").slice(0, 10);
      if (day) exceptionIdByDate.set(day, String(row.id));
    }

    const days: AgendaOpening[] = schedule.days.map((day) => ({
      date: day.date,
      closed: day.closed,
      // A line nobody could read a range out of ("vanaf 17:00") is still the
      // truth about that day, so it is shown as typed rather than as silence.
      hours: day.ranges.length ? describe(day.ranges) : day.text || "",
      note: day.note ?? null,
      source: day.source,
      exceptionId: exceptionIdByDate.get(day.date) ?? null,
    }));

    const reservationRows = reservationDocs.docs as ReservationRow[];
    const history = await guestHistory(payload, reservationRows);

    const reservations: AgendaReservation[] = reservationRows.map((doc) => ({
      id: String(doc.id),
      date: String(doc.date ?? "").slice(0, 10),
      time: doc.time || "",
      name: doc.name || "Zonder naam",
      guests: doc.guests ?? 0,
      status: doc.status || "nieuw",
      notes: doc.notes || null,
      phone: doc.phone || null,
      history: history.get(String(doc.id)) ?? null,
    }));

    // The events come back as occurrences rather than as documents: a weekly
    // quiz is one row in the CMS and eight squares in a month, and only the
    // expansion in src/lib/events.ts knows which eight.
    const occurrences = expandOccurrences(
      eventDocs.docs as unknown as EventDoc[],
      from,
      to,
    );

    const events: AgendaEvent[] = occurrences.map((occ) => {
      const doc = occ.event;
      const allDay = Boolean(doc.allDay);
      return {
        id: String(occ.id),
        docId: String(doc.id ?? ""),
        date: amsterdamDate(occ.start),
        time: allDay ? null : amsterdamTime(occ.start),
        endTime: !allDay && occ.end ? amsterdamTime(occ.end) : null,
        title: doc.title || "Naamloos evenement",
        allDay,
        recurring: Boolean(occ.isRecurring),
        category: doc.category || null,
        status: doc.status || "draft",
        location: doc.location || null,
      };
    });

    const stats = from === to ? await dayStats(payload, from, today, reservations) : null;

    const body: AgendaResponse = {
      from,
      to,
      today,
      days,
      reservations,
      events,
      stats,
    };
    return NextResponse.json(body);
  } catch (error) {
    console.error("agenda kon niet worden samengesteld", error);
    return NextResponse.json(
      { error: "De agenda kon niet worden geladen. Probeer het later opnieuw." },
      { status: 500 },
    );
  }
}

/**
 * "Wat er vandaag gebeurde", for the panel under the day view.
 *
 * Two different senses of a date meet in here and the panel names both: the
 * tables that sit down on this day, and the messages that came in on it. The
 * first is a field the guest chose, the second is when the row was written,
 * which is why only the latter needs the Amsterdam day window.
 *
 * Visitor figures exist for today only. Umami is asked for ranges rather than
 * for arbitrary dates, and rather than quietly showing this morning's visitors
 * next to a Thursday three weeks ago the panel says so in a sentence. An Umami
 * that was never configured says that instead; nothing in here is allowed to
 * fail the request, because these are the "kinda cool" numbers and the tables
 * above them are the part that matters.
 */
async function dayStats(
  payload: Awaited<ReturnType<typeof getPayloadClient>>,
  date: string,
  today: string,
  reservations: AgendaReservation[],
): Promise<AgendaStats> {
  const { start, end } = amsterdamDayWindow(date);
  const createdToday = {
    and: [
      { createdAt: { greater_than_equal: start } },
      { createdAt: { less_than_equal: end } },
    ],
  };

  const booked = reservations.filter((r) => r.status !== "geannuleerd");

  const counts = await Promise.all([
    payload
      .count({ collection: "reservations", where: createdToday })
      .then((r) => r.totalDocs)
      .catch(() => 0),
    payload
      .count({ collection: "contact-messages", where: createdToday })
      .then((r) => r.totalDocs)
      .catch(() => 0),
    payload
      .count({
        collection: "mailing-list",
        // Subscribers imported from the old list carry the date they actually
        // signed up on; the ones the form writes have only a createdAt. Asking
        // for either keeps an import day from reading as five hundred new
        // sign-ups.
        where: {
          or: [
            {
              and: [
                { subscribedAt: { greater_than_equal: start } },
                { subscribedAt: { less_than_equal: end } },
              ],
            },
            { and: [{ subscribedAt: { exists: false } }, createdToday] },
          ],
        },
      })
      .then((r) => r.totalDocs)
      .catch(() => 0),
  ]);

  let visitors: number | null = null;
  let pageviews: number | null = null;
  let analyticsNote: string | null = null;

  if (date !== today) {
    analyticsNote = "Bezoekcijfers zijn er alleen voor vandaag.";
  } else {
    const umami = await getUmamiStats("today", "summary").catch(() => null);
    if (umami && umami.configured) {
      visitors = umami.visitors;
      pageviews = umami.pageviews;
    } else {
      analyticsNote = umami?.reason || "Bezoekcijfers zijn niet ingesteld.";
    }
  }

  return {
    date,
    tables: booked.length,
    covers: booked.reduce((total, r) => total + (r.guests || 0), 0),
    cancelled: reservations.length - booked.length,
    newReservations: counts[0],
    contacts: counts[1],
    subscribers: counts[2],
    visitors,
    pageviews,
    analyticsNote,
  };
}
