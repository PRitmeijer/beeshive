"use client";

import { m, useReducedMotion, useScroll, useTransform } from "@/components/motion";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ScrollReveal } from "@/components/ScrollReveal";
import { MailingListForm } from "@/components/MailingListForm";
import { SketchBee } from "@/components/SketchBee";
import { TornEdge } from "@/components/TornEdge";
import {
  StampStrip,
  type FocalPoint,
  type StampPanel,
} from "@/components/StampStrip";
import type { SiteSettingsData } from "@/lib/payload";
import { getDict } from "@/i18n/dictionaries";
import { localeHref, type Locale } from "@/i18n/config";

interface Props {
  /** The dictionary is looked up here rather than passed: it holds functions. */
  locale: Locale;
  settings: SiteSettingsData;
  /** Resolved server-side so no date maths runs during hydration. */
  /**
   * Today as the schedule resolved it. `note` is the owners' own explanation
   * of why this day is not the ordinary one — "Eerste Kerstdag", "besloten
   * feest" — and is only ever set when a rule or an exception had the last
   * word, so printing it unconditionally cannot produce noise.
   */
  today: { label: string; open: boolean; note?: string };
}

// The two grounds the landing page is printed on: the cream sheet, and the
// sand of their existing site under the sign-up. A torn edge is the incoming
// section's fill painted into the outgoing one, so SAND must stay in step with
// `bg-paper-shade` in tailwind.config.ts.
const SAND = "#DCD5AC";
const LIP_LIGHT = "rgba(255,255,255,0.5)";

/** A drawn line-arrow, replacing the arrow glyph the old cards used. */
function DrawnArrow({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 34 12"
      width="30"
      height="11"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d="M0.8 6.2 C9.4 5.5 19.6 5.9 32.2 6.1" />
      <path d="M26.6 1.9 L32.4 6.1 L26.8 10.4" />
    </svg>
  );
}

/** Scroll cue drawn as a stroke with a flicked arrowhead, not a mouse outline. */
function ScrollMark() {
  return (
    <svg
      viewBox="0 0 12 44"
      width="12"
      height="44"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.1"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M6.1 1.4 C5.5 12.6 6.5 23.8 6 35.2" />
      <path d="M1.9 30.4 L6 35.8 L10.2 30.2" />
    </svg>
  );
}

/**
 * The printed bee cluster from the dessert page, three drawn bees at
 * slightly different sizes and angles, sitting still on the sheet. The
 * drifting ones are separate; these are artwork, not animation.
 */
function BeePlate() {
  return (
    <div
      className="pointer-events-none absolute bottom-8 left-[52%] hidden text-sage-400/75 xl:block"
      aria-hidden="true"
    >
      <div className="relative h-40 w-52">
        <div className="absolute left-[86px] top-0 -rotate-12">
          <SketchBee size={58} variant={0} strokeWidth={1} />
        </div>
        <div className="absolute left-0 top-[44px] rotate-6">
          <SketchBee size={50} variant={1} strokeWidth={1} />
        </div>
        <div className="absolute left-[110px] top-[68px] rotate-[22deg]">
          <SketchBee size={70} variant={2} strokeWidth={1} />
        </div>
      </div>
    </div>
  );
}

export function HomeClient({ locale, settings: s, today }: Props) {
  const t = getDict(locale);
  const heroRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  // The hero fade is a wide-screen device. On a phone the hero is a tall
  // scrolling block, so the stamp strip sits below the fold and the fade
  // washes it out exactly as you reach it. Read after mount and default to
  // false, so the server and the first client paint agree.
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1280px)");
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  const parallax = wide && !reduce;
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  // useReducedMotion() is null during SSR. Branching `style`, `initial` or
  // `animate` on it changes the server-rendered markup and hydrates dirty, so
  // it may only ever flatten an output range or zero a duration. Both ranges
  // below evaluate identically at scroll position 0, which is what SSR emits.
  // Hold the hero fully legible for the first stretch of the scroll. Fading
  // from 0 leaves the type half gone while the hero still fills the screen,
  // which on a light ground just reads as a blank sheet.
  const heroOpacity = useTransform(scrollYProgress, [0.3, 0.95], parallax ? [1, 0] : [1, 1]);
  const heroY = useTransform(scrollYProgress, [0, 1], parallax ? [0, 90] : [0, 0]);

  // The hero title still comes from the CMS, but it is no longer set on the
  // page: the masthead in the header is the name now, and printing it again
  // here was the third time a reader met it before learning anything. It is
  // kept for screen readers and for the CMS field to still mean something —
  // the pipe that used to mark the accent word is just a space when spoken.
  const heroTitleSpoken = s.heroTitle.split("|").join(" ").trim();

  /**
   * The three photographs.
   *
   * The owners fill these in under Site Instellingen → Homepage; until they
   * do, the strip keeps the three files that have been in /public since the
   * site was built, with the stand-in captions from the dictionary.
   *
   * Deliberately the original upload rather than one of Payload's named
   * sizes. Those are hard centre-crops to a fixed shape, and a zoom-out of a
   * crop reveals nothing that was not already there — which is the whole
   * point of the control the owners asked for. The plates draw these at about
   * 270 points across, so the browser has plenty to work with either way.
   *
   * WebP, not the JPEGs that are still beside them in /public. These three
   * are the only photographs the repository ships and they are the whole of
   * the hero's weight: 286 KiB as JPEG, 170 KiB re-encoded by
   * scripts/optimise-photos.mjs, on the page a phone loads first. The strip
   * draws them as SVG <image>, which takes one URL and has no way to ask the
   * browser what it can decode, so a format cannot be offered — it has to be
   * chosen, for everyone. WebP is the format every browser released since
   * 2020 reads; AVIF would save another 60 KiB and would show a browser two
   * years older an empty plate. The JPEGs stay where they are: they are the
   * originals, and they are what a scraper without an Accept header will
   * take.
   *
   * The family portrait starts at 78 rather than 100 because that is the
   * photograph the owners were talking about: at full bleed the plate cuts
   * the group off at both shoulders. They can move it from the CMS now, but
   * the picture should be right before anyone touches it.
   */
  const fallbackPanels: StampPanel[] = [
    {
      src: "/food-34.webp",
      alt: t.home.stamps.kitchenAlt,
      caption: t.home.stamps.kitchenCaption,
      aspect: 900 / 675,
    },
    {
      src: "/family.webp",
      alt: t.home.stamps.familyAlt,
      caption: t.home.stamps.familyCaption,
      aspect: 900 / 581,
      zoom: 78,
    },
    {
      src: "/food-03.webp",
      alt: t.home.stamps.seasonAlt,
      caption: t.home.stamps.seasonCaption,
      aspect: 900 / 675,
    },
  ];

  const chosen: StampPanel[] = s.heroImages
    .map((row): StampPanel | null => {
      const src = row.image?.url;
      if (!src) return null;
      const w = row.image?.width;
      const h = row.image?.height;
      return {
        src,
        alt: row.image?.alt || row.caption || "",
        caption: row.caption || "",
        aspect: w && h ? w / h : undefined,
        zoom: row.zoom ?? 100,
        focalPoint: (row.focalPoint as FocalPoint) || "center",
      };
    })
    .filter((panel): panel is StampPanel => panel !== null);

  const panels = chosen.length ? chosen : fallbackPanels;

  return (
    <>
      {/* ===== HERO: the sheet itself, not a dark room =====
           The name is not printed here any more. It is the masthead in the
           header — big and centred over this sheet until the reader moves,
           then folded away into the running head — so what is left below is
           the part that was always doing the work: when they are open, what
           the place is, and the way in.

           `items-start` rather than centred, and the top padding says exactly
           where the type begins. Vertical centring used to be fine because
           the block filled the screen; now that the lockup has been lifted out
           it would float the remaining lines up under a masthead whose
           position is fixed to the header, and the two would collide on some
           screen sizes and not others. `svh` rather than `vh` because iOS
           measures `vh` against the tallest the viewport ever gets and then
           collapses its URL bar into the difference. */}
      <section
        ref={heroRef}
        className="relative flex min-h-[88svh] items-start overflow-hidden bg-paper xl:min-h-[max(44rem,88svh)]"
        aria-label={t.home.heroLabel}
      >
        {/* The drawn bees sit still on the sheet, the way they do on the
            printed dessert page. Nothing drifts. */}
        <BeePlate />

        <m.div
          style={{ opacity: heroOpacity, y: heroY }}
          className="relative z-10 w-full px-6 pb-24 pt-44 md:px-12 md:pb-28 md:pt-56 lg:px-20 lg:pt-64 xl:pt-60"
        >
          {/* A column below xl so the photographs can be dealt in above the
              buttons; the old block layout again from xl up, where the strip
              leaves the flow for the right margin and the order stops
              mattering. */}
          <div className="relative mx-auto flex w-full max-w-6xl flex-col xl:block">
            <div className="relative z-10 max-w-3xl">
              <p className="sr-only">{heroTitleSpoken}</p>

              <div
                className="hero-rise rule-ink mb-8 w-28 [--rise-delay:0.15s] [--rise-travel:0px]"
                aria-hidden="true"
              />

              {/* Sits with the rule, not down by the buttons: it is a fact
                  about the place, not a call to action.

                  The bullet is there because the second half is a link and
                  the first half is not. A gap alone read as one sentence
                  about today, and nobody clicked the end of it. */}
              <p
                className="hero-rise mb-7 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.82rem] tracking-[0.02em] text-hive-400 [--rise-delay:0.25s] [--rise-travel:0px]"
              >
                <span>{today.label}</span>
                {today.note ? (
                  <span className="italic text-hive-300">{today.note}</span>
                ) : null}
                <span aria-hidden="true" className="text-honey-500 text-[0.7rem]">
                  &bull;
                </span>
                <Link
                  href={localeHref(locale, "/contact")}
                  className="group inline-flex items-center gap-2 text-honey-600 transition-colors duration-500 ease-settle hover:text-honey-700"
                >
                  <span className="ink-link !text-current group-hover:[background-size:100%_1px]">
                    {t.hours.allTimes}
                  </span>
                  <DrawnArrow className="transition-transform duration-500 ease-settle group-hover:translate-x-1" />
                </Link>
              </p>

              <p className="hero-rise max-w-xl text-lg leading-relaxed text-hive-400 md:text-2xl">
                {s.heroSubtitle}
              </p>
            </div>

            {/* One strip torn from a sheet, rather than three loose stamps:
                shared format, one angle, perforations punched through between
                the panels.

                Wide enough for a side column, it hangs in the right margin.
                Below that there is no margin to hang in, so it is torn off
                sideways instead and runs across the measure: three panels
                shoulder to shoulder, rather than a thin tower of three with a
                page-height gutter of nothing beside it. It hangs from above
                the text's own top margin, because the masthead is standing in
                the space over the column and the strip has a full 535 points
                to fall through before the sheet is torn off at the bottom.

                On a phone it now comes before the buttons rather than after
                them. It used to be the last thing on a very tall hero, which
                meant the one part of this page that shows what the place
                actually looks like was two screens down. With the name lifted
                into the header there is room for it to land inside the first
                screen, which is where it earns its keep.

                Landing inside the first screen also makes it the largest
                thing there, so it is what Chrome now times the page by, and
                .hero-rise rather than framer-motion for the same reason the
                subtitle is: the same 16 points of travel, the same settle,
                the same half second behind it, but painted straight out of
                the server's HTML rather than held at opacity 0 until an
                animation library has downloaded and hydrated. */}
            <div
              className="hero-rise mt-9 [--rise-delay:0.5s] [--rise-duration:1.1s] [--rise-travel:16px] xl:absolute xl:-top-20 xl:right-2 xl:mt-0"
            >
              <StampStrip
                panels={panels}
                orientation="horizontal"
                tilt={-1.4}
                className="w-full max-w-[34rem] xl:hidden"
              />
              <StampStrip
                panels={panels}
                orientation="vertical"
                className="hidden w-[214px] xl:block"
              />
            </div>

            <div
              className="hero-rise relative z-10 mt-9 flex max-w-3xl flex-col gap-4 [--rise-delay:0.6s] sm:flex-row xl:mt-12"
            >
              <Link href={localeHref(locale, "/kaart")} className="btn-primary">
                {t.home.ctaMenu}
              </Link>
              <Link
                href={localeHref(locale, "/over-ons")}
                className="btn-secondary"
              >
                {t.home.ctaAbout}
              </Link>
            </div>
          </div>
        </m.div>

        {/* xl only, the breakpoint at which the stamp strip moves out to the
            right margin. Below it the strip drops under the text and the cue
            lands on top of the photographs — pointing at a scroll the reader
            has already started, over the one thing worth looking at. */}
        <div
          className="hero-rise absolute bottom-16 left-6 z-10 hidden text-honey-500/60 [--rise-delay:1.4s] [--rise-duration:0.9s] [--rise-travel:0px] md:left-12 lg:left-20 xl:block"
          aria-hidden="true"
        >
          {/* The cue nudges for as long as the landing page is open, which
              as a motion value meant a rAF callback running forever behind
              whatever the reader was doing. As a keyframe the compositor
              owns it and the main thread never hears about it; the
              prefers-reduced-motion block in globals.css already stops every
              animation on the page, so the branch this used to carry has
              nothing left to decide. */}
          <div className="scroll-nudge">
            <ScrollMark />
          </div>
        </div>

        <TornEdge
          color={SAND}
          lip={LIP_LIGHT}
          variant={0}
          className="absolute inset-x-0 bottom-0 z-20"
        />
      </section>

      {/* ===== MAILING LIST =====
           The one thing that still follows the landing page. Everything the
           old middle of this page said — the introduction, the pull-quote,
           the two cards — is said properly on /over-ons, /kaart and /blog,
           and saying it twice only made the front door long. */}
      <section
        className="section-padding relative overflow-hidden bg-paper-shade"
        aria-label={t.home.newsletterLabel}
      >
        <div className="relative z-10 mx-auto max-w-2xl text-center">
          <ScrollReveal>
            <span className="label">{t.home.newsletterEyebrow}</span>
            <h2 className="heading-lg mt-4 text-hive-800">{s.newsletterTitle}</h2>
            <div className="rule-ink mx-auto mt-8 w-16" aria-hidden="true" />
            <p className="mt-8 leading-relaxed text-hive-400">{s.newsletterText}</p>
          </ScrollReveal>
          <ScrollReveal delay={0.2} className="mt-10">
            <MailingListForm
              locale={locale}
              privacyNote={s.newsletterPrivacyNote}
            />
          </ScrollReveal>
        </div>
      </section>
    </>
  );
}
