"use client";

import { Fragment } from "react";
import Link from "next/link";
import { ReservationForm } from "@/components/ReservationForm";
import { ScrollReveal } from "@/components/ScrollReveal";
import { TornEdge } from "@/components/TornEdge";
import { getDict } from "@/i18n/dictionaries";
import { localeHref, locales, type Locale } from "@/i18n/config";
import type { SiteSettingsData } from "@/lib/payload";

interface Props {
  locale: Locale;
  settings: SiteSettingsData;
  today: string;
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

export function ReserverenClient({ locale, settings: s, today }: Props) {
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
            <ReservationForm
              locale={locale}
              minDate={today}
              openingHours={openingHours}
            />
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
