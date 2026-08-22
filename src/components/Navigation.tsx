"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useState, useEffect } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { TornEdge } from "@/components/TornEdge";
import { BeeGlyph } from "@/components/BeeGlyph";
import { getDict } from "@/i18n/dictionaries";
import {
  localeHref,
  localeLabels,
  localeNames,
  locales,
  stripLocale,
  type Locale,
} from "@/i18n/config";

const SETTLE: [number, number, number, number] = [0.16, 0.84, 0.28, 1];

interface NavigationProps {
  locale: Locale;
  reservationUrl?: string;
  siteName?: string;
}

export function Navigation({
  locale,
  reservationUrl,
  siteName = "De Bee's Hive",
}: NavigationProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  const reduce = useReducedMotion();
  const t = getDict(locale);

  // Hrefs are written as the Dutch paths the site is indexed under; every one
  // of them goes through localeHref, which prefixes /en when needed.
  const navLinks = [
    { href: "/", label: t.nav.home },
    { href: "/over-ons", label: t.nav.about },
    { href: "/kaart", label: t.nav.menu },
    { href: "/galerij", label: t.nav.gallery },
    { href: "/blog", label: t.nav.blog },
    { href: "/contact", label: t.nav.contact },
  ];

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    handleScroll();
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // The overlay traps nothing, so Escape has to be the way out.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  // The browser path still carries /en on the English site, and a middleware
  // rewrite can leave /nl on it server-side. Comparing the stripped path keeps
  // the current page marked in both languages.
  const here = stripLocale(pathname || "/");
  const isActive = (href: string) =>
    href === "/" ? here === "/" : here.startsWith(href);

  // The owners can point the CTA at an external booking tool from the CMS.
  // With that field empty it falls back to our own request page.
  const external = Boolean(reservationUrl);
  const reserveHref = reservationUrl || "/reserveren";

  // The mobile sheet has no CTA button, so Reserveren rides along as a link.
  const mobileLinks = [
    ...navLinks.map((link) => ({ ...link, external: false })),
    { href: reserveHref, label: t.nav.reserve, external },
  ];

  // The bar is always paper: a running head at the top of the sheet. Only
  // the rule under it appears, once the page has moved beneath it.
  const settled = scrolled || isOpen;

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
          <Link
            href={localeHref(code, here)}
            hrefLang={code}
            lang={code}
            aria-label={localeNames[code]}
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
    <header
      className="fixed left-0 right-0 z-50 bg-paper"
      style={{ top: "var(--notice-h, 0px)" }}
    >
      <div
        aria-hidden="true"
        className={`rule-ink absolute inset-x-0 bottom-0 transition-opacity duration-500 ease-settle ${
          settled ? "opacity-100" : "opacity-0"
        }`}
      />
      <nav className="max-w-7xl mx-auto px-6 md:px-12 flex items-center justify-between h-20 relative">
        {/* Logo */}
        <Link
          href={localeHref(locale, "/")}
          className="relative z-50 flex items-baseline gap-2.5 text-hive-700 transition-colors duration-500 ease-settle hover:text-honey-600"
        >
          <BeeGlyph size={26} className="translate-y-[3px]" />
          <span className="font-display text-xl md:text-2xl font-semibold tracking-[-0.03em]">
            {siteName}
          </span>
        </Link>

        {/* Desktop Nav */}
        <ul className="hidden md:flex items-center gap-8">
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
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary !px-6 !py-2.5"
              >
                {t.nav.reserve}
              </a>
            ) : (
              <Link
                href={localeHref(locale, reserveHref)}
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
          className="md:hidden relative z-50 w-10 h-10 flex flex-col items-center justify-center gap-1.5"
          aria-label={t.nav.menuToggle}
          aria-expanded={isOpen}
        >
          <motion.span
            animate={isOpen ? { rotate: 45, y: 6 } : { rotate: 0, y: 0 }}
            transition={{ duration: 0.6, ease: SETTLE }}
            className="w-6 h-0.5 block bg-hive-700"
          />
          <motion.span
            animate={isOpen ? { opacity: 0 } : { opacity: 1 }}
            transition={{ duration: 0.6, ease: SETTLE }}
            className="w-6 h-0.5 block bg-hive-700"
          />
          <motion.span
            animate={isOpen ? { rotate: -45, y: -6 } : { rotate: 0, y: 0 }}
            transition={{ duration: 0.6, ease: SETTLE }}
            className="w-6 h-0.5 block bg-hive-700"
          />
        </button>

        {/* Mobile Menu: a second sheet torn and laid over the page. */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={reduce ? { opacity: 0 } : { opacity: 0, x: "100%" }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, x: "100%" }}
              transition={{ duration: 0.6, ease: SETTLE }}
              className="fixed inset-0 z-40 md:hidden"
            >
              <TornEdge
                color="#E8E2D4"
                lip="rgba(255,255,255,0.55)"
                variant={1}
                className="absolute inset-x-0 top-20 -translate-y-full"
              />
              <div className="paper-panel absolute inset-x-0 top-20 bottom-0 border-0 shadow-none overflow-y-auto">
                <ul className="px-6 pt-12 pb-6">
                  {mobileLinks.map((link, i) => {
                    const active = !link.external && isActive(link.href);
                    return (
                      <motion.li
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
                              onClick={() => setIsOpen(false)}
                              className="font-display text-[2rem] leading-none tracking-[-0.02em] text-hive-700 transition-colors duration-500 ease-settle hover:text-honey-600"
                            >
                              {link.label}
                            </a>
                          ) : (
                            <Link
                              href={localeHref(locale, link.href)}
                              onClick={() => setIsOpen(false)}
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
                      </motion.li>
                    );
                  })}
                </ul>

                <motion.div
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
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* One drawn line where the sheet ends, no blur, no drop shadow. */}
      {scrolled && !isOpen && (
        <div
          aria-hidden="true"
          className="rule-ink absolute inset-x-0 bottom-0 pointer-events-none"
        />
      )}
    </header>
  );
}
