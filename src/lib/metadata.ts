import type { Metadata } from "next";
import { getSiteSettings } from "@/lib/payload";
import { getDict } from "@/i18n/dictionaries";
import {
  alternatesFor,
  canonicalUrl,
  localeTags,
  locales,
  siteUrl,
  type Locale,
} from "@/i18n/config";

/**
 * The share card, defined once.
 *
 * Every page's generateMetadata ends in a call to buildMetadata(), so that
 * "what does this look like when somebody pastes the link into WhatsApp" has
 * one answer rather than eleven. It keeps the canonical and hreflang block the
 * pages already had — alternatesFor() in src/i18n/config.ts is still the only
 * thing that knows Dutch lives on the bare path — and adds the Open Graph and
 * Twitter halves around it.
 *
 * Two facts drove most of the decisions here.
 *
 * The first is that a scraper is not a browser. It fetches the HTML, reads the
 * tags, and follows nothing; a relative `og:image` is not resolved against the
 * page it was found on, it is simply dropped. So every URL below is absolute,
 * built from siteUrl, and NEXT_PUBLIC_SITE_URL has to be right at build time
 * or the cards are blank. (See the Dockerfile, which bakes it in as an ARG for
 * exactly this reason.)
 *
 * The second is that Facebook, LinkedIn and X all cache a card by URL for
 * days. Getting a picture right is therefore worth more than getting it right
 * quickly, which is why the fallbacks below go three deep before giving up.
 */

/** The size every share image is served at. Matches Media's `og` size. */
const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

/**
 * How long a title and a subtitle may be before the drawn card stops looking
 * like a card. Kept here rather than in the route because this is where the
 * decision to send them is made; the route caps again, because it also
 * answers to whatever anyone types into the URL bar.
 */
const CARD_TITLE_MAX = 70;
const CARD_SUBTITLE_MAX = 110;

/**
 * An upload as this file needs to see it.
 *
 * Structurally the same as `MediaRef` in src/lib/payload.ts, plus the `og`
 * size — Media generates a 1200x630 WebP for every upload, and that is the one
 * a share card wants. MediaRef names only `card` and `hero`, and widening it
 * there would mean editing a file this task does not own, so the shape is
 * restated here. Both `MediaRef` and the generated `Media` type satisfy it.
 */
interface SizedImage {
  url?: string | null;
  width?: number | null;
  height?: number | null;
}

export interface ShareImage {
  url?: string | null;
  alt?: string | null;
  width?: number | null;
  height?: number | null;
  sizes?: { og?: SizedImage | null } | null;
}

/**
 * An upload field as it arrives from Payload, or nothing.
 *
 * `meta.image` on a document is typed `number | Media | null`: a bare id when
 * the read was shallow, the document itself once Payload has populated it. The
 * blog and event pages read at depth 2 and 1 respectively, so they get the
 * document — but a page that forgets is a page that would otherwise pass the
 * number 47 to the card builder and get a broken preview out of it, so the
 * check is made here rather than at each call site.
 */
export function asUpload(value: unknown): ShareImage | null {
  return value && typeof value === "object" ? (value as ShareImage) : null;
}

export interface ShareInput {
  locale: Locale;
  /**
   * The bare Dutch path, e.g. "/kaart". `null` means the page has no public
   * address worth publishing: it gets no canonical, no hreflang and no
   * `og:url`. The guest pass is the only page that wants this — its URL is the
   * token, and a canonical tag would hand that token to every crawler that
   * ever reads the page.
   */
  path: string | null;
  title: string;
  description: string;
  /** A document's own image, when it has one. */
  image?: ShareImage | null;
  type?: "website" | "article";
  publishedTime?: string;
  robots?: Metadata["robots"];
}

/** Absolute, or nothing. A relative og:image is the same as no og:image. */
function absolute(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return `${siteUrl}${url.startsWith("/") ? "" : "/"}${url}`;
}

/** Open Graph wants nl_NL, not the nl-NL that Intl and hreflang use. */
function ogLocale(locale: Locale): string {
  return localeTags[locale].replace("-", "_");
}

/** One entry for `openGraph.images`, with the dimensions scrapers ask for. */
interface OgImage {
  url: string;
  width: number;
  height: number;
  alt: string;
}

/**
 * An upload turned into a card, preferring the generated 1200x630 crop.
 *
 * When only the original is available its own width and height are reported
 * rather than 1200x630, because saying 1200x630 about a portrait photograph is
 * how a card ends up letterboxed on one platform and cropped through somebody's
 * face on another.
 */
function fromUpload(image: ShareImage | null | undefined, alt: string): OgImage | null {
  if (!image) return null;

  const og = image.sizes?.og;
  const ogUrl = absolute(og?.url);
  if (ogUrl) {
    return {
      url: ogUrl,
      width: og?.width || OG_WIDTH,
      height: og?.height || OG_HEIGHT,
      alt: image.alt || alt,
    };
  }

  const url = absolute(image.url);
  if (!url) return null;
  return {
    url,
    width: image.width || OG_WIDTH,
    height: image.height || OG_HEIGHT,
    alt: image.alt || alt,
  };
}

/**
 * Cut to length on a word boundary.
 *
 * `slice()` alone leaves "…prepared with creativity and a South", which reads
 * as a bug rather than as a summary. The same trim as the one the SEO plugin's
 * generate buttons use in src/payload.config.ts, for the same reason.
 */
function trimTo(value: string, max: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).replace(/\s\S*$/, "")}…`;
}

/**
 * The title as the drawn card should print it, with the site name taken off.
 *
 * Page titles are written for a browser tab and a search result, so they carry
 * the restaurant's name: "Menu | De Bee's Hive". The card already prints that
 * name above the rule, so leaving it in the headline says it twice. Only an
 * exact match at either end is removed, and only when something is left over —
 * the home page's title is the name, and it stays.
 */
function cardTitle(title: string, siteName: string): string {
  const suffix = ` | ${siteName}`;
  const prefix = `${siteName} | `;
  let stripped = title.trim();
  if (stripped.endsWith(suffix)) stripped = stripped.slice(0, -suffix.length);
  else if (stripped.startsWith(prefix)) stripped = stripped.slice(prefix.length);
  return stripped.trim() || siteName;
}

/** The drawn card at /api/og, asked for one page in particular. */
function generatedCard(title: string, subtitle: string, alt: string): OgImage {
  const query = new URLSearchParams({
    title: trimTo(title, CARD_TITLE_MAX),
    subtitle: trimTo(subtitle, CARD_SUBTITLE_MAX),
  });
  return {
    url: `${siteUrl}/api/og?${query.toString()}`,
    width: OG_WIDTH,
    height: OG_HEIGHT,
    alt,
  };
}

/**
 * Metadata for one page, share card and all.
 *
 * THE IMAGE ORDER, which is the thing someone will come here to change:
 *
 *   1. the document's own picture — a blog post's featured image, an event's
 *      photograph, or whatever the owners chose under the SEO tab. If a page
 *      is about one thing, that thing should be on the card.
 *   2. Site Instellingen → Delen → `shareImage`. One picture for the whole
 *      site, for the pages that are not about one thing (the menu, contact).
 *   3. the drawn card at /api/og, unless `shareImageAuto` is switched off.
 *      Cream paper, the name, the bee — recognisably theirs, and it carries
 *      the page's own title, so a link to /kaart does not look like a link to
 *      the front page.
 *   4. nothing. Switching `shareImageAuto` off with no `shareImage` set is a
 *      deliberate choice to let the platforms fall back to whatever they can
 *      find in the page, and it is respected.
 *
 * `title` and `description` come from the caller because a page knows its own
 * copy; `shareTitle` and `shareDescription` from the CMS override them, which
 * is what makes item 6's "maybe make it configurable as well" true — the
 * owners can write one line for the whole site without touching a page.
 */
export async function buildMetadata(input: ShareInput): Promise<Metadata> {
  const { locale, path, title, description } = input;
  const s = await getSiteSettings(locale);
  const t = getDict(locale);

  // A second read of the same global the page itself is about to ask for.
  // Next runs generateMetadata and the page in the same request, so this is
  // one extra findGlobal per render — and with `revalidate` on every page in
  // this tree, per sixty seconds rather than per visitor.
  const shareTitle = s.shareTitle?.trim() || title;
  const shareDescription = s.shareDescription?.trim() || description;

  const fallbackAlt = t.share.imageAlt(s.siteName);
  const image =
    fromUpload(input.image, title) ??
    fromUpload(s.shareImage as ShareImage | null, fallbackAlt) ??
    (s.shareImageAuto
      ? generatedCard(
          cardTitle(shareTitle, s.siteName),
          shareDescription || t.share.tagline,
          fallbackAlt,
        )
      : null);

  const url = path === null ? undefined : canonicalUrl(locale, path);

  return {
    title,
    description,
    ...(path === null ? {} : { alternates: alternatesFor(locale, path) }),
    ...(input.robots ? { robots: input.robots } : {}),
    openGraph: {
      type: input.type ?? "website",
      title: shareTitle,
      description: shareDescription,
      siteName: s.siteName,
      locale: ogLocale(locale),
      // Every other language this page exists in. Facebook uses it to offer
      // the right version of a shared link to a reader in that language.
      alternateLocale: locales.filter((l) => l !== locale).map(ogLocale),
      ...(url ? { url } : {}),
      ...(image ? { images: [image] } : {}),
      ...(input.type === "article" && input.publishedTime
        ? { publishedTime: input.publishedTime }
        : {}),
    },
    twitter: {
      // The wide card rather than the thumbnail: these are photographs of
      // plates and rooms, and a 120px square makes every one of them soup.
      card: "summary_large_image",
      title: shareTitle,
      description: shareDescription,
      ...(image ? { images: [image.url] } : {}),
    },
  };
}
