import type { Metadata } from "next";
import "../globals.css";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { NotificationBanner } from "@/components/NotificationBanner";

export const metadata: Metadata = {
  title: "De Bee's Hive — Eetcafé in het hart van Zuilen",
  description:
    "Een warm eetcafé in het hart van Zuilen waar creativiteit, verbinding en lekker eten samenkomen.",
  keywords: ["eetcafé", "zuilen", "utrecht", "restaurant", "de bee's hive"],
  openGraph: {
    title: "De Bee's Hive",
    description:
      "Waar eten en creativiteit samenkomen. Een warm eetcafé in het hart van Zuilen.",
    locale: "nl_NL",
    type: "website",
  },
};

export default function FrontendLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
        <Navigation />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
