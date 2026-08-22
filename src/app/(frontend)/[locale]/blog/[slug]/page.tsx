import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPayloadClient, getSiteSettings } from "@/lib/payload";
import { getDict } from "@/i18n/dictionaries";
import { alternatesFor, parseLocale, type Locale } from "@/i18n/config";
import { BlogPostClient } from "./BlogPostClient";

export const dynamic = "force-dynamic";

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

  const doc = post as { title?: string; excerpt?: string };
  return {
    title: t.blog.postMetaTitle(doc.title || t.blog.title, s.siteName),
    description: doc.excerpt || t.blog.metaDescription,
    alternates: alternatesFor(locale, `/blog/${slug}`),
  };
}

export default async function BlogPostPage({ params }: PageProps) {
  const { locale: raw, slug } = await params;
  const locale = parseLocale(raw);
  if (!locale) notFound();

  const post = await findPost(slug, locale);
  if (!post) notFound();

  return <BlogPostClient locale={locale} post={post as any} />;
}
