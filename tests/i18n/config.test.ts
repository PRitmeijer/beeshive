import { describe, expect, it, vi } from "vitest";
import {
  alternatesFor,
  canonicalUrl,
  defaultLocale,
  isLocale,
  localeHref,
  localeOf,
  locales,
  parseLocale,
  resolveLocale,
  siteUrl,
  stripLocale,
} from "@/i18n/config";

/**
 * Locale plumbing. Cheap to test and load-bearing: the guest pass link, every
 * hreflang tag and every canonical URL on the site run through these.
 */

describe("isLocale, parseLocale and resolveLocale", () => {
  it.each(["nl", "en"])("knows %o", (value) => {
    expect(isLocale(value)).toBe(true);
    expect(parseLocale(value)).toBe(value);
    expect(resolveLocale(value)).toBe(value);
  });

  it.each(["de", "NL", "", "nl-NL", undefined])("does not know %o", (value) => {
    expect(isLocale(value)).toBe(false);
    // The difference between the two is a page returning 404 and a page
    // quietly serving a second copy of the Dutch homepage under another URL.
    expect(parseLocale(value)).toBeNull();
    expect(resolveLocale(value)).toBe("nl");
  });

  it("has Dutch as the default", () => {
    expect(defaultLocale).toBe("nl");
    expect([...locales]).toEqual(["nl", "en"]);
  });
});

describe("stripLocale and localeOf", () => {
  it.each([
    ["/", "/", "nl"],
    ["/kaart", "/kaart", "nl"],
    ["kaart", "/kaart", "nl"],
    ["/kaart/", "/kaart", "nl"],
    ["/en", "/", "en"],
    ["/en/", "/", "en"],
    ["/en/kaart", "/kaart", "en"],
    ["/nl/kaart", "/kaart", "nl"],
    // The one that matters: "/english" must not be read as the /en prefix,
    // which is why the pattern insists on the trailing slash.
    ["/english", "/english", "nl"],
    ["/entree", "/entree", "nl"],
  ])("reads %o as %o in %s", (path, bare, locale) => {
    expect(stripLocale(path)).toBe(bare);
    expect(localeOf(path)).toBe(locale);
  });
});

describe("localeHref", () => {
  it.each([
    ["nl", "/kaart", "/kaart"],
    ["en", "/kaart", "/en/kaart"],
    ["en", "/", "/en"],
    ["nl", "/", "/"],
    ["nl", "/en/kaart", "/kaart"],
    ["en", "/nl/kaart", "/en/kaart"],
  ])("(%s, %o) -> %o", (locale, path, expected) => {
    expect(localeHref(locale as "nl" | "en", path)).toBe(expected);
  });

  it.each([
    ["https://example.com/x", "an absolute URL"],
    ["mailto:info@debeeshive.nl", "a mail link"],
    ["tel:+31307852199", "a phone link"],
    // The one with teeth: prefixing this would build a link to
    // https://en/evil.com, or worse, quietly keep sending people off-site.
    ["//evil.com/x", "a protocol-relative URL"],
    ["#top", "an anchor"],
  ])("passes %o through untouched (%s)", (href) => {
    expect(localeHref("en", href)).toBe(href);
  });
});

describe("canonicalUrl and alternatesFor", () => {
  it("puts the homepage at the bare origin, with no trailing slash", () => {
    expect(canonicalUrl("nl", "/")).toBe(siteUrl);
    expect(canonicalUrl("en", "/")).toBe(`${siteUrl}/en`);
  });

  it("builds one alternate per language with Dutch as x-default", () => {
    const alternates = alternatesFor("en", "/kaart");
    expect(alternates).toEqual({
      canonical: `${siteUrl}/en/kaart`,
      languages: {
        nl: `${siteUrl}/kaart`,
        en: `${siteUrl}/en/kaart`,
        "x-default": `${siteUrl}/kaart`,
      },
    });
  });

  it("strips a trailing slash off the configured origin", async () => {
    // `siteUrl` is captured at module scope, so stubbing the variable is not
    // enough on its own — the module has to be loaded again afterwards.
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://staging.debeeshive.nl/");
    const config = await import("@/i18n/config");
    expect(config.siteUrl).toBe("https://staging.debeeshive.nl");
    expect(config.canonicalUrl("nl", "/kaart")).toBe("https://staging.debeeshive.nl/kaart");
  });
});
