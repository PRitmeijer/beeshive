import Link from "next/link";
import { Sheet } from "@/components/Sheet";
import { SketchBee } from "@/components/SketchBee";
import { getDict } from "@/i18n/dictionaries";
import { localeHref, localeTags, type Locale } from "@/i18n/config";

/**
 * One entry in the agenda.
 *
 * It is a component rather than markup inside the listing because two very
 * different things end up looking almost the same here: a one-off evening,
 * which has a date, and a standing fixture like the Monday buurtbabbel, which
 * has a habit and merely happens to have a next date. Drawing both from one
 * place is what keeps them recognisably the same kind of object while the
 * left-hand rail says clearly which of the two you are looking at — a numeral
 * for the evening that happens once, a looped mark and a sentence for the one
 * that keeps happening.
 *
 * Everything it receives is a plain value. The card is rendered from inside a
 * client component, and the dates arrive as ISO strings rather than Date
 * objects so that nothing here depends on how a boundary serialises them;
 * they are formatted with an explicit Europe/Amsterdam timezone, exactly as
 * the blog index does, so the server and the browser never disagree about
 * which day an evening near midnight belongs to.
 *
 * No file in this tree may call `new Date()` while rendering. The card is
 * given `nowIso` when a caller wants "Vandaag" and "Morgen" written out, and
 * simply prints the date when it is not.
 */

export interface AgendaImage {
  url: string;
  alt: string;
}

export interface AgendaItem {
  /** The occurrence id from src/lib/events.ts: stable across re-sorts. */
  id: string;
  slug: string;
  title: string;
  excerpt?: string;
  startIso: string;
  endIso?: string;
  allDay: boolean;
  recurring: boolean;
  /** "Elke maandag" and friends, already written out on the server. */
  recurrenceLabel?: string;
  /** The next few dates of a standing fixture, so the card proves its claim. */
  upcomingIso?: string[];
  featured: boolean;
  category?: string;
  location?: string;
  price?: string;
  bookingRequired: boolean;
  image?: AgendaImage;
}

/**
 * A drawn garland: three pennants on a slack string. It hangs where a
 * photograph would have been on an evening nobody has photographed yet, and
 * it is drawn rather than picked from an icon set for the same reason
 * everything else on this site is — one stroke, one weight, taking the ink
 * colour of whatever it sits in.
 */
function GarlandMark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 56"
      width="120"
      height="56"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.1"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d="M3 9 C30 26 90 26 117 8" />
      <path d="M24.5 17.4 L38.5 21.6 L30.2 34.8 Z" />
      <path d="M52.5 23.1 L66.8 24.4 L60.4 38.9 Z" />
      <path d="M80.4 21.3 L94.2 17.2 L91.9 33.2 Z" />
    </svg>
  );
}

/**
 * A loop, for the rail of a repeating evening. Two turns of a spiral rather
 * than a closed circle with an arrowhead: the point is "this keeps going",
 * not "press me".
 */
function LoopMark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 34 26"
      width="34"
      height="26"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d="M28.4 9.6 C27.1 5.2 22.6 2.4 17.6 3.1 C11.9 3.9 8 8.8 8.7 13.9 C9.4 19.1 14.4 22.6 20.1 21.8 C23.6 21.3 26.3 19.3 27.7 16.6" />
      <path d="M24.6 9 L28.9 10 L30.6 6.2" />
    </svg>
  );
}

/** A drawn line-arrow, matching the one at the foot of a blog entry. */
function ArrowMark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 26 8"
      width="26"
      height="8"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d="M0.6 4.1 L23.4 3.9" />
      <path d="M19.6 1 L23.6 4 L19.5 7.1" />
    </svg>
  );
}

/**
 * Which of the three drawn bees an event without a photograph gets. Hashed
 * from the slug rather than taken from the position in the list, because the
 * list reorders itself every time an evening passes and an event that changes
 * its drawing every week looks like a bug.
 */
function beeVariant(slug: string): 0 | 1 | 2 {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) hash = (hash * 31 + slug.charCodeAt(i)) | 0;
  return (Math.abs(hash) % 3) as 0 | 1 | 2;
}

const TZ = "Europe/Amsterdam";

function parts(iso: string, locale: Locale, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(localeTags[locale], {
    timeZone: TZ,
    ...options,
  }).format(new Date(iso));
}

/** The calendar day of an instant, as seen in Amsterdam: "2026-03-04". */
function dayOf(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

interface Props {
  locale: Locale;
  item: AgendaItem;
  /** Resolved on the server; only used to say "Vandaag" and "Morgen". */
  nowIso?: string;
}

export function EventCard({ locale, item, nowIso }: Props) {
  const t = getDict(locale);

  const dayNumber = parts(item.startIso, locale, { day: "numeric" });
  const weekday = parts(item.startIso, locale, { weekday: "long" });
  const monthShort = parts(item.startIso, locale, { month: "short" });
  const time = item.allDay
    ? t.events.allDay
    : parts(item.startIso, locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const fullDate = parts(item.startIso, locale, {
    day: "numeric",
    month: "long",
  });

  // "Vandaag" and "Morgen" only when the caller handed down a moment from the
  // server. Working it out here would mean reading the clock during render.
  let relative: string | null = null;
  if (nowIso) {
    const today = dayOf(nowIso);
    const tomorrow = dayOf(
      new Date(new Date(nowIso).getTime() + 86400000).toISOString(),
    );
    const day = dayOf(item.startIso);
    if (day === today) relative = t.events.today;
    else if (day === tomorrow) relative = t.events.tomorrow;
  }

  const category =
    item.category && item.category in t.events.categories
      ? t.events.categories[item.category as keyof typeof t.events.categories]
      : null;

  return (
    <article className="group py-10 md:py-14">
      <Link
        href={localeHref(locale, `/evenementen/${item.slug}`)}
        className="grid gap-6 md:grid-cols-12 md:gap-8"
      >
        {/* The rail. A repeating evening leads with its habit and mentions a
            date underneath; a one-off leads with the date itself. */}
        <div className="md:col-span-2">
          {item.recurring ? (
            <div className="flex items-baseline gap-4 md:flex-col md:items-start md:gap-3">
              <LoopMark className="shrink-0 text-sage-500" />
              <div>
                <p className="label leading-relaxed">
                  {item.recurrenceLabel ?? t.events.standingFixture}
                </p>
                <p className="figures-old mt-1 text-sm text-hive-400">{time}</p>
                <time
                  dateTime={item.startIso}
                  className="figures-old mt-2 block text-sm text-hive-300"
                >
                  {t.events.nextDate(relative ?? fullDate)}
                </time>
              </div>
            </div>
          ) : (
            <div className="flex items-baseline gap-4 md:flex-col md:items-start md:gap-2">
              <span className="rule-ink hidden w-8 md:block" aria-hidden="true" />
              <time dateTime={item.startIso} className="block">
                <span className="figures-old font-display text-4xl leading-none text-hive-700">
                  {dayNumber}
                </span>
                <span className="label mt-2 block">
                  {monthShort} &middot; {weekday}
                </span>
              </time>
              <p className="figures-old text-sm text-hive-400 md:mt-1">
                {relative ? `${relative} · ${time}` : time}
              </p>
            </div>
          )}
        </div>

        {/* The plate. Same mounted-sheet treatment the blog index uses, so a
            photographed evening and a drawn one sit at the same height. */}
        <div className="md:col-span-4">
          <Sheet tone="paper" edge="soft">
            <figure className="p-2 md:p-2.5">
              {item.image ? (
                <img
                  src={item.image.url}
                  alt={item.image.alt}
                  className="aspect-[4/3] w-full object-cover"
                />
              ) : (
                <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 bg-paper-shade">
                  <GarlandMark className="w-24 text-hive-700/25" />
                  <SketchBee
                    size={46}
                    variant={beeVariant(item.slug)}
                    strokeWidth={1}
                    className="text-sage-500/40"
                  />
                </div>
              )}
            </figure>
          </Sheet>
        </div>

        <div className="md:col-span-6">
          {(category || item.featured) && (
            <p className="label mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
              {category && <span>{category}</span>}
              {category && item.featured && (
                <span aria-hidden="true" className="text-clay-400">
                  &lowast;
                </span>
              )}
              {item.featured && (
                <span className="text-clay-500">{t.events.featured}</span>
              )}
            </p>
          )}

          <h3 className="heading-md text-hive-700 transition-colors duration-700 ease-settle group-hover:text-honey-600">
            {item.title}
          </h3>
          <div className="rule-ink mt-5 w-14" aria-hidden="true" />
          {item.excerpt && (
            <p className="mt-5 max-w-[34rem] leading-relaxed text-hive-400">
              {item.excerpt}
            </p>
          )}

          {/* The proof that a standing fixture really does stand: the next
              handful of dates, set small, rather than fifteen separate cards
              saying the same thing. */}
          {item.recurring && item.upcomingIso && item.upcomingIso.length > 1 && (
            <p className="figures-old mt-5 text-sm text-hive-300">
              <span className="label mr-3">{t.events.nextDates}</span>
              {item.upcomingIso
                .slice(0, 4)
                .map((iso) =>
                  parts(iso, locale, { day: "numeric", month: "short" }),
                )
                .join(" · ")}
            </p>
          )}

          <p className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-hive-300">
            {item.location && <span>{item.location}</span>}
            {item.price && (
              <span>
                {t.events.priceLabel}: {item.price}
              </span>
            )}
            {item.bookingRequired && <span>{t.events.bookingRequired}</span>}
          </p>

          <span className="mt-6 inline-flex items-center gap-3 text-honey-600">
            <span className="label ink-link !text-current group-hover:[background-size:100%_1px]">
              {t.events.readMore}
            </span>
            <ArrowMark className="transition-transform duration-700 ease-settle group-hover:translate-x-1" />
          </span>
        </div>
      </Link>
    </article>
  );
}
