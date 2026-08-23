import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSiteSettings } from "@/lib/payload";
import { buildMetadata } from "@/lib/metadata";
import { nowMinutesInAmsterdam, todayInAmsterdam } from "@/lib/openingHours";
import { loadSchedule } from "@/lib/schedule";
import { getDict } from "@/i18n/dictionaries";
import { parseLocale } from "@/i18n/config";
import { ReserverenClient } from "./ReserverenClient";

/**
 * A minute rather than five: the form is handed today's date and the current
 * time in Amsterdam, and uses them to decide whether tonight is still bookable.
 * Nothing on this page is live availability — the seats are counted by
 * /api/reserve when the request is actually made — so a minute-old clock is
 * only ever a minute of a slot offered slightly too long, never a double
 * booking. See the note above `revalidate` on the home page.
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

  // The days on offer are resolved here rather than in the browser. The form
  // can read the seven weekly rows for itself, but only the server can see the
  // repeating rules and the afwijkende dagen, and those are exactly the days a
  // guest is most likely to be looking for: the last Sunday of the month, and
  // the Tuesday in December the café opens on purpose.
  const today = todayInAmsterdam();
  const horizonDays = Math.min(
    Math.max(Number(s.reservationHorizonDays) || 90, 1),
    92,
  );
  const until = new Date(
    new Date(`${today}T12:00:00.000Z`).getTime() + horizonDays * 86_400_000,
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
    />
  );
}
