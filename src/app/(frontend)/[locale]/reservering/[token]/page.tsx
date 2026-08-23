import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddToCalendar } from "@/components/AddToCalendar";
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
        <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-3">
          {phone ? (
            <a href={`tel:${phone.replace(/\s/g, "")}`} className="ink-link">
              {phone}
            </a>
          ) : null}
          <Link href={localeHref(locale, "/")} className="ink-link">
            {t.guestPass.backToSite}
          </Link>
        </div>
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
      // Resolved on the server: `new Date()` during a client render is the
      // hydration hazard this whole codebase keeps out of components.
      isPast={hasPassed(view, s)}
      shareUrl={guestPassUrl(locale, token)}
      siteName={s.siteName}
      addressLines={addressLines(s)}
      phone={s.phone}
      mapsGoogleUrl={googleDirectionsUrl(s)}
      mapsAppleUrl={appleDirectionsUrl(s)}
      mapEmbedUrl={s.googleMapsEmbedUrl?.trim() ?? ""}
      mapTitle={getDict(locale).contact.mapTitle}
      // The welcome under the header, and the two places to follow them.
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
      instagramUrl={s.socialMedia?.instagram?.trim() ?? ""}
      facebookUrl={s.socialMedia?.facebook?.trim() ?? ""}
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
