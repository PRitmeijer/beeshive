import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSiteSettings } from "@/lib/payload";
import { nowMinutesInAmsterdam, todayInAmsterdam } from "@/lib/openingHours";
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

export default async function ReserverenPage({ params }: PageProps) {
  const locale = parseLocale((await params).locale);
  if (!locale) notFound();

  const s = await getSiteSettings(locale);
  return (
    <ReserverenClient
      locale={locale}
      settings={s}
      today={todayInAmsterdam()}
      nowMinutes={nowMinutesInAmsterdam()}
    />
  );
}
