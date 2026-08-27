import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSiteSettings } from "@/lib/payload";
import { buildMetadata } from "@/lib/metadata";
import {
  nowMinutesInAmsterdam,
  resolveBookingRules,
  todayInAmsterdam,
} from "@/lib/openingHours";
import { loadSchedule } from "@/lib/schedule";
import { getDict } from "@/i18n/dictionaries";
import { parseLocale } from "@/i18n/config";
import { ReserverenClient } from "./ReserverenClient";

/**
 * A minute rather than five, and worth being precise about what that buys,
 * because it was read too generously once already.
 *
 * Sixty seconds is the age at which a cached copy of this page becomes
 * *eligible* to be replaced, not the age at which it stops being served. Next
 * hands the stale HTML to the visitor who asks and regenerates behind them, so
 * on a quiet weekday afternoon the page a guest reads can easily be an hour
 * old — and the copy in the image is older still, prerendered at build time
 * with no database to read. The clock baked into it was therefore capable of
 * offering a date that had already been and a sitting that had already gone,
 * and /api/reserve refused both with sentences that made no sense next to the
 * list they came from.
 *
 * The form now reads the browser's own clock after mount and takes the later
 * of the two, so a stale render corrects itself one frame after hydration
 * (see the note beside `clientNow` in BookingFlow). That is why this page
 * is still cached rather than `force-dynamic`: it is the most visited page on
 * the site, everything on it except the clock changes about twice a year, and
 * making every visit render the whole schedule again would be paying by the
 * request for a problem that costs nothing to fix in the browser.
 *
 * The seats are not on this page at all — /api/availability answers those live
 * the moment a date is picked — so nothing here can hand out a table twice.
 */
export const revalidate = 60;

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const locale = parseLocale((await params).locale);
  if (!locale) return {};
  const s = await getSiteSettings(locale);
  const t = getDict(locale);
  return buildMetadata({
    locale,
    path: "/reserveren",
    title: t.reserve.metaTitle(s.siteName),
    description: t.reserve.metaDescription(
      s.siteName,
      s.address.area,
      s.address.city,
    ),
  });
}

export default async function ReserverenPage({ params }: PageProps) {
  const locale = parseLocale((await params).locale);
  if (!locale) notFound();

  const s = await getSiteSettings(locale);

  // The lead time, the horizon and the largest party, sanitised in the one
  // place both endpoints sanitise them. The clamp used to live here, at a
  // number of its own — the page said 92, the form's fallback said 90 and
  // /api/reserve took whatever the CMS held — so an owner who shortened the
  // horizon to a fortnight still had a booking sheet offering three months.
  const rules = resolveBookingRules(s);

  // Online reserveren is off. The field's own description promises the form
  // comes off the site and the telephone number stays, and until now it did
  // nothing of the kind: the page went on drawing a full form with a populated
  // date list, and the guest found out at the button. Nothing is resolved for
  // a form that is not going to be rendered, either.
  if (s.reservationsEnabled === false) {
    return <ReserverenClient locale={locale} settings={s} closed />;
  }

  // The days on offer are resolved here rather than in the browser. The form
  // can read the seven weekly rows for itself, but only the server can see the
  // repeating rules and the afwijkende dagen, and those are exactly the days a
  // guest is most likely to be looking for: the last Sunday of the month, and
  // the Tuesday in December the café opens on purpose.
  const today = todayInAmsterdam();
  const until = new Date(
    new Date(`${today}T12:00:00.000Z`).getTime() + rules.horizonDays * 86_400_000,
  )
    .toISOString()
    .slice(0, 10);
  const { days } = await loadSchedule(today, until, locale, s);

  return (
    <ReserverenClient
      locale={locale}
      settings={s}
      today={today}
      nowMinutes={nowMinutesInAmsterdam()}
      schedule={days}
      rules={rules}
    />
  );
}
