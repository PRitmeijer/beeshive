"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, m, useReducedMotion } from "@/components/motion";
import { usePathname } from "next/navigation";
import { ReservationForm } from "@/components/ReservationForm";
import { getDict } from "@/i18n/dictionaries";
import { localeHref, type Locale } from "@/i18n/config";
import type { HoursRow } from "@/lib/openingHours";
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
const squareClass =
  "fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] right-5 z-40 flex h-14 w-14 items-center justify-center " +
  "rounded-[3px] bg-hive-700 text-paper shadow-[0_8px_20px_rgba(51,30,12,0.34)] " +
  "ring-1 ring-honey-200/25 transition-colors duration-300 ease-settle " +
  "hover:bg-hive-800 active:translate-y-px xl:hidden";

export function MobileReserveButton({
  locale,
  reservationUrl,
  openingHours,
}: {
  locale: Locale;
  /** An external booking system, if the owners ever plug one in. */
  reservationUrl?: string;
  /** The week as typed into the CMS; the form reads its times off this. */
  openingHours?: HoursRow[];
}) {
  const t = getDict(locale);
  const label = t.nav.reserve;
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  const close = useCallback(() => setOpen(false), []);

  // Escape closes, and the page behind must not scroll while the sheet is up.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Move the caret into the sheet, so a keyboard or screen reader lands on
    // the form rather than staying on the button behind it.
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, close]);

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

  const target = localeHref(locale, "/reserveren");
  if (pathname === target || pathname.endsWith("/reserveren")) return null;
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
        onClick={() => track(EVENTS.reserveButtonClicked, { source: "mobile" })}
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
          track(EVENTS.reserveButtonClicked, { source: "mobile" });
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
          <div className="fixed inset-0 z-50 flex items-end xl:hidden">
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
              className="relative flex max-h-[92vh] w-full flex-col rounded-t-[4px] bg-paper outline-none"
            >
              <div className="flex items-start justify-between gap-4 border-b border-hive-700/12 px-6 pb-4 pt-6">
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
                    {t.reserve.heading}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={close}
                  aria-label={t.notifications.close}
                  className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-[3px] text-hive-500 transition-colors duration-300 ease-settle hover:bg-hive-700/8 hover:text-hive-700"
                >
                  <CloseMark />
                </button>
              </div>

              {/* Same reason as the mark above: the sheet is flush with the
                  bottom of the screen, so its last field would otherwise end
                  underneath the home indicator. */}
              <div className="overflow-y-auto overscroll-contain px-6 pb-[calc(2.5rem+env(safe-area-inset-bottom))] pt-7">
                {/* No date passed: the form reads the clock itself after
                    mount. Nothing here is server-rendered, so there is no
                    markup for it to disagree with. */}
                <ReservationForm locale={locale} openingHours={openingHours} />
              </div>
            </m.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
