import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPayloadClient, getSiteSettings } from "@/lib/payload";
import { buildMetadata } from "@/lib/metadata";
import { getDict } from "@/i18n/dictionaries";
import { parseLocale } from "@/i18n/config";
import { KaartClient, type Category, type MenuItem } from "./KaartClient";

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

  let categories: Category[] = [];
  let items: MenuItem[] = [];

  try {
    const payload = await getPayloadClient();
    /**
     * Both reads name the fields the card prints and nothing else, and both
     * ask for depth 0.
     *
     * Whatever comes back here does not stay on the server: it is serialised
     * into the page as flight payload, sent to every visitor, and parsed by
     * React on their phone. Left to itself Payload returns the whole document
     * at depth 2 — the pittigheid, the allergenen, the seizoensgerecht and
     * nieuw checkboxes, the timestamps, the category expanded into a full
     * record, and the photo expanded into a full media document with its url,
     * its dimensions, its focal point and its four generated sizes. The card
     * prints six fields. Measured on the build output that is 527 bytes a dish
     * where 174 will do.
     *
     * The photo is the reason this is worth doing now rather than later. No
     * dish has one today, so the fat is currently modest; the first afternoon
     * the owners spend attaching pictures in the admin, every visitor starts
     * downloading a kilobyte of image metadata per dish for a picture this
     * page has never rendered, with nothing in the code changing to say so.
     *
     * At depth 0 `category` arrives as the bare row id instead of the record,
     * which is what catIdOf() in KaartClient reads either way. `pagination:
     * false` keeps the limit as a ceiling but drops the COUNT query that goes
     * with paging nobody asked for.
     */
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
        pagination: false,
        depth: 0,
        select: { name: true, description: true },
        locale,
      }),
      payload.find({
        collection: "menu-items",
        sort: ["order", "name"],
        limit: 200,
        pagination: false,
        depth: 0,
        select: {
          name: true,
          description: true,
          price: true,
          category: true,
          dietary: true,
          featured: true,
        },
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
