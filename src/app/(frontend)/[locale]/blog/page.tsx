import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPayloadClient, getSiteSettings } from "@/lib/payload";
import { getDict } from "@/i18n/dictionaries";
import { alternatesFor, parseLocale } from "@/i18n/config";
import { BlogClient } from "./BlogClient";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const locale = parseLocale((await params).locale);
  if (!locale) return {};
  const s = await getSiteSettings(locale);
  const t = getDict(locale);
  return {
    title: t.blog.metaTitle(s.siteName),
    description: t.blog.metaDescription,
    alternates: alternatesFor(locale, "/blog"),
  };
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
