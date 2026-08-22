"use client";

import Link from "next/link";
import { ScrollReveal } from "@/components/ScrollReveal";
import { Sheet } from "@/components/Sheet";
import { SketchBee } from "@/components/SketchBee";
import { TornEdge } from "@/components/TornEdge";
import { getDict, type Dict } from "@/i18n/dictionaries";
import { localeHref, localeTags, type Locale } from "@/i18n/config";

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  publishedDate?: string;
  featuredImage?: {
    url?: string;
    alt?: string;
    sizes?: { card?: { url?: string } };
  };
}

/**
 * Shown until the CMS holds its first published article. The slugs stay the
 * same in both languages, only the copy is looked up per language.
 */
function placeholderPosts(t: Dict): BlogPost[] {
  return [
    {
      id: "1",
      slug: "welkom",
      publishedDate: "2025-06-14",
      ...t.blog.samplePosts.welcome,
    },
    {
      id: "2",
      slug: "seizoensgebonden-koken",
      publishedDate: "2025-07-01",
      ...t.blog.samplePosts.seasonal,
    },
    {
      id: "3",
      slug: "zuid-afrikaanse-smaken",
      publishedDate: "2025-07-15",
      ...t.blog.samplePosts.southAfrican,
    },
  ];
}

/** Hand-drawn marks differ from one another; the index picks which. */
function beeVariant(i: number): 0 | 1 | 2 {
  return (i % 3) as 0 | 1 | 2;
}

/** A drawn line-arrow, replacing the typographic one. */
function ArrowMark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 26 8"
      width="26"
      height="8"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d="M0.6 4.1 L23.4 3.9" />
      <path d="M19.6 1 L23.6 4 L19.5 7.1" />
    </svg>
  );
}

interface Props {
  /** The dictionary is looked up here rather than passed: it holds functions. */
  locale: Locale;
  posts: BlogPost[];
}

export function BlogClient({ locale, posts: cmsPosts }: Props) {
  const t = getDict(locale);
  const posts = cmsPosts.length > 0 ? cmsPosts : placeholderPosts(t);

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
      {/* ===== HEAD OF THE SHEET ===== */}
      <section className="relative flex min-h-[38vh] items-end overflow-hidden bg-paper">
        <div className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-12 pt-32 md:px-12 md:pb-16 lg:px-20">
          <p className="label">{t.blog.eyebrow}</p>
          <div className="rule-ink my-5 w-14" aria-hidden="true" />
          <h1 className="heading-xl text-hive-800">{t.blog.title}</h1>
        </div>
        <TornEdge
          color="#E8E2D4"
          lip="rgba(255,255,255,0.5)"
          variant={0}
          className="absolute inset-x-0 bottom-0 z-20"
        />
      </section>

      {/* ===== THE ENTRIES: a printed index, not a deck of cards ===== */}
      <section className="section-padding relative overflow-hidden bg-paper-deep">
        <div className="mx-auto max-w-6xl">
          {posts.map((post, i) => (
            <ScrollReveal key={post.id} delay={Math.min(i * 0.08, 0.32)}>
              {i > 0 && <div className="rule-ink w-full" aria-hidden="true" />}
              <article className="group py-10 md:py-14">
                <Link
                  href={localeHref(locale, `/blog/${post.slug}`)}
                  className="grid gap-6 md:grid-cols-12 md:gap-8"
                >
                  {/* Index rail: plate number over the date. */}
                  <div className="md:col-span-2 flex items-baseline gap-4 md:flex-col md:items-start md:gap-3">
                    <span
                      className="figures-old font-display text-2xl leading-none text-honey-500"
                      aria-hidden="true"
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span
                      className="rule-ink hidden md:block w-8"
                      aria-hidden="true"
                    />
                    {post.publishedDate && (
                      <time
                        dateTime={post.publishedDate}
                        className="label figures-old leading-relaxed"
                      >
                        {dateFormat.format(new Date(post.publishedDate))}
                      </time>
                    )}
                  </div>

                  {/* Baselines alternate down the page, so the column of
                      entries reads as a set rather than a stack. */}
                  <div
                    className={`md:col-span-4 ${i % 2 === 1 ? "md:mt-10" : ""}`}
                  >
                    <Sheet tone="paper" edge="soft">
                      <figure className="p-2 md:p-2.5">
                        {post.featuredImage?.url ? (
                          <img
                            src={
                              post.featuredImage.sizes?.card?.url ||
                              post.featuredImage.url
                            }
                            alt={post.featuredImage.alt || post.title}
                            className="aspect-[4/3] w-full object-cover"
                          />
                        ) : (
                          <div className="flex aspect-[4/3] w-full items-center justify-center bg-paper-shade">
                            <SketchBee
                              size={84}
                              variant={beeVariant(i)}
                              strokeWidth={1}
                              className="text-sage-500/30"
                            />
                          </div>
                        )}
                      </figure>
                    </Sheet>
                  </div>

                  <div
                    className={`md:col-span-6 ${i % 2 === 0 ? "md:mt-10" : ""}`}
                  >
                    <h2 className="heading-md text-hive-700 transition-colors duration-700 ease-settle group-hover:text-honey-600">
                      {post.title}
                    </h2>
                    <div className="rule-ink mt-5 w-14" aria-hidden="true" />
                    <p className="mt-5 max-w-[34rem] leading-relaxed text-hive-400">
                      {post.excerpt}
                    </p>
                    <span className="mt-6 inline-flex items-center gap-3 text-honey-600">
                      <span className="label ink-link !text-current group-hover:[background-size:100%_1px]">
                        {t.blog.readMore}
                      </span>
                      <ArrowMark className="transition-transform duration-700 ease-settle group-hover:translate-x-1" />
                    </span>
                  </div>
                </Link>
              </article>
            </ScrollReveal>
          ))}

          {posts.length === 0 && (
            <div className="py-20">
              <SketchBee
                size={44}
                variant={0}
                strokeWidth={1}
                className="text-sage-500/70"
              />
              <div className="rule-ink w-16 my-5" aria-hidden="true" />
              <p className="text-hive-400">{t.blog.empty}</p>
            </div>
          )}
        </div>

        {/* No edge here: <Footer> draws its own tear up into this section. */}
      </section>
    </>
  );
}
