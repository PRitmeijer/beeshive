"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { getDict } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import {
  dateAfter,
  monthAfter,
  monthGrid,
  monthOf,
} from "@/lib/openingHours";

/**
 * The month calendar, lifted out of the old reservation form with its grid
 * semantics untouched.
 *
 * That is deliberate and it is the point of the file existing at all. The grid
 * semantics — `role="grid"`, one roving tab stop, `aria-disabled` rather than
 * `disabled` so an unbookable day is still reachable and still says why,
 * `aria-pressed`, `aria-current="date"`, and the four spoken labels for closed,
 * full, past and beyond — were the best-tested work in the whole booking path
 * and the one part of it nobody complained about. The redesign moves the grid
 * behind a tap; it does not get to rewrite what happens once somebody takes
 * that tap.
 *
 * One thing about a shut day has changed since, and it changed to make a
 * sentence readable that could not be reached at all. A closed square can now
 * be pressed. The band underneath answers it with "Zaterdag 29 augustus zijn we
 * dicht", the owners' own note for that day if they typed one — "gesloten
 * wegens het personeelsfeest" — and a chip for the next day that can take the
 * party. Every one of those was written and none of them could ever appear,
 * because the only two ways to choose a date both refused to hand one over.
 * The square keeps its pale ink and its "gesloten" in the label, so nothing
 * about it pretends to be bookable; it simply has more to say than a grid
 * square can hold, and pressing it is how a guest asks to hear it.
 *
 * What did change is where it sits. It used to be the first thing on the page,
 * thirty-one squares wide, and it is now revealed in place under "Andere dag" —
 * which is why it takes a `revealed` flag: on the way in it puts the caret on
 * the day the tab stop is sitting on, because the control that was pressed to
 * open it has just been replaced by the grid itself and focus would otherwise
 * be orphaned at the top of the page.
 */

/** How a square in the month grid is drawn, and whether it can be pressed. */
export type DayState = "open" | "closed" | "full" | "past" | "beyond";

/** The dates a month holds, with the gaps either side of it dropped. */
export const daysOf = (month: string): string[] =>
  monthGrid(month)
    .flat()
    .filter((day): day is string => day !== null);

/** Midday UTC, so no offset can shift a date across a boundary. */
const noonOf = (iso: string) => Date.parse(`${iso}T12:00:00.000Z`);

interface Props {
  locale: Locale;
  /** Today in Amsterdam, as the flow has reconciled the two clocks. */
  today: string;
  /** The last date the endpoint will accept, inclusive. */
  lastDate: string;
  selected: string;
  dayState: (iso: string) => DayState;
  dayLabel: (iso: string) => string;
  onPick: (iso: string) => void;
  /** So the flow can ask the endpoint about the month being looked at. */
  onMonthChange?: (month: string) => void;
  /** The heading the grid belongs to, for its accessible name. */
  labelledBy: string;
  /** True on the render that revealed it: move the caret in. */
  revealed?: boolean;
}

export function MonthGrid({
  locale,
  today,
  lastDate,
  selected,
  dayState,
  dayLabel,
  onPick,
  onMonthChange,
  labelledBy,
  revealed = false,
}: Props) {
  const dict = getDict(locale);
  const t = dict.reservationForm;

  /**
   * The month on the sheet.
   *
   * `null` means "wherever the reader is", which is the month of the day they
   * have chosen or, before that, the month today falls in. Holding a resolved
   * month in state instead would freeze whatever the very first render guessed,
   * including the stale one a cached page can hand over.
   */
  const [monthCursor, setMonthCursor] = useState<string | null>(null);
  const firstMonth = today ? monthOf(today) : "";
  const lastMonth = lastDate ? monthOf(lastDate) : "";
  const wantedMonth = monthCursor ?? monthOf(selected || today || "");
  const visibleMonth =
    wantedMonth < firstMonth
      ? firstMonth
      : wantedMonth > lastMonth
        ? lastMonth
        : wantedMonth;

  useEffect(() => {
    onMonthChange?.(visibleMonth);
  }, [visibleMonth, onMonthChange]);

  const inRange = (iso: string) =>
    Boolean(today) && iso >= today && iso <= lastDate;

  /**
   * The one square a Tab lands on, and where the arrow keys move from.
   *
   * A grid has exactly one tab stop; everything else in it is reached with the
   * arrows. Held as an intention rather than as the answer — the answer is
   * derived below — so that paging to another month cannot leave the tab stop
   * behind on a square that is no longer drawn.
   */
  const [focusDate, setFocusDate] = useState<string | null>(null);
  const wantFocus = useRef(false);
  const gridRef = useRef<HTMLTableElement>(null);
  const weeks = visibleMonth ? monthGrid(visibleMonth) : [];
  const inMonth = visibleMonth ? daysOf(visibleMonth) : [];
  const focused =
    [focusDate, selected].find(
      (iso) => iso && monthOf(iso) === visibleMonth && inRange(iso),
    ) ??
    // Nothing chosen in this month, so the tab stop is the first day worth
    // pressing — and if the whole month is shut, simply the first day of it,
    // because a grid with no tab stop at all cannot be reached by keyboard.
    inMonth.find((iso) => dayState(iso) === "open") ??
    inMonth.find(inRange) ??
    inMonth[0] ??
    "";

  // Moving the caret is only right when the reader moved it, or when the grid
  // has just this moment appeared under the link they pressed. This effect runs
  // on every month change as well, and stealing focus into a calendar because
  // somebody's party size re-rendered the band would be its own bug.
  const entered = useRef(false);
  useEffect(() => {
    if (revealed && !entered.current) {
      entered.current = true;
      wantFocus.current = true;
    }
  }, [revealed]);
  useEffect(() => {
    if (!wantFocus.current) return;
    wantFocus.current = false;
    gridRef.current
      ?.querySelector<HTMLButtonElement>(`[data-date="${focused}"]`)
      ?.focus();
  }, [focused, visibleMonth]);

  /**
   * Move the tab stop by a number of days, following it into another month.
   *
   * Clamped at both ends rather than refused, exactly as `moveMonth` below is
   * and for the same reason. Refusing made Home and End dead keys on the row
   * today happens to fall in — with today a Wednesday, Home asked for the
   * Monday two days back, got nothing, and said nothing — and did the same to
   * ArrowUp in the first bookable week and ArrowDown in the last. A key that
   * quietly does nothing is indistinguishable from a key that is broken; the
   * published behaviour for a date grid is to land on the nearest day that can
   * be reached, so Home on that row lands on today.
   */
  const moveFocus = (days: number) => {
    if (!focused || !today) return;
    const wanted = dateAfter(focused, days);
    const next = wanted < today ? today : wanted > lastDate ? lastDate : wanted;
    wantFocus.current = true;
    setFocusDate(next);
    if (monthOf(next) !== visibleMonth) setMonthCursor(monthOf(next));
  };

  /**
   * Page to another month, keeping the same day of the month where it exists.
   *
   * Clamped rather than refused at the ends, which is what the comment here
   * always claimed and what the code underneath it did not do: it asked for the
   * month after the last one, found it out of range, and returned — so on the
   * final month of the horizon PageDown was a dead key, pressed four and five
   * times with nothing moving, nothing said, and no way to tell it from a
   * broken keyboard. A key that quietly does nothing is the one thing a grid
   * must not have. So a request past either end is answered with the end
   * itself: PageDown on the last month lands on the horizon, PageUp on the
   * first lands on today, and both of those are a real move of the caret onto a
   * real day that is read out when it gets there.
   */
  const moveMonth = (months: number) => {
    if (!visibleMonth) return;
    const asked = monthAfter(visibleMonth, months);
    const target =
      asked < firstMonth ? firstMonth : asked > lastMonth ? lastMonth : asked;
    const days = daysOf(target);
    const last = days.at(-1);
    if (!last) return;
    // The same day of the month where it exists — the 31st of a month with
    // thirty days lands on the 30th rather than on the 1st of the next one.
    // Except where the month itself was clamped, which is somebody asking for
    // more calendar than there is: the answer to that is the far end of the
    // range rather than the same date they were already standing on.
    const sameDay = `${target}-${(focused || `${target}-01`).slice(8, 10)}`;
    const wanted =
      target === asked
        ? days.includes(sameDay)
          ? sameDay
          : last
        : months > 0
          ? lastDate
          : today;
    const next = wanted < today ? today : wanted > lastDate ? lastDate : wanted;
    // Already standing on the far end of the range, on the month it belongs to:
    // there is genuinely nowhere further to go, and asking for the focus anyway
    // would leave `wantFocus` armed for whatever moved the caret next.
    if (next === focused && target === visibleMonth) return;
    setMonthCursor(target);
    wantFocus.current = true;
    setFocusDate(next);
  };

  const onGridKey = (event: KeyboardEvent<HTMLElement>) => {
    const byDay: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    if (event.key in byDay) {
      event.preventDefault();
      moveFocus(byDay[event.key]);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      // To the Monday or the Sunday of the row the caret is on, which is what
      // a grid means by the beginning and the end of a line — or as near to
      // either as the range reaches, which `moveFocus` sees to.
      const weekday = focused
        ? (new Date(noonOf(focused)).getUTCDay() + 6) % 7
        : 0;
      moveFocus(event.key === "Home" ? -weekday : 6 - weekday);
      return;
    }
    if (event.key === "PageUp" || event.key === "PageDown") {
      event.preventDefault();
      moveMonth(event.key === "PageUp" ? -1 : 1);
    }
  };

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => moveMonth(-1)}
          disabled={visibleMonth <= firstMonth}
          aria-label={t.monthPrevious}
          className="flex h-12 w-12 items-center justify-center rounded-[2px] text-hive-600 transition-colors duration-200 ease-settle hover:bg-hive-700/[0.08] disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <svg
            viewBox="0 0 12 12"
            width="12"
            height="12"
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
        </button>
        {/* Polite rather than assertive: paging a month should be read out, and
            should never cut across whatever is already being said. */}
        <span
          aria-live="polite"
          className="figures-old font-display text-[0.95rem] font-medium text-hive-700"
        >
          {visibleMonth
            ? `${dict.months[Number(visibleMonth.slice(5, 7)) - 1]} ${visibleMonth.slice(0, 4)}`
            : ""}
        </span>
        <button
          type="button"
          onClick={() => moveMonth(1)}
          disabled={visibleMonth >= lastMonth}
          aria-label={t.monthNext}
          className="flex h-12 w-12 items-center justify-center rounded-[2px] text-hive-600 transition-colors duration-200 ease-settle hover:bg-hive-700/[0.08] disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <svg
            viewBox="0 0 12 12"
            width="12"
            height="12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M4.4 2.2 L8.4 6 L4.4 9.8" />
          </svg>
        </button>
      </div>
      <div className="rule-ink mt-2" aria-hidden="true" />
      {/* A real grid, announced as one, rather than a pile of divs with click
          handlers on them. Arrow keys move by a day, Page keys by a month, and
          exactly one square is in the tab order, which is what a grid means. */}
      <table
        ref={gridRef}
        role="grid"
        aria-labelledby={labelledBy}
        className="mt-2 w-full table-fixed border-collapse"
      >
        <thead>
          <tr>
            {t.weekdayShort.map((short, i) => (
              <th
                key={short}
                scope="col"
                abbr={dict.weekdays[i]}
                className="label pb-1 text-center font-semibold"
              >
                {short}
              </th>
            ))}
          </tr>
        </thead>
        <tbody onKeyDown={onGridKey}>
          {weeks.map((week) => (
            <tr key={week.find(Boolean) ?? String(week.length)}>
              {week.map((iso, column) => {
                if (iso === null) {
                  return <td key={`gap-${String(column)}`} />;
                }
                const state = dayState(iso);
                const label = dayLabel(iso);
                /* Open, and shut — for the reason in the note at the top of
                   this file. Full, past and beyond are the three that answer
                   themselves: the label has already said everything the band
                   would, and a square that repeats itself when pressed is
                   worse than one that does not respond. */
                const pressable = state === "open" || state === "closed";
                return (
                  <td key={iso} className="p-0">
                    <button
                      type="button"
                      data-date={iso}
                      data-state={state}
                      data-today={iso === today ? "true" : undefined}
                      /* aria-disabled rather than disabled, so a day that
                         cannot be booked is still reachable with the arrows and
                         still says what it is. A disabled button is skipped in
                         silence, which would hide the very answer this calendar
                         exists to give. A shut day is not among them any more:
                         it can be pressed, so calling it disabled would be the
                         one thing here that is not true. */
                      aria-disabled={!pressable || undefined}
                      aria-pressed={selected === iso}
                      aria-current={iso === today ? "date" : undefined}
                      aria-label={
                        state === "closed"
                          ? t.dayClosedLabel(label)
                          : state === "full"
                            ? t.dayFullLabel(label)
                            : state === "past"
                              ? t.dayPastLabel(label)
                              : state === "beyond"
                                ? t.dayBeyondLabel(label)
                                : label
                      }
                      tabIndex={iso === focused ? 0 : -1}
                      onClick={() => {
                        if (!pressable) return;
                        // The tab stop follows the choice, so arrowing on from
                        // a day you have just pressed starts where you are
                        // rather than where the month began.
                        setFocusDate(iso);
                        onPick(iso);
                      }}
                      /* The stylesheet still draws a shut day as unpressable,
                         which it no longer is, and globals.css is not this
                         change's to edit. The utility layer wins over the
                         component layer, so the hand and the wash of ink under
                         it are put back here beside the reason for them. */
                      className={`cal-day min-h-[3rem]${
                        state === "closed"
                          ? " cursor-pointer hover:bg-hive-700/[0.08]"
                          : ""
                      }`}
                    >
                      {Number(iso.slice(8, 10))}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
