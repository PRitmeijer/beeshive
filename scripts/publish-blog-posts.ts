/**
 * The five articles the blog opens with, in both languages.
 *
 * Run with: npx tsx scripts/publish-blog-posts.ts
 *
 * These are not samples. `scripts/seed.ts` writes three placeholder posts whose
 * whole body is their own summary — enough to prove the page renders, not
 * enough to be worth reading — and this replaces them with pieces that are
 * actually about something. The words themselves live in
 * `scripts/blog-articles.ts`, which says where they came from; this file is
 * only the machinery that gets them into Payload.
 *
 * Idempotent. Posts are matched on their slug: existing ones are updated in
 * place, so re-running after fixing a typo does not create a second copy and
 * does not disturb anything the owners wrote in the admin panel afterwards
 * beyond the fields listed here.
 *
 * Every English write passes `fallbackLocale: false`. See scripts/README.md
 * for what happens when one does not; the short version is that Payload
 * otherwise stores the Dutch text of every field the patch did not mention
 * into the English rows, and no fallback can undo that afterwards.
 */
import { getPayload } from "payload";
import type { Payload } from "payload";
import config from "@payload-config";
import { existsSync, copyFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ARTICLES, SAMPLE_SLUGS, type Article } from "./blog-articles";

// Same reason as scripts/seed.ts: the adapter would otherwise push a fresh
// schema on connect, underneath whatever dev server is holding the database.
process.env.PAYLOAD_MIGRATING = "true";

/**
 * Where the photographs from the old site live. They are not in the repository
 * — they are a few hundred megabytes of holiday-sized JPEGs — so the script
 * takes a directory and carries on without pictures when it is not there.
 */
const PHOTO_DIR =
  process.env.BLOG_PHOTO_DIR ||
  path.join(process.env.HOME || "", "download/DBH/img/gallery");

const log = (line: string) => console.log(`[blog] ${line}`);

// ---------------------------------------------------------------------------
// Markdown to Lexical
//
// The articles are written as text rather than as node trees, because a
// node tree is unreadable at that length and the point of keeping the copy in
// the repository is that somebody can read it. This handles exactly the
// subset used here: paragraphs, ## and ### headings, > quotes, - bullets,
// **bold** and [links](/somewhere). Anything else is a paragraph.
//
// The converters in src/components/ProseRichText.tsx are the other half of
// this contract: every block type produced here has one there.
// ---------------------------------------------------------------------------

const INLINE = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*/g;

function textNode(text: string, format = 0) {
  return { type: "text", detail: 0, format, mode: "normal", style: "", text, version: 1 };
}

function linkNode(label: string, url: string) {
  // A link that leaves the site opens in a tab of its own; one that stays on
  // it does not, because a reader following a cross-reference between two of
  // our own articles has not asked for a second window.
  const external = /^[a-z][a-z0-9+.-]*:/i.test(url);
  return {
    type: "link",
    format: "",
    indent: 0,
    version: 3,
    direction: "ltr",
    fields: { linkType: "custom", url, newTab: external },
    children: [textNode(label)],
  };
}

function inlineNodes(source: string) {
  const nodes: unknown[] = [];
  let cursor = 0;
  for (const match of source.matchAll(INLINE)) {
    const at = match.index ?? 0;
    if (at > cursor) nodes.push(textNode(source.slice(cursor, at)));
    if (match[1] !== undefined) nodes.push(linkNode(match[1], match[2]));
    else nodes.push(textNode(match[3], 1));
    cursor = at + match[0].length;
  }
  if (cursor < source.length) nodes.push(textNode(source.slice(cursor)));
  return nodes;
}

const block = (type: string, extra: Record<string, unknown>, children: unknown[]) => ({
  type,
  format: "",
  indent: 0,
  version: 1,
  direction: "ltr",
  ...extra,
  children,
});

function toLexical(markdown: string) {
  const children = markdown
    .trim()
    .split(/\n\s*\n/)
    .map((raw) => {
      const lines = raw.trim().split("\n");
      const first = lines[0];

      const heading = /^(#{2,4})\s+(.*)$/.exec(first);
      if (heading) {
        return block("heading", { tag: `h${heading[1].length}` }, inlineNodes(heading[2]));
      }

      if (lines.every((line) => line.startsWith("> "))) {
        return block("quote", {}, inlineNodes(lines.map((l) => l.slice(2)).join(" ")));
      }

      if (lines.every((line) => line.startsWith("- "))) {
        const items = lines.map((line, index) =>
          block("listitem", { value: index + 1 }, inlineNodes(line.slice(2))),
        );
        return block("list", { tag: "ul", listType: "bullet", start: 1 }, items);
      }

      return block("paragraph", { textFormat: 0 }, inlineNodes(lines.join(" ")));
    });

  return { root: { type: "root", format: "", indent: 0, version: 1, direction: "ltr", children } };
}

/** Every word a reader would see, for telling an edited post from a seeded one. */
function plainText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const record = node as Record<string, unknown>;
  const own = typeof record.text === "string" ? record.text : "";
  const children = Array.isArray(record.children)
    ? record.children.map((child) => plainText(child)).join(" ")
    : "";
  return `${own} ${children}`.trim();
}


// ---------------------------------------------------------------------------

/**
 * Drop the seeded placeholders — but only while they are still placeholders.
 *
 * A seeded post's entire body is its own summary; that is the signature this
 * looks for. Anything else means somebody opened the admin panel and wrote,
 * and a script that came to add articles has no business deleting those.
 */
async function removeSamples(payload: Payload): Promise<void> {
  for (const slug of SAMPLE_SLUGS) {
    const { docs } = await payload.find({
      collection: "blog-posts",
      where: { slug: { equals: slug } },
      locale: "nl",
      limit: 1,
    });
    const doc = docs[0] as { id: number | string; excerpt?: string; content?: unknown } | undefined;
    if (!doc) continue;

    const body = plainText((doc.content as { root?: unknown })?.root).trim();
    if (body !== (doc.excerpt ?? "").trim()) {
      log(`"${slug}" laten staan: de tekst is bewerkt, dit is geen voorbeeldpost meer`);
      continue;
    }

    await payload.delete({ collection: "blog-posts", id: doc.id });
    log(`"${slug}" verwijderd (voorbeeldpost)`);
  }
}

/**
 * Upload one photograph from the old site, or hand back nothing.
 *
 * The file is copied to a temporary name first: Payload derives the stored
 * filename from the basename it is given, and "20250523_151724.jpg" tells
 * nobody in the media library what they are looking at.
 */
async function uploadPhoto(
  payload: Payload,
  photo: NonNullable<Article["photo"]>,
  scratch: string,
): Promise<number | string | undefined> {
  const existing = await payload.find({
    collection: "media",
    where: { filename: { equals: photo.filename } },
    limit: 1,
  });
  if (existing.docs[0]) return (existing.docs[0] as { id: number | string }).id;

  const source = path.join(PHOTO_DIR, photo.source);
  if (!existsSync(source)) {
    log(`foto ontbreekt, post krijgt de getekende plaat: ${photo.source}`);
    return undefined;
  }

  const staged = path.join(scratch, photo.filename);
  copyFileSync(source, staged);

  const created = await payload.create({
    collection: "media",
    locale: "nl",
    data: { alt: photo.alt.nl } as never,
    filePath: staged,
  });
  await payload.update({
    collection: "media",
    id: created.id,
    locale: "en",
    fallbackLocale: false,
    data: { alt: photo.alt.en } as never,
  });
  log(`foto geüpload: ${photo.filename}`);
  return created.id;
}

async function main() {
  const payload = await getPayload({ config });
  const scratch = mkdtempSync(path.join(tmpdir(), "beeshive-blog-"));

  // Posts are signed by whoever owns the site; the collection takes one user.
  const users = await payload.find({ collection: "users", limit: 1 });
  const author = (users.docs[0] as { id: number | string } | undefined)?.id;
  if (!author) log("geen gebruiker gevonden, posts worden zonder auteur opgeslagen");

  await removeSamples(payload);

  for (const article of ARTICLES) {
    const image = article.photo ? await uploadPhoto(payload, article.photo, scratch) : undefined;

    const { docs } = await payload.find({
      collection: "blog-posts",
      where: { slug: { equals: article.slug } },
      limit: 1,
    });
    const found = docs[0] as { id: number | string } | undefined;

    // `tags` and `category` are not localized, so they belong to the Dutch
    // write only; repeating them in the English patch would be harmless today
    // and wrong the moment either field gains `localized: true`.
    const dutch = {
      title: article.nl.title,
      slug: article.slug,
      excerpt: article.nl.excerpt,
      content: toLexical(article.nl.body),
      category: article.category,
      tags: article.tags,
      status: "published",
      publishedDate: article.publishedDate,
      ...(author ? { author } : {}),
      ...(image ? { featuredImage: image } : {}),
    };

    const id = found
      ? ((await payload.update({
          collection: "blog-posts",
          id: found.id,
          locale: "nl",
          data: dutch as never,
        })) as { id: number | string }).id
      : ((await payload.create({
          collection: "blog-posts",
          locale: "nl",
          data: dutch as never,
        })) as { id: number | string }).id;

    await payload.update({
      collection: "blog-posts",
      id,
      locale: "en",
      fallbackLocale: false,
      data: {
        title: article.en.title,
        excerpt: article.en.excerpt,
        content: toLexical(article.en.body),
      } as never,
    });

    log(`${found ? "bijgewerkt" : "aangemaakt"}: ${article.slug}`);
  }

  log(`klaar, ${ARTICLES.length} artikelen in beide talen`);
  process.exit(0);
}

main().catch((error) => {
  console.error("[blog] mislukt:", error);
  process.exit(1);
});
