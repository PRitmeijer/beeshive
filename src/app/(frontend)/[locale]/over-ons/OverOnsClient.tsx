"use client";

import { CraftIcon } from "@/components/CraftIcon";
import { ScrollReveal } from "@/components/ScrollReveal";
import { SketchBee } from "@/components/SketchBee";
import { TornEdge } from "@/components/TornEdge";
import type { SiteSettingsData } from "@/lib/payload";
import { getDict } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";

interface Props {
  /** The dictionary is looked up here rather than passed: it holds functions. */
  locale: Locale;
  settings: SiteSettingsData;
}

export function OverOnsClient({ locale, settings: s }: Props) {
  const t = getDict(locale);
  const values =
    (s.values as { icon: string; title: string; text: string }[]) || [];

  return (
    <>
      {/* Hero: the paper sheet, type hung on the bottom-left corner */}
      <section className="relative flex min-h-[38vh] items-end overflow-hidden bg-paper">
        <div className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-12 pt-32 md:px-12 md:pb-16 lg:px-20">
          <p className="label">{t.about.eyebrow}</p>
          <div className="rule-ink my-5 w-14" aria-hidden="true" />
          <h1 className="heading-xl text-hive-800">{t.about.title}</h1>
        </div>

        <TornEdge
          color="#E8E2D4"
          lip="rgba(255,255,255,0.5)"
          variant={0}
          className="absolute inset-x-0 bottom-0 z-20"
        />
      </section>

      {/* Story: narrow measure on the right, marginalia rail on the left */}
      <section className="section-padding relative overflow-hidden bg-paper-deep">
        <div className="mx-auto grid max-w-6xl gap-x-8 gap-y-10 md:grid-cols-12">
          <ScrollReveal direction="right" className="md:col-span-3">
            {/* The rail carries no label any more: the story eyebrow sits in
                the hero. What is left is the printed rule and the drawn mark,
                the way the menu marks a margin. */}
            <aside>
              <div className="rule-ink w-12" aria-hidden="true" />
              <SketchBee
                size={56}
                variant={1}
                strokeWidth={1}
                className="mt-8 text-sage-500"
              />
            </aside>
          </ScrollReveal>

          <div className="md:col-span-8 md:col-start-5">
            <ScrollReveal>
              <div className="max-w-[34rem] space-y-7 text-lg leading-[1.75] text-hive-500">
                <p className="drop-cap text-xl leading-[1.7] text-hive-600">
                  {s.aboutIntro}
                </p>

                {/* Rich text story from CMS, or fallback paragraphs */}
                {s.aboutStory ? (
                  <div
                    className="space-y-7 [&_a]:text-honey-600 [&_h2]:font-display [&_h2]:text-hive-700 [&_h3]:font-display [&_h3]:text-hive-700 [&_strong]:text-hive-700"
                    dangerouslySetInnerHTML={{
                      __html:
                        typeof s.aboutStory === "string"
                          ? s.aboutStory
                          : "",
                    }}
                  />
                ) : (
                  <>
                    <p>{t.about.fallbackStoryOrigin}</p>
                    <p>{t.about.fallbackStoryCraft(s.siteName)}</p>
                    <p>{t.about.fallbackStoryCommunity(s.siteName)}</p>
                  </>
                )}
              </div>
            </ScrollReveal>

            {/* Pull quote: the brush script from the printed cards, set wider
                than the measure and pulled left so it breaks the column. */}
            <ScrollReveal delay={0.1}>
              <figure className="mt-16 max-w-[37rem] md:-ml-8 md:mt-20 lg:-ml-16">
                <div className="rule-ink w-full" aria-hidden="true" />
                <blockquote className="py-10 md:py-14">
                  <p className="title-hand text-[2rem] leading-[1.3] [text-indent:-0.24em] md:text-[3rem]">
                    &ldquo;{s.aboutQuote}&rdquo;
                  </p>
                </blockquote>
                <div className="rule-ink w-full" aria-hidden="true" />
              </figure>
            </ScrollReveal>
          </div>
        </div>

        {values.length > 0 && (
          <TornEdge
            color="#F1ECE1"
            lip="rgba(255,255,255,0.5)"
            variant={1}
            className="absolute inset-x-0 bottom-0 z-20"
          />
        )}
      </section>

      {/* Values: a printed index: number and mark in the rail, text offset */}
      {values.length > 0 && (
        <section className="section-padding relative overflow-hidden bg-paper">
          <ol className="mx-auto max-w-6xl space-y-14 md:space-y-20">
            {values.map((v, i) => (
              <li key={v.title} className="relative pt-14 first:pt-0 md:pt-20">
                {i > 0 && (
                  <div
                    className="rule-ink absolute inset-x-0 top-0"
                    aria-hidden="true"
                  />
                )}
                <ScrollReveal delay={i * 0.12}>
                  <article className="grid items-start gap-x-8 gap-y-6 md:grid-cols-12">
                    <div className="flex items-center gap-5 md:col-span-3 md:block">
                      <span
                        className="figures-old text-[1.65rem] leading-none text-honey-500"
                        aria-hidden="true"
                      >
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <CraftIcon
                        name={v.icon}
                        size={44}
                        className="text-honey-600 md:mt-7"
                      />
                    </div>

                    <div className="md:col-span-7 md:col-start-5">
                      <h3 className="heading-md text-hive-700">{v.title}</h3>
                      <div className="rule-ink my-5 w-10" aria-hidden="true" />
                      <p className="max-w-[30rem] leading-relaxed text-hive-400">
                        {v.text}
                      </p>
                    </div>
                  </article>
                </ScrollReveal>
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}
