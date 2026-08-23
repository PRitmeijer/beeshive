"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { ScrollReveal } from "@/components/ScrollReveal";
import { Sheet } from "@/components/Sheet";
import { SketchBee } from "@/components/SketchBee";
import { TornEdge } from "@/components/TornEdge";
import { getDict } from "@/i18n/dictionaries";
import { localeHref, localeTags, type Locale } from "@/i18n/config";
import { EVENTS, track } from "@/lib/umami";

/**
 * One evening, written out in full.
 *
 * The page is laid out the way a blog post is — hero on the paper sheet, back
 * link hung above the title, running text in a book measure with marginalia to
 * its left — because it is the same kind of reading. What is different is the
 * column beside it: an evening has facts a piece of writing does not, and they
 * belong in a block a visitor can glance at without reading a sentence.
 *
 * Everything to do with the calendar arrives here as a finished URL. Building
 * a Google or Outlook link means knowing the instant the event starts, and
 * resolving that instant is timezone work that has already been done once, on
 * the server, by src/lib/events.ts; doing it a second time in the browser is
 * how the two ends of a page come to disagree about what time something is.
 * The .ics link is a route rather than a blob for the same reason, plus one
 * more: a data: URL cannot carry a filename that iOS will accept, and Apple
 * Calendar is the client that matters most for this button.
 */

/* ------------------------------------------------------------------ *
 * Rich text
 * ------------------------------------------------------------------ */

/**
 * A small walker over Lexical's JSON.
 *
 * Payload ships a renderer of its own, but importing it pulls the editor's
 * React runtime into the visitor's bundle to draw what is, on this site, four
 * paragraphs and the occasional link. The node types below are the ones the
 * owners can actually produce with the toolbar they have; anything else falls
 * through to its children, so an unrecognised block loses its styling rather
 * than its words.
 *
 * The typography is the blog's: the same `prose` chain, so an evening and an
 * article are set in one hand.
 */

interface LexicalNode {
  type?: string;
  tag?: string;
  format?: number | string;
  text?: string;
  listType?: string;
  fields?: { url?: string; newTab?: boolean; linkType?: string; doc?: unknown };
  children?: LexicalNode[];
}

/** Lexical stores the marks on a run of text as a bitmask. */
const BOLD = 1;
const ITALIC = 2;
const STRIKETHROUGH = 4;
const UNDERLINE = 8;
const CODE = 16;

function renderText(node: LexicalNode, key: string): ReactNode {
  let out: ReactNode = node.text ?? "";
  const format = typeof node.format === "number" ? node.format : 0;
  if (format & CODE) out = <code>{out}</code>;
  if (format & BOLD) out = <strong>{out}</strong>;
  if (format & ITALIC) out = <em>{out}</em>;
  if (format & UNDERLINE) out = <u>{out}</u>;
  if (format & STRIKETHROUGH) out = <s>{out}</s>;
  return <span key={key}>{out}</span>;
}

function renderNodes(nodes: LexicalNode[] | undefined, prefix = "n"): ReactNode {
  if (!nodes) return null;
  return nodes.map((node, i) => renderNode(node, `${prefix}-${i}`));
}

function renderNode(node: LexicalNode, key: string): ReactNode {
  switch (node.type) {
    case "text":
      return renderText(node, key);
    case "linebreak":
      return <br key={key} />;
    case "horizontalrule":
      return <hr key={key} />;
    case "paragraph":
      return <p key={key}>{renderNodes(node.children, key)}</p>;
    case "heading": {
      // The page already owns the h1, so an editor's own H1 is demoted to an
      // H2 rather than being allowed to create a second one.
      const level = Math.min(Math.max(Number(node.tag?.slice(1)) || 2, 2), 6);
      const Tag = `h${level}` as "h2" | "h3" | "h4" | "h5" | "h6";
      return <Tag key={key}>{renderNodes(node.children, key)}</Tag>;
    }
    case "quote":
      return <blockquote key={key}>{renderNodes(node.children, key)}</blockquote>;
    case "list":
      return node.listType === "number" ? (
        <ol key={key}>{renderNodes(node.children, key)}</ol>
      ) : (
        <ul key={key}>{renderNodes(node.children, key)}</ul>
      );
    case "listitem":
      return <li key={key}>{renderNodes(node.children, key)}</li>;
    case "link":
    case "autolink": {
      const url = node.fields?.url;
      if (!url) return <span key={key}>{renderNodes(node.children, key)}</span>;
      const external = /^https?:\/\//i.test(url);
      return (
        <a
          key={key}
          href={url}
          {...(external || node.fields?.newTab
            ? { target: "_blank", rel: "noopener noreferrer" }
            : {})}
        >
          {renderNodes(node.children, key)}
        </a>
      );
    }
    default:
      return node.children ? (
        <span key={key}>{renderNodes(node.children, key)}</span>
      ) : null;
  }
}

function RichText({ value }: { value: unknown }) {
  const root = (value as { root?: LexicalNode } | null | undefined)?.root;
  if (!root?.children?.length) return null;
  return <>{renderNodes(root.children, "root")}</>;
}

/* ------------------------------------------------------------------ *
 * Small drawn marks
 * ------------------------------------------------------------------ */

function BackArrow({ className = "" }: { className?: string }) {
  return (
    <svg
      width="26"
      height="8"
      viewBox="0 0 26 8"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path
        d="M25.4 4.1 L1.2 3.85"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
      <path
        d="M5.4 0.9 L1.2 4 L5.4 7.1"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ *
 * The page
 * ------------------------------------------------------------------ */

export interface EventCalendarLinks {
  /** The route that serves this one evening as a .ics attachment. */
  ics: string;
  /** The whole series, when there is a series. */
  series?: string;
  google: string;
  outlook: string;
}

export interface EventDetail {
  slug: string;
  title: string;
  excerpt?: string;
  description?: unknown;
  location?: string;
  price?: string;
  bookingRequired: boolean;
  bookingUrl?: string;
  bookingNote?: string;
  category?: string;
  allDay: boolean;
  image?: { url: string; alt: string };
}

interface Props {
  /** The dictionary is looked up here rather than passed: it holds functions. */
  locale: Locale;
  event: EventDetail;
  startIso: string;
  endIso?: string;
  /** "Elke maandag", written out on the server. Absent for a one-off. */
  recurrenceLabel?: string;
  /** The next handful of dates, when this repeats. */
  upcomingIso: string[];
  calendar: EventCalendarLinks;
}

const TZ = "Europe/Amsterdam";

export function EventClient({
  locale,
  event,
  startIso,
  endIso,
  recurrenceLabel,
  upcomingIso,
  calendar,
}: Props) {
  const t = getDict(locale);

  // Which evening was read, and which calendar it was taken away in. The
  // title and nothing else — that is a fact about the programme, not about
  // whoever is reading it. `track()` swallows everything it touches, so
  // neither of these can interfere with the link the reader just followed.
  useEffect(() => {
    track(EVENTS.eventViewed, { title: event.title });
  }, [event.title]);
  const takeAway = (target: string) => () =>
    track(EVENTS.addToCalendar, { title: event.title, target });

  // Fixed timezone so the server and the browser print the same date; without
  // it the two can land on different days around midnight.
  const dateFormat = new Intl.DateTimeFormat(localeTags[locale], {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: TZ,
  });
  const shortDate = new Intl.DateTimeFormat(localeTags[locale], {
    day: "numeric",
    month: "long",
    timeZone: TZ,
  });
  const timeFormat = new Intl.DateTimeFormat(localeTags[locale], {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: TZ,
  });

  const start = new Date(startIso);
  const end = endIso ? new Date(endIso) : null;
  const clock = event.allDay
    ? t.events.allDay
    : end
      ? t.events.timeRange(timeFormat.format(start), timeFormat.format(end))
      : timeFormat.format(start);

  const category =
    event.category && event.category in t.events.categories
      ? t.events.categories[event.category as keyof typeof t.events.categories]
      : null;

  return (
    <>
      {/* Hero: the paper sheet, type hung on the bottom-left corner */}
      <section className="relative flex min-h-[38vh] items-end overflow-hidden bg-paper">
        <div className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-12 pt-32 md:px-12 md:pb-16 lg:px-20">
          <Link
            href={localeHref(locale, "/evenementen")}
            className="label group inline-flex items-center gap-3 transition-colors duration-500 ease-settle hover:text-honey-700"
          >
            <BackArrow className="transition-transform duration-500 ease-settle group-hover:-translate-x-1" />
            {t.events.back}
          </Link>

          <div className="mt-10 md:mt-14">
            <p className="label figures-old flex flex-wrap items-center gap-x-3 gap-y-1">
              <time dateTime={startIso}>
                {recurrenceLabel ?? dateFormat.format(start)}
              </time>
              <span aria-hidden="true" className="text-hive-200">
                &middot;
              </span>
              <span>{clock}</span>
              {category && (
                <>
                  <span aria-hidden="true" className="text-hive-200">
                    &middot;
                  </span>
                  <span>{category}</span>
                </>
              )}
            </p>
            <div className="rule-ink my-5 w-14" aria-hidden="true" />
            <h1 className="heading-xl text-hive-800">{event.title}</h1>
          </div>
        </div>

        <TornEdge
          color="#E8E2D4"
          lip="rgba(255,255,255,0.5)"
          variant={0}
          className="absolute inset-x-0 bottom-0 z-20"
        />
      </section>

      {/* Body: the plate mounted on stock, the facts as marginalia, the
          long text in a book measure */}
      <section className="section-padding relative overflow-hidden bg-paper-deep">
        <div className="mx-auto max-w-6xl">
          {event.image && (
            <ScrollReveal>
              <figure className="mb-20 md:mb-28">
                <Sheet tone="deep" edge="soft" className="p-3 md:p-4">
                  <img
                    src={event.image.url}
                    alt={event.image.alt}
                    className="block aspect-[3/2] w-full rounded-[2px] object-cover"
                  />
                </Sheet>
              </figure>
            </ScrollReveal>
          )}

          <div className="grid gap-x-8 gap-y-12 md:grid-cols-12">
            {/* ---- the facts, and the calendar control ---- */}
            <ScrollReveal direction="right" className="md:col-span-4">
              <aside>
                <dl className="space-y-6">
                  <div>
                    <dt className="label">{t.events.whenLabel}</dt>
                    <dd className="figures-old mt-2 text-hive-500">
                      <time dateTime={startIso}>{dateFormat.format(start)}</time>
                      <span className="block text-hive-400">{clock}</span>
                      {recurrenceLabel && (
                        <span className="mt-2 block text-sm text-hive-300">
                          {recurrenceLabel}
                        </span>
                      )}
                    </dd>
                  </div>

                  {event.location && (
                    <div>
                      <dt className="label">{t.events.whereLabel}</dt>
                      <dd className="mt-2 text-hive-500">{event.location}</dd>
                    </div>
                  )}

                  {event.price && (
                    <div>
                      <dt className="label">{t.events.priceLabel}</dt>
                      <dd className="figures-old mt-2 text-hive-500">
                        {event.price}
                      </dd>
                    </div>
                  )}

                  {event.bookingRequired && (
                    <div>
                      <dt className="label">{t.events.bookingRequired}</dt>
                      <dd className="mt-2 text-hive-500">
                        {event.bookingNote && <p>{event.bookingNote}</p>}
                        {event.bookingUrl && (
                          <a
                            href={event.bookingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ink-link mt-2 inline-block"
                          >
                            {t.events.signUp}
                          </a>
                        )}
                      </dd>
                    </div>
                  )}
                </dl>

                {/* Repeating evenings prove it here rather than in a sentence,
                    which is also the only place the folded-away occurrences
                    from the agenda column come back into view. */}
                {upcomingIso.length > 1 && (
                  <div className="mt-8">
                    <p className="label">{t.events.nextDates}</p>
                    <ul className="figures-old mt-2 space-y-1 text-sm text-hive-400">
                      {upcomingIso.slice(0, 6).map((iso) => (
                        <li key={iso}>
                          <time dateTime={iso}>
                            {shortDate.format(new Date(iso))}
                          </time>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* A <details> rather than a popover: it opens without
                    JavaScript, it closes with Escape, and a screen reader
                    already knows what it is. */}
                <details className="group mt-10">
                  <summary className="btn-primary cursor-pointer list-none">
                    {t.events.addToCalendar}
                  </summary>
                  <div className="paper-panel mt-4 p-5">
                    <ul className="space-y-3">
                      <li>
                        {/* Apple Calendar is what a .ics opens in on an Apple
                            device, so these two are the same file under two
                            names — the name a visitor recognises, and the name
                            of the thing itself. */}
                        <a
                          href={calendar.ics}
                          onClick={takeAway("apple")}
                          className="ink-link"
                        >
                          {t.events.appleCalendar}
                        </a>
                      </li>
                      <li>
                        <a
                          href={calendar.google}
                          onClick={takeAway("google")}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ink-link"
                        >
                          {t.events.googleCalendar}
                        </a>
                      </li>
                      <li>
                        <a
                          href={calendar.outlook}
                          onClick={takeAway("outlook")}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ink-link"
                        >
                          {t.events.outlookCalendar}
                        </a>
                      </li>
                      <li>
                        <a
                          href={calendar.ics}
                          onClick={takeAway("ics")}
                          className="ink-link"
                        >
                          {t.events.downloadIcs}
                        </a>
                      </li>
                      {calendar.series && (
                        <li>
                          <a
                            href={calendar.series}
                            onClick={takeAway("series")}
                            className="ink-link"
                          >
                            {t.events.seriesIcs}
                          </a>
                        </li>
                      )}
                    </ul>
                    <p className="mt-4 text-sm leading-relaxed text-hive-300">
                      {t.events.addToCalendarHint}
                    </p>
                  </div>
                </details>

                <SketchBee
                  size={52}
                  variant={2}
                  strokeWidth={1}
                  className="mt-10 text-sage-500"
                />
              </aside>
            </ScrollReveal>

            {/* ---- the long text ---- */}
            <ScrollReveal delay={0.1} className="md:col-span-7 md:col-start-6">
              <article className="prose prose-lg max-w-none prose-headings:font-display prose-headings:tracking-[-0.01em] prose-headings:text-hive-700 prose-p:leading-[1.75] prose-p:text-hive-500 prose-a:text-honey-600 prose-a:underline prose-a:decoration-honey-400 prose-a:underline-offset-4 prose-blockquote:border-l-2 prose-blockquote:border-honey-400 prose-blockquote:pl-6 prose-blockquote:font-display prose-blockquote:font-normal prose-blockquote:not-italic prose-blockquote:text-hive-700 prose-strong:font-semibold prose-strong:text-hive-700 prose-em:text-hive-600 prose-li:text-hive-500 prose-hr:border-hive-200 prose-img:rounded-[2px] prose-figcaption:text-hive-300">
                {event.excerpt && (
                  <p className="drop-cap max-w-[36rem] text-xl leading-[1.7] text-hive-600">
                    {event.excerpt}
                  </p>
                )}
                <div className="mt-10 max-w-[34rem]">
                  <RichText value={event.description} />
                </div>
              </article>
            </ScrollReveal>
          </div>
        </div>

        {/* No edge here: <Footer> draws its own tear up into this section. */}
      </section>
    </>
  );
}
