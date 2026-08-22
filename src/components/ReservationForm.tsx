"use client";

import { useMemo, useState, type FormEvent } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { CraftIcon } from "@/components/CraftIcon";
import { getDict } from "@/i18n/dictionaries";
import { defaultLocale, type Locale } from "@/i18n/config";
import { isReservationError } from "@/lib/reservationErrors";
import {
  describe,
  parseWeek,
  slotsFor,
  weekdayIndex,
  type HoursRow,
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

const EMPTY = {
  name: "",
  email: "",
  phone: "",
  date: "",
  time: "",
  guests: "2",
  occasion: "",
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
   * The week as the owners typed it into the CMS. The times on offer are read
   * off this rather than hard-coded, so changing the hours in the admin
   * changes what a guest can book without anyone touching the code.
   */
  openingHours?: HoursRow[];
}

export function ReservationForm({
  locale = defaultLocale,
  minDate,
  openingHours,
}: ReservationFormProps) {
  const t = getDict(locale).reservationForm;
  const [form, setForm] = useState(EMPTY);
  const week = useMemo(() => parseWeek(openingHours), [openingHours]);

  // Which day the guest picked, and therefore what is on offer. No date yet
  // means no list: offering times before knowing the day would be inventing
  // them, and half of them would be on a day the café is shut.
  const dayIndex = form.date ? weekdayIndex(form.date) : null;
  const dayRanges = dayIndex === null ? null : week[dayIndex];
  const slots = dayRanges ? slotsFor(dayRanges) : [];
  const closedThatDay = dayRanges !== null && slots.length === 0;
  // Honeypot. Kept out of `form` so it can never be confused for real input.
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [error, setError] = useState(t.error);
  const reduce = useReducedMotion();

  const set = (key: keyof typeof EMPTY) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  /**
   * Changing the date can strand a time the new day does not offer — Friday
   * evening is bookable, Tuesday is shut. Drop the time whenever it is no
   * longer on the list rather than submitting something we know is refused.
   */
  const setDate = (value: string) =>
    setForm((prev) => {
      const index = weekdayIndex(value);
      const next = index === null ? [] : slotsFor(week[index]);
      return {
        ...prev,
        date: value,
        time: next.includes(prev.time) ? prev.time : "",
      };
    });

  /**
   * /api/reserve answers a refusal with a code, not a sentence, so the reason
   * arrives from the server and the wording comes from the reader's own
   * dictionary. A code we have no line for falls back to the generic one.
   */
  const messageFrom = (data: unknown): string => {
    const code =
      data && typeof data === "object"
        ? (data as { error?: unknown }).error
        : undefined;
    return isReservationError(code) ? t.errors[code] : t.error;
  };

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
          occasion: form.occasion,
          notes: form.notes,
          website,
        }),
      });
      if (res.ok) {
        setStatus("success");
        setForm(EMPTY);
        return;
      }
      const data = await res.json().catch(() => null);
      setError(messageFrom(data));
      setStatus("error");
    } catch {
      setError(t.error);
      setStatus("error");
    }
  };

  if (status === "success") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduce ? 0 : 0.8, ease: [0.16, 0.84, 0.28, 1] }}
        role="status"
        className="py-2"
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
      </motion.div>
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
            max={30}
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
          <input
            id="reserve-date"
            name="date"
            type="date"
            required
            min={minDate}
            value={form.date}
            onChange={(e) => setDate(e.target.value)}
            aria-describedby={closedThatDay ? "reserve-date-closed" : undefined}
            className={`${fieldClass} figures-old`}
          />
          {closedThatDay && (
            <p
              id="reserve-date-closed"
              role="status"
              className="mt-2 text-sm text-honey-600"
            >
              {t.closedThatDay}
            </p>
          )}
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
            {slots.map((slot) => (
              <option key={slot} value={slot}>
                {t.timeOption(slot)}
              </option>
            ))}
          </select>
          <p id="reserve-time-hint" className="mt-2 text-sm text-hive-400">
            {dayRanges && dayRanges.length > 0
              ? t.timeHintForDay(describe(dayRanges), slots[slots.length - 1])
              : t.timeHint}
          </p>
        </div>
      </div>

      <div>
        <label htmlFor="reserve-occasion" className="label block">
          {t.occasion}
        </label>
        <input
          id="reserve-occasion"
          name="occasion"
          type="text"
          maxLength={120}
          placeholder={t.occasionPlaceholder}
          value={form.occasion}
          onChange={(e) => set("occasion")(e.target.value)}
          className={fieldClass}
        />
      </div>

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
