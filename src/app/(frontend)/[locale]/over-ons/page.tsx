import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSiteSettings } from "@/lib/payload";
import { buildMetadata } from "@/lib/metadata";
import { getDict } from "@/i18n/dictionaries";
import { parseLocale } from "@/i18n/config";
import { OverOnsClient } from "./OverOnsClient";

/**
 * Five minutes rather than the home page's one: the story of the place, the
 * photograph and the paragraph under it change a few times a year, and nothing
 * on the page reads the clock. See the note above `revalidate` there for what
 * the caching is for and what the delay costs.
 */
export const revalidate = 300;

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
    path: "/over-ons",
    title: t.about.metaTitle(s.siteName),
    description: t.about.metaDescription(s.siteName, s.aboutIntro),
  });
}

export default async function OverOnsPage({ params }: PageProps) {
  const locale = parseLocale((await params).locale);
  if (!locale) notFound();

  const s = await getSiteSettings(locale);
  return <OverOnsClient locale={locale} settings={s} />;
}
