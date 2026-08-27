"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, m, useReducedMotion } from "@/components/motion";
import { usePathname } from "next/navigation";
import { BookingFlow } from "@/components/booking/BookingFlow";
import { getDict } from "@/i18n/dictionaries";
import { localeHref, type Locale } from "@/i18n/config";
import {
  DEFAULT_BOOKING_RULES,
  todayInAmsterdam,
  type BookingRules,
  type HoursRow,
  type Range,
  type ScheduledDay,
} from "@/lib/openingHours";
import { EVENTS, track } from "@/lib/umami";

/**
 * The standing reservation control on phones.
 *
 * The desktop navigation carries one, but on a phone that lives behind the
 * hamburger, so the single thing a visitor most often wants is two taps away.
 *
 * It used to be a full width bar pinned along the bottom edge, which cost a
 * strip of every page and sat on top of whatever you were reading. This is a
 * small square mark in the bottom right corner instead, and it opens the
 * booking form in place rather than throwing the reader onto another page and
 * losing their scroll position. Hidden on /reserveren, where the form is the
 * page.
 *
 * What the sheet knows about the calendar it asks for itself, on open, from
 * /api/availability. It is mounted from the layout and there is no page render
 * behind it to resolve a schedule, so for a long time it read nothing but the
 * seven weekly rows — which meant the repeating rules and the afwijkende dagen
 * were invisible on precisely the device most of this café's guests use. The
 * last Sunday of the month, the one Sunday they are open, simply was not in
 * the list; a Christmas Eve marked closed by hand was, and the guest found out
 * at the button. A window that has not answered yet, or a request that fails,
 * falls back to those weekly rows exactly as before.
 */

const SETTLE = [0.16, 0.84, 0.28, 1] as const;

/** A drawn calendar, in the same line weight as the rest of the artwork. */
function CalendarMark({ size = 22 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
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
      <path d="M7.6 13.4 L11 13.3" />
      <path d="M7.6 16.6 L14.6 16.5" />
    </svg>
  );
}

/** The cross on the close control, drawn rather than set as a glyph. */
function CloseMark() {
  return (
    <svg
      viewBox="0 0 14 14"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M2.6 2.8 L11.4 11.2" />
      <path d="M11.3 2.7 L2.7 11.3" />
    </svg>
  );
}

/*
 * The mark floats above the page on phones, and with `viewport-fit=cover` the
 * page now runs the full height of the screen — so plain `bottom-5` puts a
 * 56px tap target half under the home indicator on any notched iPhone. The
 * inset is added to the gap rather than replacing it, so the mark keeps the
 * same 1.25rem of air above whatever the bottom of the usable screen is; on a
 * device with no inset `env()` resolves to 0px and nothing moves.
 */
/**
 * Everything inside the sheet that a Tab can land on, in document order.
 *
 * The list is the browser's own, minus the two things that are focusable in
 * markup but not in the tab order: anything holding a negative `tabindex` —
 * the panel itself, and the honeypot input the booking form hides off screen —
 * which is why the filter reads `tabIndex >= 0` rather than trusting the
 * selector. The visibility test is `getClientRects()` and deliberately not
 * `offsetParent`, because half the controls in this flow are visually hidden
 * radios and checkboxes: they are 1px in a clip and they are the real controls,
 * so anything that treated "cannot be seen" as "cannot be reached" would trap
 * the caret in a dialog whose party tiles it could not get to.
 */
const TABBABLE = [
  "a[href]",
  "button",
  "input",
  "select",
  "textarea",
  "[tabindex]",
]
  .map((selector) => `${selector}:not([disabled])`)
  .join(",");

const tabStops = (root: HTMLElement): HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>(TABBABLE)).filter(
    (el) => el.tabIndex >= 0 && el.getClientRects().length > 0,
  );

/**
 * Take the rest of the page out of the reader's world for as long as the sheet
 * is up, and hand back the undoing of it.
 *
 * `aria-modal="true"` is a promise to a screen reader and nothing whatever to a
 * keyboard, and this sheet has been making it for a long time without keeping
 * it either way: the whole booking flow sits in here now — the party tiles,
 * three day chips, an evening's sittings and three fields — and tabbing off the
 * end of it walked straight out into the page behind, where the reader could
 * fill in a navigation they could not see. `inert` is the platform's own answer
 * and it does both halves at once: no focus, no pointer, and nothing in the
 * accessibility tree. Everything is put back exactly as it was found, and
 * anything already inert for its own reasons is left alone rather than being
 * un-inerted on the way out.
 *
 * Walked from the sheet's own layer rather than from the panel, and that is
 * load bearing: the backdrop is the panel's sibling, and inerting it would kill
 * the tap that dismisses the sheet — which is the commonest ending of all.
 */
const hideTheRest = (layer: HTMLElement): (() => void) => {
  const hidden: HTMLElement[] = [];
  let node: HTMLElement | null = layer;
  while (node && node !== document.body) {
    for (const sibling of Array.from(node.parentElement?.children ?? [])) {
      if (sibling === node || !(sibling instanceof HTMLElement)) continue;
      if (sibling.hasAttribute("inert")) continue;
      sibling.setAttribute("inert", "");
      hidden.push(sibling);
    }
    node = node.parentElement;
  }
  return () => {
    for (const el of hidden) el.removeAttribute("inert");
  };
};

const squareClass =
  "fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] right-5 z-40 flex h-14 w-14 items-center justify-center " +
  "rounded-[3px] bg-hive-700 text-paper shadow-[0_8px_20px_rgba(51,30,12,0.34)] " +
  "ring-1 ring-honey-200/25 transition-colors duration-300 ease-settle " +
  "hover:bg-hive-800 active:translate-y-px xl:hidden";

/**
 * The window as /api/availability answers it, read as suspiciously as anything
 * that arrives over the wire. A row missing its date or its hours is dropped
 * rather than repaired: what the form does with an empty list is fall back to
 * the weekly rows, which is a worse answer than the endpoint's but never a
 * wrong one.
 */
function toScheduledDays(value: unknown): ScheduledDay[] {
  if (!Array.isArray(value)) return [];
  const days: ScheduledDay[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const day = row as Record<string, unknown>;
    if (typeof day.date !== "string" || !Array.isArray(day.ranges)) continue;
    const ranges: Range[] = [];
    for (const entry of day.ranges) {
      const range = entry as Range | null;
      if (
        range &&
        typeof range.open === "number" &&
        typeof range.close === "number"
      ) {
        ranges.push({ open: range.open, close: range.close });
      }
    }
    days.push({
      date: day.date,
      ranges,
      closed: day.closed === true,
      note: typeof day.note === "string" ? day.note : null,
      /*
       * `hours` in the answer is not always what a person typed. Whenever the
       * day has ranges the endpoint prints them itself — `describe()` — and
       * only falls back to the owner's own line when it could read no ranges
       * out of it at all. `text` on a ScheduledDay promises the opposite: the
       * hours as they were typed, for a line no range could be read out of.
       * Copying `hours` across unconditionally filled the field with
       * "11:00 – 21:00" strings this codebase had generated a moment earlier,
       * so the next reader to reach for the owners' words would have got our
       * own prose handed back. Nothing on this path reads it today, which is
       * the only reason it never showed.
       */
      text:
        ranges.length === 0 && typeof day.hours === "string" ? day.hours : null,
    });
  }
  return days;
}

export function MobileReserveButton({
  locale,
  reservationUrl,
  openingHours,
  reservationsEnabled = true,
  rules = DEFAULT_BOOKING_RULES,
  phone,
  email,
}: {
  locale: Locale;
  /** An external booking system, if the owners ever plug one in. */
  reservationUrl?: string;
  /** The week as typed into the CMS; the form reads its times off this. */
  openingHours?: HoursRow[];
  /**
   * Online reserveren, as it stood when the layout was rendered. The layout is
   * cached like everything else, so this decides the first paint only: the
   * sheet's own request carries the live answer and overrides it.
   */
  reservationsEnabled?: boolean;
  /** The CMS booking rules, so the sheet counts the same days the page does. */
  rules?: BookingRules;
  /** For the sheet that is shown when online booking is switched off. */
  phone?: string;
  email?: string;
}) {
  const t = getDict(locale);
  const label = t.nav.reserve;
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  /** The fixed layer holding the backdrop and the panel, as one thing. */
  const layerRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  const close = useCallback(() => setOpen(false), []);

  /**
   * Everything that makes this a modal rather than a thing that says it is one.
   *
   * Escape closes it, the page behind does not scroll, the page behind is inert,
   * and Tab goes round the sheet instead of out of it. The last two are the ones
   * that were missing, and between them they were the difference between the
   * `role="dialog" aria-modal="true"` on the panel being true and being a claim.
   *
   * The Tab handling is belt and braces over `inert`, which every browser this
   * café's guests use has supported for a couple of years but which a slightly
   * older phone will simply ignore — and on that phone the wrap below is the
   * only thing standing between the last field of a booking and the site's own
   * navigation. Cheap, and it also spares the working browsers a trip out to
   * the address bar and back on the way round.
   */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const stops = tabStops(panel);
      const active = document.activeElement;
      const inside = active instanceof Node && panel.contains(active);
      // Nothing to tab to at all — the sheet with the telephone number in it —
      // so the caret stays on the panel rather than being handed to the page.
      if (stops.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = stops[0];
      const last = stops[stops.length - 1];
      if (!inside) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
        return;
      }
      // The panel itself is the one tab stop that is not in `stops`: it holds a
      // negative tabindex so the caret can be put on it when the sheet opens.
      // Going backwards off it is going backwards off the top of the sheet.
      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const show = layerRef.current ? hideTheRest(layerRef.current) : null;
    // Move the caret into the sheet, so a keyboard or screen reader lands on
    // the form rather than staying on the button behind it.
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
      show?.();
    };
  }, [open, close]);

  /**
   * The calendar, asked for the moment the sheet goes up and not before.
   *
   * On open rather than on mount, because this component is in the layout of
   * every page on the site and most visitors never touch it: a window this
   * wide walks every reservation in it, and paying for that on every page view
   * to draw a sheet nobody opened would be a poor trade. Asked again on each
   * open rather than kept, because a phone can sit in a pocket with a page
   * loaded for a week and the answer to "which days" is only true for a day.
   *
   * The window ends exactly at the horizon the owners set, which is also the
   * largest span /api/availability will answer — see MAX_HORIZON_DAYS. A
   * failure leaves whatever was already here, and an empty answer leaves the
   * form on the weekly rows.
   */
  const [answer, setAnswer] = useState<{
    enabled: boolean;
    days: ScheduledDay[];
  } | null>(null);
  useEffect(() => {
    if (!open) return;
    const ac = new AbortController();
    const from = todayInAmsterdam();
    const to = new Date(
      new Date(`${from}T12:00:00.000Z`).getTime() +
        rules.horizonDays * 86_400_000,
    )
      .toISOString()
      .slice(0, 10);
    fetch(`/api/availability?from=${from}&to=${to}&locale=${locale}`, {
      signal: ac.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { reservationsEnabled?: boolean; days?: unknown } | null) => {
        if (!data) return;
        setAnswer({
          enabled: data.reservationsEnabled !== false,
          days: toScheduledDays(data.days),
        });
      })
      .catch(() => {});
    return () => ac.abort();
  }, [open, locale, rules.horizonDays]);

  // Send focus back to the mark that opened the sheet — but only once the
  // sheet has actually been opened. This effect also runs on mount, where
  // `open` is false too, and focusing there would yank the caret to a corner
  // button on every page load.
  const opened = useRef(false);
  useEffect(() => {
    if (open) {
      opened.current = true;
    } else if (opened.current) {
      triggerRef.current?.focus({ preventScroll: true });
    }
  }, [open]);

  // The live answer if there is one, the cached layout's otherwise.
  const bookable = answer ? answer.enabled : reservationsEnabled;

  const target = localeHref(locale, "/reserveren");
  // The booking pages themselves, in both languages and on both screens of the
  // flow. `/reserveren/gegevens` used to slip through this — it does not end in
  // "/reserveren" — so a floating "reserveer een tafel" mark would have hovered
  // over the details of a booking somebody was halfway through making.
  if (pathname === target || /\/reserveren(\/|$)/.test(pathname)) return null;
  // The guest pass belongs to a party that already has a table. Offering them
  // a floating "reserve" mark over it is noise at best, and at worst it reads
  // as though the booking they are looking at did not take.
  if (pathname.includes("/reservering/")) return null;

  // An external booking system owns the whole flow, so there is nothing to
  // put in a sheet: the mark is simply a link out.
  if (reservationUrl) {
    return (
      <a
        href={reservationUrl}
        /* Its own source value, distinct from the mark below, and split before
           an external booking system is ever plugged in rather than after. The
           two shared the word "mobile" while doing entirely different things:
           this one leaves the site for somebody else's flow, where nothing we
           measure can follow it, and that one opens a form we can watch from
           beginning to end. Read as one number they would have been nonsense. */
        onClick={() =>
          track(EVENTS.reserveButtonClicked, { source: "mobile_external" })
        }
        target="_blank"
        rel="noopener noreferrer"
        aria-label={label}
        title={label}
        className={squareClass}
      >
        <CalendarMark />
      </a>
    );
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          track(EVENTS.reserveButtonClicked, { source: "mobile_fab" });
          setOpen(true);
        }}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={label}
        className={squareClass}
      >
        <CalendarMark />
      </button>

      <AnimatePresence>
        {open && (
          <div
            ref={layerRef}
            className="fixed inset-0 z-50 flex items-end xl:hidden"
          >
            <m.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.28 }}
              onClick={close}
              className="absolute inset-0 bg-hive-900/55"
              aria-hidden="true"
            />

            <m.div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              tabIndex={-1}
              initial={{ y: reduce ? 0 : "6%", opacity: reduce ? 0 : 1 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: reduce ? 0 : "6%", opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.42, ease: SETTLE }}
              /*
                `dvh` and not `vh`, and it is a real bug rather than a
                preference.

                On Chrome for Android `vh` is the LARGE viewport — the height
                the page would have with the address bar hidden — whatever the
                address bar happens to be doing at the time. This sheet is
                anchored to the bottom (`items-end` on the fixed layer above),
                so a panel measured against a viewport taller than the one
                actually on screen does not overflow downwards where a scrollbar
                would find it: it overflows off the TOP. Landing on the site and
                tapping Reserveren without scrolling first therefore cut the
                close button and the heading off the top edge of the screen,
                and scrolling — which hides the address bar and grows the
                viewport to match `vh` — appeared to "fix" it.

                `dvh` tracks the viewport that is really there. And it cannot
                shudder while the sheet is open, which is the usual objection to
                it: opening the sheet locks the body scroll a few lines up, so
                the address bar cannot hide or reappear until the sheet closes.
                It is read once, at the size the screen actually is.
              */
              className="relative flex max-h-[92dvh] w-full flex-col rounded-t-[4px] bg-paper outline-none"
            >
              <div className="flex items-start justify-between gap-4 border-b border-hive-700/[0.12] px-6 pb-4 pt-6">
                {/* Eyebrow and heading sit on consecutive lines with nothing
                    between them, so they are read as one sentence whether we
                    meant them that way or not. The eyebrow therefore names the
                    house rather than opening the heading; see the note in
                    src/i18n/dict/reserve.ts. */}
                <div>
                  <p className="label">{t.reserve.eyebrow}</p>
                  <h2
                    id={titleId}
                    className="mt-1.5 font-display text-2xl text-hive-800"
                  >
                    {bookable
                      ? t.reserve.heading
                      : t.reservationForm.closedHeading}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={close}
                  aria-label={t.notifications.close}
                  className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-[3px] text-hive-500 transition-colors duration-300 ease-settle hover:bg-hive-700/[0.08] hover:text-hive-700"
                >
                  <CloseMark />
                </button>
              </div>

              {/* Same reason as the mark above: the sheet is flush with the
                  bottom of the screen, so its last field would otherwise end
                  underneath the home indicator. */}
              <div className="overflow-y-auto overscroll-contain px-6 pb-[calc(2.5rem+env(safe-area-inset-bottom))] pt-7">
                {bookable ? (
                  /* No date passed: the form reads the clock itself after
                     mount. Nothing here is server-rendered, so there is no
                     markup for it to disagree with. The resolved window is
                     handed over the moment it arrives, and until then the
                     form works off the weekly rows. */
                  <BookingFlow
                    locale={locale}
                    openingHours={openingHours}
                    schedule={answer?.days}
                    rules={rules}
                    phone={phone}
                    email={email}
                    /* The sheet does no measuring of its own, and that is the
                       point of passing these two in. Opening it mounts the
                       form and the form says so; closing it unmounts the form
                       and the form says that too — including the tap on the
                       backdrop, which is the commonest ending of all and used
                       to leave no trace whatsoever. Every stage in between
                       then carries the same two words, so "of the people who
                       opened the sheet on a phone, how many reached the time
                       picker" is one reading rather than a guess. */
                    entry="mobile_fab"
                    surface="sheet"
                  />
                ) : (
                  /* Online reserveren is off. The mark stays where it is and
                     the sheet still opens, because a floating control that
                     vanishes leaves a phone guest with the nav behind the
                     hamburger and no idea why — and what the owners promised
                     the guest would still see is the telephone number. */
                  <div className="pb-4">
                    <p className="max-w-prose leading-relaxed text-hive-500">
                      {t.reservationForm.errors.reservationsClosed}
                    </p>
                    <div className="mt-5 space-y-1">
                      {phone ? (
                        <a
                          href={`tel:${phone.replace(/\s/g, "")}`}
                          className="ink-link block"
                        >
                          {phone}
                        </a>
                      ) : null}
                      {email ? (
                        <a href={`mailto:${email}`} className="ink-link block">
                          {email}
                        </a>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            </m.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
