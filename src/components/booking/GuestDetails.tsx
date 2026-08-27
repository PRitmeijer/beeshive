"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Confirmation } from "@/components/booking/Confirmation";
import { fieldClass } from "@/components/booking/ink";
import type { Funnel } from "@/components/booking/useFunnel";
import { getDict } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import { STEPS, EVENTS, track } from "@/lib/umami";
import { isReservationError } from "@/lib/reservationErrors";
import { forget, readRemembered, remember } from "@/lib/rememberMe";
import { leadBucket, msBucket, partyBucket, weekdayKey } from "@/lib/bookingTelemetry";
import { todayInAmsterdam, type BookingRules } from "@/lib/openingHours";

/**
 * Who, once when has been settled.
 *
 * Three fields and nothing else. That is not a reduction — every one of them is
 * a field /api/reserve requires and none has been removed — it is a separation:
 * the party size went back to the availability screen where it belongs, the
 * notes folded away behind the one line that describes them, and what is left
 * is the smallest thing this café can take a booking on.
 *
 * The screen is arrived at rather than scrolled to. On /reserveren it is a real
 * route with its own URL, which is the one boundary every booking system in the
 * research draws without exception; inside the phone sheet it is a `pushState`
 * entry, so the Android back gesture returns to the accordion instead of
 * dismissing the sheet and losing the lot. Either way the fields do not exist
 * until an evening has been proven available, and no personal data is ever put
 * in a URL — everything typed here lives in this component and goes straight to
 * the endpoint.
 *
 * The e-mail address is required and collected even though the automatic
 * confirmation mail is still held back. The owners write to their guests by
 * hand, so the address is used; a field asked for and not used would be the
 * thing worth removing, and this is not that.
 */

/** What a returning guest can be shown before they have typed anything. */
interface Filled {
  name: string;
  email: string;
  phone: string;
}

const EMPTY: Filled = { name: "", email: "", phone: "" };

export function GuestDetails({
  locale,
  surface,
  guests,
  date,
  time,
  dayLabel,
  rules,
  funnel,
  backHref,
  onBack,
  onTimeChanged,
  onSeatsMoved,
}: {
  locale: Locale;
  surface: "sheet" | "page";
  guests: number;
  date: string;
  time: string;
  /** "Zaterdag 29 augustus", written once by the flow and handed down. */
  dayLabel: string;
  rules: BookingRules;
  /** The counting, owned by whichever screen began this journey. */
  funnel: Funnel;
  /** On the page surface, back to the accordion is a real link. */
  backHref?: string;
  /** In the sheet, it is a history entry to pop. */
  onBack?: () => void;
  /** So the surface that owns the booking follows a re-pointed time. */
  onTimeChanged?: (time: string) => void;
  /** The seats moved under us: whoever owns the window should ask again. */
  onSeatsMoved?: () => void;
}) {
  const t = getDict(locale).reservationForm;
  const router = useRouter();

  const [form, setForm] = useState<Filled>(EMPTY);
  const [notes, setNotes] = useState("");
  const [notesOpen, setNotesOpen] = useState(false);
  // Honeypot. Kept out of `form` so it can never be confused for real input.
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState<Record<string, string>>({});
  const [passUrl, setPassUrl] = useState<string | null>(null);

  /**
   * The sitting this screen is booking, which is the one it arrived with until
   * somebody else takes it. Held rather than read straight off the prop so the
   * recovery below can re-point the booking in place, without the guest being
   * sent back a screen and without a single keystroke being lost.
   */
  const [slot, setSlot] = useState(time);
  useEffect(() => setSlot(time), [time]);

  /** Which sitting went, and what is left of that evening. */
  const [gone, setGone] = useState<{ time: string; free: string[] } | null>(
    null,
  );

  const heading = useRef<HTMLHeadingElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  /**
   * The screen announces itself and takes the caret — on the heading, and
   * deliberately not on the first field. A form that opens the keyboard the
   * moment it appears hides two thirds of itself behind it, and this is the
   * screen where somebody most wants to see what they are agreeing to before
   * they start typing.
   */
  useEffect(() => {
    funnel.step(STEPS.detailsShown);
    heading.current?.focus({ preventScroll: surface === "page" });
  }, [funnel, surface]);

  /**
   * The fast checkout for somebody who has booked here before.
   *
   * `rememberMe` is the tickbox beside the button and it is an intention rather
   * than a fact: nothing is written until a booking is accepted, so ticking it
   * and closing the tab leaves this device exactly as clean as it was.
   * `prefilled` is the fact, and it exists so this screen can say out loud that
   * it filled three fields in by itself — a booking form that already knows
   * your telephone number and does not mention it is unnerving in a way that
   * costs more trust than the typing saved is worth.
   *
   * Both start false and the reading happens in an effect rather than in
   * `useState`'s initialiser, because this component renders on the server too,
   * where there is no localStorage, and the first client paint has to match
   * that render to the character or React throws the markup away.
   *
   * On a return visit the box comes back ticked, because by then it is no
   * longer an offer but a description of how things already stand. Untick it,
   * book, and the record is gone.
   */
  const [rememberMe, setRememberMe] = useState(false);
  const [prefilled, setPrefilled] = useState(false);
  /** Prefilled details, folded to one line until the guest wants at them. */
  const [editing, setEditing] = useState(false);
  const fillFromStorage = useCallback(() => {
    const saved = readRemembered();
    if (!saved) return;
    setForm({ name: saved.name, email: saved.email, phone: saved.phone });
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
   * the fields and the stored record go together, now.
   */
  const forgetMe = () => {
    forget();
    setForm(EMPTY);
    setRememberMe(false);
    setPrefilled(false);
    setEditing(true);
  };

  const reportBlocked = (field: string) =>
    track(EVENTS.reservationBlocked, { field, surface });

  /**
   * What is wrong with one field, in the reader's own language, using the very
   * sentences /api/reserve's refusals already carry — so being stopped here and
   * being stopped by the server say the same thing about the same field rather
   * than two things a guest has to reconcile.
   */
  const complaint = (el: HTMLInputElement): string => {
    if (el.validity.valid) return "";
    if (el.validity.typeMismatch && el.name === "email") {
      return t.errors.emailInvalid;
    }
    if (el.validity.valueMissing) {
      if (el.name === "name") return t.errors.nameRequired;
      if (el.name === "email") return t.errors.emailRequired;
      if (el.name === "phone") return t.errors.phoneRequired;
    }
    return t.error;
  };

  /**
   * Checked when a field is left, never while it is being typed in. Somebody
   * three characters into an e-mail address has not made a mistake yet, and
   * telling them so is the surest way to make a form feel hostile.
   */
  const checkOnBlur = (el: HTMLInputElement) => {
    const message = complaint(el);
    setFieldError((prev) => ({ ...prev, [el.name]: message }));
  };

  /**
   * The browser's own refusal, made visible.
   *
   * `required` and `type="email"` stay, and so does the absence of
   * `noValidate`: the browser's constraint checking is doing real work here and
   * writing a second copy of it would be writing a second copy of it. What is
   * replaced is only the bubble it draws, which inside the phone sheet — its
   * own scroll container — can sit entirely off screen, so the guest sees a
   * button that does nothing at all. The event is cancelled, the sentence is
   * printed under the field's own rule, and the caret goes to the first
   * offender of the burst.
   *
   * In the capture phase because `invalid` does not bubble: one handler on the
   * form only hears all three of them on the way down. The browser fires it
   * once per offending control, which is what makes "on which field do people
   * get stuck" answerable, and it is deliberately the control's `name`
   * attribute — our own markup — that is read. Its value is never touched.
   *
   * The first offender is the first event, because a browser checks a form's
   * controls in tree order, so all this has to do is keep hold of the one it
   * heard first and let the rest of the burst go past. Which is what the guard
   * was for, and what it did not manage: it disarmed itself inside a
   * `queueMicrotask`, and a microtask checkpoint runs after every listener
   * returns rather than after the last one — so the second `invalid` found the
   * guard armed again, and the third after that, and the caret ended on the
   * telephone number at the bottom of the form while the empty name field it
   * should have been in was two rules above it. A timer of zero is the shortest
   * wait that is genuinely later than the whole burst: the events are dispatched
   * one after another inside a single task, and nothing queued as a task can
   * run until that task is finished.
   */
  const burst = useRef<HTMLInputElement | null>(null);
  const handleInvalid = (e: FormEvent<HTMLFormElement>) => {
    const el = e.target as HTMLInputElement | null;
    if (!el || typeof el.name !== "string") return;
    e.preventDefault();
    reportBlocked(el.name);
    setFieldError((prev) => ({ ...prev, [el.name]: complaint(el) }));
    if (burst.current) return;
    burst.current = el;
    window.setTimeout(() => {
      const first = burst.current;
      burst.current = null;
      first?.focus();
    }, 0);
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
  /**
   * A number the refusal carried, when it carried one. Two of the sentences
   * name a limit the CMS owns — the horizon in days and the largest party — and
   * the endpoint sends the value it just measured against beside the code,
   * because this may be a cached bundle holding an older copy of either.
   */
  const numberFrom = (data: unknown, key: string): number | undefined => {
    const value =
      data && typeof data === "object"
        ? (data as Record<string, unknown>)[key]
        : undefined;
    return typeof value === "number" && Number.isFinite(value)
      ? value
      : undefined;
  };
  const messageFor = (code: string, data?: unknown): string => {
    if (!isReservationError(code)) return t.error;
    if (code === "guestsInvalid") {
      return t.errors.guestsInvalid(
        numberFrom(data, "max") ?? rules.maxPartySize,
      );
    }
    if (code === "dateTooFar") {
      return t.errors.dateTooFar(numberFrom(data, "days") ?? rules.horizonDays);
    }
    return t.errors[code];
  };

  /**
   * The shape of the booking being attempted, in bands that cannot be turned
   * back into it. See src/lib/bookingTelemetry.ts for the whole argument; this
   * is only the assembly. Anything unknown is left off rather than sent empty.
   */
  const bookingShape = () => {
    const party = partyBucket(guests);
    const lead = leadBucket(date, todayInAmsterdam());
    const day = weekdayKey(date);
    return {
      ...(party ? { party_bucket: party } : {}),
      ...(lead ? { lead_bucket: lead } : {}),
      ...(day ? { weekday: day } : {}),
    };
  };

  /**
   * Somebody else took the sitting while this was being filled in.
   *
   * The docket is replaced by what happened and that evening's remaining
   * sittings are printed straight underneath, so one tap re-points the booking.
   * Nothing typed is cleared — a refusal at the button must never cost a guest
   * a keystroke, which is the whole difference between this and an error
   * paragraph. The list is fetched fresh rather than remembered, because the
   * only interesting thing about it is that it changed a moment ago.
   */
  const askWhatIsLeft = useCallback(async () => {
    try {
      const query = new URLSearchParams({
        date,
        locale,
        guests: String(guests),
      });
      const res = await fetch(`/api/availability?${query}`);
      if (!res.ok) return [];
      const data = (await res.json()) as {
        slots?: { time: string; full: boolean }[];
      };
      return Array.isArray(data.slots)
        ? data.slots.filter((s) => !s.full).map((s) => s.time)
        : [];
    } catch {
      return [];
    }
  }, [date, locale, guests]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    funnel.step(STEPS.submitAttempted);
    // How long the guest waits, in bands. /api/reserve counts seats and writes
    // a row with a mail hook behind it, and if that ever creeps towards two
    // seconds on a phone the only evidence would otherwise be a rise in
    // abandonment with nothing attached to explain it.
    const startedAt = performance.now();
    try {
      const res = await fetch("/api/reserve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          phone: form.phone,
          date,
          time: slot,
          guests,
          notes,
          // Only so the guest pass link comes back in the language this was
          // filled in in. Nothing about the booking itself depends on it.
          locale,
          website,
        }),
      });
      if (res.ok) {
        funnel.finish();
        funnel.step(STEPS.confirmed);
        // The old name, sent alongside the new one until March 2027. See the
        // note on EVENTS.reservationSubmitted: bookings per week is the one
        // figure the owners already read, and Umami keys its history on the
        // name string, so dropping it on the day the measuring got better
        // would make the improvement look exactly like a regression.
        track(EVENTS.reservationSubmitted);
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
         * the new one is right, so the write is unconditional rather than "only
         * if there was nothing there". The mirror of it matters as much — an
         * unticked box on a guest who was remembered is them withdrawing, so
         * the record goes.
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
            guests,
          });
        } else {
          forget();
        }
        setStatus("success");
        return;
      }
      const data = await res.json().catch(() => null);
      const code = codeFrom(data);
      const took = msBucket(performance.now() - startedAt);
      track(EVENTS.reservationFailed, {
        reason: code,
        step: funnel.furthest(),
        ...funnel.props,
        ...bookingShape(),
        ...(took ? { ms_bucket: took } : {}),
      });
      if (code === "slotFull" || code === "dayFull") {
        onSeatsMoved?.();
        const free = await askWhatIsLeft();
        setGone({ time: slot, free });
        setStatus("idle");
        return;
      }
      setError(messageFor(code, data));
      setStatus("error");
    } catch {
      // Only a request that never arrived can reach here. Both readings of the
      // body have a `.catch` of their own, so a reply that will not parse is
      // already counted as the refusal it was rather than being folded in with
      // a dropped connection.
      const took = msBucket(performance.now() - startedAt);
      track(EVENTS.reservationFailed, {
        reason: "network",
        step: funnel.furthest(),
        ...funnel.props,
        ...bookingShape(),
        ...(took ? { ms_bucket: took } : {}),
      });
      setError(t.error);
      setStatus("error");
    }
  };

  if (status === "success") {
    return (
      <Confirmation
        locale={locale}
        passUrl={passUrl}
        onAgain={() => {
          setPassUrl(null);
          setStatus("idle");
          setNotes("");
          setNotesOpen(false);
          // Every stage is reported once per journey, and this is somebody
          // starting a second one: leaving the old marks in place would drop
          // their whole second booking out of the funnel while
          // `reservation_submitted` beside it went on counting.
          funnel.reset();
          /**
           * Back to the availability screen, whichever of the two ways there is
           * of getting there. The condition used to name both and then act on
           * only one of them — `if (backHref || onBack) onBack?.()` — which on
           * /reserveren/gegevens, where `backHref` is the only one passed, was
           * a true test around an empty body. So the button did nothing at all:
           * the guest stayed on the details URL of the booking they had just
           * made, in front of an emptied form for the very same sitting, and
           * pressing submit again either booked the table twice or was refused.
           *
           * The hand-off is the same one the accordion makes on the way here,
           * and for the same reason. `reset` has just put the journey back to
           * its beginning, which un-finishes it, and without this the unmount
           * that follows the navigation would report somebody who booked a
           * table and asked for another as having abandoned the form.
           */
          if (onBack) {
            onBack();
          } else if (backHref) {
            funnel.handOff();
            router.push(backHref);
          }
          // The contact details are not part of the last booking; they are the
          // person still sitting there. Having just been asked to remember
          // them, asking them to type it all again would be a strange way to
          // keep the promise. It matters on the sheet, where this screen stays
          // mounted; on the page the navigation above takes them out of it.
          fillFromStorage();
        }}
      />
    );
  }

  const backClass =
    "ink-link -my-3 -ml-1.5 inline-flex min-h-[2.75rem] items-center px-1.5 py-3 text-sm";
  const back = (
    <span className="inline-flex items-center gap-2">
      <svg
        viewBox="0 0 12 12"
        width="11"
        height="11"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M7.6 2.2 L3.6 6 L7.6 9.8" />
      </svg>
      {t.backToWhen}
    </span>
  );

  return (
    <form
      onSubmit={handleSubmit}
      onInvalidCapture={handleInvalid}
      className="relative"
    >
      {/* Padded to a real target and pulled back out of the line again, which
          is the trick <BandSummary> plays on "wijzig" and for the same reason:
          this was 73 by 21 points, the smallest thing in the flow by some
          distance, and it is the only way back off a screen somebody may well
          have arrived at by mistake. Everything else here clears 44. The
          negative margins mean the line still sits where it looks like it
          sits — the padding is for the finger, not for the layout. */}
      {backHref ? (
        <Link href={backHref} className={backClass}>
          {back}
        </Link>
      ) : (
        <button type="button" onClick={onBack} className={backClass}>
          {back}
        </button>
      )}

      {/* The docket: three facts between two rules, the way a waiter writes
          them on the pad. Not a card, and not a countdown either — this café
          confirms on the spot rather than holding inventory across a checkout,
          and a ticking clock reads as pressure in a place whose whole
          proposition is being the neighbourhood's. */}
      <div className="rule-ink mt-5" aria-hidden="true" />
      <div className="py-5">
        {gone ? (
          <div role="status">
            <p className="font-display text-xl text-hive-700">
              {t.slotJustTaken(gone.time)}
            </p>
            {gone.free.length > 0 ? (
              <>
                <p className="mt-3 text-sm text-hive-400">{t.stillFree}</p>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {gone.free.map((free) => (
                    <button
                      key={free}
                      type="button"
                      onClick={() => {
                        setSlot(free);
                        setGone(null);
                        onTimeChanged?.(free);
                      }}
                      className="slot-chip min-h-[3rem] w-full hover:border-honey-400 hover:bg-hive-700/[0.06]"
                    >
                      {free}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="mt-3 max-w-prose leading-relaxed text-hive-500">
                {t.errors.dayFull}
              </p>
            )}
          </div>
        ) : (
          <>
            <h2
              ref={heading}
              tabIndex={-1}
              className="font-display text-xl text-hive-700 outline-none"
            >
              {t.docketHeading(t.people(guests))}
            </h2>
            <p className="mt-1 text-hive-500">{dayLabel}</p>
            <p className="figures-old mt-0.5 text-hive-500">{slot}</p>
          </>
        )}
      </div>
      <div className="rule-ink" aria-hidden="true" />

      {/* Three fields that filled themselves in, folded to the line that says
          so. It is at the top, because the moment to explain a form that knows
          your telephone number is before it is read, not in a footnote under
          the button — and for a returning guest the whole of this screen is now
          one line and one press. The two ways out are different on purpose:
          "wijzig" opens the fields with the details still in them, and the
          other empties both them and this device's record. */}
      {prefilled && !editing ? (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-7 text-hive-600">
          <span>{t.filledInAs(form.name)}</span>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="ink-link text-sm"
          >
            {t.changeAnswer}
          </button>
          <button type="button" onClick={forgetMe} className="ink-link text-sm">
            {t.someoneElse}
          </button>
        </div>
      ) : (
        <div className="space-y-7 py-7">
          <Field
            id="guest-name"
            name="name"
            label={t.name}
            type="text"
            value={form.name}
            error={fieldError.name}
            onChange={(v) => setForm((p) => ({ ...p, name: v }))}
            onBlur={checkOnBlur}
            maxLength={120}
            autoComplete="name"
            autoCapitalize="words"
            autoCorrect="off"
            spellCheck={false}
          />
          <Field
            id="guest-email"
            name="email"
            label={t.email}
            type="email"
            inputMode="email"
            value={form.email}
            error={fieldError.email}
            onChange={(v) => setForm((p) => ({ ...p, email: v }))}
            onBlur={checkOnBlur}
            maxLength={200}
            autoComplete="email"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          {/* No `pattern`, and forty characters. Both are deliberate and both
              are the sort of thing a later contributor "improves": a validator
              that rejects what the autofill bar just put in is the single most
              expensive silent defect a booking form can carry, and a telephone
              number is written a dozen legitimate ways. /api/reserve agrees
              with this field to the character. */}
          <Field
            id="guest-phone"
            name="phone"
            label={t.phone}
            type="tel"
            inputMode="tel"
            value={form.phone}
            error={fieldError.phone}
            onChange={(v) => setForm((p) => ({ ...p, phone: v }))}
            onBlur={checkOnBlur}
            maxLength={40}
            autoComplete="tel"
          />
        </div>
      )}

      <div className="rule-ink" aria-hidden="true" />

      {/* Most tables have nothing to declare, and a four-row textarea asked all
          of them anyway. The three examples are in the line rather than in a
          hint underneath it, so whoever has an allergy to mention recognises
          themselves in it and everybody else reads past. */}
      <div className="pt-6">
        {notesOpen ? (
          <div>
            <label htmlFor="guest-notes" className="label block">
              {t.notes}
            </label>
            <textarea
              id="guest-notes"
              ref={notesRef}
              name="notes"
              rows={3}
              maxLength={2000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={`${fieldClass} resize-none`}
            />
          </div>
        ) : (
          <button
            type="button"
            /* No `aria-expanded`. This is not a disclosure that stays where it
               is — pressing it replaces it with the field it summons, and the
               caret goes straight in — so a reader was being told "collapsed"
               about a control that was about to stop existing. The calendar's
               "Andere dag" answered the same complaint the other way, by
               remaining and folding back; that is the better shape and it is
               not available here. Folding this one away again would mean
               either throwing away what somebody typed or keeping it hidden
               and sending it anyway, and neither is worth a state a button
               could announce. */
            onClick={() => {
              setNotesOpen(true);
              // Opened on purpose, so the caret belongs in it: nobody presses
              // this line without something to write.
              queueMicrotask(() => notesRef.current?.focus());
            }}
            className="ink-link text-left text-[0.95rem]"
          >
            {t.notesReveal}
          </button>
        )}
      </div>

      {/* Honeypot. Off screen rather than display:none, and hidden from the
          accessibility tree, so only a form filling bot ever reaches it. */}
      <div
        aria-hidden="true"
        className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden"
      >
        <label htmlFor="guest-website">{t.honeypot}</label>
        <input
          id="guest-website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      <div className="pt-8">
        {/* The offer, beside the button rather than at the top, where it would
            be a setting to be decided before there is anything to decide about.
            Drawn in the same ink as the guest pass's own tickboxes: the
            browser's blue square is the one thing on this page that would look
            like it came from somewhere else.

            Deliberately without a `name`, and deliberately not part of the JSON
            the submit handler builds. It changes what this browser keeps and
            nothing whatever about what is sent, so there is nothing here for a
            form-filling bot to turn into a different booking. */}
        {/* Same 44 points as everything else, taken in padding and given back
            in margin so the row reads as the one line of text it is. A tickbox
            is a 20 point square, and the row it sits in was 22 points tall —
            on a phone that is a thing you miss, and missing it is the guest
            silently not being remembered. */}
        <label className="-my-2.5 flex min-h-[2.75rem] cursor-pointer items-start gap-3 py-2.5">
          <input
            id="guest-remember"
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
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

        <button
          type="submit"
          disabled={status === "loading"}
          className="btn-primary mt-7 w-full disabled:opacity-50"
        >
          {status === "loading" ? t.submitting : t.submit}
        </button>
      </div>

      {status === "error" && error ? (
        <p
          role="alert"
          className="mt-6 flex items-center gap-2 text-sm text-honey-600"
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
      ) : null}
    </form>
  );
}

/**
 * One field, its label above the rule and its complaint below it.
 *
 * Written out once rather than three times because the three differ only in
 * their keyboard hints, and those hints are the whole reason this exists: a
 * name that autocapitalises, an e-mail address that does not and gets the @
 * keyboard, a telephone number that gets the dial pad. Twenty-four of Zuko's
 * two hundred and fifteen forms converted *worse* with autofill, purely because
 * of what happened to what the browser filled in, so these attributes are load
 * bearing rather than polish.
 */
function Field({
  id,
  name,
  label,
  error,
  value,
  onChange,
  onBlur,
  ...rest
}: {
  id: string;
  name: string;
  label: string;
  error?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur: (el: HTMLInputElement) => void;
} & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "id" | "name" | "value" | "onChange" | "onBlur"
>) {
  return (
    <div>
      <label htmlFor={id} className="label block">
        {label}
      </label>
      <input
        {...rest}
        id={id}
        name={name}
        required
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => {
          onChange(e.target.value);
          // Un-marking, not validating: a field still flagged after it has been
          // put right is worse than one that was never flagged at all.
          if (error && e.target.validity.valid) onBlur(e.target);
        }}
        onBlur={(e) => onBlur(e.target)}
        className={fieldClass}
      />
      {error ? (
        <p id={`${id}-error`} className="mt-2 text-sm text-honey-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
