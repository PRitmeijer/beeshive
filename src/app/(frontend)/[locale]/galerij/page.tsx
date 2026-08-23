import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPayloadClient, getSiteSettings } from "@/lib/payload";
import { buildMetadata } from "@/lib/metadata";
import { getDict } from "@/i18n/dictionaries";
import { parseLocale } from "@/i18n/config";
import { GalerijClient } from "./GalerijClient";

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
    path: "/galerij",
    title: t.gallery.metaTitle(s.siteName),
    description: t.gallery.metaDescription,
  });
}

/**
 * Five minutes rather than the home page's one: a photograph added to the
 * gallery is not news, and the page reads nothing but the collection. See the
 * note above `revalidate` there for what the caching is for and what the delay
 * costs.
 */
export const revalidate = 300;

export default async function GalerijPage({ params }: PageProps) {
  const locale = parseLocale((await params).locale);
  if (!locale) notFound();

  let images: any[] = [];

  try {
    const payload = await getPayloadClient();
    const res = await payload.find({
      collection: "gallery-images",
      sort: "order",
      limit: 100,
      depth: 1,
      locale,
    });
    images = res.docs;
  } catch {
    // CMS not initialized
  }

  return <GalerijClient locale={locale} images={images} />;
}
