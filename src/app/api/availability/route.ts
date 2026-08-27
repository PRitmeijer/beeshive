import { NextResponse, type NextRequest } from "next/server";
import { rateLimit } from "@/lib/apiGuard";
import { resolveLocale } from "@/i18n/config";
import { getSiteSettings } from "@/lib/payload";
import { fullDaysBetween, loadForDay } from "@/lib/capacity";
import { loadSchedule } from "@/lib/schedule";
import {
  MAX_HORIZON_DAYS,
  describe,
  nowMinutesInAmsterdam,
  resolveBookingRules,
  slotsFor,
  todayInAmsterdam,
} from "@/lib/openingHours";

/**
 * What the booking form is allowed to ask before anybody fills it in.
 *
 * The date picker cannot grey out a Tuesday on its own, and it certainly
 * cannot know that the last Sunday of the month is open or that eight o'clock
 * has been taken by a party of twelve. Both answers live on the server — the
 * schedule reads the CMS, the seat count reads the reservations — so the form
 * asks for them here rather than guessing from the seven weekly rows it was
 * handed.
 *
 * Two questions, one endpoint. `?date=` is "what about this day", down to the
 * individual sittings; `?from=&to=` is "which days at all", which is what the
 * picker needs to draw itself. Nothing here is secret: the opening hours are
 * on the front page and a slot being full is what a guest would be told on the
 * phone. No names, no party sizes, no seat counts leave this route — only
 * whether there is room.
 *
 * It is throttled like the two writing endpoints, generously: a picker asks
 * every time somebody changes their mind about a date, and one visitor
 * deciding between four Saturdays is not an attack.
 *
 * The lead time, the largest party and the spacing of the sittings all come
 * from the CMS here, through the same `resolveBookingRules()` /api/reserve and
 * the reserveren page read. The first two used to be a constant and an
 * assumption: this route hard-coded an hour of notice while /api/reserve
 * honoured whatever the owners had set, and it asked about seats for a party
 * of one whoever was actually booking. A guest booking for ten was told half
 * past seven was free, was refused by the endpoint, asked again — and was told
 * the same thing again, because nothing in the question had changed.
 *
 * The third is newer and fails the same way if it is forgotten. The times a
 * guest may choose are quarter hours or half hours as the owners set them, and
 * the seat counting has to be told which: asked about half hours while the form
 * offers quarters, 19:00 and 19:15 land in one bucket and are full together,
 * which is precisely the spreading the setting exists to buy.
 */

export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;

const isIso = (value: string | null): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

const bad = () => NextResponse.json({ error: "badRequest" }, { status: 400 });

/** Whole days between two dates, read at midday so no offset can shift them. */
function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T12:00:00.000Z`).getTime();
  const to = new Date(`${toIso}T12:00:00.000Z`).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) return NaN;
  return Math.round((to - from) / DAY_MS);
}

export async function GET(request: NextRequest) {
  if (!rateLimit(request, "availability", 120)) {
    return NextResponse.json({ error: "rateLimited" }, { status: 429 });
  }

  const params = request.nextUrl.searchParams;
  const locale = resolveLocale(params.get("locale") || undefined);
  const date = params.get("date");
  const from = params.get("from");
  const to = params.get("to");
  const guests = params.get("guests");

  try {
    const settings = await getSiteSettings(locale);

    // The whole form is off. Say so in one field rather than answering with a
    // schedule the guest cannot act on.
    if (settings.reservationsEnabled === false) {
      return NextResponse.json({ reservationsEnabled: false, days: [], slots: [] });
    }

    const rules = resolveBookingRules(settings);

    /**
     * How many seats the question is about. Read exactly as /api/reserve reads
     * it, and a party this route will not take is asked about as one person
     * rather than refused: this endpoint only greys out times, and a party of
     * fifty is a conversation the form already sends to the contact page.
     */
    const partySize = (() => {
      const n = Number(guests);
      return Number.isInteger(n) && n >= 1 && n <= rules.maxPartySize ? n : 1;
    })();

    const today = todayInAmsterdam();

    if (isIso(date)) {
      const { days } = await loadSchedule(date, date, locale, settings);
      const day = days[0];
      if (!day) return bad();

      // Only today is measured against the clock; every other day is on offer
      // from the moment the doors open.
      const notBefore =
        date === today ? nowMinutesInAmsterdam() + rules.leadMinutes : -1;
      const times = slotsFor(
        day.ranges,
        notBefore,
        rules.slotMinutes,
        rules.lastSittingMinutes,
      );
      const opts = {
        capacity: settings.reservationCapacity,
        durationMinutes: settings.reservationDurationMinutes,
        slots: times,
        partySize,
        slotMinutes: rules.slotMinutes,
      };
      const loads = await loadForDay(date, opts);

      return NextResponse.json({
        reservationsEnabled: true,
        date,
        closed: day.closed,
        note: day.note ?? null,
        hours: day.ranges.length ? describe(day.ranges) : day.text ?? null,
        full: loads.length > 0 && loads.every((slot) => slot.full),
        slots: loads.map((slot) => ({ time: slot.time, full: slot.full })),
      });
    }

    if (isIso(from) && isIso(to)) {
      const span = daysBetween(from, to);
      // A window of exactly the horizon is allowed, so the booking sheet on
      // phones can ask about every day the owners opened and no fewer.
      if (!Number.isFinite(span) || span < 0 || span > MAX_HORIZON_DAYS) {
        return bad();
      }
      const { days } = await loadSchedule(from, to, locale, settings);

      // The hours differ per day — the last Sunday of the month is shorter
      // than a Saturday — so each day's own slots go in, and the seats behind
      // all of them come back out of a single query.
      const slotsByDate = new Map(
        days.map((day) => [
          day.date,
          slotsFor(
            day.ranges,
            day.date === today ? nowMinutesInAmsterdam() + rules.leadMinutes : -1,
            rules.slotMinutes,
            rules.lastSittingMinutes,
          ),
        ]),
      );
      const full = await fullDaysBetween(slotsByDate, {
        capacity: settings.reservationCapacity,
        durationMinutes: settings.reservationDurationMinutes,
        partySize,
        slotMinutes: rules.slotMinutes,
      });

      const answered = days.map((day) => {
        const times = slotsByDate.get(day.date) ?? [];
        return {
          date: day.date,
          // The ranges themselves, and not only the sentence describing them.
          // The booking sheet on phones builds its whole date list and every
          // time in it out of this answer — it has no server render to resolve
          // a schedule for it — and reading the times back out of "11:00 –
          // 21:00" would be parsing our own prose. Nothing secret: these are
          // the opening hours, printed on the front page.
          ranges: day.ranges,
          closed: day.closed || times.length === 0,
          note: day.note ?? null,
          hours: day.ranges.length ? describe(day.ranges) : day.text ?? null,
          full: full.has(day.date),
        };
      });

      return NextResponse.json({
        reservationsEnabled: true,
        from,
        to,
        days: answered,
      });
    }

    return bad();
  } catch (error) {
    console.error("availability lookup failed", error);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}
