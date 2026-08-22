"use client";

import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ScrollReveal } from "@/components/ScrollReveal";
import { MailingListForm } from "@/components/MailingListForm";
import { SketchBee } from "@/components/SketchBee";
import { RosemarySprig } from "@/components/RosemarySprig";
import { LogoSvg } from "@/components/LogoSvg";
import { CraftIcon } from "@/components/CraftIcon";
import { TornEdge } from "@/components/TornEdge";
import { Sheet } from "@/components/Sheet";
import { StampStrip } from "@/components/StampStrip";
import type { SiteSettingsData } from "@/lib/payload";
import { getDict } from "@/i18n/dictionaries";
import { localeHref, type Locale } from "@/i18n/config";

interface Props {
  /** The dictionary is looked up here rather than passed: it holds functions. */
  locale: Locale;
  settings: SiteSettingsData;
  /** Resolved server-side so no date maths runs during hydration. */
  today: { label: string; open: boolean };
}

const SETTLE = [0.16, 0.84, 0.28, 1] as const;

// The grounds the landing page is printed on: cream sheet, second sheet, the
// sand of their existing site, and one band of chocolate brown.
const PAPER = "#F1ECE1";
const PAPER_DEEP = "#E8E2D4";
const SAND = "#DCD5AC";
const COCOA = "#331E0C";
const INK = "#422810";
const LIP_LIGHT = "rgba(255,255,255,0.5)";
const LIP_GOLD = "rgba(216,190,126,0.3)";

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

  // Support pipe-separated hero title for accent word, e.g. "De Bee's|Hive"
  const titleParts = s.heroTitle.split("|");
  const titleMain = titleParts[0];
  const titleAccent = titleParts[1] || "";

  const features = (s.features as { icon: string; title: string; text: string }[]) || [];

  // Deliberate baseline stagger across the index, set here so the columns
  // don't line up like a table.
  const indexOffset = ["", "md:mt-10", "md:mt-20"];

  return (
    <>
      {/* ===== HERO: the sheet itself, not a dark room ===== */}
      <section
        ref={heroRef}
        className="relative flex min-h-[88vh] items-center overflow-hidden bg-paper md:min-h-screen"
        aria-label={t.home.heroLabel}
      >
        {/* The drawn bees sit still on the sheet, the way they do on the
            printed dessert page. Nothing drifts. */}
        <BeePlate />

        <motion.div
          style={{ opacity: heroOpacity, y: heroY }}
          className="relative z-10 w-full px-6 py-24 md:px-12 md:py-32 lg:px-20"
        >
          <div className="relative mx-auto w-full max-w-6xl">
            <div
              className="pointer-events-none absolute bottom-[34%] left-[44%] z-0 hidden -rotate-[10deg] text-sage-500/60 lg:block"
              aria-hidden="true"
            >
              <RosemarySprig size={112} />
            </div>

            <div className="relative z-10 max-w-3xl">
              <motion.div
                initial={{ opacity: 0, y: -14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reduce ? 0 : 1.2, ease: SETTLE }}
                className="mb-10"
              >
                {/* Printed in the same ink as the headings, so the lockup
                    reads as one drawn thing rather than a coloured badge. */}
                <LogoSvg width={300} height={174} fill={INK} />
              </motion.div>

              <motion.p
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reduce ? 0 : 1, delay: 0.25, ease: SETTLE }}
                className="heading-xl text-hive-800"
                aria-hidden="true"
              >
                {titleMain}
                {titleAccent && (
                  <>
                    {" "}
                    <span className="text-honey-600 italic">{titleAccent}</span>
                  </>
                )}
              </motion.p>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: reduce ? 0 : 1, delay: 0.4, ease: SETTLE }}
                className="rule-ink my-9 w-28"
                aria-hidden="true"
              />

              {/* Sits with the rule, not down by the buttons: it is a fact
                  about the place, not a call to action. */}
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: reduce ? 0 : 1, delay: 0.45, ease: SETTLE }}
                className="-mt-4 mb-9 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.82rem] tracking-[0.02em] text-hive-400"
              >
                <span>{today.label}</span>
                <Link
                  href={localeHref(locale, "/contact")}
                  className="group inline-flex items-center gap-2 text-honey-600 transition-colors duration-500 ease-settle hover:text-honey-700"
                >
                  <span className="ink-link !text-current group-hover:[background-size:100%_1px]">
                    {t.hours.allTimes}
                  </span>
                  <DrawnArrow className="transition-transform duration-500 ease-settle group-hover:translate-x-1" />
                </Link>
              </motion.p>

              <motion.p
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reduce ? 0 : 1, delay: 0.5, ease: SETTLE }}
                className="max-w-xl text-lg leading-relaxed text-hive-400 md:text-2xl"
              >
                {s.heroSubtitle}
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reduce ? 0 : 1, delay: 0.7, ease: SETTLE }}
                className="mt-12 flex flex-col gap-4 sm:flex-row"
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
              </motion.div>

            </div>

            {/* One strip torn from a sheet, rather than three loose stamps:
                shared format, one angle, perforations punched through between
                the panels. */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduce ? 0 : 1.1, delay: 0.9, ease: SETTLE }}
              className="mt-16 w-[172px] sm:w-[196px] xl:absolute xl:right-2 xl:top-0 xl:mt-0 xl:w-[214px]"
            >
              <StampStrip
                panels={[
                  {
                    src: "/food-34.jpg",
                    alt: t.home.stamps.kitchenAlt,
                    caption: t.home.stamps.kitchenCaption,
                  },
                  {
                    src: "/family.jpg",
                    alt: t.home.stamps.familyAlt,
                    caption: t.home.stamps.familyCaption,
                  },
                  {
                    src: "/food-03.jpg",
                    alt: t.home.stamps.seasonAlt,
                    caption: t.home.stamps.seasonCaption,
                  },
                ]}
              />
            </motion.div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: reduce ? 0 : 0.9, delay: 1.4, ease: SETTLE }}
          className="absolute bottom-16 left-6 z-10 text-honey-500/60 md:left-12 lg:left-20"
          aria-hidden="true"
        >
          <motion.div
            animate={{ y: reduce ? [0, 0, 0] : [0, 8, 0] }}
            transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
          >
            <ScrollMark />
          </motion.div>
        </motion.div>

        <TornEdge
          color={PAPER_DEEP}
          lip={LIP_LIGHT}
          variant={0}
          className="absolute inset-x-0 bottom-0 z-20"
        />
      </section>

      {/* ===== INTRODUCTION ===== */}
      <section
        className="section-padding relative overflow-hidden bg-paper-deep"
        aria-label={t.home.introLabel}
      >
        <div className="relative mx-auto max-w-6xl">
          <div className="grid gap-y-8 md:grid-cols-12 md:gap-x-10">
            {/* Eyebrow set in its own narrow rail, beside the heading */}
            <div className="md:col-span-3 md:pt-4">
              <ScrollReveal>
                <span className="label">{t.home.welcome}</span>
                <div className="rule-ink mt-5 w-12" aria-hidden="true" />
              </ScrollReveal>
            </div>

            <div className="md:col-span-8 md:col-start-5">
              <ScrollReveal delay={0.1}>
                <h2 className="heading-lg text-hive-800">{s.introTitle}</h2>
                <p className="drop-cap mt-8 max-w-2xl text-lg leading-[1.8] text-hive-400">
                  {s.introText}
                </p>
              </ScrollReveal>
            </div>
          </div>

          {features.length > 0 && (
            <ol className="mt-24 grid gap-x-10 gap-y-16 md:grid-cols-3">
              {features.map((item, i) => (
                <li key={item.title} className={indexOffset[i % 3]}>
                  {/* The hanging indent lives on the revealed element itself:
                      framer-motion's transform makes it the containing block,
                      so the index would otherwise sit inside the indent while
                      the reveal is running. */}
                  <ScrollReveal delay={i * 0.12} className="relative pl-12 md:pl-14">
                    <article>
                      <span
                        className="figures-old absolute left-0 top-0 text-[1.65rem] leading-none text-honey-500"
                        aria-hidden="true"
                      >
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <CraftIcon name={item.icon} size={38} className="text-honey-600" />
                      <div className="rule-ink mt-6 w-full" aria-hidden="true" />
                      <h3 className="heading-md mt-6 text-hive-700">{item.title}</h3>
                      <p className="mt-4 leading-relaxed text-hive-400">{item.text}</p>
                    </article>
                  </ScrollReveal>
                </li>
              ))}
            </ol>
          )}
        </div>

        <TornEdge
          color={COCOA}
          lip={LIP_GOLD}
          variant={1}
          className="absolute inset-x-0 bottom-0 z-20"
        />
      </section>

      {/* ===== PULL-QUOTE: the one coloured band, printed like a menu bar ===== */}
      <section
        className="relative overflow-hidden bg-hive-800 px-6 py-28 md:py-36"
        aria-label={t.home.quoteLabel}
      >
        <div className="relative z-10 mx-auto max-w-3xl text-center">
          <ScrollReveal>
            <SketchBee size={44} className="mx-auto text-honey-300/60" strokeWidth={1} />
            <blockquote className="mt-9">
              <p className="title-hand text-3xl leading-[1.3] !text-honey-300 md:text-5xl">
                &ldquo;{s.quote}&rdquo;
              </p>
              <cite className="label mt-9 block !text-honey-200 not-italic">
                {s.quoteAttribution}
              </cite>
            </blockquote>
          </ScrollReveal>
        </div>

        <TornEdge
          color={PAPER}
          lip={LIP_LIGHT}
          variant={0}
          className="absolute inset-x-0 bottom-0 z-20"
        />
      </section>

      {/* ===== FEATURED SECTION ===== */}
      <section
        className="section-padding relative overflow-hidden bg-paper"
        aria-label={t.home.discoverLabel}
      >
        <div className="relative mx-auto max-w-6xl">
          <ScrollReveal>
            <div className="mb-20 flex flex-col gap-7 md:flex-row md:items-end md:justify-between md:gap-14">
              <div>
                <span className="label">{t.home.discoverEyebrow}</span>
                <h2 className="heading-lg mt-4 text-hive-800">
                  {t.home.discoverTitle}
                </h2>
              </div>
              <div className="rule-ink w-full md:mb-4 md:w-1/3" aria-hidden="true" />
            </div>
          </ScrollReveal>

          <div className="grid gap-x-12 gap-y-16 md:grid-cols-2">
            {[
              {
                title: t.home.cards.menuTitle,
                desc: t.home.cards.menuText,
                link: "/kaart",
                label: t.home.cards.menuLink,
                icon: "pan",
              },
              {
                title: t.home.cards.eventsTitle,
                desc: t.home.cards.eventsText,
                link: "/blog",
                label: t.home.cards.eventsLink,
                icon: "palette",
              },
            ].map((card, i) => (
              <ScrollReveal
                key={card.title}
                delay={i * 0.12}
                className={i === 1 ? "md:mt-16" : ""}
              >
                {/* A real cut sheet, deckle and all, laid on the page. */}
                <Sheet tone="deep" edge="soft" className="group h-full">
                  <div className="relative p-8 md:p-10">
                    <span
                      className="figures-old absolute right-8 top-8 text-sm text-honey-500 md:right-10 md:top-10"
                      aria-hidden="true"
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <CraftIcon name={card.icon} size={44} className="text-honey-600" />
                    <h3 className="heading-md mt-8 text-hive-700 transition-colors duration-500 ease-settle group-hover:text-honey-600">
                      {card.title}
                    </h3>
                    <div className="rule-ink mt-5 w-14" aria-hidden="true" />
                    <p className="mt-5 leading-relaxed text-hive-400">{card.desc}</p>
                    <Link
                      href={localeHref(locale, card.link)}
                      className="group/link mt-8 inline-flex items-center gap-3 text-honey-600 transition-colors duration-500 ease-settle hover:text-honey-700"
                    >
                      <span className="label ink-link !text-current group-hover/link:[background-size:100%_1px]">
                        {card.label}
                      </span>
                      <DrawnArrow className="transition-transform duration-500 ease-settle group-hover/link:translate-x-1" />
                    </Link>
                  </div>
                </Sheet>
              </ScrollReveal>
            ))}
          </div>
        </div>

        <TornEdge
          color={SAND}
          lip={LIP_LIGHT}
          variant={1}
          className="absolute inset-x-0 bottom-0 z-20"
        />
      </section>

      {/* ===== MAILING LIST ===== */}
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
            <MailingListForm locale={locale} />
          </ScrollReveal>
        </div>
      </section>
    </>
  );
}
