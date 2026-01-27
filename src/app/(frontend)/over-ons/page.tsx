import type { Metadata } from "next";
import { getSiteSettings } from "@/lib/payload";
import { OverOnsClient } from "./OverOnsClient";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSiteSettings();
  return {
    title: `Over Ons — ${s.siteName}`,
    description: `Ontdek het verhaal achter ${s.siteName}. ${s.aboutIntro}`,
    alternates: { canonical: "https://debeeshive.nl/over-ons" },
  };
}

export default async function OverOnsPage() {
  const s = await getSiteSettings();
  return <OverOnsClient settings={s} />;
}
