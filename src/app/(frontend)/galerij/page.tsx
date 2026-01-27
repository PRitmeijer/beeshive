import type { Metadata } from "next";
import { getPayloadClient } from "@/lib/payload";
import { GalerijClient } from "./GalerijClient";

export const metadata: Metadata = {
  title: "Galerij — De Bee's Hive",
  description:
    "Bekijk foto's van De Bee's Hive — ons restaurant, gerechten, evenementen en sfeerbeelden uit het hart van Zuilen.",
  alternates: { canonical: "https://debeeshive.nl/galerij" },
};

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
