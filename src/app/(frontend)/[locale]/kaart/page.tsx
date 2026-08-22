import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPayloadClient, getSiteSettings } from "@/lib/payload";
import { getDict } from "@/i18n/dictionaries";
import { alternatesFor, parseLocale } from "@/i18n/config";
import { KaartClient } from "./KaartClient";

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const locale = parseLocale((await params).locale);
  if (!locale) return {};
  const s = await getSiteSettings(locale);
  const t = getDict(locale);
  return {
    title: t.menuPage.metaTitle(s.siteName),
    description: t.menuPage.metaDescription,
    alternates: alternatesFor(locale, "/kaart"),
  };
}

export const dynamic = "force-dynamic";

export default async function KaartPage({ params }: PageProps) {
  const locale = parseLocale((await params).locale);
  if (!locale) notFound();

  let categories: any[] = [];
  let items: any[] = [];

  try {
    const payload = await getPayloadClient();
    const [catRes, itemRes] = await Promise.all([
      payload.find({
        collection: "menu-categories",
        sort: "order",
        limit: 100,
        locale,
      }),
      payload.find({
        collection: "menu-items",
        sort: "order",
        limit: 200,
        where: { available: { equals: true } },
        locale,
      }),
    ]);
    categories = catRes.docs;
    items = itemRes.docs;
  } catch {
    // CMS not initialized yet, show placeholder
  }

  return <KaartClient locale={locale} categories={categories} items={items} />;
}
