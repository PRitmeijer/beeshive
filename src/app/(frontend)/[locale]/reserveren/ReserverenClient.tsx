"use client";

import { Fragment } from "react";
import Link from "next/link";
import { BookingFlow } from "@/components/booking/BookingFlow";
import { ScrollReveal } from "@/components/ScrollReveal";
import { TornEdge } from "@/components/TornEdge";
import { getDict } from "@/i18n/dictionaries";
import { localeHref, locales, type Locale } from "@/i18n/config";
import type { SiteSettingsData } from "@/lib/payload";
import { EVENTS, track } from "@/lib/umami";
import type { BookingRules, ScheduledDay } from "@/lib/openingHours";

interface Props {
  locale: Locale;
  settings: SiteSettingsData;
  /**
   * Online reserveren is switched off in Site Instellingen. The form is not
   * rendered at all then — the owners' own description of that switch promises
   * the guest is left with the telephone number, and a form that takes eight
   * fields and then says "bel ons" is not that. The three props below are
   * absent in that case, because nothing resolved them.
   */
  closed?: boolean;
  today?: string;
  /** Minutes past midnight in Amsterdam at render time. */
  nowMinutes?: number;
  /**
   * The days the page resolved on the server, with the repeating rules and the
   * afwijkende dagen already folded in. Forwarded straight to the form, which
   * offers exactly these days when it has them and falls back to the seven
   * weekly rows when it does not. `ScheduledDay` rather than `DaySchedule`
   * because this is a client component: the server type lives in
   * src/lib/schedule.ts, which imports Payload.
   */
  schedule?: ScheduledDay[];
  /** The lead time, horizon and largest party, as the page read them. */
  rules?: BookingRules;
}

// Must stay in step with `bg-paper-deep` in tailwind.config.ts, since a torn
// edge is the incoming section's fill painted into the outgoing one.
const PAPER_DEEP = "#E8E2D4";
const LIP_LIGHT = "rgba(255,255,255,0.5)";

/** The whole cell reads "Gesloten" or "Closed", never a time range. */
const CLOSED = /^\s*(gesloten|closed)\s*$/i;

/**
 * The opening hours rows are CMS content, and Payload hands back the Dutch
 * value for as long as the English tab is empty. Recognising the day in either
 * language lets this page print it in the language the reader chose.
 */
function localiseDay(day: string, locale: Locale): string {
  const needle = day.trim().toLowerCase();
  for (const source of locales) {
    const index = getDict(source).weekdays.findIndex(
      (d) => d.toLowerCase() === needle,
    );
    if (index !== -1) return getDict(locale).weekdays[index];
  }
  return day;
}

function localiseHours(hours: string, locale: Locale): string {
  return CLOSED.test(hours) ? getDict(locale).hours.closed : hours;
}

export function ReserverenClient({
  locale,
  settings: s,
  closed = false,
  today,
  nowMinutes,
  schedule = [],
  rules,
}: Props) {
  const t = getDict(locale);
  const openingHours = (s.openingHours || []) as {
    day: string;
    hours: string;
  }[];

  return (
    <>
      {/* ===== HERO: the sheet itself ===== */}
      <section className="relative flex min-h-[38vh] items-end overflow-hidden bg-paper">
        <div className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-12 pt-32 md:px-12 md:pb-16 lg:px-20">
          <p className="label">{t.reserve.eyebrow}</p>
          <div className="rule-ink my-5 w-14" aria-hidden="true" />
          <h1 className="heading-xl text-hive-800">{t.reserve.title}</h1>
        </div>
        <TornEdge
          color={PAPER_DEEP}
          lip={LIP_LIGHT}
          variant={0}
          className="absolute inset-x-0 bottom-0 z-20"
        />
      </section>

      {/* ===== THE FORM =====
           Nothing to read before you can start filling it in. The details a
           caller might want sit in a narrow rail beside it, not in front. */}
      <section className="section-padding relative overflow-hidden bg-paper-deep">
        <div className="mx-auto grid max-w-6xl gap-y-14 md:grid-cols-12 md:gap-x-12 lg:gap-x-16">
          <ScrollReveal className="md:col-span-7">
            {closed ? (
              /* Where the form was. The rail beside it still carries the
                 number and the address, so this says what has changed and
                 leaves the reader to look one column right rather than
                 printing the same two links twice. */
              <div>
                <h2 className="font-display text-2xl text-hive-800">
                  {t.reservationForm.closedHeading}
                </h2>
                <p className="mt-4 max-w-prose leading-relaxed text-hive-500">
                  {t.reservationForm.errors.reservationsClosed}
                </p>
              </div>
            ) : (
              <BookingFlow
                locale={locale}
                minDate={today}
                nowMinutes={nowMinutes}
                openingHours={openingHours}
                schedule={schedule}
                rules={rules}
                /* For the two dead ends, where ringing beats filling anything
                   in, and for the branch that appears if the owners switch
                   online booking off while this cached page is open. */
                phone={s.phone ?? undefined}
                email={s.contactEmail}
                /* The page, as opposed to the sheet on phones. `entry` is left
                   at its default: whoever pressed a Reserveren button
                   elsewhere on the site was carried here by a navigation, and
                   this page cannot tell them apart from somebody who arrived
                   on the URL, so it does not pretend to. */
                surface="page"
              />
            )}
          </ScrollReveal>

          <ScrollReveal delay={0.12} className="md:col-span-4 md:col-start-9">
            <div className="space-y-8 text-hive-500">
              <div>
                <h2 className="label">{t.reserve.directHeading}</h2>
                <p className="mt-3 leading-relaxed">{t.reserve.directText}</p>
                <div className="mt-4 space-y-1">
                  {s.phone && (
                    <a
                      href={`tel:${s.phone.replace(/\s/g, "")}`}
                      onClick={() =>
                        track(EVENTS.outboundClicked, {
                          kind: "phone",
                          surface: "reserveren",
                        })
                      }
                      className="ink-link block"
                    >
                      {s.phone}
                    </a>
                  )}
                  <a href={`mailto:${s.contactEmail}`} className="ink-link block">
                    {s.contactEmail}
                  </a>
                </div>
              </div>

              {openingHours.length > 0 && (
                <div>
                  <h2 className="section-bar">{t.hours.heading}</h2>
                  <dl className="mt-5 grid grid-cols-[1fr_auto] gap-x-8 gap-y-2.5 text-sm">
                    {openingHours.map((h) => (
                      <Fragment key={h.day}>
                        <dt className="text-hive-500">
                          {localiseDay(h.day, locale)}
                        </dt>
                        <dd className="figures-old text-right text-hive-400">
                          {localiseHours(h.hours, locale)}
                        </dd>
                      </Fragment>
                    ))}
                  </dl>
                  {/* Exceptions the week grid cannot hold, such as the extra
                      Sunday at the end of the month. */}
                  {s.openingHoursNote ? (
                    <p className="mt-4 text-sm italic leading-snug text-hive-400">
                      {s.openingHoursNote}
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          </ScrollReveal>
        </div>
      </section>
    </>
  );
}
