"use client";

import Link from "next/link";
import { useEffect } from "react";
import {
  RichText,
  type JSXConvertersFunction,
} from "@payloadcms/richtext-lexical/react";
import type { SerializedEditorState } from "@payloadcms/richtext-lexical/lexical";
import { ScrollReveal } from "@/components/ScrollReveal";
import { Sheet } from "@/components/Sheet";
import { SketchBee } from "@/components/SketchBee";
import { TornEdge } from "@/components/TornEdge";
import { getDict } from "@/i18n/dictionaries";
import { localeHref, localeTags, type Locale } from "@/i18n/config";
import { EVENTS, track } from "@/lib/umami";

interface BlogPostProps {
  /** The dictionary is looked up here rather than passed: it holds functions. */
  locale: Locale;
  post: {
    title: string;
    publishedDate?: string;
    excerpt: string;
    content: SerializedEditorState;
    featuredImage?: {
      url?: string;
      alt?: string;
      sizes?: { hero?: { url?: string } };
    };
    author?: { name?: string; email?: string };
  };
}

/**
 * Where a document one of the owners links to from inside an article lives on
 * the public site.
 *
 * It repeats `publicPathByCollection` in src/payload.config.ts rather than
 * importing it, because that module is the entire CMS: pulling it in here would
 * drag Payload, the database adapter and the whole admin panel into the browser
 * bundle for the sake of two strings. If a route is renamed, both have to move.
 */
const publicPathByCollection: Record<string, string> = {
  "blog-posts": "blog",
  events: "evenementen",
};

/**
 * How the article's rich text is drawn.
 *
 * Tailwind's typography plugin is not installed and preflight strips the
 * browser's own margins, so nothing below can be left to a default — an
 * unstyled `<p>` would sit flush against the next one. Writing the converters
 * out by hand also keeps the running text in the same ink as the rest of the
 * sheet: house rules, house links, the same measure as the lead.
 *
 * Built per language rather than once, because a link to another page on the
 * site has to keep the reader in the language they are reading in.
 */
const articleConverters =
  (locale: Locale): JSXConvertersFunction =>
  ({ defaultConverters }) => ({
    ...defaultConverters,

    paragraph: ({ node, nodesToJSX }) => {
      const children = nodesToJSX({ nodes: node.children });
      // An empty paragraph is what pressing Enter twice leaves behind. The gap
      // between paragraphs is already set here, so honouring it would only open
      // a hole the writer did not mean to make.
      if (!children?.length) return null;
      return (
        <p className="mt-6 text-lg leading-[1.75] text-hive-500 first:mt-0">
          {children}
        </p>
      );
    },

    heading: ({ node, nodesToJSX }) => {
      // The post title is the page's only h1. A heading typed into the body is
      // therefore demoted one level, so an article that opens with a big heading
      // does not give the page two first-level headings and a broken outline.
      const level = Math.min(Number(node.tag.slice(1)) + 1, 6);
      const Tag = `h${level}` as "h2" | "h3" | "h4" | "h5" | "h6";
      return (
        <Tag
          className={`mt-12 text-hive-700 first:mt-0 ${
            level <= 3 ? "heading-md" : "font-display text-lg"
          }`}
        >
          {nodesToJSX({ nodes: node.children })}
        </Tag>
      );
    },

    quote: ({ node, nodesToJSX }) => (
      <blockquote className="my-10 border-l-2 border-honey-400 pl-6 font-display text-xl leading-[1.6] text-hive-700">
        {nodesToJSX({ nodes: node.children })}
      </blockquote>
    ),

    list: ({ node, nodesToJSX }) => {
      const Tag = node.tag as "ol" | "ul";
      return (
        <Tag
          className={`mt-6 space-y-2 pl-6 text-lg leading-[1.75] text-hive-500 ${
            node.listType === "number" ? "list-decimal" : "list-disc"
          } marker:text-honey-500`}
        >
          {nodesToJSX({ nodes: node.children })}
        </Tag>
      );
    },

    horizontalrule: () => <div className="rule-ink my-12 w-full" />,

    link: ({ node, nodesToJSX }) => {
      const { fields } = node;
      let href = fields.url ?? "#";
      if (fields.linkType === "internal") {
        const doc = fields.doc;
        const segment = publicPathByCollection[doc?.relationTo ?? ""];
        const value = doc?.value;
        const slug =
          value && typeof value === "object" && "slug" in value
            ? String((value as { slug?: unknown }).slug ?? "")
            : "";
        // Nothing sensible to point at: keep the words, drop the link, rather
        // than sending a reader to the "#" the default converter falls back to.
        if (!segment || !slug) return <>{nodesToJSX({ nodes: node.children })}</>;
        href = localeHref(locale, `/${segment}/${slug}`);
      }
      return (
        <a
          href={href}
          className="ink-link"
          rel={fields.newTab ? "noopener noreferrer" : undefined}
          target={fields.newTab ? "_blank" : undefined}
        >
          {nodesToJSX({ nodes: node.children })}
        </a>
      );
    },

    // A node type nobody wrote a converter for — a relationship, say — otherwise
    // prints the literal words "unknown node" on the public page.
    unknown: () => null,
  });

export function BlogPostClient({ locale, post }: BlogPostProps) {
  const t = getDict(locale);

  // The title, and nothing else: which piece was read is a fact about the
  // writing, not about the reader.
  useEffect(() => {
    track(EVENTS.blogPostRead, { title: post.title });
  }, [post.title]);

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
                <RichText
                  data={post.content}
                  converters={articleConverters(locale)}
                  className="payload-richtext mt-10 max-w-[34rem]"
                />
              </article>
            </ScrollReveal>
          </div>
        </div>
      </section>
    </>
  );
}
