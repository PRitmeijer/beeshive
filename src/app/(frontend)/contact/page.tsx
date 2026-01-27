import type { Metadata } from "next";
import { getSiteSettings } from "@/lib/payload";
import { ContactClient } from "./ContactClient";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSiteSettings();
  return {
    title: `Contact — ${s.siteName}`,
    description: `Neem contact op met ${s.siteName} in ${s.address.area}, ${s.address.city}. Stuur ons een bericht of kom langs.`,
    alternates: { canonical: "https://debeeshive.nl/contact" },
  };
}

export default async function ContactPage() {
  const s = await getSiteSettings();
  return <ContactClient settings={s} />;
}
