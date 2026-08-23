import type { MetadataRoute } from "next";
import { locales, defaultLocale, siteUrl } from "@/i18n/config";

/**
 * robots.txt.
 *
 * Three things are kept out of the index and one thing is deliberately let
 * back in, and the order of the rules is what makes that work: a crawler that
 * follows Google's rules picks the longest matching path, whichever kind of
 * rule it is, so `Allow: /api/og` beats `Disallow: /api/` on the same URL.
 * That is not decoration. Facebook, LinkedIn and Slack all read robots.txt
 * before fetching an `og:image`, so a blanket `Disallow: /api` would have
 * meant every share of this site showing a blank rectangle — the generated
 * card lives at /api/og and the uploads, when there is no R2 bucket in front
 * of them, at /api/media/file/...
 *
 * The guest pass is the reverse case. Its URL is the token, so the whole
 * point is that no crawler ever asks for one. Naming the prefix here is safe —
 * "/reservering/" reveals nothing — and it is only the outermost of three
 * layers: the page sets `robots: noindex` in its metadata and next.config.mjs
 * sets an `X-Robots-Tag` header on the response itself, which is the one that
 * still works for a crawler that never read this file.
 */
export default function robots(): MetadataRoute.Robots {
  // Every language version of the guest pass. Dutch is on the bare path and
  // English under /en, so listing the route once would leave half of it open.
  const guestPass = locales.map((locale) =>
    locale === defaultLocale ? "/reservering/" : `/${locale}/reservering/`,
  );

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/api/og", "/api/media/"],
        disallow: ["/admin", "/api/", ...guestPass],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
