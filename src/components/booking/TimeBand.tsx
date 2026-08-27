"use client";

import { useEffect, useId, useRef, useState } from "react";
import { BandSummary } from "@/components/booking/BandSummary";
import { DayChip } from "@/components/booking/DayChip";
import { getDict } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import type { BookingRules } from "@/lib/openingHours";
import {
  emptyDayLine,
  timeAnswer,
  type DayFacts,
  type Horizon,
} from "@/lib/bookingFlow";

/**
 * One hour of a service, with the sittings that fall inside it.
 *
 * Walked in order rather than bucketed into a map, for the same reason
 * `sittings()` walks its ranges: order is meaning here. The list arrives
 * already sorted, an hour's quarters are always adjacent in it, and a gap in
 * the middle of a service — an afternoon the kitchen is shut — has to survive
 * into what is drawn rather than being tidied away by a lookup table.
 */
export function hourRows(times: string[]): { hour: string; times: string[] }[] {
  const rows: { hour: string; times: string[] }[] = [];
  for (const time of times) {
    const hour = time.slice(0, 2);
    const last = rows[rows.length - 1];
    if (last && last.hour === hour) last.times.push(time);
    else rows.push({ hour, times: [time] });
  }
  return rows;
}

/**
 * The minute mark of a sitting: the "15" of "19:15".
 *
 * One reading of the field rather than two, which is worth a named function
 * for the reason the two readings were different. The column key took
 * `slice(3, 5)` and the chip's own label took `slice(3)`, and on every string
 * the CMS grid produces — five characters, "HH:MM" — those are the same
 * answer, so nothing ever misbehaved. The day something hands this band a time
 * with seconds on it they part company: the chip is still placed in the
 * quarter-past column, correctly, and prints ":15:00" inside it. The half that
 * breaks is the half a guest can see, and the half that goes on working is the
 * half that would have made it obvious.
 */
const minuteOf = (time: string) => time.slice(3, 5);

/**
 * The minute marks the whole day is offered on, in order: 00, 15, 30, 45.
 *
 * Gathered across every service rather than per hour, because they become the
 * columns the quarters are printed in and columns that shifted from one row to
 * the next would give up the only thing this layout is for. Once every :15 in
 * the evening sits under every other :15, a guest who wants quarter past can
 * read straight down one column, and an hour missing its quarter past shows it
 * as a gap in that column instead of asking anybody to compare five-character
 * numbers.
 *
 * It is read off the times rather than assumed to be the four quarters,
 * because the grid is the owners' to set: the CMS offers quarter-hours and
 * half-hours, and a half-hour evening should print in two columns rather than
 * four with every other one empty.
 *
 * Which is why the sittings that have gone are handed in beside the ones that
 * are left, and why that argument is required rather than optional. The grid a
 * day is *offered* on is a property of the day; what is still free is a
 * property of the diary, and it changes all afternoon. Read off the free
 * sittings alone — as this was — a Saturday whose every quarter to had been
 * taken by half past six answered "three columns", the whole band reflowed
 * around the missing one, and the alignment the layout exists for shifted under
 * a reader who had done nothing but wait. Taken and free together are the marks
 * the owners set, so quarter to keeps its column all day and an hour that has
 * lost it prints a hole there — which is the behaviour every comment about
 * these columns already promised.
 */
export function quarterColumns(
  sittings: { times: string[] }[],
  taken: readonly string[],
): string[] {
  const marks = new Set<string>();
  for (const sitting of sittings) {
    for (const time of sitting.times) marks.add(minuteOf(time));
  }
  for (const time of taken) marks.add(minuteOf(time));
  return [...marks].sort();
}

/**
 * What time, and the four ways there is no answer.
 *
 * Every bookable sitting the CMS grid produces is drawn — nothing here is
 * behind a second tap, and that is the rule the whole band is built to. The
 * alternative considered and rejected was an hour-first drill-down, four
 * quarters revealed once you press an hour, and the owners turned it down in
 * one sentence: tapping an hour and then finding the time you wanted is not
 * there is a disappointment you have paid for. So the evening is on the screen,
 * all of it, before the guest commits to anything.
 *
 * What changed is how it is read. On a long Saturday — eleven in the morning
 * until nine at night, on the quarter — that is thirty-seven sittings, and as a
 * grid of thirty-seven near-identical chips it is a keypad: every number has to
 * be read before any of them can be dismissed. But there are only ten hours in
 * it. So the hour is the unit. It is set large in the left margin in the house
 * numerals, and its quarters are ruled off to the right of it in fixed columns,
 * one column per minute mark the day uses. The eye runs down ten numerals and
 * stops at the one it wants; the quarters are read once, at the end, along a
 * single line. The help text under `reservationSlotMinutes` says in the owners'
 * own words why the quarters exist — arrivals spread across the kitchen's worst
 * hour — so a presentation layer that quietly collapsed them to half hours
 * would be undoing an operational decision they made on purpose. This one
 * collapses nothing: it prints all thirty-seven and asks the reader to parse
 * ten.
 *
 * The hours are grouped by the day's own services, headed by the hours of each
 * — "17:00 – 21:00" — which is also how the opening hours get onto the screen
 * now that the hint paragraph under the old list is gone. No lunch/dinner
 * taxonomy had to be invented, and a split Sunday keeps its afternoon gap,
 * which is the single most useful thing on the screen for somebody deciding
 * between the two halves of it.
 *
 * A sitting that is gone is named in a sentence — "Vol om 19:00 en 19:30." —
 * rather than drawn as forty grey chips. Everything visible can be pressed.
 * That is the one place this departs from the old form, which drew the taken
 * sittings struck through: on a phone, forty targets of which thirty are
 * refusals is a wall, and the sentence says the same thing without asking
 * anybody to press it. The columns quietly say it a second time and earlier:
 * the hour that has lost its half past prints with a hole where half past
 * would have been, so the shape of the evening is legible before the sentence
 * under it is read.
 *
 * The sentence names every one of them, and on a Saturday with twenty-seven
 * gone that is four lines of small type rather than the one line it is on a
 * quiet Tuesday. Capping it — three times and "en 24 andere" — was the obvious
 * economy and is the wrong one, because the columns cannot be leaned on to
 * carry what the cap would drop. A hole in a column is not the same fact as a
 * taken sitting: the last hour of a service offers only the sittings that fall
 * before the gap the owners set between the final table and closing time, so on
 * an hour cut short by that gap the band prints holes for sittings that were
 * never on offer at all. And an hour that has lost every one of its four has
 * no row on the page to put a hole in. Between those two, the only place a
 * guest can find out that seven o'clock is taken rather than never offered is
 * this line, so it says all of them and pays for it in height at the foot of
 * the band, where the reader who has already found a time never has to go.
 *
 * Each chip carries its own minute mark — ":15", not "15" — so a row reads as
 * one time broken over two sizes of type rather than as a numeral and a
 * quantity. The big numeral itself is `aria-hidden`, and nothing is lost by
 * that: every radio already carries the whole time as its accessible name,
 * "19:15 uur", so a screen reader hears thirty-seven complete times and never
 * the row heading that only a sighted reader needs.
 *
 * Moving along the chips and choosing one are two different acts here, and
 * keeping them apart is the whole reason the radios are worth having. A radio
 * group answers the arrow keys by itself — that is why these are real inputs
 * rather than buttons wearing `role="radio"` — but choosing a sitting is also
 * the last answer of the flow, and the flow leaves for the details screen the
 * moment it has it. Wired straight to `onChange`, as this was, one press of
 * ArrowRight on a Thursday's thirty-seven chips carried the guest off the
 * screen on whichever chip it happened to land on, so a keyboard or a screen
 * reader could not read the evening at all. The arrows therefore move the ink
 * and nothing else, and the booking is made by the deliberate act it is: a
 * click, a tap, or Enter or Space on the chip that has been arrived at.
 *
 * Enter and Space are both answered on the keydown below. The sentence above
 * promised as much for months while only Enter delivered on it, which is the
 * more embarrassing half of this. Space fell through a handler that
 * returned early on every key but Enter, and the click Chrome makes when Space
 * checks a radio is not made when the radio is already checked — which is
 * precisely the state the arrows leave the chip in. So the key most people
 * press to take the thing they have just arrowed to did nothing whatever: no
 * navigation, no message, no event to find. That is the second time this
 * component has swallowed a keyboard path in silence, and both times the chip
 * simply read from outside as something that was not a control after all.
 *
 * The arrows walk the sittings in time order — ArrowDown from quarter to
 * twelve lands on twelve o'clock, not on quarter to one — and now that the
 * quarters stand in columns, that is worth saying out loud rather than leaving
 * to be discovered. It is deliberate. A radio group steps through its members
 * in document order, the document order here is the order of the day, and the
 * order of the day is what the list is about. Rebinding ArrowDown to mean "an
 * hour later, in the same column" would spend the native behaviour every
 * assistive technology already knows how to announce on a movement nobody
 * making a booking asks for: a guest arrowing off half past six wants the next
 * time they could eat, not half past seven. The columns are an aid to the eye,
 * which reads in two dimensions. The keys follow the clock, which has one.
 */
export function TimeBand({
  locale,
  days,
  horizon,
  nowMinutes,
  rules,
  date,
  value,
  guests,
  fullSlots,
  phone,
  dayLabel,
  dateOnly,
  expanded,
  onPick,
  onEdit,
  onPickDate,
  headingRef,
}: {
  locale: Locale;
  days: DayFacts[];
  horizon: Horizon;
  nowMinutes: number | undefined;
  rules: BookingRules;
  date: string;
  value: string;
  guests: number;
  fullSlots: ReadonlySet<string>;
  phone?: string;
  dayLabel: (iso: string) => string;
  dateOnly: (iso: string) => string;
  expanded: boolean;
  onPick: (time: string) => void;
  onEdit: () => void;
  /** The way forward out of every dead end: the next day that can take them. */
  onPickDate: (iso: string) => void;
  headingRef?: React.Ref<HTMLHeadingElement>;
}) {
  const t = getDict(locale).reservationForm;
  const name = useId();
  const headingId = useId();

  /**
   * The chip the ink is on, which is not yet the chip that is being booked.
   *
   * A radio group has exactly one checked member and the browser moves it on
   * every arrow key, so this is the only state that can follow the arrows
   * without anything happening. `value` is the committed answer the flow holds;
   * this is where the guest is currently standing. They start as the same
   * thing, and they part company for as long as somebody is reading down the
   * evening — which is precisely the interval that used to be impossible.
   */
  const [choice, setChoice] = useState(value);
  useEffect(() => setChoice(value), [value]);

  /**
   * What the reader last did, so a click can be told apart from a key press.
   *
   * A browser may dispatch a click of its own when an arrow key moves a radio
   * group — Chrome does — and it is the same event a mouse produces, not to be
   * told apart from one after the fact: `detail` is 0 for a screen reader's tap
   * as well, so it decides nothing. What can be known is what came immediately
   * before it: an arrow key, or a pointer going down. On a browser that fires
   * no such click there is simply nothing to ignore. Held as the raw key rather
   * than a flag so Enter and Space can be recognised too, which matters
   * because both of them are answered below: a browser that also synthesised a
   * click out of one of them would otherwise book the table twice.
   */
  const lastKey = useRef<string | null>(null);
  /**
   * Reads the guard and spends it in the same breath, and the spending is the
   * part that matters.
   *
   * One arrow key produces at most one click of the browser's own making, so
   * once that click has been swallowed there is nothing left to suppress. An
   * earlier version only read the ref and never cleared it, which left the band
   * armed to ignore the *next* click too — indefinitely, until some pointerdown
   * or non-arrow key happened along to reset it.
   *
   * That sounds harmless and is not, because of who it lands on. A mouse is
   * fine: a pointer going down clears the ref before its own click. Enter and
   * Space are fine: both are answered on their own path. What breaks is an
   * assistive technology that activates a control by synthesising a bare click
   * with no pointer and no key in front of it — which is how some screen
   * readers press a button. Arrow along the row the way a reader does, then
   * activate, and the chip did nothing at all. Silently: no navigation, no
   * event, no message. That is precisely the pass this whole guard was written
   * to make possible, failing for the one population it was written for.
   */
  const fromKey = () => {
    const key = lastKey.current;
    lastKey.current = null;
    return (
      key !== null &&
      (key.startsWith("Arrow") || key === "Enter" || key === " ")
    );
  };

  if (!expanded) {
    return (
      <BandSummary
        label={t.timeLegend}
        answer={value}
        change={t.changeAnswer}
        changeLabel={t.changeLabel(t.timeLegend)}
        onChange={onEdit}
      />
    );
  }

  const answer = timeAnswer(
    date,
    days,
    horizon,
    nowMinutes,
    rules,
    fullSlots,
  );

  /** The one way out of a dead end, printed the same way in all of them. */
  const next = "next" in answer ? answer.next : null;
  const wayForward = next ? (
    <div className="mt-5">
      <p className="text-sm text-hive-400">{t.nextOpenLead}</p>
      <div className="mt-1">
        <DayChip
          name={dayLabel(next).split(" ")[0]}
          date={dateOnly(next)}
          label={dayLabel(next)}
          onPick={() => onPickDate(next)}
        />
      </div>
    </div>
  ) : null;

  /* One set of columns for the whole day, so that every quarter past in the
     evening stands in the same place on the page. Computed here rather than
     inside the map for that reason: per service it would drift, and a Sunday
     whose lunch runs on the half hour and whose dinner runs on the quarter
     would print two different grids under one heading.

     Both halves of the day go in — what is free and what has gone — because
     between them they are the grid the owners set, and the grid is what must
     not move while somebody is reading it. */
  const columns =
    answer.kind === "times"
      ? quarterColumns(answer.sittings, answer.full)
      : [];

  return (
    <div className="py-4">
      <h2
        id={headingId}
        ref={headingRef}
        tabIndex={-1}
        /* The band opening scrolls this heading to the top of the viewport,
           and the top of the viewport on this site is under a bar five rem
           deep — so it is a fair question whether this wants a
           `scroll-margin-top` to sit clear of it. It does not, and the answer
           is worth writing down because the question comes back.

           `scroll-padding-top` on <html> already reserves the chrome for
           anything scrolled to on this site, `scrollIntoView` included, and it
           is honoured: when the band is scrolled to on a 390-wide phone this
           heading lands at 96px, sixteen clear of the bar, with all ten hours
           of a Saturday on the screen beneath it. Give the element a margin as
           well and the two add — the same open lands it at 192px, a
           chrome-height of empty paper above the answer.

           An earlier version of this note claimed 96px was simply where every
           opening landed, and driving it ten times as a guest would said
           otherwise: four openings at 96, three at 354, two at 9, one left
           alone at 568. The two at 9 were the bug, and they were not a race —
           WhenAccordion decided the heading was already on screen because it
           was inside the viewport, and the top eighty pixels of this viewport
           are behind a bar. That test now measures against the same
           `scroll-padding-top` this paragraph is about, so "visible" and
           "scrolled clear" are one number rather than two.

           What a margin cannot fix is the case that prompted the question: a
           guest who flicks the block to the very top of the screen themselves
           puts this heading at 16px, under the bar. Nothing in the scroll
           properties reaches a scroll a person performs by hand, and every
           sticky header on the web behaves this way. The band is scrolled to
           for them, correctly, and on a phone tall enough to hold the evening
           there is no reason to flick at all. */
        className="label outline-none"
      >
        {t.timeLegend}
      </h2>

      {answer.kind === "beyond_horizon" ? (
        <p className="mt-3 max-w-prose leading-relaxed text-hive-500">
          {t.beyondHorizon(dayLabel(horizon.last))}
        </p>
      ) : answer.kind === "day_closed" || answer.kind === "day_over" ? (
        <>
          {/* Two sentences, because they are two days. `day_closed` is the
              doors not opening at all; `day_over` is an evening the café is
              open on and has stopped taking bookings for — tonight after the
              last sitting, or a day the gap before closing has eaten whole.
              Saying "we zijn dicht" about the second is the kind of untruth a
              guest acts on by staying at home, so `timeAnswer` keeps them
              apart and this prints whichever it was handed. Everything else
              below is shared: the owners' note is theirs either way, and both
              of them want the next day that can take the table. */}
          <p className="mt-3 max-w-prose leading-relaxed text-hive-500">
            {t[emptyDayLine(answer.kind)](dayLabel(date))}
          </p>
          {/* The owners' own line about this day, printed verbatim and before
              anything else we have to say. "Gesloten wegens het personeelsfeest"
              is the warmest sentence in the whole flow and it is theirs. */}
          {answer.note ? (
            <p className="mt-2 max-w-prose italic leading-relaxed text-hive-500">
              {answer.note}
            </p>
          ) : null}
          {wayForward}
        </>
      ) : answer.kind === "day_full" ? (
        <>
          {/* The party size is in the sentence, and it has to be: a Saturday
              full for six is very often open for two, and "we zitten vol" on
              its own turns away a table the café could have taken. */}
          <p className="mt-3 max-w-prose leading-relaxed text-hive-500">
            {t.dayFullForParty(dayLabel(date), t.people(guests))}
          </p>
          {/* The one place in the flow where the telephone outranks the form.
              The diary shows what is booked, not what the owners can shuffle. */}
          {phone ? (
            <p className="mt-2 max-w-prose leading-relaxed text-hive-500">
              {t.callUs}{" "}
              <a href={`tel:${phone.replace(/\s/g, "")}`} className="ink-link">
                {phone}
              </a>
            </p>
          ) : null}
          {wayForward}
        </>
      ) : (
        /* Named by the band's own heading rather than by a visually hidden
           legend saying the same words: two names for one group is two
           announcements, and what a guest hears is "Hoe laat, hoe laat". */
        <fieldset
          aria-labelledby={headingId}
          className="mt-3 border-0 p-0"
          // Capture, so both of these are already true by the time the input's
          // own handlers run: the browser fires keydown and then, as the
          // default action of it, the change and the click.
          onKeyDownCapture={(event) => {
            lastKey.current = event.key;
          }}
          onPointerDownCapture={() => {
            lastKey.current = null;
          }}
        >
          {answer.sittings.map((sitting) => (
            <div key={sitting.key} className="mt-6 first:mt-0">
              {sitting.heading ? (
                <h3 className="label figures-old">{sitting.heading}</h3>
              ) : null}
              <div className="mt-2">
                {hourRows(sitting.times).map((row) => (
                  /* The hour and its quarters on one line, the numeral hanging
                     in the margin the way a side-head hangs beside a paragraph
                     rather than sitting on top of it. Ten of those is a third
                     of the height that ten headings with rows underneath them
                     would have taken, which on a phone is the difference
                     between a card and a scroll.

                     Centred rather than baseline-aligned, and that is the
                     alignment that actually looks right here: the chips are
                     three-rem boxes with their text in the middle of them, so
                     centring a numeral of a different size in the same row
                     puts the two on very nearly the same line. Asking flexbox
                     for baselines instead would align the numeral to whatever
                     the grid beside it decided its own baseline was, which is
                     a different answer on an hour with one sitting in it. */
                  <div key={row.hour} className="mt-3 flex items-center gap-2.5 first:mt-0">
                    <span
                      aria-hidden="true"
                      className="figures-old w-8 shrink-0 text-right font-display
                                 text-2xl font-semibold leading-none text-hive-700"
                    >
                      {row.hour}
                    </span>
                    <div
                      /* A timetable column is a column whatever else the day
                         is doing, so the track has a width of its own rather
                         than a share of what is left over. `1fr` gave every
                         column an equal share of the row, which reads
                         perfectly while there are four of them and falls apart
                         at one: a day the owners have set on the hour printed
                         a single chip three hundred pixels wide on a phone and
                         six hundred on a desk, ":00" marooned in the middle of
                         it with a hand's breadth of empty paper between the
                         numeral and the mark. It did not look like a timetable
                         with one column. It looked like something had gone
                         wrong. A quarter-hour evening picked over until only
                         one sitting an hour was left used to arrive at the
                         same place, by the other route this pair of changes
                         closes: it now keeps its four columns and prints three
                         holes, which is the true thing to say about it.
                         `minmax(0, 4.5rem)` is a maximum rather than a size,
                         so the tracks still give ground on a narrow screen —
                         at 390 the four columns settle at the sixty-nine
                         pixels they always had — and stop growing on a wide
                         one, where the same day used to spread its chips to a
                         hundred and forty. One chip is now the width of one
                         chip in every day the CMS can produce, and a day with
                         one column reads as deliberately as a day with four. */
                      className="grid flex-1 gap-2"
                      style={{
                        gridTemplateColumns: `repeat(${columns.length}, minmax(0, 4.5rem))`,
                      }}
                    >
                      {row.times.map((time) => (
                        <label
                          key={time}
                          className="block cursor-pointer"
                          /* Placed by the minute it is rather than by the
                             order it arrived in, which is the whole of how a
                             taken sitting shows up: quarter past is drawn in
                             the quarter-past column or the column is left
                             empty, and either way the ten rows line up. */
                          style={{
                            gridColumnStart: columns.indexOf(minuteOf(time)) + 1,
                          }}
                        >
                          <input
                            type="radio"
                            name={name}
                            value={time}
                            checked={choice === time}
                            aria-label={t.timeOption(time)}
                            // Moving, not choosing. Everything the arrows do ends
                            // here, on the ink and on what is announced.
                            onChange={() => setChoice(time)}
                            // Choosing. A pointer and a screen reader's tap both
                            // arrive as a click, which is exactly the deliberate
                            // press this is waiting for. A click the browser made
                            // for itself out of a key — an arrow moving the group,
                            // or Space checking a chip that was not checked — is
                            // not, and is dropped here because the key it came
                            // from has already been answered below.
                            onClick={() => {
                              if (!fromKey()) onPick(time);
                            }}
                            // The two keys that mean yes, answered together and
                            // cancelled together, because between them they cover
                            // every way a browser declines to hand this a plain
                            // click. Enter never reaches the click above at all:
                            // inside a form it is implicit submission, which this
                            // screen cancels, so without this the press would go
                            // looking for a submit button and find none. Space is
                            // the opposite shape of the same problem — it does
                            // produce a click, but only when it has a radio to
                            // check, and after the arrows have moved the ink the
                            // chip under the caret is already checked. So on the
                            // one chip a keyboard user is most likely to press it
                            // on, Space produced nothing at all.
                            //
                            // Cancelling is what keeps it to a single booking:
                            // the default action of Space on an unchecked radio
                            // is the check and the click that follows it, and
                            // preventing it here means the browser has nothing
                            // left to synthesise. `fromKey` above is the second
                            // line of that defence, for a browser that fires the
                            // click regardless. Nothing is lost by cancelling the
                            // check, either: this commits, and a committed answer
                            // comes straight back down as `value`.
                            onKeyDown={(event) => {
                              if (event.key !== "Enter" && event.key !== " ") {
                                return;
                              }
                              event.preventDefault();
                              onPick(time);
                            }}
                            className="peer sr-only"
                          />
                          <span
                            aria-hidden="true"
                            /* Two bands, and the outer one is the one that can
                               actually be seen. Gold on this paper is the house's
                               focus ring everywhere else on the site and it is worth
                               about 1.8:1 against the sheet, which is under the 3:1
                               an indicator has to hold — on a chip that is now the
                               only thing telling a keyboard user which of thirty-
                               seven sittings they are standing on, that is not a
                               style question. So the gold stays where it is and a
                               hair of heading ink is laid immediately outside it: the
                               mark still reads as ours, and what carries it is the
                               band with the contrast rather than the band with the
                               colour.

                               A step up from the size `.slot-chip` sets, which
                               is deliberate and local to this band: a chip that
                               used to carry five characters now carries three,
                               and at the smaller size three characters in a
                               sixty-nine pixel box read as a caption rather
                               than as the thing to press. */
                            className="slot-chip min-h-[3rem] w-full text-base
                                       peer-hover:peer-[:not(:checked)]:border-honey-400
                                       peer-hover:peer-[:not(:checked)]:bg-hive-700/[0.06]
                                       peer-checked:border-clay-500 peer-checked:bg-clay-500 peer-checked:text-paper
                                       peer-focus-visible:ring-2 peer-focus-visible:ring-honey-400
                                       peer-focus-visible:outline peer-focus-visible:outline-2
                                       peer-focus-visible:outline-offset-2 peer-focus-visible:outline-hive-700"
                          >
                            {`:${minuteOf(time)}`}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {/* Every sitting that has gone, named, however many there are —
              four lines of it on a nearly full Saturday. Small, grey and
              underneath everything that can be pressed, because it is the
              answer to a question only some guests will ask; complete,
              because the columns above cannot answer it for the hours that
              have nothing left at all, and the reasoning for choosing that
              over a cap and a count is in the note at the top of this file. */}
          {answer.full.length > 0 ? (
            <p className="mt-5 text-sm text-hive-400">
              {t.fullAt(t.joinTimes(answer.full))}
            </p>
          ) : null}
        </fieldset>
      )}
    </div>
  );
}
