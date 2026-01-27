import "../globals.css";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { NotificationBanner } from "@/components/NotificationBanner";
import { getSiteSettings } from "@/lib/payload";

export default async function FrontendLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const s = await getSiteSettings();

  return (
    <html lang="nl">
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
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen flex flex-col antialiased">
        <NotificationBanner />
        <Navigation
          reservationUrl={s.reservationUrl || undefined}
          siteName={s.siteName}
        />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
