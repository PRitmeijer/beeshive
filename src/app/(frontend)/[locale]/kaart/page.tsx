import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPayloadClient, getSiteSettings } from "@/lib/payload";
import { buildMetadata } from "@/lib/metadata";
import { getDict } from "@/i18n/dictionaries";
import { parseLocale } from "@/i18n/config";
import { KaartClient } from "./KaartClient";

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
    path: "/kaart",
    title: t.menuPage.metaTitle(s.siteName),
    description: t.menuPage.metaDescription,
  });
}

/**
 * Cached for a minute; see the note above `revalidate` on the home page for
 * why these pages stopped being `force-dynamic` and what the minute costs.
 */
export const revalidate = 60;

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
        // Second key on purpose. Rows tied on `order` come back in whatever
        // sequence the database feels like, and it does not feel the same way
        // twice — so a card with two categories both left at the same number
        // reorders itself between page loads. `name` is stable, so ties break
        // the same way every time.
        sort: ["order", "name"],
        limit: 100,
        locale,
      }),
      payload.find({
        collection: "menu-items",
        sort: ["order", "name"],
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
