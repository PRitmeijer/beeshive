"use client";

import { useEffect, useRef } from "react";
import { DateBand } from "@/components/booking/DateBand";
import { PartyBand } from "@/components/booking/PartyBand";
import { TimeBand } from "@/components/booking/TimeBand";
import type { Locale } from "@/i18n/config";
import type { BookingRules } from "@/lib/openingHours";
import type { DayFacts, Horizon } from "@/lib/bookingFlow";

/**
 * Screen one: when, and nothing else.
 *
 * Three bands, exactly one of them open, and — this is the part that is a rule
 * rather than a style — no band below an unanswered one exists in the document
 * at all. Not hidden, not `display:none`, not present with `aria-hidden`:
 * absent. A guest choosing an evening cannot tab into a name field, a screen
 * reader cannot find one, and the first paint is ten controls instead of fifty.
 *
 * **There is no identity field anywhere in this file or anything it imports,
 * and there must never be one.** Availability is proved before anybody is asked
 * who they are, which is the one thing every booking system in the research
 * does without exception; here it rests on progressive disclosure rather than
 * on the router, so it is exactly the kind of thing a careless refactor could
 * undo without anybody noticing. tests/lib/bookingFlow.disclosure.test.ts is
 * what notices.
 */

/**
 * Whether the caret has been dropped on the floor of a dialog.
 *
 * Only ever true inside the phone sheet, and only in the one situation this
 * exists for: the back gesture, which unmounts the details screen and mounts
 * this one in its place. Whatever was focused went with the old tree, and a
 * browser answers that by putting focus on `<body>` — silently, with no event
 * to listen for. Inside a modal dialog that is never a state anybody chose: a
 * dialog's whole promise is that the caret is somewhere in it. On the page
 * surface there is no dialog and body focus is simply where a page starts, so
 * the question is not even asked.
 *
 * Focus sitting on some other real element is left exactly where it is. That is
 * the sheet being opened, where the caret is still on the mark that opened it
 * and the sheet's own focus handling is a moment away from moving it.
 */
const strandedInDialog = (node: HTMLElement): boolean => {
  if (!node.closest('[role="dialog"]')) return false;
  const active = document.activeElement;
  return !active || active === document.body;
};

export function WhenAccordion({
  locale,
  days,
  horizon,
  nowMinutes,
  rules,
  guests,
  date,
  time,
  fullSlots,
  phone,
  announcement,
  editing,
  dayLabel,
  dateOnly,
  onGuests,
  onDate,
  onTime,
  onEdit,
  onCalendarOpened,
  onMonthChange,
}: {
  locale: Locale;
  days: DayFacts[];
  horizon: Horizon;
  nowMinutes: number | undefined;
  rules: BookingRules;
  guests: number;
  date: string;
  time: string;
  fullSlots: ReadonlySet<string>;
  phone?: string;
  /** The one live region on this screen, owned by the flow above. */
  announcement: string;
  /** Which answered band the guest has asked to change, if any. */
  editing: "date" | "time" | null;
  dayLabel: (iso: string) => string;
  dateOnly: (iso: string) => string;
  onGuests: (guests: number) => void;
  onDate: (iso: string, via: "chip" | "calendar") => void;
  onTime: (time: string) => void;
  onEdit: (band: "date" | "time" | null) => void;
  onCalendarOpened: () => void;
  onMonthChange: (month: string) => void;
}) {
  const dateOpen = !date || editing === "date";
  // Nothing below an unanswered band. While the date is being changed the date
  // is unanswered, whatever was chosen a moment ago, so the time band goes with
  // it — which is also right on its own terms, because a different day is a
  // different evening and the sittings on it have to be asked about again.
  const timePresent = Boolean(date) && !dateOpen;
  const timeOpen = timePresent && (!time || editing === "time");

  /**
   * Whether the guest has actually pressed anything in here.
   *
   * A band opens for two quite different reasons and only one of them is a
   * guest doing something. Pressing a chip, a "wijzig", a party tile: those
   * open a band under somebody's finger and the caret should follow it. But the
   * flow also answers the address it was opened at — /reserveren?n=2&d=… , which
   * is where the details screen sends people back to — and that fills the date
   * in from the query string a moment after the first paint, which opens the
   * time band exactly as a press would. Focus went with it: somebody arriving
   * at that link was put on "Hoe laat" three hundred milliseconds in, halfway
   * down a page still scrolled to the top, having never seen the masthead.
   *
   * Recorded in the capture phase on the form itself, so it is true before any
   * handler inside has run and before the render it causes. `change` is in the
   * list for the "6+" menu, which is the one control here that can be answered
   * without a click ever reaching us.
   */
  const pressed = useRef(false);
  const noteAPress = () => {
    pressed.current = true;
  };

  /**
   * The caret follows the band that opened, and so does the viewport.
   *
   * Correct rather than intrusive, because the control that was just pressed
   * has been replaced by a one-line summary and focus would otherwise be
   * orphaned in the middle of a page that has changed shape underneath it. The
   * scroll only happens when the heading is not already fully on screen —
   * moving a page that did not need moving is the thing people mean when they
   * say an interface "jumped".
   *
   * Arriving is not a band opening, which is what `previous === ""` catches —
   * with one exception, and it is the phone sheet's back gesture. That mounts
   * this screen fresh in a dialog whose caret has just been thrown away with
   * the details screen, and leaving it on `<body>` means the next Tab starts at
   * the top of the document behind the sheet. So on arrival the caret is taken
   * only when it is genuinely lying on the floor; every other time it is taken
   * only when somebody pressed something.
   */
  const dateHeading = useRef<HTMLHeadingElement>(null);
  const timeHeading = useRef<HTMLHeadingElement>(null);
  const open = timeOpen ? "time" : dateOpen ? "date" : "";
  const settled = useRef<string>("");
  useEffect(() => {
    const previous = settled.current;
    settled.current = open;
    if (!open || previous === open) return;
    const heading = open === "time" ? timeHeading.current : dateHeading.current;
    if (!heading) return;
    const arrived = previous === "";
    if (arrived ? !strandedInDialog(heading) : !pressed.current) return;
    heading.focus({ preventScroll: true });
    /**
     * "Already on screen" has to mean on screen where somebody can read it.
     *
     * This asked whether the heading was inside the viewport, and the top of
     * the viewport is not visible: a sticky bar sits over it, and on the
     * landing page a notification banner can sit over that. A heading nine
     * pixels down therefore satisfied `top >= 0`, this returned early
     * congratulating itself, and the reader pressed a day and got a band whose
     * own title was behind the chrome. Driven ten times as a guest would, two
     * of the ten settled exactly there — which is the sort of proportion that
     * gets called flaky and is really an off-by-a-header.
     *
     * The number is read off `scroll-padding-top`, which globals.css already
     * computes from the banner, the bar and the status strip. Reading it rather
     * than re-deriving it is the point: it is the same value the browser itself
     * will use to place the heading when `scrollIntoView` runs a few lines
     * down, so the question "is it clear of the chrome?" and the answer "put it
     * clear of the chrome" cannot drift apart. A stylesheet that has not
     * arrived yet parses as NaN, which falls back to nought — the behaviour
     * this had before, rather than an exception.
     */
    const clearance =
      Number.parseFloat(
        getComputedStyle(document.documentElement).scrollPaddingTop,
      ) || 0;
    const box = heading.getBoundingClientRect();
    if (box.top >= clearance && box.bottom <= window.innerHeight) return;
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)")
      .matches;
    heading.scrollIntoView({
      block: "start",
      behavior: still ? "auto" : "smooth",
    });
  }, [open]);

  return (
    <form
      // Nothing is submitted from this screen; the last answer navigates. It is
      // still a form because the party tiles and the sittings are real radios,
      // and radios belong to a form whether one is written round them or not —
      // the browser will find the nearest one, and being explicit about which
      // is better than finding out.
      onSubmit={(e) => e.preventDefault()}
      onClickCapture={noteAPress}
      onKeyDownCapture={noteAPress}
      onChangeCapture={noteAPress}
      className="relative"
    >
      {/* One polite region for the whole screen, reused rather than one per
          band: two live regions on a page take turns interrupting each other,
          and what a guest hears is the second half of both sentences. */}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <PartyBand
        locale={locale}
        value={guests}
        rules={rules}
        onChange={onGuests}
      />

      <div className="rule-ink mt-8" aria-hidden="true" />

      <DateBand
        locale={locale}
        days={days}
        horizon={horizon}
        nowMinutes={nowMinutes}
        rules={rules}
        value={date}
        guests={guests}
        dayLabel={dayLabel}
        dateOnly={dateOnly}
        expanded={dateOpen}
        onPick={onDate}
        onEdit={() => onEdit("date")}
        onCalendarOpened={onCalendarOpened}
        onMonthChange={onMonthChange}
        headingRef={dateHeading}
      />

      {timePresent ? (
        <>
          <div className="rule-ink" aria-hidden="true" />
          <TimeBand
            locale={locale}
            days={days}
            horizon={horizon}
            nowMinutes={nowMinutes}
            rules={rules}
            date={date}
            value={time}
            guests={guests}
            fullSlots={fullSlots}
            phone={phone}
            dayLabel={dayLabel}
            dateOnly={dateOnly}
            expanded={timeOpen}
            onPick={onTime}
            onEdit={() => onEdit("time")}
            onPickDate={(iso) => onDate(iso, "chip")}
            headingRef={timeHeading}
          />
        </>
      ) : null}

      <div className="rule-ink" aria-hidden="true" />

      {/* The whole of the old first screen's explaining, reduced to nothing.
          Four hint paragraphs used to stand under these bands — what grey
          means, to pick a date first, which hours the day keeps, what would be
          shown once a date was chosen — and every one of them existed to
          describe a control the guest could see but could not yet use. A band
          that does not exist until it can be answered has nothing to explain,
          which is why there is nothing printed here at all. */}
    </form>
  );
}
