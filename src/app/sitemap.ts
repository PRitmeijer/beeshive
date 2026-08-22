import type { MetadataRoute } from "next";
import { canonicalUrl, defaultLocale, locales } from "@/i18n/config";

/** Every page exists twice: bare Dutch, and the same path under /en. */
const staticPaths: { path: string; changeFrequency: "weekly" | "monthly"; priority: number }[] = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/over-ons", changeFrequency: "monthly", priority: 0.8 },
  { path: "/kaart", changeFrequency: "weekly", priority: 0.9 },
  { path: "/galerij", changeFrequency: "weekly", priority: 0.7 },
  { path: "/blog", changeFrequency: "weekly", priority: 0.7 },
  { path: "/contact", changeFrequency: "monthly", priority: 0.6 },
];

/** The hreflang block Google wants on every entry of a translated sitemap. */
function alternates(path: string) {
  return {
    languages: Object.fromEntries(
      locales.map((locale) => [locale, canonicalUrl(locale, path)]),
    ),
  };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = new Date();

  const staticPages: MetadataRoute.Sitemap = staticPaths.flatMap((page) =>
    locales.map((locale) => ({
      url: canonicalUrl(locale, page.path),
      lastModified,
      changeFrequency: page.changeFrequency,
      // The English pages rank behind their Dutch originals.
      priority:
        locale === defaultLocale ? page.priority : Math.max(page.priority - 0.1, 0.1),
      alternates: alternates(page.path),
    })),
  );

  // Dynamically add blog posts
  let blogPages: MetadataRoute.Sitemap = [];
  try {
    const { getPayloadClient } = await import("@/lib/payload");
    const payload = await getPayloadClient();
    const posts = await payload.find({
      collection: "blog-posts",
      where: { status: { equals: "published" } },
      limit: 1000,
      depth: 0,
    });
    blogPages = posts.docs.flatMap((post: any) =>
      locales.map((locale) => ({
        url: canonicalUrl(locale, `/blog/${post.slug}`),
        lastModified: new Date(post.updatedAt || post.createdAt),
        changeFrequency: "monthly" as const,
        priority: locale === defaultLocale ? 0.6 : 0.5,
        alternates: alternates(`/blog/${post.slug}`),
      })),
    );
  } catch {
    // CMS not ready
  }

  return [...staticPages, ...blogPages];
}
