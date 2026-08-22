import { NextResponse, type NextRequest } from "next/server";
import { defaultLocale, locales } from "@/i18n/config";

/**
 * One canonical URL per page, two languages.
 *
 * Dutch keeps the bare paths that are already indexed, so /kaart is rewritten
 * internally onto /nl/kaart and the address bar never changes. An explicit
 * /nl/kaart is a duplicate of that, so it 308-redirects down to /kaart.
 * English simply passes through: /en/kaart is already the internal route.
 *
 * A rewrite is invisible to the browser, a redirect is not. That asymmetry is
 * the whole point: search engines keep the URLs they have.
 */

/** Anything Payload, Next or the file system owns is none of our business. */
const RESERVED_SEGMENTS = ["api", "admin", "_next", "_vercel", "paper", "media"];

/** A dot in the last segment means a file: favicon.ico, sitemap.xml, food-03.jpg. */
const HAS_EXTENSION = /\.[^/]+$/;

function isReserved(pathname: string): boolean {
  if (HAS_EXTENSION.test(pathname)) return true;
  return RESERVED_SEGMENTS.some(
    (segment) => pathname === `/${segment}` || pathname.startsWith(`/${segment}/`),
  );
}

function hasPrefix(pathname: string, locale: string): boolean {
  return pathname === `/${locale}` || pathname.startsWith(`/${locale}/`);
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isReserved(pathname)) return NextResponse.next();

  // /nl/... is a second address for a page that already has one.
  if (hasPrefix(pathname, defaultLocale)) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.slice(defaultLocale.length + 1) || "/";
    return NextResponse.redirect(url, 308);
  }

  // Every other declared locale already matches the route tree.
  for (const locale of locales) {
    if (locale !== defaultLocale && hasPrefix(pathname, locale)) {
      return NextResponse.next();
    }
  }

  // A bare path is Dutch. Rewrite, never redirect.
  const url = request.nextUrl.clone();
  url.pathname = `/${defaultLocale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  // Only two things are filtered out here: the build output, and anything that
  // ends in a file extension. Naming the reserved segments in this regex would
  // match them as bare prefixes too, so /paperback would silently stop being a
  // page; isReserved() above compares whole segments instead.
  matcher: ["/((?!_next/)(?!.*\\.[A-Za-z0-9]+$).*)"],
};
