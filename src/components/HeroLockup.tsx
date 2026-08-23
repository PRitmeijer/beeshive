import { LogoSvg } from "@/components/LogoSvg";

/**
 * The masthead on the landing page: the crest, and the name under it.
 *
 * This replaces a cleverer thing that did not survive contact with a browser.
 * The first attempt was one element that lived in the header's flex row and
 * was scaled and translated by a scroll-driven custom property, so that the
 * big lockup and the bar's running head were literally the same node. It reads
 * well as an idea and it behaved badly: it had to reserve its settled box in
 * the bar the whole time, which left an empty rectangle sitting next to the
 * title, and a transformed element inside a fixed header is exactly the
 * compositing case this codebase has been bitten by before.
 *
 * So the two are two things now. This one is ordinary page content at the top
 * of the hero, and it scrolls away because the page scrolls. The bar's own
 * lockup fades in behind it once the reader has moved (see Masthead.tsx and
 * SETTLE_AT in Navigation.tsx). Nothing is transformed, nothing is measured,
 * nothing has to agree with anything else about where it is.
 *
 * THE CREST, not the bare bee. `logo.svg` is the finished mark: the bee, the
 * chef's hat, the two laurel branches. It carries no wordmark of its own,
 * which is what makes it safe to set the name in type underneath rather than
 * printing the name twice. The bar keeps the bee on its own, because a crest
 * with two branches does not survive being 26 pixels tall.
 */
export function HeroLockup({ siteName }: { siteName: string }) {
  return (
    <div className="mb-8 flex flex-col items-start md:mb-9">
      {/* The crest arrives first and the name a beat later, which is the order
          you would draw them in. Both are CSS keyframes rather than an
          animation library: this is a fade and a small lift on first paint,
          and the hero's Largest Contentful Paint used to be gated behind
          hydration for exactly this kind of decoration. */}
      <div
        className="hero-rise [--rise-delay:0s] [--rise-travel:10px]"
        aria-hidden="true"
      >
        <LogoSvg
          fill="#422810"
          className="h-auto w-[10rem] sm:w-[12rem] md:w-[14rem] lg:w-[18rem]"
        />
      </div>

      <h1 className="hero-rise mt-5 font-display text-[2.75rem] font-semibold leading-[0.95] tracking-[-0.035em] text-hive-800 [--rise-delay:0.1s] sm:text-6xl md:text-7xl lg:text-[5.5rem]">
        {siteName}
      </h1>
    </div>
  );
}
