import "../../globals.css";
import { notFound } from "next/navigation";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { MobileReserveButton } from "@/components/MobileReserveButton";
import { NotificationBanner } from "@/components/NotificationBanner";
import { PaperDefs } from "@/components/Sheet";
import { getSiteSettings } from "@/lib/payload";
import { locales, parseLocale } from "@/i18n/config";

/**
 * Both language versions of the site are pre-declared, so /nl/... and /en/...
 * are known routes rather than arbitrary dynamic segments. The pages
 * underneath still opt into `force-dynamic` where they read the CMS.
 */
export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function FrontendLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  // A segment that is not a declared language is not a page. Without this the
  // route would happily serve the homepage at /anything.
  const locale = parseLocale((await params).locale);
  if (!locale) notFound();

  const s = await getSiteSettings(locale);

  return (
    <html lang={locale}>
      <head>
        <link
          rel="preconnect"
          href="https://fonts.googleapis.com"
          crossOrigin="anonymous"
        />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        {/* Matches the printed menu: one geometric sans doing all the structural
            work, and a brush script held back for card titles. */}
        <link
          href="https://fonts.googleapis.com/css2?family=Jost:ital,wght@0,300..700;1,300..700&family=Kaushan+Script&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen flex flex-col antialiased">
        <PaperDefs />
        <NotificationBanner locale={locale} />
        <Navigation
          locale={locale}
          reservationUrl={s.reservationUrl || undefined}
          siteName={s.siteName}
        />
        <main className="flex-1">{children}</main>
        <Footer locale={locale} />
        <MobileReserveButton
          locale={locale}
          reservationUrl={s.reservationUrl || undefined}
          openingHours={s.openingHours}
        />
        <div className="paper-ground" aria-hidden="true" />
      </body>
    </html>
  );
}
