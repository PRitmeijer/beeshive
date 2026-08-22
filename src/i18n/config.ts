/**
 * Locale plumbing for the two language versions of the site.
 *
 * Dutch is the default and keeps the URLs that are already indexed: /kaart,
 * /over-ons and so on. English lives one segment down, under /en. The internal
 * route tree is /[locale]/... for both; src/middleware.ts rewrites a bare path
 * onto /nl and 308-redirects an explicit /nl back to the bare path, so every
 * page has exactly one canonical URL.
 */

export const locales = ["nl", "en"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "nl";

/** Written out for the language switcher and the <html lang> attribute. */
export const localeNames: Record<Locale, string> = {
  nl: "Nederlands",
  en: "English",
};

/** Short form used on the switcher itself. */
export const localeLabels: Record<Locale, string> = {
  nl: "NL",
  en: "EN",
};

/** BCP 47 tags for Intl formatting and hreflang. */
export const localeTags: Record<Locale, string> = {
  nl: "nl-NL",
  en: "en-GB",
};

export function isLocale(value: string | undefined): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

/**
 * Narrow an untrusted route param down to a Locale. Pages should call
 * notFound() when this returns null rather than quietly serving Dutch, so a
 * stray segment cannot mint a duplicate of the homepage.
 */
export function parseLocale(value: string | undefined): Locale | null {
  return isLocale(value) ? value : null;
}

/** Same, but never fails. For places where a wrong guess is harmless. */
export function resolveLocale(value: string | undefined): Locale {
  return isLocale(value) ? value : defaultLocale;
}

/** Normalise "kaart", "kaart/", "/kaart" to "/kaart" and "" to "/". */
function normalisePath(path: string): string {
  const withSlash = path.startsWith("/") ? path : `/${path}`;
  if (withSlash.length > 1 && withSlash.endsWith("/")) {
    return withSlash.slice(0, -1);
  }
  return withSlash;
}

/**
 * Strip a leading language segment, so a browser path can be compared against
 * the plain route table. "/en/kaart" and "/nl/kaart" both give "/kaart".
 */
export function stripLocale(path: string): string {
  const clean = normalisePath(path);
  for (const locale of locales) {
    if (clean === `/${locale}`) return "/";
    if (clean.startsWith(`/${locale}/`)) return clean.slice(locale.length + 1);
  }
  return clean;
}

/** The locale a browser path belongs to, judged by its first segment. */
export function localeOf(path: string): Locale {
  const clean = normalisePath(path);
  for (const locale of locales) {
    if (clean === `/${locale}` || clean.startsWith(`/${locale}/`)) return locale;
  }
  return defaultLocale;
}

/**
 * Turn an internal path into the URL for one language. The path given may be
 * bare ("/kaart") or already carry a prefix ("/en/kaart"); either way the
 * result is the canonical URL for `locale`.
 *
 *   localeHref("nl", "/kaart")     -> "/kaart"
 *   localeHref("en", "/kaart")     -> "/en/kaart"
 *   localeHref("en", "/")          -> "/en"
 *   localeHref("nl", "/en/kaart")  -> "/kaart"
 *
 * External URLs (anything with a scheme) and anchors are passed straight
 * through, so it is safe to wrap every href in a page.
 */
export function localeHref(locale: Locale, path: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith("//") || path.startsWith("#")) {
    return path;
  }
  const bare = stripLocale(path);
  if (locale === defaultLocale) return bare;
  return bare === "/" ? `/${locale}` : `/${locale}${bare}`;
}

/** Absolute origin used for canonical URLs and hreflang. */
export const siteUrl = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://debeeshive.nl"
).replace(/\/$/, "");

/** Absolute canonical URL of `path` in one language. */
export function canonicalUrl(locale: Locale, path: string): string {
  const href = localeHref(locale, path);
  return href === "/" ? siteUrl : `${siteUrl}${href}`;
}

/**
 * The `alternates` block for a page's metadata: its own canonical plus one
 * hreflang per language, with Dutch as x-default. Pages pass the bare Dutch
 * path, e.g. alternatesFor(locale, "/kaart").
 */
export function alternatesFor(locale: Locale, path: string) {
  const languages: Record<string, string> = {};
  for (const l of locales) {
    languages[l] = canonicalUrl(l, path);
  }
  languages["x-default"] = canonicalUrl(defaultLocale, path);
  return { canonical: canonicalUrl(locale, path), languages };
}
