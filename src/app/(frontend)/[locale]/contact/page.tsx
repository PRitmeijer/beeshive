import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSiteSettings } from "@/lib/payload";
import { getDict } from "@/i18n/dictionaries";
import { alternatesFor, parseLocale } from "@/i18n/config";
import { ContactClient } from "./ContactClient";

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
    title: t.contact.metaTitle(s.siteName),
    description: t.contact.metaDescription(
      s.siteName,
      s.address.area,
      s.address.city,
    ),
    alternates: alternatesFor(locale, "/contact"),
  };
}

export default async function ContactPage({ params }: PageProps) {
  const locale = parseLocale((await params).locale);
  if (!locale) notFound();

  const s = await getSiteSettings(locale);
  return <ContactClient locale={locale} settings={s} />;
}
