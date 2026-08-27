"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GuestDetails } from "@/components/booking/GuestDetails";
import { NO_FULL_SLOTS } from "@/components/booking/ink";
import { useFunnel } from "@/components/booking/useFunnel";
import { WhenAccordion } from "@/components/booking/WhenAccordion";
import { getDict } from "@/i18n/dictionaries";
import { defaultLocale, localeHref, type Locale } from "@/i18n/config";
import { STEPS, EVENTS, track } from "@/lib/umami";
import { leadBucket, msBucket, weekdayKey } from "@/lib/bookingTelemetry";
import {
  DEFAULT_BOOKING_RULES,
  dateAfter,
  monthGrid,
  nowMinutesInAmsterdam,
  parseWeek,
  todayInAmsterdam,
  type BookingRules,
  type HoursRow,
  type ScheduledDay,
} from "@/lib/openingHours";
import {
  dayIn,
  formatDayLabel,
  fromSchedule,
  fromWeek,
  invalidationFor,
  mergeDays,
  readWindowDays,
  timesFor,
  type DayFacts,
  type Horizon,
} from "@/lib/bookingFlow";

/**
 * The booking, from the first tap to the confirmation.
 *
 * One component, mounted twice: once as the whole of /reserveren and once
 * inside the sheet the floating mark opens on phones. Not two implementations
 * with a shared look — one, with a `surface` prop, because the two used to
 * differ in ways nobody had decided on and every fix had to be made twice.
 *
 * What differs between them is exactly one thing, and it is the boundary
 * between the two screens. On the page it is a real navigation to
 * /reserveren/gegevens, with its own URL and its own history entry, which is
 * what every booking system in the research does and what makes the browser's
 * own back button mean the obvious thing. In the sheet it is a `pushState`
 * entry and a `popstate` listener, because there the back gesture would
 * otherwise dismiss the whole sheet and throw away everything the guest had
 * answered — which is the single worst thing this flow could do on the surface
 * carrying most of the traffic.
 *
 * Nothing in the availability stack moved to make any of this work.
 * /api/availability answers the same two questions it always has, the seat
 * counting is untouched, and the quarter-hour grid is exactly the grid the
 * owners set in the CMS.
 */

/**
 * How far ahead the first window question looks.
 *
 * Only three days are ever offered without a calendar, so a fortnight is
 * already generous — it covers a fortnight of shut Mondays before it runs out
 * of chips to draw. The alternative was to ask about the whole horizon on every
 * first paint, which walks every reservation in a quarter of a year to draw
 * three rows, on a page that is the most visited on the site. The calendar asks
 * about its own month when somebody opens it, and the answers are merged.
 */
const CHIP_WINDOW_DAYS = 13;

/** The party the flow opens on, and the one two thirds of tables are for. */
const DEFAULT_PARTY = 2;

const isIso = (value: string | null): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

interface Props {
  locale?: Locale;
  /**
   * Earliest selectable day as YYYY-MM-DD. Passed in from the server so the
   * first render is decided once and the markup hydrates clean — but it is the
   * starting point rather than the last word, because the page it comes from is
   * cached and its clock can be hours old. See `clientNow` below.
   */
  minDate?: string;
  /** Minutes past midnight in Amsterdam, from that same server render. */
  nowMinutes?: number;
  /** The week as the owners typed it into the CMS: the last-resort fallback. */
  openingHours?: HoursRow[];
  /**
   * The window already resolved on the server, with the repeating rules and the
   * one-off exceptions folded in. When it is here it wins over `openingHours`:
   * only the server can see that the last Sunday of the month is open and that
   * Eerste Kerstdag is not. It is also what makes the three date chips correct
   * on the very first paint of /reserveren with no network at all.
   */
  schedule?: ScheduledDay[];
  /** The lead time, the horizon and the largest party, as the owners set them. */
  rules?: BookingRules;
  /** For the two dead ends and the closed branch, where ringing beats typing. */
  phone?: string;
  email?: string;
  /** Which of our own buttons led here, carried in rather than guessed. */
  entry?: "mobile_fab" | "nav" | "nav_sheet" | "direct";
  /** The dialog on phones, or the /reserveren page. */
  surface?: "sheet" | "page";
}

export function BookingFlow({
  locale = defaultLocale,
  minDate,
  nowMinutes: nowMinutes0,
  openingHours,
  schedule,
  rules = DEFAULT_BOOKING_RULES,
  phone,
  email,
  entry = "direct",
  surface = "page",
}: Props) {
  const dict = getDict(locale);
  const t = dict.reservationForm;
  const router = useRouter();
  const funnel = useFunnel({ surface, entry });

  /**
   * What time it is, according to two clocks that need not agree.
   *
   * The page that owns the flow passes today and the minute in from the server,
   * so the first render is decided once and the markup hydrates clean. That
   * much is unchanged. What is not is that the server's answer is no longer the
   * last word, because /reserveren is held in the ISR cache: the sixty seconds
   * on `revalidate` is the minimum age of a cached page and not the maximum, so
   * on a quiet Tuesday a visitor is handed the HTML the last visitor's request
   * regenerated — an hour, or a deploy, or a night ago. That page offered its
   * own stale today as the first chip and its own stale minute as the cutoff,
   * and the endpoint then refused the very options it had drawn.
   *
   * So the browser reads its own clock after mount, always, and the later of
   * the two wins. Later rather than the browser's outright, because a device
   * whose clock is behind should not be able to re-open a sitting the café has
   * already had: the server's answer can only ever be too early, never too
   * late.
   */
  const [clientNow, setClientNow] = useState<
    { date: string; minutes: number } | undefined
  >(undefined);
  useEffect(() => {
    setClientNow({ date: todayInAmsterdam(), minutes: nowMinutesInAmsterdam() });
  }, []);
  const { today, nowMinutes } = useMemo(() => {
    if (!clientNow) return { today: minDate ?? "", nowMinutes: nowMinutes0 };
    if (!minDate || clientNow.date > minDate) {
      return { today: clientNow.date, nowMinutes: clientNow.minutes };
    }
    if (minDate > clientNow.date) {
      return { today: minDate, nowMinutes: nowMinutes0 };
    }
    return {
      today: minDate,
      nowMinutes: Math.max(nowMinutes0 ?? clientNow.minutes, clientNow.minutes),
    };
  }, [minDate, nowMinutes0, clientNow]);

  const horizon: Horizon = useMemo(
    () => ({
      today,
      // Inclusive, exactly as /api/reserve draws it, so the last day the
      // endpoint will accept is a day the reader can actually press.
      last: today ? dateAfter(today, rules.horizonDays) : "",
    }),
    [today, rules.horizonDays],
  );

  const [guests, setGuests] = useState(DEFAULT_PARTY);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [editing, setEditing] = useState<"date" | "time" | null>(null);
  const [screen, setScreen] = useState<"when" | "who">("when");
  const [announcement, setAnnouncement] = useState("");
  /**
   * The owners have taken the form out of service since this was drawn.
   *
   * /reserveren renders the phone number instead of the flow when the switch is
   * off, but it is a cached page and the sheet is mounted from a cached layout,
   * so either can be sitting open in front of somebody when the switch is
   * flipped. The availability answer says so in a field, and the moment it does
   * the flow stops pretending.
   */
  const [closedNow, setClosedNow] = useState(false);
  /**
   * Bumped when the server refuses a booking for want of seats, so the window
   * is asked again instead of going on offering what it was just refused.
   */
  const [nonce, setNonce] = useState(0);

  /**
   * What the guest was carrying when they came back from the details screen.
   *
   * Read off the URL in an effect rather than through `useSearchParams`, and
   * that is a deployment fact rather than a preference: /reserveren is a
   * statically rendered, ISR-cached page, and reading the search params during
   * render would either force it dynamic or demand a Suspense boundary round
   * the whole flow. Reading `location` after mount costs the render nothing and
   * undoes none of the caching, exactly as the clock above does.
   *
   * The party size and the day come back; the time deliberately does not. Back
   * from the details screen means "not that, then", and an accordion whose
   * three bands are all answered has nowhere left to go — so the time band
   * re-opens with that day's sittings and one tap carries them forward again.
   */
  useEffect(() => {
    if (surface !== "page" || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const n = Number(params.get("n"));
    if (Number.isInteger(n) && n >= 1 && n <= rules.maxPartySize) setGuests(n);
    const d = params.get("d");
    if (isIso(d)) setDate(d);
  }, [surface, rules.maxPartySize]);

  /**
   * What the flow knows about the days, from its two sources.
   *
   * The server-resolved schedule where there is one, the seven weekly rows
   * where there is not, and the endpoint's answer over the top of either — day
   * by day, so a fortnight's worth of seat counts does not wipe out what the
   * schedule said about the other eleven weeks.
   */
  const week = useMemo(() => parseWeek(openingHours), [openingHours]);
  const base = useMemo(
    () =>
      schedule && schedule.length > 0
        ? fromSchedule(schedule)
        : fromWeek(week, horizon),
    [schedule, week, horizon],
  );
  const [answered, setAnswered] = useState<DayFacts[]>([]);
  const days = useMemo(() => mergeDays(base, answered), [base, answered]);

  /**
   * Which sittings that day are already given away.
   *
   * The opening hours are enough to know that half past seven exists on a
   * Saturday and nowhere near enough to know that half past seven has been
   * given to a party of twelve: only the server can see the other reservations.
   * Courtesy, never a gate — /api/reserve counts the seats again on the way in
   * whatever this says, so every failure here is swallowed.
   */
  const [fullSlots, setFullSlots] = useState<ReadonlySet<string>>(NO_FULL_SLOTS);

  /**
   * Which day, and which party size, the set above is an answer about.
   *
   * An empty set means two entirely different things — nobody has asked yet,
   * and the endpoint has answered that nothing is taken — and for most of the
   * flow the difference does not matter, because both mean "grey nothing out".
   * It matters to exactly one reader, `partyChanged` below, which has to know
   * whether the answers that a party change set in motion have landed yet.
   * Empty while nothing has been answered, `date|guests` once something has.
   */
  const [slotsAnswerFor, setSlotsAnswerFor] = useState("");

  /**
   * Everything the endpoint has said is about a party size, so a change to that
   * size makes every word of it stale at once. Thrown away rather than patched:
   * the two requests below are already on their way with the new number.
   */
  const partyChanged = useRef(false);
  useEffect(() => {
    setAnswered([]);
    setFullSlots(NO_FULL_SLOTS);
    setSlotsAnswerFor("");
  }, [guests, nonce]);

  /**
   * Which window is being asked about: a fortnight to draw the chips, or the
   * month the calendar is showing once somebody opens it.
   */
  const [month, setMonth] = useState("");
  const span = useMemo(() => {
    if (!horizon.today || !horizon.last) return null;
    if (!month) {
      const to = dateAfter(horizon.today, CHIP_WINDOW_DAYS);
      return { from: horizon.today, to: to > horizon.last ? horizon.last : to };
    }
    const inMonth = monthGrid(month)
      .flat()
      .filter((day): day is string => day !== null);
    const end = inMonth.at(-1) ?? "";
    if (!end) return null;
    const from =
      `${month}-01` < horizon.today ? horizon.today : `${month}-01`;
    const to = end > horizon.last ? horizon.last : end;
    return from > to ? null : { from, to };
  }, [horizon, month]);

  useEffect(() => {
    if (!span) return;
    const ac = new AbortController();
    // Held for a moment before it goes out: paging quickly through three months
    // should ask once, about the month somebody stopped on.
    const timer = setTimeout(() => {
      const query = new URLSearchParams({
        from: span.from,
        to: span.to,
        locale,
        guests: String(guests),
      });
      /**
       * What the endpoint said about a whole window, in one word.
       *
       * `scope` is what keeps this readable beside the per-day question below.
       * The flow asks two different things — "which days at all" and "which
       * sittings on this day" — and merging their outcome distributions makes
       * both unreadable: `day_closed` from the day question is a guest who
       * picked a shut Tuesday, and `all_closed` from this one is a fortnight
       * with nothing in it, which is a far more serious thing to see.
       */
      const askedAt = performance.now();
      const report = (outcome: string) => {
        const took = msBucket(performance.now() - askedAt);
        track(EVENTS.availabilityChecked, {
          scope: "window",
          outcome,
          ...(took ? { ms_bucket: took } : {}),
          surface,
        });
      };
      fetch(`/api/availability?${query}`, { signal: ac.signal })
        .then((res) => (res.ok ? res.json() : null))
        .then(
          (data: { reservationsEnabled?: boolean; days?: unknown } | null) => {
            if (!data) {
              report("refused");
              return;
            }
            setClosedNow(data.reservationsEnabled === false);
            const window = readWindowDays(data.days);
            if (window.length === 0) {
              report("refused");
              return;
            }
            report(
              window.some((day) => !day.closed && !day.full)
                ? "days_free"
                : "all_closed",
            );
            setAnswered((prev) => mergeDays(prev, window));
          },
        )
        .catch(() => {
          // A guest who moved on is not a failure and must never be counted as
          // one: the request they abandoned was aborted by this effect's own
          // cleanup, one line down.
          if (ac.signal.aborted) return;
          report("network");
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      ac.abort();
    };
  }, [span, guests, locale, surface, nonce]);

  useEffect(() => {
    // Nothing is known about a day until the endpoint has spoken, so the
    // previous day's taken sittings go first. Carrying them over would grey out
    // times on a day nobody has asked about.
    setFullSlots(NO_FULL_SLOTS);
    setSlotsAnswerFor("");
    if (!date) return;
    const ac = new AbortController();
    const timer = setTimeout(() => {
      const query = new URLSearchParams({
        date,
        locale,
        guests: String(guests),
      });
      /**
       * What the endpoint said, in one word, and how long it took to say it.
       *
       * Three completely different situations used to end in the same silence:
       * the evening is genuinely sold out, the endpoint failed and the guest
       * was shown times that were already gone, and the request took nine
       * seconds on 4G and they gave up. Those are the three most likely reasons
       * somebody picks a date on a phone and is never heard from again.
       *
       * The date itself never travels; only how far ahead it is and which day
       * of the week it falls on. See src/lib/bookingTelemetry.ts.
       */
      const askedAt = performance.now();
      const report = (outcome: string) => {
        const took = msBucket(performance.now() - askedAt);
        const lead = leadBucket(date, todayInAmsterdam());
        const day = weekdayKey(date);
        track(EVENTS.availabilityChecked, {
          scope: "day",
          outcome,
          ...(took ? { ms_bucket: took } : {}),
          ...(day ? { weekday: day } : {}),
          ...(lead ? { lead_bucket: lead } : {}),
          surface,
        });
      };
      fetch(`/api/availability?${query}`, { signal: ac.signal })
        .then((res) => (res.ok ? res.json() : null))
        .then(
          (
            data: {
              reservationsEnabled?: boolean;
              slots?: { time: string; full: boolean }[];
            } | null,
          ) => {
            if (!data) {
              report("refused");
              return;
            }
            setClosedNow(data.reservationsEnabled === false);
            if (!Array.isArray(data.slots)) {
              report("refused");
              return;
            }
            const taken = new Set(
              data.slots.filter((slot) => slot.full).map((slot) => slot.time),
            );
            // Nothing on offer at all covers two cases and reports them as one:
            // the café is shut that day, and online booking has been switched
            // off altogether — which answers with an empty list too.
            report(
              data.slots.length === 0
                ? "day_closed"
                : taken.size === data.slots.length
                  ? "day_full"
                  : taken.size > 0
                    ? "some_full"
                    : "slots_free",
            );
            setFullSlots(taken);
            setSlotsAnswerFor(`${date}|${guests}`);
          },
        )
        .catch(() => {
          if (ac.signal.aborted) return;
          report("network");
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      ac.abort();
    };
  }, [date, guests, locale, surface, nonce]);

  /**
   * "Zaterdag 29 augustus", and the same date without its weekday for the
   * right-hand column of a chip. Written from the dictionary rather than
   * through Intl: the server and the browser must produce the same string to
   * the character, and two ICU builds need not agree.
   */
  const dayLabel = useCallback(
    (iso: string) => formatDayLabel(iso, dict.weekdays, dict.months, today),
    [dict.weekdays, dict.months, today],
  );
  const dateOnly = useCallback(
    (iso: string) =>
      formatDayLabel(iso, dict.weekdays, dict.months, today)
        .split(" ")
        .slice(1)
        .join(" "),
    [dict.weekdays, dict.months, today],
  );

  /**
   * An answer that has stopped being true, put right rather than wiped.
   *
   * It runs whenever a fresh answer lands, and it returns immediately unless
   * something is actually wrong — which is nearly always. The verdicts, the
   * causes and the reasoning behind them are in `invalidationFor`; what belongs
   * here is only which band is re-opened and what is said out loud.
   *
   * And those really do differ by cause, which for a while they did not: every
   * cleared day was announced as "zit vol voor 2 personen", so a guest who
   * chose a Tuesday the café is shut was told the place was full. There are two
   * dimensions to the sentence and both are read here. The cause is what
   * happened — shut, full, over, behind us, too far ahead, that half hour
   * taken. `grew` is whose doing it was: a party size the guest themselves just
   * raised is news about their own party and reads best with the party first,
   * while a table somebody else took while the band sat open is news about the
   * evening.
   */
  useEffect(() => {
    if (!date) return;
    const outcome = invalidationFor(
      { date, time },
      days,
      horizon,
      nowMinutes,
      rules,
      fullSlots,
    );
    const grew = partyChanged.current;
    /**
     * The flag is the guest's own party change, and it is spent here — but only
     * once it can be spent honestly.
     *
     * Clearing it on the way out of a `keep` would spend it on the render that
     * happens the instant the party size moves, before either request has been
     * answered, and the invalidation the change actually causes would arrive a
     * moment later with nothing left to explain it. Leaving it set for ever is
     * the opposite error and the one that was here: a party change that
     * invalidated nothing left the flag standing, and the next unrelated
     * clearing — a nonce bump after somebody else took the table, on the sheet
     * where this component stays mounted across both screens — blamed the party
     * size for a thing it had not done.
     *
     * So it is spent when it is answered: either the verdict is an
     * invalidation, in which case this is the very moment it was set for, or
     * the day answer for this day and this party has landed and said nothing is
     * wrong, in which case the change has been fully accounted for.
     */
    if (outcome.verdict !== "keep" || slotsAnswerFor === `${date}|${guests}`) {
      partyChanged.current = false;
    }
    if (outcome.verdict === "keep") return;

    if (outcome.verdict === "clear_time") {
      const free = timesFor(dayIn(days, date), horizon.today, nowMinutes, rules)
        .filter((slot) => !fullSlots.has(slot))
        .slice(0, 3);
      // `free` cannot be empty here — a day with nothing free is `clear_both`
      // now, decided by the same arithmetic this line repeats — but "cannot" is
      // two functions agreeing, and the day they stop agreeing the fallback is
      // a short true sentence rather than "19:00 zit vol.  is nog vrij."
      const others = t.joinTimes(free);
      setAnnouncement(
        outcome.cause === "time_outside_hours"
          ? free.length > 0
            ? t.announceTimeOffGrid(time, others)
            : t.announceTimeOffGridAlone(time)
          : grew
            ? t.announcePartyTimeGone(t.people(guests), time)
            : free.length > 0
              ? t.announceTimeGone(time, others)
              : t.announceTimeGoneAlone(time),
      );
      setTime("");
      setEditing("time");
      return;
    }

    const day = dayLabel(date);
    setAnnouncement(
      outcome.cause === "day_closed"
        ? t.announceDayClosed(day)
        : outcome.cause === "day_over"
          ? t.announceDayOver(day)
          : outcome.cause === "date_past"
            ? t.announceDayPast(day)
            : outcome.cause === "beyond_horizon"
              ? t.announceDayBeyond(day)
              : grew
                ? t.announcePartyDayGone(t.people(guests), day)
                : t.announceDayFull(day, t.people(guests)),
    );
    setTime("");
    setDate("");
    setEditing("date");
  }, [
    days,
    fullSlots,
    slotsAnswerFor,
    date,
    time,
    horizon,
    nowMinutes,
    rules,
    guests,
    t,
    dayLabel,
  ]);

  const onGuests = (next: number) => {
    if (next === guests) return;
    partyChanged.current = true;
    setGuests(next);
  };

  /**
   * A band re-opened by hand, and the one thing that has to happen besides
   * opening it: the live region goes quiet.
   *
   * It is a single polite region shared by the whole screen, and it used to be
   * only ever written to and never emptied, so whatever was last said stayed in
   * the document for as long as the flow was mounted. That is fine while the
   * sentence is still true. It stopped being fine the moment "wijzig"
   * un-answered the very thing the sentence was about: the region went on
   * holding "Datum gekozen: zaterdag 29 augustus. Kies nu een tijd" over a date
   * band that had just been re-opened, and anyone browsing the page with a
   * virtual cursor rather than listening to announcements reads it as the
   * current state of the form, because that is what a live region looks like to
   * them.
   *
   * Emptied rather than replaced with a sentence about the band having opened:
   * the band that opened has its own heading and its own focus, and a second
   * voice describing what the guest just pressed is noise.
   */
  const onEdit = (band: "date" | "time" | null) => {
    setEditing(band);
    setAnnouncement("");
  };

  const onDate = (iso: string, via: "chip" | "calendar") => {
    // `via` says whether the calendar was needed, and it is the one number
    // that validates or kills hiding a thirty-one square grid behind a single
    // tap. One property on the step it qualifies, rather than an event of its
    // own that would have to be joined back to this one.
    funnel.step(STEPS.datePicked, { via });
    // Whatever happened to the last answer, it has been dealt with: a stale
    // flag here would put a sentence about a party size on a later change that
    // had nothing to do with one.
    partyChanged.current = false;
    setDate(iso);
    setTime("");
    setEditing(null);
    setAnnouncement(t.announceDate(dayLabel(iso)));
  };

  /**
   * The one navigation in the whole flow, and the only thing the two surfaces
   * do differently.
   *
   * On the page it is a route: /reserveren/gegevens re-checks the slot on the
   * server before it paints, so a link pasted into WhatsApp and opened three
   * days later degrades into one of the honest answers rather than into a form
   * for a table that has gone. In the sheet it is one history entry, pushed at
   * this boundary and at no other, so the back gesture returns to the accordion
   * with everything still answered.
   */
  const pushed = useRef(false);
  const onTime = (chosen: string) => {
    setTime(chosen);
    setEditing(null);
    setAnnouncement(t.announceTime(chosen));
    funnel.step(STEPS.timePicked);
    if (surface === "page") {
      // Going forward, not away: without this the abandonment beacon would fire
      // at the exact moment somebody progressed.
      funnel.handOff();
      const query = new URLSearchParams({
        n: String(guests),
        d: date,
        t: chosen,
      });
      router.push(
        `${localeHref(locale, "/reserveren/gegevens")}?${query.toString()}`,
      );
      return;
    }
    if (!pushed.current) {
      // Same URL: the sheet has none of its own, and changing the address bar
      // under a dialog would leave a link nobody can go back to.
      window.history.pushState({ beeshive: "details" }, "", window.location.href);
      pushed.current = true;
    }
    setScreen("who");
  };

  useEffect(() => {
    if (surface !== "sheet") return;
    const onPop = () => {
      pushed.current = false;
      setScreen("when");
      // Back means "not that one, then". Clearing the sitting re-opens the band
      // it came from, so the accordion always has somewhere forward to go — an
      // accordion with all three bands answered and no button is a dead end,
      // and it would be reached by the commonest gesture on Android.
      setTime("");
      setEditing("time");
      // Same reason as `onEdit`: the sitting this region last announced has
      // just been un-chosen, so leaving "Tijd gekozen: 19:00 uur" in the
      // document would describe a form that no longer has a time in it.
      setAnnouncement("");
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // Closing the sheet from the details screen must not leave the entry
      // behind it: a guest who then taps a navigation link would find a back
      // button that does nothing before it does anything.
      if (pushed.current) {
        pushed.current = false;
        window.history.back();
      }
    };
  }, [surface]);

  if (closedNow) {
    return (
      <div role="status">
        <h2 className="font-display text-2xl text-hive-800">
          {t.closedHeading}
        </h2>
        <p className="mt-4 max-w-prose leading-relaxed text-hive-500">
          {t.errors.reservationsClosed}
        </p>
        <div className="mt-5 space-y-1">
          {phone ? (
            <a
              href={`tel:${phone.replace(/\s/g, "")}`}
              onClick={() =>
                track(EVENTS.outboundClicked, {
                  kind: "phone",
                  surface: "reserveren",
                })
              }
              className="ink-link block"
            >
              {phone}
            </a>
          ) : null}
          {email ? (
            <a href={`mailto:${email}`} className="ink-link block">
              {email}
            </a>
          ) : null}
        </div>
      </div>
    );
  }

  if (screen === "who") {
    return (
      <GuestDetails
        locale={locale}
        surface={surface}
        guests={guests}
        date={date}
        time={time}
        dayLabel={dayLabel(date)}
        rules={rules}
        funnel={funnel}
        onBack={() => {
          // The history entry is the state, so going back is the whole of it;
          // the listener above does the rest.
          if (pushed.current) window.history.back();
          else setScreen("when");
        }}
        onTimeChanged={setTime}
        onSeatsMoved={() => setNonce((n) => n + 1)}
      />
    );
  }

  return (
    <WhenAccordion
      locale={locale}
      days={days}
      horizon={horizon}
      nowMinutes={nowMinutes}
      rules={rules}
      guests={guests}
      date={date}
      time={time}
      fullSlots={fullSlots}
      phone={phone}
      announcement={announcement}
      editing={editing}
      dayLabel={dayLabel}
      dateOnly={dateOnly}
      onGuests={onGuests}
      onDate={onDate}
      onTime={onTime}
      onEdit={onEdit}
      onCalendarOpened={() => setAnnouncement(t.announceCalendar)}
      onMonthChange={setMonth}
    />
  );
}
