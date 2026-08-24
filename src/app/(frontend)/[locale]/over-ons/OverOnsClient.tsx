"use client";

import { ProseRichText } from "@/components/ProseRichText";
import { ScrollReveal } from "@/components/ScrollReveal";
import { SketchBee } from "@/components/SketchBee";
import { Sheet } from "@/components/Sheet";
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
  // One plate under the quote: a video if the owners have pasted one in,
  // otherwise a photo, otherwise nothing at all. A video wins because it is
  // the more deliberate thing to have gone and made.
  const video = s.aboutVideoUrl?.trim();
  // Payload hands back the whole document once populated; if it ever hands
  // back a bare id there is no url on it and this reads as "no picture".
  const image = video ? null : s.aboutImage;
  const imageSrc = image?.sizes?.hero?.url || image?.url || "";
  const mediaCaption = s.aboutMediaCaption?.trim();

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
          {/* The margin rail. Wider than a rail needs to be for a rule and a
              drawn bee, because it also carries the picture: on an About page
              the photograph belongs beside the story, in the margin the eye
              starts from, not buried underneath it. */}
          <ScrollReveal direction="right" className="md:col-span-4">
            <aside>
              {/* The rail carries no label any more: the story eyebrow sits in
                  the hero. What is left is the printed rule and the drawn
                  mark, the way the menu marks a margin. */}
              <div className="rule-ink w-12" aria-hidden="true" />
              <SketchBee
                size={56}
                variant={1}
                strokeWidth={1}
                className="mt-8 text-sage-500"
              />

              {/* Mounted on a cut sheet, the same way the map is on /contact. */}
              {(video || imageSrc) && (
                <figure className="mt-10 md:mt-12">
                  <Sheet tone="deep" edge="soft">
                    <div className="p-3 md:p-4">
                      {video ? (
                        // 16:9, held by the padding trick rather than a fixed
                        // height, so it keeps its shape at every width.
                        <div className="relative w-full pt-[56.25%]">
                          <iframe
                            src={video}
                            title={mediaCaption || t.about.mediaTitle}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                            loading="lazy"
                            referrerPolicy="strict-origin-when-cross-origin"
                            className="absolute inset-0 h-full w-full border-0"
                          />
                        </div>
                      ) : (
                        // Plain <img>, as the gallery does: these come off the
                        // Payload media store, already resized.
                        <img
                          src={imageSrc}
                          alt={image?.alt || t.about.mediaTitle}
                          width={image?.width || undefined}
                          height={image?.height || undefined}
                          loading="lazy"
                          className="block h-auto w-full"
                        />
                      )}
                    </div>
                  </Sheet>
                  {mediaCaption && (
                    <figcaption className="label mt-4 !text-hive-400">
                      {mediaCaption}
                    </figcaption>
                  )}
                </figure>
              )}
            </aside>
          </ScrollReveal>

          <div className="md:col-span-7 md:col-start-6">
            <ScrollReveal>
              <div className="max-w-[34rem] space-y-7 text-lg leading-[1.75] text-hive-500">
                <p className="drop-cap text-xl leading-[1.7] text-hive-600">
                  {s.aboutIntro}
                </p>

                {/* What the owners wrote in the CMS, or the story that
                    shipped with the site while they have not written one.

                    This used to hand `aboutStory` to dangerouslySetInnerHTML as
                    if it were HTML. A Payload rich text field is not HTML — it
                    is a serialised Lexical document — so the guard on that line
                    never matched, the story rendered as an empty div, and
                    because the document was still truthy the fallback below did
                    not get its turn either. The page simply lost its middle. */}
                {s.aboutStory ? (
                  <ProseRichText locale={locale} data={s.aboutStory} />
                ) : (
                  <>
                    <p>{t.about.fallbackStoryOrigin}</p>
                    <p>{t.about.fallbackStoryCraft(s.siteName)}</p>
                    <p>{t.about.fallbackStoryCommunity(s.siteName)}</p>
                  </>
                )}
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>
    </>
  );
}
