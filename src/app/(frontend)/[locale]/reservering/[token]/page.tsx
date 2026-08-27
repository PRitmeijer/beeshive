import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddToCalendar } from "@/components/AddToCalendar";
import { OutboundLinkTracker } from "@/components/AddToCalendarTracker";
import { followLinks, socialLinks } from "@/components/SocialMarks";
import { getSiteSettings } from "@/lib/payload";
import { buildMetadata } from "@/lib/metadata";
import { getDict } from "@/i18n/dictionaries";
import { localeHref, parseLocale, type Locale } from "@/i18n/config";
import {
  addressLines,
  appleDirectionsUrl,
  findByToken,
  googleDirectionsUrl,
  guestPassIcsPath,
  guestPassUrl,
  hasPassed,
  redactForGuests,
  reviewAskUrl,
  sittingMinutes,
  toIcsEvent,
} from "@/lib/guestPass";
import { GuestPassClient } from "./GuestPassClient";

/**
 * The guest pass: one reservation, shown to whoever holds the link.
 *
 * This is the only page on the site that renders somebody's booking without
 * asking who is reading, so it is also the only one where the server does the
 * work of deciding what may be seen. Nothing below reaches into the CMS on its
 * own: the lookup and the redaction both live in src/lib/guestPass.ts, and the
 * client component is handed a shape that has already had the e-mail address,
 * the phone number, the notes and the surname taken out of it. There is no
 * route from this file to a field that was not deliberately let through.
 *
 * A token that matches nothing does not call notFound(). A 404 in this
 * situation reads as "we lost your table", and the person seeing it is usually
 * someone who was forwarded a link that got mangled by a chat app. They get a
 * sheet of the same paper as the rest of the site, saying so, with the phone
 * number on it.
 */

/**
 * The one page in this tree that stays dynamic.
 *
 * Everything else now revalidates on a timer (see the note on the home page),
 * which means Next keeps the rendered HTML and hands the same copy to the next
 * visitor. This page renders one guest's booking, so a shared copy is the
 * whole of the harm: the next person to open a guest pass link would be shown
 * somebody else's table. `force-dynamic` also suppresses the `Cache-Control`
 * a CDN would act on, which is the same argument one layer out.
 */
export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ locale: string; token: string }> };

/**
 * Never indexed, in either half of the instruction.
 *
 * The meta tag is set here; the matching `X-Robots-Tag` header is set by
 * /api/guest-pass on the calendar file, and by next.config.mjs for the page
 * itself — a Next page cannot set a response header.
 *
 * `path: null` is the other half of the same care. It tells buildMetadata to
 * write no canonical, no hreflang and no `og:url`, because every one of those
 * is the token spelled out in a tag, and the token is the one thing that must
 * not end up anywhere a crawler can read it. The card itself is the site's
 * generic one, which is right: a guest forwarding the link in a group chat
 * should get a picture of the café, and the picture gives nothing away.
 */
export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const locale = parseLocale((await params).locale);
  if (!locale) return {};
  const s = await getSiteSettings(locale);
  const t = getDict(locale);
  return buildMetadata({
    locale,
    path: null,
    title: t.guestPass.metaTitle(s.siteName),
    description: s.description,
    robots: {
      index: false,
      follow: false,
      nocache: true,
      googleBot: { index: false, follow: false },
    },
  });
}

/** The sheet a mangled or expired link lands on. Still the site, still paper. */
function LinkGone({
  locale,
  phone,
}: {
  locale: Locale;
  phone: string;
}) {
  const t = getDict(locale);
  return (
    <section className="relative flex min-h-[70vh] items-center overflow-hidden bg-paper">
      <div className="mx-auto w-full max-w-2xl px-6 pb-20 pt-32 md:px-12">
        <p className="label">{t.guestPass.heading}</p>
        <div className="rule-ink my-5 w-14" aria-hidden="true" />
        <h1 className="heading-lg text-hive-800">{t.guestPass.notFound}</h1>
        <p className="mt-5 max-w-prose leading-relaxed text-hive-500">
          {t.guestPass.notFoundBody}
        </p>
        {/* Whoever is reading this was forwarded a link that did not survive
            the trip, and the telephone number is the only thing on the sheet
            that can still help them — so how often it is actually used is
            worth knowing. This page is rendered on the server and has no
            handler to hang that on; the wrapper hears the tap on its way past
            and replaces the <div> that was here rather than adding one. */}
        <OutboundLinkTracker
          surface="guest_pass"
          className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-3"
        >
          {phone ? (
            <a href={`tel:${phone.replace(/\s/g, "")}`} className="ink-link">
              {phone}
            </a>
          ) : null}
          <Link href={localeHref(locale, "/")} className="ink-link">
            {t.guestPass.backToSite}
          </Link>
        </OutboundLinkTracker>
      </div>
    </section>
  );
}

export default async function GuestPassPage({ params }: PageProps) {
  const { locale: rawLocale, token } = await params;
  const locale = parseLocale(rawLocale);
  if (!locale) notFound();

  const s = await getSiteSettings(locale);

  // By token, with a `where` equals, and never by id. The one lookup this page
  // is allowed to make.
  const doc = await findByToken(token);
  if (!doc) return <LinkGone locale={locale} phone={s.phone} />;

  const view = redactForGuests(doc);
  const event = toIcsEvent(doc, s, locale);

  // Resolved on the server: `new Date()` during a client render is the
  // hydration hazard this whole codebase keeps out of components. Hoisted out
  // of the JSX below because the review ask is decided against the same
  // answer, and two readings of the clock a few lines apart is how a page ends
  // up thanking somebody it has just told to come on Saturday.
  //
  // The sitting length is passed in from the document rather than left to the
  // house standard, because the view handed to `hasPassed` has had `duration`
  // redacted out of it and a long table would otherwise be declared over after
  // the usual two hours — with the party still at it, reading a page that
  // thanks them for having come.
  const isPast = hasPassed(view, s, sittingMinutes(doc, s));

  // "" whenever this party should not be asked for a review — the evening is
  // still ahead of them, the booking was never confirmed, or the owners left
  // the field empty. All three live in reviewAskUrl(), so the client has one
  // thing to check rather than three to get right. Held in a name because the
  // row of marks at the foot of the page turns on the same answer, and asking
  // twice is how the two of them end up disagreeing.
  const reviewUrl = reviewAskUrl(view, isPast, s);

  /**
   * <AddToCalendar> is a server component so that @/lib/ics never reaches the
   * browser bundle, and <GuestPassClient> is a client component because a copy
   * button and a form need to be. Rendering the first here and passing it down
   * as a prop is what lets both be true at once.
   */
  const calendar = event ? (
    <AddToCalendar
      event={event}
      icsHref={guestPassIcsPath(locale, token)}
      locale={locale}
    />
  ) : null;

  return (
    <GuestPassClient
      locale={locale}
      token={token}
      view={view}
      isPast={isPast}
      reviewUrl={reviewUrl}
      shareUrl={guestPassUrl(locale, token)}
      siteName={s.siteName}
      addressLines={addressLines(s)}
      phone={s.phone}
      mapsGoogleUrl={googleDirectionsUrl(s)}
      mapsAppleUrl={appleDirectionsUrl(s)}
      mapEmbedUrl={s.googleMapsEmbedUrl?.trim() ?? ""}
      mapTitle={getDict(locale).contact.mapTitle}
      // The welcome under the header, and the places to find them.
      // Everything here is already in Site Instellingen — the About tab's
      // intro and picture, the Contact tab's socials — so the owners edit it
      // where they already know to look, and no field exists twice.
      welcomeText={
        s.guestPassWelcome?.trim() ||
        s.welcomeText?.trim() ||
        s.aboutIntro?.trim() ||
        ""
      }
      welcomeImageUrl={
        s.aboutImage?.sizes?.card?.url || s.aboutImage?.url || ""
      }
      welcomeImageAlt={s.aboutImage?.alt ?? ""}
      // The same row of marks the footer prints, except on a sheet that has
      // already asked for a review. `socialLinks` is the accounts you can
      // follow plus the Google listing, and on a thanked pass that listing is
      // the exact destination the ask at the top points at — so the guest was
      // being handed the same link twice, forty lines apart, which is the
      // opposite of the said-once-at-the-door restraint the ask is written to
      // have. `followLinks` is that row with the listing left out.
      socials={reviewUrl ? followLinks(s) : socialLinks(s)}
      dietaryOptions={(s.guestPassDietary ?? [])
        .map((row) => row?.label?.trim() ?? "")
        .filter(Boolean)}
      drinkOptions={(s.guestPassDrinks ?? [])
        .map((row) => row?.label?.trim() ?? "")
        .filter(Boolean)}
      // The switch the owners can throw in Site Instellingen. Off means the
      // party can still read the page and add it to a calendar; only the
      // question disappears.
      formEnabled={Boolean(s.guestPassEnabled)}
      calendar={calendar}
    />
  );
}
