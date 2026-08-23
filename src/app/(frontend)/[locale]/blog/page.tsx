import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPayloadClient, getSiteSettings } from "@/lib/payload";
import { buildMetadata } from "@/lib/metadata";
import { getDict } from "@/i18n/dictionaries";
import { parseLocale } from "@/i18n/config";
import { BlogClient } from "./BlogClient";

/**
 * Cached for a minute; see the note above `revalidate` on the home page for
 * why these pages stopped being `force-dynamic` and what the minute costs.
 */
export const revalidate = 60;

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const locale = parseLocale((await params).locale);
  if (!locale) return {};
  const s = await getSiteSettings(locale);
  const t = getDict(locale);
  return buildMetadata({
    locale,
    path: "/blog",
    title: t.blog.metaTitle(s.siteName),
    description: t.blog.metaDescription,
  });
}

export default async function BlogPage({ params }: PageProps) {
  const locale = parseLocale((await params).locale);
  if (!locale) notFound();

  let posts: any[] = [];

  try {
    const payload = await getPayloadClient();
    const res = await payload.find({
      collection: "blog-posts",
      where: { status: { equals: "published" } },
      sort: "-publishedDate",
      limit: 50,
      depth: 1,
      locale,
    });
    posts = res.docs;
  } catch {
    // CMS not initialized
  }

  return <BlogClient locale={locale} posts={posts} />;
}
