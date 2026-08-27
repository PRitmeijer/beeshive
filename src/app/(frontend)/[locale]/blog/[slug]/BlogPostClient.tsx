"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { SerializedEditorState } from "@payloadcms/richtext-lexical/lexical";
import { Lightbox } from "@/components/Lightbox";
import { ProseRichText } from "@/components/ProseRichText";
import { ScrollReveal } from "@/components/ScrollReveal";
import { Sheet } from "@/components/Sheet";
import { SketchBee } from "@/components/SketchBee";
import { TornEdge } from "@/components/TornEdge";
import { getDict } from "@/i18n/dictionaries";
import { localeHref, localeTags, type Locale } from "@/i18n/config";
import { EVENTS, track } from "@/lib/umami";

/**
 * Printer's crop marks, the mark a plate carries on a proof sheet before it is
 * trimmed. It stands in for the magnifying glass every other site puts here:
 * it says "there is a frame around this and it can be opened" in the same
 * drawn line as the arrows and the bees, and it does not look like a browser
 * chrome control landing on a piece of paper.
 */
function CropMarks({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d="M1.3 5.4 L1.4 1.5 L5.2 1.4" />
      <path d="M10.8 1.4 L14.6 1.5 L14.5 5.3" />
      <path d="M14.6 10.7 L14.5 14.6 L10.9 14.5" />
      <path d="M5.1 14.6 L1.4 14.5 L1.5 10.8" />
    </svg>
  );
}

interface BlogPostProps {
  /** The dictionary is looked up here rather than passed: it holds functions. */
  locale: Locale;
  post: {
    /**
     * The address this piece lives at. Carried on the event instead of the
     * title: it is shorter, it survives a retitle in the CMS without splitting
     * one post's figures into two rows, and it is already public in the URL.
     */
    slug?: string;
    title: string;
    publishedDate?: string;
    excerpt: string;
    content: SerializedEditorState;
    featuredImage?: {
      url?: string;
      alt?: string;
      sizes?: { card?: { url?: string }; hero?: { url?: string } };
    };
    author?: { name?: string; email?: string };
  };
}

export function BlogPostClient({ locale, post }: BlogPostProps) {
  const t = getDict(locale);
  const [photoOpen, setPhotoOpen] = useState(false);
  const closePhoto = useCallback(() => setPhotoOpen(false), []);

  // What the photograph is of, for anyone who cannot see it. The alt text is
  // the better answer where an owner has written one; the headline is what is
  // always there.
  const photo = post.featuredImage;
  const photoName = photo?.alt || post.title;

  // Which piece was read, and nothing else: that is a fact about the writing,
  // not about the reader.
  useEffect(() => {
    track(EVENTS.contentViewed, { kind: "blog", ref: post.slug ?? "" });
  }, [post.slug]);

  // Fixed timezone so the server and the browser print the same date; without
  // it the two can land on different days around midnight.
  const dateFormat = new Intl.DateTimeFormat(localeTags[locale], {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Europe/Amsterdam",
  });

  return (
    <>
      {/* Hero: the paper sheet, type hung on the bottom-left corner */}
      <section className="relative flex min-h-[38vh] items-end overflow-hidden bg-paper">
        <div className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-12 pt-32 md:px-12 md:pb-16 lg:px-20">
          <Link
            href={localeHref(locale, "/blog")}
            className="label group inline-flex items-center gap-3 transition-colors duration-500 ease-settle hover:text-honey-700"
          >
            <svg
              width="26"
              height="8"
              viewBox="0 0 26 8"
              fill="none"
              aria-hidden="true"
              focusable="false"
              className="transition-transform duration-500 ease-settle group-hover:-translate-x-1"
            >
              <path
                d="M25.4 4.1 L1.2 3.85"
                stroke="currentColor"
                strokeWidth="1.1"
                strokeLinecap="round"
              />
              <path
                d="M5.4 0.9 L1.2 4 L5.4 7.1"
                stroke="currentColor"
                strokeWidth="1.1"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {t.blog.back}
          </Link>

          <div className="mt-10 md:mt-14">
            {post.publishedDate && (
              <time
                dateTime={post.publishedDate}
                className="label figures-old block"
              >
                {dateFormat.format(new Date(post.publishedDate))}
              </time>
            )}
            <div className="rule-ink my-5 w-14" aria-hidden="true" />
            <h1 className="heading-xl text-hive-800">{post.title}</h1>
          </div>
        </div>

        <TornEdge
          color="#E8E2D4"
          lip="rgba(255,255,255,0.5)"
          variant={0}
          className="absolute inset-x-0 bottom-0 z-20"
        />
      </section>

      {/* Body: the plate mounted on stock, byline as marginalia, running
          text in a book measure */}
      <section className="section-padding relative overflow-hidden bg-paper-deep">
        <div className="mx-auto max-w-6xl">
          {/* The plate.

              This used to run the full width of the sheet at 3:2, which on a
              laptop is something like 1150 by 770 — a photograph that fills
              the window and has to be scrolled past before a word of the
              article is visible. It is a plate in a book now, not a hero: it
              hangs in the same eight columns the running text below it does,
              so the top edge of the writing and the left edge of the picture
              line up, and the byline in the margin sits beside it the way a
              printed caption would.

              The two crops are deliberate and not a fallback for one another.
              Every generated size is a centre crop, so cropping a crop moves
              the frame — and the sizes only compose cleanly when each one is
              cut straight from the original. `card` is 3:2 and `hero` is 16:9,
              so the box is 3:2 on a phone and 16:9 from the same 768px the
              <source> switches at, and neither image is ever cut twice. That
              the wider shape only appears on the wider screen is the point:
              a 16:9 band 180 pixels tall is a letterbox on a phone, and 3:2
              across a text column on a laptop is a wall.

              Sourcing it this way is also most of the weight. The owners'
              photographs are 2000-4000px originals of one to two megabytes;
              the hero re-encode runs 50 to 430 KB and the card 20 to 100. A
              phone was being handed the hero for a box a third of its width.

              The uncropped original is loaded by nothing until somebody asks
              for it — see <Lightbox> below. */}
          {photo?.url && (
            <ScrollReveal>
              <div className="mb-12 grid gap-x-8 md:mb-16 md:grid-cols-12">
                <figure className="group relative md:col-span-8 md:col-start-5">
                  <Sheet tone="deep" edge="soft" className="p-3 md:p-4">
                    <picture>
                      <source
                        media="(min-width: 768px)"
                        srcSet={photo.sizes?.hero?.url || photo.url}
                      />
                      <img
                        src={photo.sizes?.card?.url || photo.url}
                        alt={photoName}
                        className="block aspect-[3/2] w-full rounded-[2px] object-cover transition-opacity duration-700 ease-settle md:aspect-[16/9] group-hover:opacity-[0.92]"
                      />
                    </picture>
                  </Sheet>

                  {/* The affordance. Most of the people reading this are on a
                      phone, where there is no hover to discover anything with,
                      so it has to be visible standing still — but a plate on
                      paper cannot carry a magnifying glass without the whole
                      conceit falling over. A rule, a small-caps word and a set
                      of crop marks say the same thing in the house's own
                      hand. */}
                  <figcaption className="mt-3 flex items-center gap-2.5">
                    <span className="rule-ink w-8 shrink-0" aria-hidden="true" />
                    <span className="label transition-colors duration-700 ease-settle group-hover:text-honey-700">
                      {t.blog.photo.hint}
                    </span>
                    <CropMarks className="text-honey-600/70 transition-colors duration-700 ease-settle group-hover:text-honey-700" />
                  </figcaption>

                  {/* A real button, laid over the whole figure rather than
                      wrapped around it: <Sheet> renders divs, and the caption
                      has to be inside the <figure> to be a caption, so neither
                      can legally live inside a <button>. Covering the caption
                      too means the words that say "vergroten" are themselves
                      part of the thing you press, which is what a thumb will
                      try. The focus ring the site draws globally traces this
                      element, so it outlines the plate and its caption
                      together. */}
                  <button
                    type="button"
                    onClick={() => setPhotoOpen(true)}
                    aria-label={t.blog.photo.enlarge(photoName)}
                    className="absolute inset-0 z-10 h-full w-full cursor-zoom-in"
                  />
                </figure>
              </div>
            </ScrollReveal>
          )}

          <div className="grid gap-x-8 gap-y-8 md:grid-cols-12">
            <ScrollReveal direction="right" className="md:col-span-3">
              <aside>
                {post.author?.name && (
                  <p className="label">{t.blog.by(post.author.name)}</p>
                )}
                <div className="rule-ink mt-4 w-12" aria-hidden="true" />
                <SketchBee
                  size={52}
                  variant={2}
                  strokeWidth={1}
                  className="mt-8 text-sage-500"
                />
              </aside>
            </ScrollReveal>

            <ScrollReveal delay={0.1} className="md:col-span-8 md:col-start-5">
              {/* The `prose-*` utilities that used to dress this element were
                  doing nothing: @tailwindcss/typography is not among the
                  plugins in tailwind.config.ts, so every one of them compiled
                  to an empty class. The measure and the rhythm are set by the
                  converters above instead. */}
              <article className="max-w-none">
                {/* The lead hangs left of the running text, the way a printed
                    opening breaks its own column. */}
                <p className="drop-cap max-w-[36rem] text-xl leading-[1.7] text-hive-600 md:-ml-8 lg:-ml-12">
                  {post.excerpt}
                </p>

                {/* What the owners actually wrote. Until now this said the
                    article "is loaded from the CMS" and pointed at /admin —
                    a note to the developer left standing on the public page,
                    which is all a reader would ever have seen of a real post. */}
                <ProseRichText
                  locale={locale}
                  data={post.content}
                  className="mt-10 max-w-[34rem]"
                />
              </article>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* Only ever rendered once the reader has asked for it, and pointed at
          the upload's own file rather than any of the generated sizes: those
          are all centre crops of a photograph that is usually taller than it
          is wide, and what somebody opening this wants is the half of the
          picture the plate cut off. */}
      {photo?.url && (
        <Lightbox
          open={photoOpen}
          onClose={closePhoto}
          src={photo.url}
          alt={photoName}
          label={t.blog.photo.dialog(photoName)}
          closeLabel={t.blog.photo.close}
        />
      )}
    </>
  );
}
