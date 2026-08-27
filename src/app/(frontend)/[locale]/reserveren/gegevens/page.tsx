import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TornEdge } from "@/components/TornEdge";
import { getSiteSettings } from "@/lib/payload";
import { buildMetadata } from "@/lib/metadata";
import { loadForDay } from "@/lib/capacity";
import { loadSchedule } from "@/lib/schedule";
import {
  dateAfter,
  nowMinutesInAmsterdam,
  resolveBookingRules,
  slotsFor,
  todayInAmsterdam,
} from "@/lib/openingHours";
import { formatDayLabel } from "@/lib/bookingFlow";
import { getDict } from "@/i18n/dictionaries";
import { localeHref, parseLocale, type Locale } from "@/i18n/config";
import { GegevensClient } from "./GegevensClient";

/**
 * Screen two: who, on a route of its own.
 *
 * The one boundary every booking system in the research draws without
 * exception, and the reason it is a route rather than a piece of component
 * state: it gives the browser's back button an obvious meaning, it gives the
 * guest a page they can be sent to, and it puts "no identity field before
 * proven availability" in the router where a careless refactor cannot quietly
 * undo it.
 *
 * The address carries a party size, a date and a time and nothing else, ever.
 * Those three are the booking, they are already on the screen the guest just
 * left, and none of them says anything about a person. The name, the e-mail
 * address, the telephone number and the notes live in the browser's memory
 * until they are posted to /api/reserve — never in a URL, which is a thing that
 * lands in a history, a referrer header, a shared link and a server log.
 *
 * Which also means the address is shareable and cacheable, and it will be
 * shared: somebody will paste it into WhatsApp and somebody else will open it
 * three days later against a slot that has gone. So the slot is checked again
 * here, on the server, before the page paints, and a booking that can no longer
 * be made degrades into the same honest answer the accordion would have given —
 * with the way forward being the accordion itself, which has the whole window
 * in front of it and can offer the next day that works.
 */

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const locale = parseLocale((await params).locale);
  if (!locale) return {};
  const s = await getSiteSettings(locale);
  const t = getDict(locale);
  return buildMetadata({
    locale,
    // No canonical and no hreflang: this is a step inside a flow rather than a
    // page anybody should arrive at from a search result, and a crawler that
    // indexed it would be indexing one particular Saturday at half past seven.
    path: null,
    title: t.reserve.metaTitle(s.siteName),
    description: t.reserve.metaDescription(
      s.siteName,
      s.address.area,
      s.address.city,
    ),
    robots: { index: false, follow: true },
  });
}

/** The first of a repeated query parameter, or nothing. */
const one = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? (value[0] ?? "") : (value ?? "");

// Must stay in step with `bg-paper-deep` in tailwind.config.ts, since a torn
// edge is the incoming section's fill painted into the outgoing one.
const PAPER_DEEP = "#E8E2D4";
const LIP_LIGHT = "rgba(255,255,255,0.5)";

export default async function GegevensPage({ params, searchParams }: PageProps) {
  const locale = parseLocale((await params).locale);
  if (!locale) notFound();

  const query = await searchParams;
  const s = await getSiteSettings(locale);
  const t = getDict(locale);
  const rules = resolveBookingRules(s);
  const today = todayInAmsterdam();

  const date = one(query.d);
  const time = one(query.t);

  /**
   * How many are coming, and why a party this page will not take is refused
   * rather than quietly rounded.
   *
   * /api/availability treats an impossible party size as one person on purpose:
   * it only greys out times, and asking about one is the widest question it can
   * ask. This page cannot do that. It prints "Tafel voor 1" at the top of a
   * booking and then takes the guest's name for it, so somebody who arrived on
   * a hand-made link asking for ninety-nine would be shown a table for one and
   * told nothing about it. An absent number is the flow's own default, because
   * that is a link with no opinion; a number that is out of range is an opinion
   * we have to answer.
   */
  const asked = one(query.n);
  const wanted = Number(asked);
  const tooMany =
    asked !== "" &&
    (!Number.isInteger(wanted) || wanted < 1 || wanted > rules.maxPartySize);
  const guests = tooMany || asked === "" ? 2 : wanted;

  const back = `${localeHref(locale, "/reserveren")}?n=${guests}${
    /^\d{4}-\d{2}-\d{2}$/.test(date) ? `&d=${date}` : ""
  }`;

  /**
   * Why this booking cannot be made, in the guest's own language, or nothing at
   * all if it can.
   *
   * Every branch here mirrors a refusal /api/reserve would give, and uses the
   * endpoint's own wording for it, so being turned away before the form and
   * being turned away after it say the same thing about the same problem. The
   * order is the endpoint's too: the shape of the request first, then the day,
   * then the sitting.
   *
   * ## Why a refusal is two things and not one sentence
   *
   * There are two entirely different reasons this page turns somebody away and
   * they want opposite headings. `closed` is the owners having switched online
   * reserveren off in de CMS: nothing is wrong with the link, the form works
   * perfectly, and the only way to a table today really is the telephone.
   * Everything else is `stale` — a party size this café will not take, a date
   * that does not exist or has gone by, an evening past the horizon, a sitting
   * somebody else got to first. There the café is open and taking bookings and
   * the guest is one tap from a table; the only thing wrong is the three values
   * in the address, which is what happens to a URL that gets pasted into
   * WhatsApp and opened on Thursday.
   *
   * All of them wore the telephone heading, which told the second group a plain
   * untruth about the café and sent them looking for a number they did not
   * need. So the reason travels beside the sentence, and the heading and the
   * way out are chosen from it below.
   */
  type Refusal = { reason: "closed" | "stale"; message: string };
  const stale = (message: string): Refusal => ({ reason: "stale", message });

  const refuse = async (): Promise<Refusal | null> => {
    if (s.reservationsEnabled === false) {
      return {
        reason: "closed",
        message: t.reservationForm.errors.reservationsClosed,
      };
    }
    if (tooMany) {
      return stale(t.reservationForm.errors.guestsInvalid(rules.maxPartySize));
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return stale(t.reservationForm.errors.dateInvalid);
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      return stale(t.reservationForm.errors.timeInvalid);
    }
    if (date < today) return stale(t.reservationForm.errors.datePast);
    if (date > dateAfter(today, rules.horizonDays)) {
      return stale(t.reservationForm.errors.dateTooFar(rules.horizonDays));
    }

    const { days } = await loadSchedule(date, date, locale, s);
    const day = days[0];
    if (!day || day.closed) return stale(t.reservationForm.errors.dayClosed);

    // Only today is measured against the clock; every other day is on offer
    // from the moment the doors open.
    const notBefore =
      date === today ? nowMinutesInAmsterdam() + rules.leadMinutes : -1;
    const times = slotsFor(
      day.ranges,
      notBefore,
      rules.slotMinutes,
      rules.lastSittingMinutes,
    );
    if (times.length === 0) return stale(t.reservationForm.errors.dayClosed);
    if (!times.includes(time)) {
      // A time that is on the grid but behind us is a different sentence from
      // one that was never on offer, and a guest opening a link from Tuesday
      // deserves the first rather than the second.
      return stale(
        slotsFor(day.ranges, -1, rules.slotMinutes, rules.lastSittingMinutes).includes(
          time,
        )
          ? t.reservationForm.errors.timePassed
          : t.reservationForm.errors.timeOutsideHours,
      );
    }

    const loads = await loadForDay(date, {
      capacity: s.reservationCapacity,
      durationMinutes: s.reservationDurationMinutes,
      slots: times,
      partySize: guests,
      slotMinutes: rules.slotMinutes,
    });
    if (loads.length > 0 && loads.every((slot) => slot.full)) {
      return stale(t.reservationForm.errors.dayFull);
    }
    return loads.find((slot) => slot.time === time)?.full
      ? stale(t.reservationForm.errors.slotFull)
      : null;
  };

  const refusal = await refuse();

  return (
    <>
      {/* The same sheet the accordion is printed on, so crossing the boundary
          between the two screens does not read as arriving somewhere else —
          but shorter than /reserveren's, and deliberately. This is the second
          screen of a flow rather than a page anybody arrives at cold, and a
          hero the height of the one they have just scrolled past would push
          the three fields below the fold to say something they have read. The
          top padding is what clears the fixed masthead and nothing more. */}
      <section className="relative flex items-end overflow-hidden bg-paper">
        <div className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-8 pt-24 md:px-12 md:pb-10 lg:px-20">
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

      <section className="section-padding relative overflow-hidden bg-paper-deep">
        <div className="mx-auto max-w-xl">
          {refusal ? (
            /* The way forward is the accordion, and deliberately: it holds the
               whole window and can offer the next day that works, which this
               page would have to fetch a second time to do worse.

               Unless there is no accordion to go back to. When online booking
               is switched off, /reserveren prints the telephone number where
               the form would have been, so a link labelled "kies een andere dag
               of tijd" would lead to a page with neither on it — and the
               telephone line below is already the whole answer. */
            <div>
              <h2 className="font-display text-2xl text-hive-800">
                {refusal.reason === "closed"
                  ? t.reservationForm.closedHeading
                  : t.reservationForm.degradedHeading}
              </h2>
              <p className="mt-4 max-w-prose leading-relaxed text-hive-500">
                {refusal.message}
              </p>
              {refusal.reason === "stale" ? (
                <Link href={back} className="ink-link mt-6 inline-block">
                  {t.reservationForm.pickAnotherSlot}
                </Link>
              ) : null}
              {s.phone ? (
                <p className="mt-6 text-sm text-hive-400">
                  {t.reservationForm.callUs}{" "}
                  <a
                    href={`tel:${s.phone.replace(/\s/g, "")}`}
                    className="ink-link"
                  >
                    {s.phone}
                  </a>
                </p>
              ) : null}
            </div>
          ) : (
            <GegevensClient
              locale={locale as Locale}
              guests={guests}
              date={date}
              time={time}
              dayLabel={formatDayLabel(date, t.weekdays, t.months, today)}
              rules={rules}
              backHref={back}
            />
          )}
        </div>
      </section>
    </>
  );
}
