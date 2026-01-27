import { getPayloadClient } from "@/lib/payload";
import { GalerijClient } from "./GalerijClient";

export const dynamic = "force-dynamic";

export default async function GalerijPage() {
  let images: any[] = [];

  try {
    const payload = await getPayloadClient();
    const res = await payload.find({
      collection: "gallery-images",
      sort: "order",
      limit: 100,
      depth: 1,
    });
    images = res.docs;
  } catch {
    // CMS not initialized
  }

  return <GalerijClient images={images} />;
}
