import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPayloadClient, getSiteSettings } from "@/lib/payload";
import { asUpload, buildMetadata } from "@/lib/metadata";
import { getDict } from "@/i18n/dictionaries";
import { alternatesFor, parseLocale, type Locale } from "@/i18n/config";
import { BlogPostClient } from "./BlogPostClient";

/**
 * Five minutes. An article is finished when it is published and then sits
 * still, so there is nothing here worth a shorter window — and a post that has
 * just been shared is exactly the page a burst of traffic lands on. See the
 * note above `revalidate` on the home page for what the caching buys.
 */
export const revalidate = 300;

type PageProps = { params: Promise<{ locale: string; slug: string }> };

/** One published article in one language, or null when there is none. */
async function findPost(slug: string, locale: Locale) {
  try {
    const payload = await getPayloadClient();
    const res = await payload.find({
      collection: "blog-posts",
      where: {
        slug: { equals: slug },
        status: { equals: "published" },
      },
      depth: 2,
      limit: 1,
      locale,
    });
    return res.docs[0] ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { locale: raw, slug } = await params;
  const locale = parseLocale(raw);
  if (!locale) return {};

  const [post, s] = await Promise.all([
    findPost(slug, locale),
    getSiteSettings(locale),
  ]);
  const t = getDict(locale);
  if (!post) return { alternates: alternatesFor(locale, `/blog/${slug}`) };

  /**
   * The SEO tab wins where it has been filled in.
   *
   * @payloadcms/plugin-seo adds `meta.title`, `meta.description` and
   * `meta.image` to this collection (see src/payload.config.ts), all of them
   * per language, and the owners can overwrite whatever the generate button
   * suggested. Each falls back to what this page has always shown: the
   * headline with the site name after it, the excerpt, and the article's own
   * featured photograph — which is also what the plugin's generate button
   * would have picked, so the two agree even when nobody pressed it.
   *
   * `meta.title` is used exactly as typed, without the site name appended: the
   * generate button already puts it there, and a second one reads as a bug.
   */
  const doc = post as {
    title?: string;
    excerpt?: string;
    publishedDate?: string | null;
    createdAt?: string;
    featuredImage?: unknown;
    meta?: { title?: string | null; description?: string | null; image?: unknown } | null;
  };

  return buildMetadata({
    locale,
    path: `/blog/${slug}`,
    title:
      doc.meta?.title?.trim() ||
      t.blog.postMetaTitle(doc.title || t.blog.title, s.siteName),
    description:
      doc.meta?.description?.trim() || doc.excerpt || t.blog.metaDescription,
    image: asUpload(doc.meta?.image) ?? asUpload(doc.featuredImage),
    type: "article",
    // The date the owners put on the post, not the row's createdAt — a post
    // written in March and published in April is an April article.
    publishedTime: doc.publishedDate || doc.createdAt,
  });
}

export default async function BlogPostPage({ params }: PageProps) {
  const { locale: raw, slug } = await params;
  const locale = parseLocale(raw);
  if (!locale) notFound();

  const post = await findPost(slug, locale);
  if (!post) notFound();

  return <BlogPostClient locale={locale} post={post as any} />;
}
