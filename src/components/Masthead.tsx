"use client";

import Link from "next/link";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { BeeGlyph } from "@/components/BeeGlyph";
import { localeHref, type Locale } from "@/i18n/config";

/**
 * The name of the place, printed once.
 *
 * It used to be printed three times on the landing page: the running head in
 * the bar, the drawn lockup in the hero, and the hero title under it. Three
 * introductions to a reader who has not been given a single fact about the
 * café yet. What the owners asked for instead is one masthead — the mark and
 * the name, big, sitting where the bar would be and spilling down into the
 * hero — which then packs itself away into the running head as the reader
 * starts to move.
 *
 * The important word in that is *packs itself away*, not *is replaced by*. It
 * is one element throughout. It starts as the bar's own lockup at
 * `--mh-k0` times its size and ends at exactly the lockup this bar has always
 * carried on every other page: the bee at 26 pixels, the name at 20 or 24.
 * Nothing fades into anything else, because there is nothing else.
 *
 * WHY THE BEE AND NOT THE FULL DRAWN LOGO. The obvious reading of "the big
 * logo on top" is <LogoSvg>, and it was tried. Two things rule it out. It
 * carries its own wordmark, so pairing it with the bar's text name puts the
 * name on the page twice again, which is the thing being fixed. And it is
 * thirty-odd bezier paths: scaling a vector continuously forces the browser to
 * re-rasterise it on every frame, and thirty paths at 60fps is exactly the
 * kind of thing that makes a phone stutter. The bee is one path, it is the
 * half of the artwork the bar already uses, and it is what makes the mark
 * theirs. So the bee travels and the wordmark is set in type, at both ends.
 *
 * WHY useScroll AND NOT A SCROLL LISTENER. Both were on the table. A listener
 * writing a custom property is fine on paper but goes through React state or a
 * rAF of its own, and the naive version fires a style recalculation from a
 * scroll handler — the classic way to lose frames on a phone. A MotionValue
 * writes straight to the element's style outside React's render, once per
 * animation frame, and nothing above it re-renders. It also gives us the
 * server-side answer for free: at scroll zero the value is 1, on the server
 * and on the client alike.
 *
 * WHICH MATTERS, because <Navigation> already carries a comment about this and
 * <HomeClient> carries another: useReducedMotion() is null while the page is
 * being rendered on the server, so it may never decide what the markup *is*,
 * only how far a value is allowed to travel. Both branches below are the same
 * number at scroll position zero, which is the only position the server knows
 * about. With motion reduced the lockup simply swaps state halfway through the
 * same 180 pixels instead of gliding through them.
 */

/** How far the reader has to move before the masthead has finished settling. */
const SETTLE_DISTANCE = 180;

export type MastheadVariant = "hero" | "standard";

interface MastheadProps {
  locale: Locale;
  siteName: string;
  /**
   * "hero" is the landing page: no wordmark in the bar to begin with, because
   * the masthead is standing in front of it. "standard" is every other page,
   * where the running head is a running head from the first pixel.
   */
  variant: MastheadVariant;
  /**
   * The mobile sheet opens from the bottom of the bar downwards, and on the
   * landing page the big masthead is standing exactly there. Rather than have
   * the two argue about z-index, the masthead steps out of the way for as long
   * as the menu is the page. Only the big state is in the way, but fading both
   * keeps it one rule instead of two.
   */
  away?: boolean;
}

export function Masthead({
  locale,
  siteName,
  variant,
  away = false,
}: MastheadProps) {
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();

  // 1 while the masthead is big and centred, 0 once it has settled into the
  // bar. Reduced motion gets the same two ends and no journey between them;
  // note both ranges read 1 at scrollY 0, which is what the server renders.
  const s = useTransform(
    scrollY,
    reduce
      ? [0, SETTLE_DISTANCE / 2 - 1, SETTLE_DISTANCE / 2, SETTLE_DISTANCE]
      : [0, SETTLE_DISTANCE],
    reduce ? [1, 1, 0, 0] : [1, 0],
    { clamp: true },
  );

  const hero = variant === "hero";

  return (
    // The box this element occupies in the bar's flex row never changes — the
    // whole performance is a transform — so `justify-between`, the language
    // switch and the hamburger stay exactly where they were laid out.
    //
    // --mh-k0 is stepped by screen rather than fluid because the lockup must
    // never be wider than the screen it is centred on, and the only honest way
    // to know its width is to measure it, which would mean a first paint with
    // the wrong number in it. The steps are chosen so that "De Bee's Hive" at
    // that size still clears the edges of the narrowest phone in each band.
    <motion.div
      style={hero ? ({ "--mh-s": s } as React.CSSProperties) : undefined}
      className={`masthead-lockup relative z-50 [--mh-pad:1.5rem] transition-opacity duration-300 ease-settle md:[--mh-pad:3rem] ${
        away ? "pointer-events-none opacity-0" : "opacity-100"
      } ${
        hero
          ? "[--mh-k0:1.65] [--mh-y:5.5rem] min-[400px]:[--mh-k0:1.9] sm:[--mh-k0:2.3] sm:[--mh-y:6rem] md:[--mh-k0:2.7] md:[--mh-y:6.5rem] lg:[--mh-k0:3.15] lg:[--mh-y:7.75rem]"
          : ""
      }`}
    >
      <Link
        href={localeHref(locale, "/")}
        className="flex items-baseline gap-2.5 text-hive-700 transition-colors duration-500 ease-settle hover:text-honey-600"
      >
        <BeeGlyph size={26} className="translate-y-[3px]" />
        <span className="whitespace-nowrap font-display text-xl font-semibold tracking-[-0.03em] md:text-2xl">
          {siteName}
        </span>
      </Link>
    </motion.div>
  );
}
