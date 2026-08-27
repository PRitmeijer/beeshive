import "../../globals.css";
import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { Analytics } from "@/components/Analytics";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { MobileReserveButton } from "@/components/MobileReserveButton";
import { NotificationBanner } from "@/components/NotificationBanner";
import { MotionProvider } from "@/components/motion";
import { PaperDefs } from "@/components/Sheet";
import { getActiveNotifications } from "@/lib/notifications";
import { getSiteSettings } from "@/lib/payload";
import { resolveBookingRules } from "@/lib/openingHours";
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
  // Read here rather than in the bar itself: the body reserves room for the
  // notification bar, so a bar that arrives after a client fetch drops the
  // whole page by its own height in front of the reader.
  const notices = await getActiveNotifications(locale);

  return (
    <html lang={locale}>
      <head>
        {/* Matches the printed menu: one geometric sans doing all the
            structural work, and a brush script held back for card titles.
            Both are served from this origin — see the @font-face block at the
            top of globals.css — so there is no stylesheet from a third party
            standing between the reader and the first paint, and no preconnect
            to warm a connection nothing opens any more.

            Only the upright latin cut is preloaded. It is the face that
            paints the first word of every page; the italic and the brush
            script are wanted further down, if at all, and asking for them
            here would spend the same early bandwidth on glyphs nobody is
            looking at yet. */}
        <link
          rel="preload"
          as="font"
          type="font/woff2"
          href="/fonts/jost-latin.woff2"
          crossOrigin="anonymous"
        />
      </head>
      {/* The page starts below whichever of the two is taller: the
          notification bar, or the strip iOS keeps for the status bar. They
          never stack — when the bar is up it has already taken the inset into
          its own published height — so this is a max, not a sum. */}
      <body
        className="min-h-screen flex flex-col antialiased"
        style={
          {
            // When there is a bar it sits in the flow and brings its own
            // safe-area padding, so the body must not add it a second time.
            // Decided on the server, from data the server already has, which
            // is what keeps this off the critical path: a padding that only
            // resolves after a measurement is a padding that moves the page.
            paddingTop: notices.length
              ? undefined
              : "env(safe-area-inset-top, 0px)",
            // The two faces, published as custom properties so anything that
            // would rather name a variable than a family — a Tailwind stack,
            // a one-off rule — has a handle on them. The family names in the
            // fallback are real: globals.css declares them.
            "--font-display": '"Jost", system-ui, sans-serif',
            "--font-hand": '"Kaushan Script", "Segoe Script", cursive',
          } as React.CSSProperties
        }
      >
        {/* Every animated element on the site is an `m.*`, which is the
            framer-motion renderer without any of its features attached; this
            is where the features it is allowed to have are decided, once, for
            all of them. See src/components/motion.tsx for what that buys and
            what it costs to get wrong. It renders no markup, so the flex
            column below begins at <PaperDefs> exactly as it did. */}
        <MotionProvider>
          <PaperDefs />
          {/*
            The strip of screen iOS keeps for the clock and the battery, in
            paper, always.

            `viewportFit: "cover"` above is what lets this site's paper run
            edge to edge under the notch, and it is worth keeping. What comes
            with it is that the page is genuinely up there, so anything that
            fails to cover that strip lets running text scroll through it —
            which reads, from the reader's side, as the words sliding over the
            top of the header and into the status bar.

            Three separate things were covering it before, and each of them has
            a state in which it does not. The notification bar folds the inset
            into its own padding, but it is dismissible. The body pays the
            inset as padding, but only when the server rendered no bar — and a
            bar that is dismissed a second later does not give that padding
            back. The header pays it through `.safe-head-below-notice`, but on
            the landing page the header is deliberately transparent until the
            reader has moved ninety pixels, because the masthead beneath it is
            doing the talking. Every one of those is right on its own. The gap
            is that nothing owned the strip.

            So this does, and it does nothing else: one element, no content, no
            pointer events, the height of the inset and the colour of the
            paper. On a phone without a notch `env()` is zero and this is a
            div of no height. It cannot be seen in any state that was already
            correct, because the hero, the header's settled state and this are
            all the same cream — it only shows up in the states that were
            wrong, where it is the difference between chrome and a sentence.

            The z-index is the whole of its interaction with everything else:
            above the page, below the header at 50 so the header's own paper
            still wins once it is opaque, below the banner at 60 so a banner
            covers it as it always did, and below the booking sheet at 50 so
            that sheet's dim backdrop still darkens the notch rather than
            leaving a bright band across the top of a modal.
          */}
          <div
            aria-hidden="true"
            className="pointer-events-none fixed inset-x-0 top-0 z-[45] bg-paper"
            style={{ height: "env(safe-area-inset-top, 0px)" }}
          />
          <NotificationBanner locale={locale} initial={notices} />
          <Navigation
            locale={locale}
            reservationUrl={s.reservationUrl || undefined}
            siteName={s.siteName}
          />
          <main className="flex-1">{children}</main>
          <Footer locale={locale} />
          {/* The booking sheet is mounted here rather than by a page, so
              everything it needs about the CMS has to be handed to it here
              too: the switch that takes online booking out of service, and
              the numbers the form draws its dates, times and party sizes from.
              Without them the sheet ran on constants of its own and offered
              ninety days, an hour's notice, an hour before closing and twenty
              people whatever the owners had set — on the device most of this
              café's guests book from. */}
          <MobileReserveButton
            locale={locale}
            reservationUrl={s.reservationUrl || undefined}
            openingHours={s.openingHours}
            reservationsEnabled={s.reservationsEnabled !== false}
            rules={resolveBookingRules(s)}
            phone={s.phone || undefined}
            email={s.contactEmail || undefined}
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
        </MotionProvider>
      </body>
    </html>
  );
}
