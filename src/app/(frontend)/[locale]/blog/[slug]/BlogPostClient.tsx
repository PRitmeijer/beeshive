"use client";

import Link from "next/link";
import { ScrollReveal } from "@/components/ScrollReveal";
import { Sheet } from "@/components/Sheet";
import { SketchBee } from "@/components/SketchBee";
import { TornEdge } from "@/components/TornEdge";
import { getDict } from "@/i18n/dictionaries";
import { localeHref, localeTags, type Locale } from "@/i18n/config";

interface BlogPostProps {
  /** The dictionary is looked up here rather than passed: it holds functions. */
  locale: Locale;
  post: {
    title: string;
    publishedDate?: string;
    excerpt: string;
    content: any;
    featuredImage?: {
      url?: string;
      alt?: string;
      sizes?: { hero?: { url?: string } };
    };
    author?: { name?: string; email?: string };
  };
}

export function BlogPostClient({ locale, post }: BlogPostProps) {
  const t = getDict(locale);

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
          {post.featuredImage?.url && (
            <ScrollReveal>
              <figure className="mb-20 md:mb-28">
                <Sheet tone="deep" edge="soft" className="p-3 md:p-4">
                  <img
                    src={
                      post.featuredImage.sizes?.hero?.url ||
                      post.featuredImage.url
                    }
                    alt={post.featuredImage.alt || post.title}
                    className="block aspect-[3/2] w-full rounded-[2px] object-cover"
                  />
                </Sheet>
              </figure>
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
              <article className="prose prose-lg max-w-none prose-headings:font-display prose-headings:tracking-[-0.01em] prose-headings:text-hive-700 prose-p:leading-[1.75] prose-p:text-hive-500 prose-a:text-honey-600 prose-a:underline prose-a:decoration-honey-400 prose-a:underline-offset-4 prose-blockquote:border-l-2 prose-blockquote:border-honey-400 prose-blockquote:pl-6 prose-blockquote:font-display prose-blockquote:font-normal prose-blockquote:not-italic prose-blockquote:text-hive-700 prose-strong:font-semibold prose-strong:text-hive-700 prose-em:text-hive-600 prose-li:text-hive-500 prose-hr:border-hive-200 prose-img:rounded-[2px] prose-figcaption:text-hive-300">
                {/* The lead hangs left of the running text, the way a printed
                    opening breaks its own column. */}
                <p className="drop-cap max-w-[36rem] text-xl leading-[1.7] text-hive-600 md:-ml-8 lg:-ml-12">
                  {post.excerpt}
                </p>

                {/* Rich text content rendered by Payload */}
                <div className="mt-10 max-w-[34rem] text-lg leading-[1.75] text-hive-500">
                  <p>
                    {t.blog.cmsNoticeBefore}
                    <a href="/admin" className="ink-link">
                      {t.blog.cmsNoticeLink}
                    </a>
                    {t.blog.cmsNoticeAfter}
                  </p>
                </div>
              </article>
            </ScrollReveal>
          </div>
        </div>
      </section>
    </>
  );
}
