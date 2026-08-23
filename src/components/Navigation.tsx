"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useState, useEffect } from "react";
import { m, AnimatePresence, useReducedMotion } from "@/components/motion";
import { TornEdge } from "@/components/TornEdge";
import { Masthead, type MastheadVariant } from "@/components/Masthead";
import { getDict } from "@/i18n/dictionaries";
import {
  localeHref,
  localeLabels,
  localeNames,
  locales,
  stripLocale,
  type Locale,
} from "@/i18n/config";
import { EVENTS, track } from "@/lib/umami";

const SETTLE: [number, number, number, number] = [0.16, 0.84, 0.28, 1];

/**
 * How far down the page the bar takes on its paper ground, its rule and its
 * lockup.
 *
 * Two numbers, because the bar has two jobs on two kinds of page. Everywhere
 * else it is a running head and it should look like one almost immediately.
 * On the landing page it starts as chrome and nothing else, because the crest
 * and the name are printed large at the top of the hero directly beneath it;
 * it puts the paper down, and its own small lockup with it, once the reader
 * has moved far enough that the big one is on its way out of the frame.
 */
const SETTLE_AT: Record<MastheadVariant, number> = { standard: 50, hero: 90 };

interface NavigationProps {
  locale: Locale;
  reservationUrl?: string;
  siteName?: string;
  /**
   * Which of the two headers this page gets. The layout that renders this is a
   * server component and has no path to hand down, and asking the DOM would be
   * both fragile and a frame late, so when nothing is passed the answer comes
   * from the router: the landing page, and only the landing page, carries the
   * masthead. The prop stays so a page can say otherwise without this file
   * growing a list of routes.
   */
  variant?: MastheadVariant;
}

export function Navigation({
  locale,
  reservationUrl,
  siteName = "De Bee's Hive",
  variant,
}: NavigationProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  const reduce = useReducedMotion();
  const t = getDict(locale);

  // The browser path still carries /en on the English site, and a middleware
  // rewrite can leave /nl on it server-side. Comparing the stripped path keeps
  // the current page marked in both languages.
  const here = stripLocale(pathname || "/");
  const isActive = (href: string) =>
    href === "/" ? here === "/" : here.startsWith(href);

  const mode: MastheadVariant = variant ?? (here === "/" ? "hero" : "standard");

  // Hrefs are written as the Dutch paths the site is indexed under; every one
  // of them goes through localeHref, which prefixes /en when needed.
  // Evenementen sits after Galerij: the four that describe the place run in
  // the order a visitor meets it — who they are, what they cook, what it looks
  // like, what is on — and Blog and Contact close the list as they always did.
  const navLinks = [
    { href: "/", label: t.nav.home },
    { href: "/over-ons", label: t.nav.about },
    { href: "/kaart", label: t.nav.menu },
    { href: "/galerij", label: t.nav.gallery },
    { href: "/evenementen", label: t.nav.events },
    { href: "/blog", label: t.nav.blog },
    { href: "/contact", label: t.nav.contact },
  ];

  useEffect(() => {
    const threshold = SETTLE_AT[mode];
    const handleScroll = () => setScrolled(window.scrollY > threshold);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [mode]);

  // The overlay traps nothing, so Escape has to be the way out.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  // The owners can point the CTA at an external booking tool from the CMS.
  // With that field empty it falls back to our own request page.
  const external = Boolean(reservationUrl);
  const reserveHref = reservationUrl || "/reserveren";

  // The mobile sheet has no CTA button, so Reserveren rides along as a link.
  const mobileLinks = [
    ...navLinks.map((link) => ({ ...link, external: false })),
    { href: reserveHref, label: t.nav.reserve, external },
  ];

  // The bar is a running head at the top of the sheet, and on every page but
  // one it is paper from the first pixel. On the landing page it starts out
  // as chrome and nothing else: no ground, no rule, no wordmark, because the
  // masthead is standing where all three would be and the hero's own paper is
  // the same cream anyway. It puts the sheet down as the reader moves, which
  // is the moment it starts having something to cover.
  const settled = scrolled || isOpen;
  const opaque = mode === "standard" || settled;

  /**
   * NL and EN, the current one in ochre, parted by a hairline of ink. Each
   * points at this same page in the other language, which is why it works off
   * the stripped path rather than a fixed href.
   */
  const LanguageSwitch = ({
    className = "",
    onNavigate,
  }: {
    className?: string;
    onNavigate?: () => void;
  }) => (
    <div
      className={`flex items-center gap-3 ${className}`}
      role="group"
      aria-label={t.nav.language}
    >
      {locales.map((code, i) => (
        <Fragment key={code}>
          {i > 0 && (
            <span
              aria-hidden="true"
              className="block h-3 w-px bg-hive-700/25"
            />
          )}
          {/* The accessible name has to contain the visible text, or voice
              control cannot act on "click NL": the link reads "NL" and "NL" is
              not a substring of "Nederlands", which is what
              label-content-name-mismatch is about. Naming both keeps the
              spoken name a real word and keeps the spoken command working. */}
          <Link
            href={localeHref(code, here)}
            hrefLang={code}
            lang={code}
            aria-label={`${localeLabels[code]}, ${localeNames[code]}`}
            aria-current={code === locale ? "true" : undefined}
            onClick={onNavigate}
            className={`label transition-colors duration-500 ease-settle ${
              code === locale
                ? "text-honey-600"
                : "text-hive-400 hover:text-honey-600"
            }`}
          >
            {localeLabels[code]}
          </Link>
        </Fragment>
      ))}
    </div>
  );

  return (
    // Sits under the notification bar when there is one: --notice-h is
    // published by NotificationBanner, and is 0px the rest of the time.
    //
    // `.safe-head-below-notice` is the iOS half of it. With viewport-fit=cover
    // the page owns the whole screen, so this bar begins underneath the clock
    // and the battery. Its paper therefore starts at the true top of the
    // screen — there is never a transparent band for the page to scroll
    // through, which is what was showing up in the status bar — and its
    // contents are pushed down clear of them. When the notification bar is up
    // it has already taken that strip, and the class resolves to nothing.
    <header
      className={`fixed left-0 right-0 z-50 safe-head-below-notice transition-colors duration-500 ease-settle ${
        opaque ? "bg-paper" : "bg-transparent"
      }`}
      style={{ top: "var(--notice-h, 0px)" }}
    >
      <div
        aria-hidden="true"
        className={`rule-ink absolute inset-x-0 bottom-0 transition-opacity duration-500 ease-settle ${
          settled ? "opacity-100" : "opacity-0"
        }`}
      />
      <nav className="max-w-7xl mx-auto px-6 md:px-12 flex items-center justify-between h-20 relative">
        {/* The wordmark. On the landing page this same element is the big
            masthead over the hero until the reader moves; everywhere else it
            has never been anything but this. */}
        <Masthead
          locale={locale}
          siteName={siteName}
          variant={mode}
          settled={settled}
          away={mode === "hero" && isOpen}
        />

        {/* Desktop Nav */}
        {/* The bar switches to the hamburger below xl, not below md.
            Seven links, a language switch and a filled button do not fit a
            tablet: at 768 the row overflowed its own container and the last
            items ran under the reserve button, and Evenementen is the one that
            broke it. Measured at the label's own size, 11px uppercase with
            0.22em tracking, the row wants about 1,070 points before padding,
            which no breakpoint under xl has to give. `gap-6` up to 2xl buys
            the last of the headroom at exactly 1280. */}
        <ul className="hidden xl:flex items-center gap-6 2xl:gap-8">
          {navLinks.map((link) => {
            const active = isActive(link.href);
            return (
              <li key={link.href}>
                <Link
                  href={localeHref(locale, link.href)}
                  aria-current={active ? "page" : undefined}
                  className={`label group relative block py-1 transition-colors duration-500 ease-settle ${
                    active ? "text-honey-600" : "text-hive-500 hover:text-honey-600"
                  }`}
                >
                  {link.label}
                  {/* Ink drawn in from the left; ochre and permanent on the current page. */}
                  <span
                    aria-hidden="true"
                    className={`absolute -bottom-1 left-0 h-px transition-[width] duration-[450ms] ease-settle ${
                      active
                        ? "w-full bg-honey-400"
                        : "w-0 bg-current group-hover:w-full group-focus-visible:w-full"
                    }`}
                  />
                </Link>
              </li>
            );
          })}
          <li>
            <LanguageSwitch />
          </li>
          <li>
            {external ? (
              <a
                href={reserveHref}
                onClick={() => track(EVENTS.reserveButtonClicked, { source: "nav" })}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary !px-6 !py-2.5"
              >
                {t.nav.reserve}
              </a>
            ) : (
              <Link
                href={localeHref(locale, reserveHref)}
                onClick={() => track(EVENTS.reserveButtonClicked, { source: "nav" })}
                aria-current={isActive(reserveHref) ? "page" : undefined}
                className="btn-primary !px-6 !py-2.5"
              >
                {t.nav.reserve}
              </Link>
            )}
          </li>
        </ul>

        {/* Mobile Toggle */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="xl:hidden relative z-50 w-10 h-10 flex flex-col items-center justify-center gap-1.5"
          aria-label={t.nav.menuToggle}
          aria-expanded={isOpen}
        >
          <m.span
            animate={isOpen ? { rotate: 45, y: 6 } : { rotate: 0, y: 0 }}
            transition={{ duration: 0.6, ease: SETTLE }}
            className="w-6 h-0.5 block bg-hive-700"
          />
          <m.span
            animate={isOpen ? { opacity: 0 } : { opacity: 1 }}
            transition={{ duration: 0.6, ease: SETTLE }}
            className="w-6 h-0.5 block bg-hive-700"
          />
          <m.span
            animate={isOpen ? { rotate: -45, y: -6 } : { rotate: 0, y: 0 }}
            transition={{ duration: 0.6, ease: SETTLE }}
            className="w-6 h-0.5 block bg-hive-700"
          />
        </button>

        {/* Mobile Menu: a second sheet torn and laid over the page. It is torn
            off at --chrome-h, which is wherever the pinned chrome actually
            ends: the notification bar or the notch, whichever is taller, plus
            the bar itself. Hard-coding the bar's own height here used to put
            the tear underneath the notification bar on a phone with a notch. */}
        <AnimatePresence>
          {isOpen && (
            <m.div
              initial={reduce ? { opacity: 0 } : { opacity: 0, x: "100%" }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, x: "100%" }}
              transition={{ duration: 0.6, ease: SETTLE }}
              className="fixed inset-0 z-40 xl:hidden"
            >
              <TornEdge
                color="#E8E2D4"
                lip="rgba(255,255,255,0.55)"
                variant={1}
                className="absolute inset-x-0 top-[var(--chrome-h)] -translate-y-full"
              />
              <div className="paper-panel absolute inset-x-0 bottom-0 top-[var(--chrome-h)] border-0 shadow-none overflow-y-auto">
                <ul className="px-6 pt-12 pb-6">
                  {mobileLinks.map((link, i) => {
                    const active = !link.external && isActive(link.href);
                    // The sheet has no CTA button; Reserveren is simply the
                    // last row, so it is recognised by its href rather than
                    // by a flag the array does not carry.
                    const leave = () => {
                      if (link.href === reserveHref) {
                        track(EVENTS.reserveButtonClicked, { source: "nav-sheet" });
                      }
                      setIsOpen(false);
                    };
                    return (
                      <m.li
                        key={link.href}
                        initial={reduce ? false : { opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          duration: 0.6,
                          delay: reduce ? 0 : 0.08 + i * 0.06,
                          ease: SETTLE,
                        }}
                      >
                        <div className="flex items-baseline gap-5 py-3.5">
                          <span
                            aria-hidden="true"
                            className="label figures-old w-7 shrink-0 text-honey-500/70"
                          >
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          {link.external ? (
                            <a
                              href={link.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={leave}
                              className="font-display text-[2rem] leading-none tracking-[-0.02em] text-hive-700 transition-colors duration-500 ease-settle hover:text-honey-600"
                            >
                              {link.label}
                            </a>
                          ) : (
                            <Link
                              href={localeHref(locale, link.href)}
                              onClick={leave}
                              aria-current={active ? "page" : undefined}
                              className={`font-display text-[2rem] leading-none tracking-[-0.02em] transition-colors duration-500 ease-settle ${
                                active
                                  ? "text-honey-600"
                                  : "text-hive-700 hover:text-honey-600"
                              }`}
                            >
                              {link.label}
                            </Link>
                          )}
                        </div>
                        <div
                          className={`rule-ink ${active ? "" : "opacity-45"}`}
                        />
                      </m.li>
                    );
                  })}
                </ul>

                <m.div
                  initial={reduce ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.6,
                    delay: reduce ? 0 : 0.08 + mobileLinks.length * 0.06,
                    ease: SETTLE,
                  }}
                  className="px-6 pb-24 pt-8"
                >
                  <LanguageSwitch onNavigate={() => setIsOpen(false)} />
                </m.div>
              </div>
            </m.div>
          )}
        </AnimatePresence>
      </nav>

      {/* One drawn line where the sheet ends, no blur, no drop shadow. */}
      {settled && !isOpen && (
        <div
          aria-hidden="true"
          className="rule-ink absolute inset-x-0 bottom-0 pointer-events-none"
        />
      )}
    </header>
  );
}
