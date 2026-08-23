"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { CraftIcon } from "@/components/CraftIcon";
import { getDict } from "@/i18n/dictionaries";
import { defaultLocale, type Locale } from "@/i18n/config";
import { isReservationError } from "@/lib/reservationErrors";
import { EVENTS, track } from "@/lib/umami";
import {
  LEAD_MINUTES,
  availableDates,
  availableDatesFromSchedule,
  dayFromSchedule,
  describe,
  nowMinutesInAmsterdam,
  parseWeek,
  slotsFor,
  todayInAmsterdam,
  weekdayIndex,
  type HoursRow,
  type Range,
  type ScheduledDay,
} from "@/lib/openingHours";

/**
 * Letterpress field: no box, just a rule the ink sits on. Paper ground.
 * Kept byte-identical to <MailingListForm> so every form on the site is
 * demonstrably the same piece of printing.
 */
const fieldClass =
  "mt-2 block w-full rounded-none border-0 border-b border-hive-700/25 bg-transparent " +
  "px-0 py-3 font-body text-hive-700 placeholder:text-hive-300/70 outline-none " +
  "transition-colors duration-300 ease-settle " +
  "focus:border-honey-400 focus:shadow-[inset_0_-2px_0_0_#B4735E]";

/**
 * One shared empty set for "we have not been told of a single taken sitting",
 * so clearing the list does not hand every render a new object to compare.
 */
const NO_FULL_SLOTS: ReadonlySet<string> = new Set();

const EMPTY = {
  name: "",
  email: "",
  phone: "",
  date: "",
  time: "",
  guests: "2",
  notes: "",
};

interface ReservationFormProps {
  locale?: Locale;
  /**
   * Earliest selectable day as YYYY-MM-DD. Passed in from the server so the
   * value is decided once, rather than differing between the rendered HTML
   * and the browser's own clock.
   */
  minDate?: string;
  /**
   * Minutes past midnight in Amsterdam, from the same server render as
   * `minDate`. Today's slots that have already gone are dropped, and today
   * itself disappears once the last sitting is inside the lead time.
   */
  nowMinutes?: number;
  /**
   * The week as the owners typed it into the CMS. The dates and times on offer
   * are read off this rather than hard-coded, so changing the hours in the
   * admin changes what a guest can book without anyone touching the code.
   */
  openingHours?: HoursRow[];
  /**
   * The window already resolved on the server, with the repeating rules and
   * the one-off exceptions folded in. When it is here it wins over
   * `openingHours`: only the server can see that the last Sunday of the month
   * is open and that Eerste Kerstdag is not, so offering the plain weekly
   * pattern beside it would offer days the endpoint will refuse.
   *
   * Optional because the booking sheet on phones is mounted without a server
   * render and has nothing to hand down; that path still reads the seven
   * weekly rows, which is what it has always done.
   */
  schedule?: ScheduledDay[];
}

export function ReservationForm({
  locale = defaultLocale,
  minDate,
  nowMinutes: nowMinutes0,
  openingHours,
  schedule,
}: ReservationFormProps) {
  const dict = getDict(locale);
  const t = dict.reservationForm;
  const [form, setForm] = useState(EMPTY);
  const week = useMemo(() => parseWeek(openingHours), [openingHours]);

  // The page that owns the form passes today in from the server, so the list
  // of dates is decided once and the markup hydrates clean. The booking sheet
  // on phones has no server render to disagree with, so it reads the clock
  // here instead, after mount.
  const [clientNow, setClientNow] = useState<
    { date: string; minutes: number } | undefined
  >(undefined);
  useEffect(() => {
    if (!minDate) {
      setClientNow({ date: todayInAmsterdam(), minutes: nowMinutesInAmsterdam() });
    }
  }, [minDate]);
  const today = minDate ?? clientNow?.date;
  const nowMinutes = minDate ? nowMinutes0 : clientNow?.minutes;

  // A resolved window beats the weekly pattern; see the prop's own note.
  const resolved = schedule && schedule.length > 0 ? schedule : null;

  const dates = useMemo(
    () =>
      !today
        ? []
        : resolved
          ? availableDatesFromSchedule(resolved, today, nowMinutes)
          : availableDates(today, week, nowMinutes),
    [today, week, nowMinutes, resolved],
  );

  /**
   * The hours a given date really offers, from whichever of the two sources
   * this render has. One function so the list of times, the hint under it and
   * the pruning in `setDate` can never disagree about a day.
   */
  const rangesForDate = (iso: string): Range[] | null => {
    if (resolved) return dayFromSchedule(resolved, iso)?.ranges ?? null;
    const index = weekdayIndex(iso);
    return index === null ? null : week[index];
  };

  /**
   * "Zaterdag 29 augustus", written from the dictionary rather than through
   * Intl: the server and the browser must produce the same string to the
   * character, and two ICU builds need not agree. The year is added only when
   * the date is not in the current one, where leaving it off would be a
   * genuine ambiguity rather than noise.
   */
  const dateLabel = (iso: string) => {
    const d = new Date(`${iso}T12:00:00.000Z`);
    const weekday = dict.weekdays[(d.getUTCDay() + 6) % 7];
    const month = dict.months[d.getUTCMonth()];
    const year = d.getUTCFullYear();
    const thisYear = today ? Number(today.slice(0, 4)) : year;
    return `${weekday} ${d.getUTCDate()} ${month}${
      year === thisYear ? "" : ` ${year}`
    }`;
  };

  // Which day the guest picked, and therefore what is on offer. No date yet
  // means no list: offering times before knowing the day would be inventing
  // them, and half of them would be on a day the café is shut.
  const dayRanges = form.date ? rangesForDate(form.date) : null;
  // Why this day differs, in the reader's language, when the owners said so.
  const dayNote = form.date && resolved
    ? (dayFromSchedule(resolved, form.date)?.note ?? null)
    : null;
  // Only today is measured against the clock; every other day is open from
  // the door opening.
  const notBefore =
    form.date && form.date === today && typeof nowMinutes === "number"
      ? nowMinutes + LEAD_MINUTES
      : -1;
  const slots = dayRanges ? slotsFor(dayRanges, notBefore) : [];

  /**
   * Which of that day's sittings are already given away.
   *
   * The opening hours the form was handed are enough to know that half past
   * seven exists on a Saturday and nowhere near enough to know that half past
   * seven has been given to a party of twelve: only the server can see the
   * other reservations. So the moment a date is chosen we ask /api/availability
   * for that one day, and the guest learns a time is gone while the rest of the
   * form is still empty — rather than after filling in eight fields and
   * pressing the button, which is a miserable way to be told.
   *
   * Courtesy, never a gate. /api/reserve counts the seats again on the way in
   * and answers `slotFull` or `dayFull` whatever this list happens to say, so
   * every failure here is swallowed: an endpoint that does not answer leaves
   * the times exactly as the form drew them before any of this existed.
   *
   * Only the chosen day, never the whole window. The endpoint's `?from=&to=`
   * branch would let the date list grey out days that are entirely booked, but
   * that request would have to go out on mount, for every visitor who so much
   * as opens the sheet, and it walks the reservations for up to three months to
   * find something that is rare in a café this size. A per-day question asked
   * once somebody has committed to a day is the cheap half of the same idea.
   */
  const [fullSlots, setFullSlots] = useState<ReadonlySet<string>>(NO_FULL_SLOTS);
  /**
   * Bumped when the server refuses a booking for want of seats, so the list is
   * asked again instead of going on offering the time it was just refused.
   */
  const [availabilityNonce, setAvailabilityNonce] = useState(0);
  useEffect(() => {
    // Nothing is known about a day until the endpoint has spoken, so the
    // previous day's taken sittings go first. Carrying them over would grey
    // out times on a day nobody has asked about — and a request that never
    // answers would leave them greyed out for good, which is the one failure
    // here that could cost a table rather than merely fail to save one.
    setFullSlots(NO_FULL_SLOTS);
    if (!form.date) return;
    const ac = new AbortController();
    fetch(`/api/availability?date=${form.date}&locale=${locale}`, {
      signal: ac.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { slots?: { time: string; full: boolean }[] } | null) => {
        if (!data || !Array.isArray(data.slots)) return;
        const taken = new Set(
          data.slots.filter((slot) => slot.full).map((slot) => slot.time),
        );
        setFullSlots(taken);
        // A time that was still free when it was picked, or carried over from
        // a day where it was, is dropped rather than left selected under a
        // greyed-out label for the endpoint to refuse later.
        setForm((prev) => (taken.has(prev.time) ? { ...prev, time: "" } : prev));
      })
      .catch(() => {});
    return () => ac.abort();
  }, [form.date, locale, availabilityNonce]);

  // Nothing left that day at all: a different time is not the answer, so the
  // hint under the list says so rather than leaving a column of greyed-out
  // times to be puzzled over.
  const dayIsFull =
    slots.length > 0 && slots.every((slot) => fullSlots.has(slot));

  // Honeypot. Kept out of `form` so it can never be confused for real input.
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [error, setError] = useState(t.error);

  /**
   * "Somebody began filling this in", once per mounted form. The ref rather
   * than state because nothing on screen depends on it and a re-render for a
   * measurement would be a real cost paid for a beacon. `track()` swallows
   * everything, so no keystroke can be lost to it.
   */
  const started = useRef(false);
  const markStarted = () => {
    if (started.current) return;
    started.current = true;
    track(EVENTS.reservationStarted);
  };

  const set = (key: keyof typeof EMPTY) => (value: string) => {
    markStarted();
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  /**
   * Days can differ from one another, so changing the date can strand a time
   * the new day does not offer. Drop it whenever it is no longer on the list
   * rather than submitting something we know is refused.
   */
  const setDate = (value: string) => {
    markStarted();
    setForm((prev) => {
      const ranges = rangesForDate(value);
      const cutoff =
        value === today && typeof nowMinutes === "number"
          ? nowMinutes + LEAD_MINUTES
          : -1;
      const next = ranges ? slotsFor(ranges, cutoff) : [];
      return {
        ...prev,
        date: value,
        time: next.includes(prev.time) ? prev.time : "",
      };
    });
  };

  /**
   * /api/reserve answers a refusal with a code, not a sentence, so the reason
   * arrives from the server and the wording comes from the reader's own
   * dictionary. A code we have no line for falls back to the generic one.
   */
  const codeFrom = (data: unknown): string => {
    const code =
      data && typeof data === "object"
        ? (data as { error?: unknown }).error
        : undefined;
    return isReservationError(code) ? code : "unknown";
  };
  const messageFor = (code: string): string =>
    isReservationError(code) ? t.errors[code] : t.error;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    try {
      const res = await fetch("/api/reserve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          phone: form.phone,
          date: form.date,
          time: form.time,
          guests: Number(form.guests),
          notes: form.notes,
          website,
        }),
      });
      if (res.ok) {
        // The refusal code, never the guest: a reason is a fact about us, a
        // name or a party size is a fact about them.
        track(EVENTS.reservationSubmitted);
        setStatus("success");
        setForm(EMPTY);
        return;
      }
      const data = await res.json().catch(() => null);
      const code = codeFrom(data);
      track(EVENTS.reservationFailed, { reason: code });
      // The seats moved while this form was being filled in. Ask again, so the
      // list stops offering what was just declined.
      if (code === "slotFull" || code === "dayFull") {
        setAvailabilityNonce((n) => n + 1);
      }
      setError(messageFor(code));
      setStatus("error");
    } catch {
      track(EVENTS.reservationFailed, { reason: "network" });
      setError(t.error);
      setStatus("error");
    }
  };

  if (status === "success") {
    return (
      // Plays once, when the confirmation replaces the form, and never
      // again — so it is a keyframe rather than an animated element, and
      // .hero-rise is that keyframe already. Its travel and duration are
      // custom properties, so these are the same numbers as before.
      <div
        role="status"
        className="hero-rise py-2 [--rise-delay:0s] [--rise-duration:0.8s] [--rise-travel:12px]"
      >
        <CraftIcon name="bee" size={48} weight={1} className="text-sage-500" />
        <div className="rule-ink mt-6 w-16" aria-hidden="true" />
        <p className="mt-6 font-display text-2xl text-hive-700">
          {t.successTitle}
        </p>
        <p className="mt-3 max-w-prose leading-relaxed text-hive-500">
          {t.successText}
        </p>
        <button
          type="button"
          onClick={() => setStatus("idle")}
          className="ink-link mt-6 text-sm"
        >
          {t.successAgain}
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="relative space-y-9"
    >

      <div className="grid gap-9 sm:grid-cols-2">
        <div>
          <label htmlFor="reserve-name" className="label block">
            {t.name}
          </label>
          <input
            id="reserve-name"
            name="name"
            type="text"
            required
            maxLength={120}
            autoComplete="name"
            value={form.name}
            onChange={(e) => set("name")(e.target.value)}
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="reserve-email" className="label block">
            {t.email}
          </label>
          <input
            id="reserve-email"
            name="email"
            type="email"
            required
            maxLength={200}
            autoComplete="email"
            value={form.email}
            onChange={(e) => set("email")(e.target.value)}
            className={fieldClass}
          />
        </div>
      </div>

      <div className="grid gap-9 sm:grid-cols-2">
        <div>
          <label htmlFor="reserve-phone" className="label block">
            {t.phone}
          </label>
          <input
            id="reserve-phone"
            name="phone"
            type="tel"
            required
            maxLength={40}
            autoComplete="tel"
            value={form.phone}
            onChange={(e) => set("phone")(e.target.value)}
            aria-describedby="reserve-phone-hint"
            className={fieldClass}
          />
          <p id="reserve-phone-hint" className="mt-2 text-sm text-hive-400">
            {t.phoneHint}
          </p>
        </div>
        <div>
          <label htmlFor="reserve-guests" className="label block">
            {t.guests}
          </label>
          <input
            id="reserve-guests"
            name="guests"
            type="number"
            required
            min={1}
            max={20}
            step={1}
            inputMode="numeric"
            value={form.guests}
            onChange={(e) => set("guests")(e.target.value)}
            aria-describedby="reserve-guests-hint"
            className={`${fieldClass} figures-old`}
          />
          <p id="reserve-guests-hint" className="mt-2 text-sm text-hive-400">
            {t.guestsHint}
          </p>
        </div>
      </div>

      <div className="grid gap-9 sm:grid-cols-2">
        <div>
          <label htmlFor="reserve-date" className="label block">
            {t.date}
          </label>
          <select
            id="reserve-date"
            name="date"
            required
            disabled={dates.length === 0}
            value={form.date}
            onChange={(e) => setDate(e.target.value)}
            aria-describedby="reserve-date-hint"
            className={`${fieldClass} disabled:opacity-50`}
          >
            <option value="">{t.datePlaceholder}</option>
            {dates.map((iso) => (
              <option key={iso} value={iso}>
                {dateLabel(iso)}
              </option>
            ))}
          </select>
          <p id="reserve-date-hint" className="mt-2 text-sm text-hive-400">
            {dayNote || t.dateHint}
          </p>
        </div>
        <div>
          <label htmlFor="reserve-time" className="label block">
            {t.time}
          </label>
          <select
            id="reserve-time"
            name="time"
            required
            disabled={slots.length === 0}
            value={form.time}
            onChange={(e) => set("time")(e.target.value)}
            aria-describedby="reserve-time-hint"
            className={`${fieldClass} figures-old disabled:opacity-50`}
          >
            <option value="">
              {!form.date
                ? t.timeNeedsDate
                : slots.length === 0
                  ? t.timeNoneThatDay
                  : t.timePlaceholder}
            </option>
            {slots.map((slot) => {
              const full = fullSlots.has(slot);
              return (
                <option key={slot} value={slot} disabled={full}>
                  {full ? t.timeOptionFull(slot) : t.timeOption(slot)}
                </option>
              );
            })}
          </select>
          <p id="reserve-time-hint" className="mt-2 text-sm text-hive-400">
            {dayIsFull
              ? t.timeDayFull
              : dayRanges && dayRanges.length > 0
                ? t.timeHintForDay(describe(dayRanges), slots[slots.length - 1])
                : t.timeHint}
          </p>
        </div>
      </div>

      {/* There was a "Gelegenheid" field here, and it asked a stranger to
          account for why they were coming out to eat before they had so much
          as sat down. The one answer that ever changed anything on the floor
          was a birthday, and that fits perfectly well in the notes alongside
          the allergies and the high chair, where it is offered rather than
          demanded. The column and its server-side check both survive, for
          browsers still holding the old page. */}
      <div>
        <label htmlFor="reserve-notes" className="label block">
          {t.notes}
        </label>
        <textarea
          id="reserve-notes"
          name="notes"
          rows={4}
          maxLength={2000}
          value={form.notes}
          onChange={(e) => set("notes")(e.target.value)}
          aria-describedby="reserve-notes-hint"
          className={`${fieldClass} resize-none`}
        />
        <p id="reserve-notes-hint" className="mt-2 text-sm text-hive-400">
          {t.notesHint}
        </p>
      </div>

      {/* Honeypot. Off screen rather than display:none, and hidden from the
          accessibility tree, so only a form filling bot ever reaches it. */}
      <div aria-hidden="true" className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden">
        <label htmlFor="reserve-website">{t.honeypot}</label>
        <input
          id="reserve-website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      <div className="pt-2">
        <button
          type="submit"
          disabled={status === "loading"}
          className="btn-primary disabled:opacity-50"
        >
          {status === "loading" ? t.submitting : t.submit}
        </button>
      </div>

      {status === "error" && (
        <p
          role="alert"
          className="flex items-center gap-2 text-sm text-honey-600"
        >
          <svg
            viewBox="0 0 12 12"
            width="12"
            height="12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            aria-hidden="true"
            focusable="false"
            className="shrink-0"
          >
            <path d="M2.2 2.4 L9.8 9.6" />
            <path d="M9.7 2.3 L2.3 9.7" />
          </svg>
          {error}
        </p>
      )}
    </form>
  );
}
