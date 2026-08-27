"use client";

import { useCallback, useId, useState } from "react";
import { BandSummary } from "@/components/booking/BandSummary";
import { DayChip } from "@/components/booking/DayChip";
import { MonthGrid, type DayState } from "@/components/booking/MonthGrid";
import { getDict } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import type { BookingRules } from "@/lib/openingHours";
import {
  dateAnswer,
  relativeDay,
  timesFor,
  dayIn,
  type DayFacts,
  type Horizon,
} from "@/lib/bookingFlow";

/**
 * When, answered in three taps or fewer.
 *
 * The band that replaced a thirty-one square grid on the first paint of the
 * page, and the change the whole redesign stands or falls on. Three days are
 * offered outright — tonight, tomorrow, and the next one after that the café
 * can take — and the calendar is one press away underneath them. The bet is
 * that most guests want one of the three, and `via` on the analytics step is
 * the instrument that says whether the bet held; if a third of them are opening
 * the calendar, the link needs to be louder or the chips need to look further
 * ahead.
 *
 * The chips come off the schedule the page already resolved on the server, so
 * on /reserveren they are correct on the first paint with no network at all.
 * The window answer lands moments later and can only ever remove one and slide
 * the next up — never insert a day in front of one somebody has already
 * pressed, because the order is the calendar's rather than the answer's.
 */
export function DateBand({
  locale,
  days,
  horizon,
  nowMinutes,
  rules,
  value,
  guests,
  dayLabel,
  dateOnly,
  expanded,
  onPick,
  onEdit,
  onCalendarOpened,
  onMonthChange,
  headingRef,
}: {
  locale: Locale;
  days: DayFacts[];
  horizon: Horizon;
  nowMinutes: number | undefined;
  rules: BookingRules;
  value: string;
  guests: number;
  /** "Zaterdag 29 augustus", from the flow so every screen writes it once. */
  dayLabel: (iso: string) => string;
  /** The same date without its weekday, for the chip's right-hand column. */
  dateOnly: (iso: string) => string;
  expanded: boolean;
  /** `via` says whether the calendar was needed; it is the one number that
   *  validates or kills hiding the grid behind a tap. */
  onPick: (iso: string, via: "chip" | "calendar") => void;
  onEdit: () => void;
  onCalendarOpened: () => void;
  onMonthChange: (month: string) => void;
  headingRef?: React.Ref<HTMLHeadingElement>;
}) {
  const t = getDict(locale).reservationForm;
  const headingId = useId();
  const [calendar, setCalendar] = useState(false);

  const answer = dateAnswer(days, horizon, nowMinutes, rules);

  /**
   * One square, in one of five states.
   *
   * A day before today and a day past the horizon are separate states carrying
   * separate sentences, because they used to be one and everything earlier in
   * the month than today — up to thirty squares on the very first paint — was
   * announced as "nog niet te reserveren", which is the precise opposite of
   * what it is.
   *
   * The endpoint's answer wins where there is one, because only the server can
   * see the other reservations and the repeating rules; the resolved schedule
   * is what the opening hours alone can work out, and it is the answer until
   * the window has been fetched and whenever it cannot be.
   */
  const dayState = useCallback(
    (iso: string): DayState => {
      if (iso < horizon.today) return "past";
      if (iso > horizon.last) return "beyond";
      const known = dayIn(days, iso);
      if (!known) return "closed";
      if (known.closed) return "closed";
      if (known.full) return "full";
      return timesFor(known, horizon.today, nowMinutes, rules).length > 0
        ? "open"
        : "closed";
    },
    [days, horizon, nowMinutes, rules],
  );

  if (!expanded) {
    return (
      <BandSummary
        label={t.dateLegend}
        answer={dayLabel(value)}
        change={t.changeAnswer}
        changeLabel={t.changeLabel(t.dateLegend)}
        onChange={() => {
          // The calendar comes back with the band whenever that is where the
          // date came from, so "wijzig" returns the guest to the control they
          // used rather than to the one we would have preferred them to use.
          onEdit();
        }}
      />
    );
  }

  /**
   * What a chip calls its day, and what it is called out loud.
   *
   * The two differ, and only for the days that have a name of their own.
   * "Vanavond" needs the date after it or nobody hears which evening it is, but
   * a chip already headed "Zaterdag" would be read as "Zaterdag, zaterdag 29
   * augustus" if the same rule were applied to it — the label is built from the
   * kind rather than glued together after the fact for exactly that reason.
   */
  const chip = (iso: string) => {
    const kind = relativeDay(
      iso,
      horizon,
      timesFor(dayIn(days, iso), horizon.today, nowMinutes, rules),
    );
    const full = dayLabel(iso);
    if (kind === "other") {
      const weekday =
        getDict(locale).weekdays[
          (new Date(`${iso}T12:00:00.000Z`).getUTCDay() + 6) % 7
        ];
      return { name: weekday, label: full };
    }
    const name =
      kind === "tonight" ? t.tonight : kind === "today" ? t.todayWord : t.tomorrow;
    return { name, label: `${name}, ${full}` };
  };

  return (
    <div className="py-4">
      <h2 id={headingId} ref={headingRef} tabIndex={-1} className="label outline-none">
        {t.dateLegend}
      </h2>

      {answer.kind === "no_days" ? (
        /* Not one day in the whole horizon has room for this party, which is
           a different sentence from "we are shut" and needs the party size in
           it to be true. The calendar stays openable underneath, because a
           guest who does not believe us should be able to look. */
        <p className="mt-3 max-w-prose leading-relaxed text-hive-500">
          {t.dateNoneForParty(t.people(guests))}
        </p>
      ) : (
        <div className="mt-3">
          {answer.dates.map((iso) => {
            const { name, label } = chip(iso);
            return (
              <DayChip
                key={iso}
                name={name}
                date={dateOnly(iso)}
                label={label}
                onPick={() => onPick(iso, "chip")}
              />
            );
          })}
        </div>
      )}

      {/* A disclosure that stays where it is.

          It used to be replaced by the calendar it summoned, while still saying
          `aria-expanded={false}`: a reader was told the thing was collapsed,
          pressed it, and found the control itself gone — with the month grid
          now open and no way whatever of folding it away again. Both halves of
          that are fixed by the button simply remaining. The state it announces
          is true, pressing it a second time puts the thirty-one squares back
          behind the one tap they were meant to be behind, and the caret has
          somewhere to be on the way out because the control that was pressed is
          still under it. The wording does not change with the state, which is
          what a disclosure does: "Andere dag" is what the button is for, and
          whether it is open is `aria-expanded`'s to say rather than the label's.

          `onCalendarOpened` is still only the opening. It counts whether the
          three chips were enough, and a fold shut is not a second guest. */}
      <button
        type="button"
        onClick={() => {
          const opening = !calendar;
          setCalendar(opening);
          if (opening) onCalendarOpened();
        }}
        aria-expanded={calendar}
        className="ink-link mt-4 inline-flex min-h-[3rem] items-center gap-2 text-[0.95rem]"
      >
        {/* Drawn here rather than taken from <CraftIcon>, which has no
            calendar among its marks: hanging a twelfth symbol in <PaperDefs>
            for one eighteen-pixel use is more machinery than the drawing.
            Same line weight and same open hand as the rest of the artwork. */}
        <svg
          viewBox="0 0 24 24"
          width="17"
          height="17"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M3.4 6.6 C3.3 5.8 3.9 5.2 4.7 5.2 L19.3 5.2 C20.1 5.2 20.7 5.8 20.6 6.6 L20.6 19.2 C20.6 20 20 20.6 19.2 20.6 L4.8 20.6 C4 20.6 3.4 20 3.4 19.2 Z" />
          <path d="M3.6 9.7 C9 9.4 15 9.5 20.4 9.6" />
          <path d="M8 2.9 L8 7" />
          <path d="M16 2.9 L16 7" />
        </svg>
        {t.otherDay}
      </button>

      {calendar ? (
        <MonthGrid
          locale={locale}
          today={horizon.today}
          lastDate={horizon.last}
          selected={value}
          dayState={dayState}
          dayLabel={dayLabel}
          onPick={(iso) => onPick(iso, "calendar")}
          onMonthChange={onMonthChange}
          labelledBy={headingId}
          revealed
        />
      ) : null}
    </div>
  );
}
