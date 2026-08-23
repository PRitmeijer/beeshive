"use client";

import Link from "next/link";
import { BeeGlyph } from "@/components/BeeGlyph";
import { localeHref, type Locale } from "@/i18n/config";

/**
 * The running head: the bee and the name, in the bar, at the size the bar has
 * always carried them.
 *
 * On every page but one it is simply there. On the landing page it waits: the
 * crest and the name are printed large at the top of the hero (see
 * HeroLockup.tsx), and printing them again in the bar two centimetres above
 * would be the duplication this was all meant to remove. So it fades in as the
 * reader moves, at the same moment the bar puts its paper down, which is when
 * there is finally something underneath worth labelling.
 *
 * It used to be more ambitious than this. One element lived here and was
 * scaled and translated by a scroll-driven custom property so that the big
 * lockup and this one were the same node, morphing between the two states.
 * That version had to reserve its settled box in the flex row the entire time,
 * which drew an empty rectangle beside the hero title, and it put a
 * continuously transformed element inside a fixed header — the compositing
 * hazard .paper-ground carries a whole paragraph about. Two plain elements and
 * an opacity are worth more than the clever version was.
 */

export type MastheadVariant = "hero" | "standard";

interface MastheadProps {
  locale: Locale;
  siteName: string;
  variant: MastheadVariant;
  /**
   * Whether the bar is showing its ground yet. On the landing page this is
   * what the lockup waits for; everywhere else it is always true.
   */
  settled: boolean;
  /**
   * The mobile sheet covers the page from the bottom of the bar down, and the
   * lockup is the one thing in the bar that is not a control. It steps aside
   * while the menu is the page.
   */
  away?: boolean;
}

export function Masthead({
  locale,
  siteName,
  variant,
  settled,
  away = false,
}: MastheadProps) {
  // Hidden rather than absent, so the flex row is laid out identically in both
  // states and the language switch and the hamburger never shift sideways.
  const shown = variant === "standard" || settled;

  return (
    <div
      className={`relative z-50 transition-opacity duration-500 ease-settle ${
        shown && !away ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
      aria-hidden={shown && !away ? undefined : "true"}
    >
      <Link
        href={localeHref(locale, "/")}
        tabIndex={shown && !away ? undefined : -1}
        className="flex items-baseline gap-2.5 text-hive-700 transition-colors duration-500 ease-settle hover:text-honey-600"
      >
        <BeeGlyph size={26} className="translate-y-[3px]" />
        <span className="whitespace-nowrap font-display text-xl font-semibold tracking-[-0.03em] md:text-2xl">
          {siteName}
        </span>
      </Link>
    </div>
  );
}
