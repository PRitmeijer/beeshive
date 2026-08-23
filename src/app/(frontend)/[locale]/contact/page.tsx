import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSiteSettings } from "@/lib/payload";
import { buildMetadata } from "@/lib/metadata";
import { todayInAmsterdam } from "@/lib/openingHours";
import { loadSchedule } from "@/lib/schedule";
import { getDict } from "@/i18n/dictionaries";
import { parseLocale } from "@/i18n/config";
import { ContactClient } from "./ContactClient";

/**
 * A minute rather than five, because this page resolves "today" and marks it in
 * the table of days ahead. See the note above `revalidate` on the home page.
 */
export const revalidate = 60;

/**
 * How far ahead the contact page looks for days that break the pattern. Four
 * weeks is about as far as somebody planning a visit thinks, and it is long
 * enough to always contain the next last-Sunday-of-the-month.
 */
const SCHEDULE_DAYS = 28;

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
    path: "/contact",
    title: t.contact.metaTitle(s.siteName),
    description: t.contact.metaDescription(
      s.siteName,
      s.address.area,
      s.address.city,
    ),
  });
}

export default async function ContactPage({ params }: PageProps) {
  const locale = parseLocale((await params).locale);
  if (!locale) notFound();

  const s = await getSiteSettings(locale);

  // The opening hours table is seven rows of CMS text and cannot say that the
  // last Sunday of the month is open or that Eerste Kerstdag is not. The
  // resolved days can, so they are worked out here — on the server, where the
  // clock and the CMS both live — and handed down for ContactClient to print
  // beside the table.
  const today = todayInAmsterdam();
  const until = new Date(
    new Date(`${today}T12:00:00.000Z`).getTime() + SCHEDULE_DAYS * 86_400_000,
  )
    .toISOString()
    .slice(0, 10);
  const { days } = await loadSchedule(today, until, locale, s);

  return (
    <ContactClient locale={locale} settings={s} today={today} schedule={days} />
  );
}
