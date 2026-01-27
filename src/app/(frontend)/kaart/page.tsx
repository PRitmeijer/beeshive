import { getPayloadClient } from "@/lib/payload";
import { KaartClient } from "./KaartClient";

export const dynamic = "force-dynamic";

export default async function KaartPage() {
  let categories: any[] = [];
  let items: any[] = [];

  try {
    const payload = await getPayloadClient();
    const [catRes, itemRes] = await Promise.all([
      payload.find({
        collection: "menu-categories",
        sort: "order",
        limit: 100,
      }),
      payload.find({
        collection: "menu-items",
        sort: "order",
        limit: 200,
        where: { available: { equals: true } },
      }),
    ]);
    categories = catRes.docs;
    items = itemRes.docs;
  } catch {
    // CMS not initialized yet, show placeholder
  }

  return <KaartClient categories={categories} items={items} />;
}
