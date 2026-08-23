import "../../globals.css";
import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { Analytics } from "@/components/Analytics";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { MobileReserveButton } from "@/components/MobileReserveButton";
import { NotificationBanner } from "@/components/NotificationBanner";
import { PaperDefs } from "@/components/Sheet";
import { getSiteSettings } from "@/lib/payload";
import { locales, parseLocale } from "@/i18n/config";

/**
 * Both language versions of the site are pre-declared, so /nl/... and /en/...
 * are known routes rather than arbitrary dynamic segments. The pages
 * underneath still opt into `force-dynamic` where they read the CMS.
 */
export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

/**
 * The screen itself, as opposed to what is printed on it.
 *
 * `viewportFit: "cover"` is the fix for the complaint that the page scrolls
 * visibly through the strip at the top of an iPhone. Without it Safari keeps
 * that strip for itself and fills it with a colour of its own choosing, and
 * the sheet slides past underneath a band that belongs to nobody. With it the
 * page owns the whole screen, and the two bars pinned to the top of it — the
 * notification bar and the running head — take responsibility for holding
 * their own contents clear of the clock and the battery. They do that through
 * env(safe-area-inset-top); see .safe-head-below-notice in globals.css.
 *
 * `themeColor` is the same cream as `--paper`, so the browser furniture that
 * is still Safari's to paint — the address bar, the strip behind a fullscreen
 * status bar — is the colour of the sheet rather than white.
 *
 * Declared as a `viewport` export rather than a hand-written <meta> because
 * Next owns that tag: writing it by hand gets it emitted twice, and the one
 * that wins is not the one you wrote.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#F1ECE1",
};

/**
 * Site-wide metadata. Next merges this with whatever each page's own
 * generateMetadata returns, and a page that does not mention keywords
 * inherits these — so the owners maintain one list in the CMS rather than a
 * field per page.
 *
 * Worth being straight about what this buys: Google dropped
 * `<meta name="keywords">` as a ranking signal in 2009 and Bing treats it as
 * a spam indicator when it is stuffed. It is here because it is asked for and
 * it is harmless kept short; the site's actual search visibility comes from
 * the page copy, the per-page descriptions, and the Restaurant structured
 * data on the homepage.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const locale = parseLocale((await params).locale);
  if (!locale) return {};

  const s = await getSiteSettings(locale);

  // Next renders an array as one comma-separated tag, and omits the tag
  // entirely when the list is empty — which is the right outcome for a field
  // the owners have not filled in.
  const keywords = (s.keywords || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  return keywords.length ? { keywords } : {};
}

export default async function FrontendLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  // A segment that is not a declared language is not a page. Without this the
  // route would happily serve the homepage at /anything.
  const locale = parseLocale((await params).locale);
  if (!locale) notFound();

  const s = await getSiteSettings(locale);

  return (
    <html lang={locale}>
      <head>
        <link
          rel="preconnect"
          href="https://fonts.googleapis.com"
          crossOrigin="anonymous"
        />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        {/* Matches the printed menu: one geometric sans doing all the structural
            work, and a brush script held back for card titles. */}
        <link
          href="https://fonts.googleapis.com/css2?family=Jost:ital,wght@0,300..700;1,300..700&family=Kaushan+Script&display=swap"
          rel="stylesheet"
        />
      </head>
      {/* The page starts below whichever of the two is taller: the
          notification bar, or the strip iOS keeps for the status bar. They
          never stack — when the bar is up it has already taken the inset into
          its own published height — so this is a max, not a sum. */}
      <body
        className="min-h-screen flex flex-col antialiased"
        style={{
          paddingTop:
            "max(var(--notice-h, 0px), env(safe-area-inset-top, 0px))",
        }}
      >
        <PaperDefs />
        <NotificationBanner locale={locale} />
        <Navigation
          locale={locale}
          reservationUrl={s.reservationUrl || undefined}
          siteName={s.siteName}
        />
        <main className="flex-1">{children}</main>
        <Footer locale={locale} />
        <MobileReserveButton
          locale={locale}
          reservationUrl={s.reservationUrl || undefined}
          openingHours={s.openingHours}
        />
        <div className="paper-ground" aria-hidden="true" />
        {/* Owned by another agent; everything it needs is decided here, in
            Site Instellingen, and it renders nothing at all until the owners
            have switched measuring on and pasted a website id. */}
        <Analytics
          enabled={s.umamiEnabled}
          scriptUrl={s.umamiScriptUrl}
          websiteId={s.umamiWebsiteId}
          doNotTrack={s.umamiDoNotTrackAdmin}
        />
      </body>
    </html>
  );
}
