import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSiteSettings } from "@/lib/payload";
import { getDict } from "@/i18n/dictionaries";
import { alternatesFor, parseLocale } from "@/i18n/config";
import { ReserverenClient } from "./ReserverenClient";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const locale = parseLocale((await params).locale);
  if (!locale) return {};
  const s = await getSiteSettings(locale);
  const t = getDict(locale);
  return {
    title: t.reserve.metaTitle(s.siteName),
    description: t.reserve.metaDescription(
      s.siteName,
      s.address.area,
      s.address.city,
    ),
    alternates: alternatesFor(locale, "/reserveren"),
  };
}

/** Today in Amsterdam as YYYY-MM-DD, decided on the server so the date field
 *  cannot disagree with itself between the rendered HTML and the browser. */
function todayInAmsterdam(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default async function ReserverenPage({ params }: PageProps) {
  const locale = parseLocale((await params).locale);
  if (!locale) notFound();

  const s = await getSiteSettings(locale);
  return (
    <ReserverenClient
      locale={locale}
      settings={s}
      today={todayInAmsterdam()}
    />
  );
}
