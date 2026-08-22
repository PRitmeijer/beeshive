import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSiteSettings } from "@/lib/payload";
import { getDict } from "@/i18n/dictionaries";
import { alternatesFor, parseLocale } from "@/i18n/config";
import { OverOnsClient } from "./OverOnsClient";

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
    title: t.about.metaTitle(s.siteName),
    description: t.about.metaDescription(s.siteName, s.aboutIntro),
    alternates: alternatesFor(locale, "/over-ons"),
  };
}

export default async function OverOnsPage({ params }: PageProps) {
  const locale = parseLocale((await params).locale);
  if (!locale) notFound();

  const s = await getSiteSettings(locale);
  return <OverOnsClient locale={locale} settings={s} />;
}
