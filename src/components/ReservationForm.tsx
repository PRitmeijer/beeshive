"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { CraftIcon } from "@/components/CraftIcon";
import { ShareActions } from "@/components/ShareActions";
import { getDict } from "@/i18n/dictionaries";
import { defaultLocale, type Locale } from "@/i18n/config";
import { isReservationError } from "@/lib/reservationErrors";
import { forget, readRemembered, remember } from "@/lib/rememberMe";
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
   * The link to the table's own page, as /api/reserve hands it back.
   *
   * Held in state rather than derived from anything, because it does not exist
   * until the booking does: the token is minted while the row is written. It
   * stays null whenever the owners have the guest pass switched off in the CMS,
   * and the success screen then looks exactly as it did before any of this —
   * a switch that only half works would be worse than no switch.
   */
  const [passUrl, setPassUrl] = useState<string | null>(null);

  /**
   * The fast checkout for somebody who has booked here before.
   *
   * Two pieces of state and no more. `rememberMe` is the tickbox beside the
   * button, and it is an intention rather than a fact: nothing is written until
   * a booking is accepted, so ticking it and then closing the tab leaves this
   * device exactly as clean as it was. `prefilled` is the fact, and it exists
   * only so the form can say out loud that it filled three fields in by itself
   * — a booking form that already knows your phone number and does not mention
   * it is unnerving in a way that costs more trust than the typing saved is
   * worth.
   *
   * Both start false, and the reading happens in an effect rather than in
   * `useState`'s initialiser, for the same reason `clientNow` above does: this
   * component is rendered on the server, where there is no localStorage, and
   * the first client paint has to match that render to the character or React
   * throws the markup away. So the server draws an empty form, the browser
   * draws the same empty form, and only then — one frame later, invisibly —
   * does what this device knows arrive. See src/lib/rememberMe.ts for why this
   * is localStorage and not the cookie the feature was asked for.
   *
   * On a return visit the box comes back ticked, because by then it is no
   * longer an offer but a description of how things already stand, and a form
   * that says "we have filled this in for you" over an empty tickbox is
   * contradicting itself. Untick it, book, and the record is gone.
   */
  const [rememberMe, setRememberMe] = useState(false);
  const [prefilled, setPrefilled] = useState(false);
  const fillFromStorage = useCallback(() => {
    const saved = readRemembered();
    if (!saved) return;
    setForm((prev) => ({
      ...prev,
      name: saved.name,
      email: saved.email,
      phone: saved.phone,
      // The party size is a habit, not a booking, so it is offered as a
      // starting point and only when there was one to offer; the field already
      // has a sensible two in it otherwise.
      guests: saved.guests ? String(saved.guests) : prev.guests,
    }));
    setRememberMe(true);
    setPrefilled(true);
  }, []);
  useEffect(() => {
    fillFromStorage();
  }, [fillFromStorage]);

  /**
   * "That is not me." The one button that has to work immediately rather than
   * on the next submission: whoever presses it is very often not the person the
   * record belongs to — a partner on the household laptop, a colleague on the
   * shared machine at work — and telling them their details will be forgotten
   * once they finish booking a table they may not want is no answer at all. So
   * the fields and the stored record go together, now, and the party size falls
   * back to the default rather than staying at somebody else's usual four.
   */
  const forgetMe = () => {
    forget();
    setForm((prev) => ({
      ...prev,
      name: "",
      email: "",
      phone: "",
      guests: EMPTY.guests,
    }));
    setRememberMe(false);
    setPrefilled(false);
  };

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
          // Only so the guest pass link comes back in the language this form
          // was filled in in. Nothing about the booking itself depends on it.
          locale,
          website,
        }),
      });
      if (res.ok) {
        // The refusal code, never the guest: a reason is a fact about us, a
        // name or a party size is a fact about them.
        track(EVENTS.reservationSubmitted);
        // Read on the success path too, now that there is something in it.
        // A body that will not parse is not a failed booking — the endpoint
        // said 200 — so it costs the share block and nothing else.
        const data = (await res.json().catch(() => null)) as {
          guestPassUrl?: unknown;
        } | null;
        setPassUrl(
          typeof data?.guestPassUrl === "string" ? data.guestPassUrl : null,
        );
        /**
         * The only place the tickbox is ever acted upon, and only once the
         * table has actually been asked for. Which also makes this the place
         * that keeps the record true: somebody who came back, corrected the
         * phone number they moved house with and booked again has just told us
         * the new one is the right one, so the write is unconditional rather
         * than "only if there was nothing there". The mirror of it matters as
         * much — an unticked box on a guest who was remembered is them
         * withdrawing, so the record goes.
         *
         * Nothing here can throw: every function in rememberMe swallows a
         * refusing or full localStorage, because the booking has succeeded and
         * a storage quota is not allowed to turn a confirmed table into an
         * error screen.
         */
        if (rememberMe) {
          remember({
            name: form.name,
            email: form.email,
            phone: form.phone,
            guests: Number(form.guests),
          });
        } else {
          forget();
        }
        setStatus("success");
        setForm(EMPTY);
        setPrefilled(false);
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
        {/* The link to the party's own page, and the two ways it travels.
            This is the whole point of the guest pass reaching anybody: the
            person reading this screen is the only one who knows who else is
            coming, and until it was printed here they were the one person
            never given the address — the owners have it in their notification
            mail, and there is no mail to the guest at all yet.

            The link opens in its own tab on purpose. Tapping it is how
            somebody checks what they are about to forward, and this screen is
            React state on a page that has no route of its own: navigating away
            from it and pressing back returns an empty form, with the copy
            button and the address gone with it. */}
        {passUrl ? (
          <div className="mt-8">
            <div className="rule-ink w-10" aria-hidden="true" />
            <p className="mt-4 max-w-prose leading-relaxed text-hive-500">
              {t.shareText}
            </p>
            <a
              href={passUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ink-link mt-4 break-all text-sm"
            >
              {passUrl}
            </a>
            <ShareActions
              url={passUrl}
              message={t.whatsAppMessage(passUrl)}
              copyLabel={t.copyLink}
              copiedLabel={t.copied}
              whatsAppLabel={t.shareWhatsApp}
              className="mt-5"
            />
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => {
            // Nothing of the last booking survives into the next one. A link
            // left in state would be shown again beside a second request that
            // has not been made yet, pointing at the first party's table.
            setPassUrl(null);
            setStatus("idle");
            // The contact details are not part of the last booking; they are
            // the person still sitting there with the form open. Having just
            // been asked to remember them, asking them to type it all again
            // one screen later would be a strange way to keep the promise.
            fillFromStorage();
          }}
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

      {/* Three fields that filled themselves in, said out loud. It is one line
          and it is at the top, because the moment to explain a form that knows
          your telephone number is before it is read, not in a footnote under
          the button. The way out sits in the same sentence: whoever needs it is
          usually not the person the details belong to, and asking them to hunt
          for a setting would be asking the wrong person to do the work. */}
      {prefilled ? (
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-hive-500">
          <span>{t.rememberedNotice}</span>
          <button type="button" onClick={forgetMe} className="ink-link">
            {t.rememberedForget}
          </button>
        </p>
      ) : null}

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
        {/* The offer, beside the button rather than at the top of the form,
            where it would be a setting to be decided before there is anything
            to decide about. Drawn in the same ink as the guest pass's own
            tickboxes: the browser's blue square is the one thing on this page
            that would look like it came from somewhere else.

            Deliberately without a `name`, and deliberately not part of the JSON
            the submit handler builds. It changes what this browser keeps and
            nothing whatever about what is sent, so there is nothing here for a
            form-filling bot to turn into a different booking — it can tick this
            all it likes and the request is byte for byte the one it would have
            sent anyway. The honeypot two blocks up remains the only field that
            has an opinion about robots. */}
        <label className="flex cursor-pointer items-start gap-3">
          <input
            id="reserve-remember"
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            aria-describedby="reserve-remember-note"
            className="peer sr-only"
          />
          <span
            aria-hidden="true"
            className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[2px]
                       border border-hive-700/25 transition-colors duration-200 ease-settle
                       peer-checked:border-clay-500 peer-checked:bg-clay-500
                       peer-checked:[&_svg]:opacity-100
                       peer-focus-visible:ring-2 peer-focus-visible:ring-honey-400"
          >
            <svg
              viewBox="0 0 12 12"
              width="11"
              height="11"
              fill="none"
              stroke="#F1ECE1"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
              className="opacity-0 transition-opacity duration-200"
            >
              <path d="M2 6.3 L4.7 9 L10 3.2" />
            </svg>
          </span>
          <span className="text-[0.95rem] leading-snug text-hive-600">
            {t.remember}
          </span>
        </label>
        <p
          id="reserve-remember-note"
          className="mt-2 pl-8 text-sm text-hive-400"
        >
          {t.rememberNote}
        </p>
        <button
          type="submit"
          disabled={status === "loading"}
          className="btn-primary mt-8 disabled:opacity-50"
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
