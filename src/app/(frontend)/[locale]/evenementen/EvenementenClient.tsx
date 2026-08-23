"use client";

import { ScrollReveal } from "@/components/ScrollReveal";
import { SketchBee } from "@/components/SketchBee";
import { TornEdge } from "@/components/TornEdge";
import { EventCard, type AgendaItem } from "@/components/EventCard";
import { getDict } from "@/i18n/dictionaries";
import { type Locale } from "@/i18n/config";

/**
 * The agenda, as one column you scroll.
 *
 * There is no filter bar, no calendar grid and no view switcher, and that is
 * the design rather than an omission. A neighbourhood café has a handful of
 * things on in any given month; anything that asks a visitor to operate a
 * control before they can read what is happening on Friday is working against
 * them. So: months in order, entries under them, and nothing to press.
 *
 * The one genuine editorial decision is what a repeating evening looks like.
 * The Monday buurtbabbel expands to fifteen occurrences inside the window this
 * page asks for, and printing fifteen identical cards would bury every one-off
 * evening between them and make the café look like it does exactly one thing.
 * The server therefore hands down a single card per series — the next date it
 * falls on, plus a few more set small underneath — and it reads as the
 * standing fixture it is. The occurrences that were folded away are not lost:
 * the detail page lists them, and the .ics for the series carries every one.
 *
 * Featured events are marked rather than moved. Hoisting them to the top would
 * mean an evening in November sitting above one next Tuesday under a heading
 * that says November, and a month heading that lies is worse than a missed
 * emphasis.
 */

const TZ = "Europe/Amsterdam";

/**
 * The Amsterdam year and month of an instant. Read through Intl with the
 * timezone named out loud, so the server and the browser cannot land on
 * different months for an event that starts at half past eleven at night.
 */
function monthOf(iso: string): { year: number; month: number } {
  const formatted = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
  }).format(new Date(iso));
  const [year, month] = formatted.split("-").map(Number);
  return { year, month };
}

interface MonthGroup {
  key: string;
  year: number;
  month: number;
  items: AgendaItem[];
}

/** The items are already sorted, so one pass down them is enough. */
function groupByMonth(items: AgendaItem[]): MonthGroup[] {
  const groups: MonthGroup[] = [];
  for (const item of items) {
    const { year, month } = monthOf(item.startIso);
    const key = `${year}-${month}`;
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(item);
    else groups.push({ key, year, month, items: [item] });
  }
  return groups;
}

interface Props {
  /** The dictionary is looked up here rather than passed: it holds functions. */
  locale: Locale;
  items: AgendaItem[];
  /** Resolved on the server, so nothing here has to read the clock. */
  nowIso: string;
  /** The subscribable feed, built server-side with the locale folded in. */
  feedHref: string;
}

export function EvenementenClient({ locale, items, nowIso, feedHref }: Props) {
  const t = getDict(locale);
  const groups = groupByMonth(items);
  const currentYear = monthOf(nowIso).year;

  return (
    <>
      {/* ===== HEAD OF THE SHEET ===== */}
      <section className="relative flex min-h-[38vh] items-end overflow-hidden bg-paper">
        <div className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-12 pt-32 md:px-12 md:pb-16 lg:px-20">
          <p className="label">{t.events.eyebrow}</p>
          <div className="rule-ink my-5 w-14" aria-hidden="true" />
          <h1 className="heading-xl text-hive-800">{t.events.title}</h1>
          <p className="mt-6 max-w-[36rem] text-lg leading-relaxed text-hive-400">
            {t.events.intro}
          </p>
        </div>
        <TornEdge
          color="#E8E2D4"
          lip="rgba(255,255,255,0.5)"
          variant={0}
          className="absolute inset-x-0 bottom-0 z-20"
        />
      </section>

      {/* ===== THE COLUMN ===== */}
      <section className="section-padding relative overflow-hidden bg-paper-deep">
        <div className="mx-auto max-w-6xl">
          {groups.map((group, groupIndex) => (
            <div key={group.key}>
              {/* The month is a printed slug across the sheet, not a tab. The
                  year is dropped inside the current one, where writing it out
                  would only be noise. */}
              <ScrollReveal>
                <div
                  className={`flex items-baseline gap-5 ${
                    groupIndex === 0 ? "" : "pt-14 md:pt-20"
                  }`}
                >
                  <h2 className="label whitespace-nowrap">
                    {group.year === currentYear
                      ? t.months[group.month - 1]
                      : t.events.monthHeading(t.months[group.month - 1], group.year)}
                  </h2>
                  <span className="rule-ink w-full" aria-hidden="true" />
                </div>
              </ScrollReveal>

              {group.items.map((item, i) => (
                <ScrollReveal key={item.id} delay={Math.min(i * 0.08, 0.32)}>
                  {i > 0 && <div className="rule-ink w-full" aria-hidden="true" />}
                  <EventCard locale={locale} item={item} nowIso={nowIso} />
                </ScrollReveal>
              ))}
            </div>
          ))}

          {items.length === 0 && (
            <div className="py-20">
              <SketchBee
                size={44}
                variant={0}
                strokeWidth={1}
                className="text-sage-500/70"
              />
              <div className="rule-ink my-5 w-16" aria-hidden="true" />
              <p className="text-hive-400">{t.events.empty}</p>
            </div>
          )}

          {/* Set as a footnote on purpose: subscribing is the right thing for
              the handful of people who want it and clutter for everyone else. */}
          {items.length > 0 && (
            <ScrollReveal>
              <div className="mt-16 border-t border-hive-200/60 pt-8 md:mt-24">
                <a href={feedHref} className="label ink-link">
                  {t.events.subscribeCalendar}
                </a>
                <p className="mt-3 max-w-[28rem] text-sm text-hive-300">
                  {t.events.subscribeHint}
                </p>
              </div>
            </ScrollReveal>
          )}
        </div>

        {/* No edge here: <Footer> draws its own tear up into this section. */}
      </section>
    </>
  );
}
