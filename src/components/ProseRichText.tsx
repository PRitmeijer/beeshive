"use client";

import {
  RichText,
  type JSXConvertersFunction,
} from "@payloadcms/richtext-lexical/react";
import type { SerializedEditorState } from "@payloadcms/richtext-lexical/lexical";
import { localeHref, type Locale } from "@/i18n/config";

/**
 * Where a document one of the owners links to from inside their writing lives
 * on the public site.
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
 * How rich text written in the CMS is drawn on the public site.
 *
 * Tailwind's typography plugin is not installed and preflight strips the
 * browser's own margins, so nothing below can be left to a default — an
 * unstyled `<p>` would sit flush against the next one. Writing the converters
 * out by hand also keeps the running text in the same ink as the rest of the
 * sheet: house rules, house links, the same measure as the lead.
 *
 * Built per language rather than once, because a link to another page on the
 * site has to keep the reader in the language they are reading in.
 *
 * This started life inside the blog post page and moved out when the Over Ons
 * story turned out to need exactly the same treatment. Both pages carry their
 * title in the one `h1`, which is what the heading rule below assumes; a third
 * page that does not would need its own converters rather than a flag here.
 */
export const proseConverters =
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
      // The page title is its only h1. A heading typed into the body is
      // therefore demoted one level, so writing that opens with a big heading
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

interface Props {
  locale: Locale;
  data: SerializedEditorState;
  className?: string;
}

/** CMS rich text, drawn in the house style. */
export function ProseRichText({ locale, data, className }: Props) {
  return (
    <RichText
      data={data}
      converters={proseConverters(locale)}
      className={`payload-richtext${className ? ` ${className}` : ""}`}
    />
  );
}
