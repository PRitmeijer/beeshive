import type { Metadata } from "next";
import { HomeClient } from "./HomeClient";

export const metadata: Metadata = {
  title: "De Bee's Hive — Eetcafé in het hart van Zuilen",
  description:
    "Een warm eetcafé in het hart van Zuilen, Utrecht waar creativiteit, verbinding en lekker eten samenkomen. Ontdek onze creatieve keuken met lokale ingrediënten.",
  alternates: {
    canonical: "https://debeeshive.nl",
  },
};

// JSON-LD structured data for the restaurant
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Restaurant",
  name: "De Bee's Hive",
  description:
    "Een warm eetcafé in het hart van Zuilen waar creativiteit, verbinding en lekker eten samenkomen.",
  url: "https://debeeshive.nl",
  email: "info@debeeshive.nl",
  servesCuisine: ["Dutch", "International", "South African"],
  priceRange: "€€",
  address: {
    "@type": "PostalAddress",
    addressLocality: "Utrecht",
    addressRegion: "Utrecht",
    addressCountry: "NL",
  },
  openingHoursSpecification: [
    {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
      opens: "12:00",
      closes: "22:00",
    },
  ],
  sameAs: ["https://instagram.com/debeeshive"],
};

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* SEO-visible content rendered server-side */}
      <h1 className="sr-only">
        De Bee&apos;s Hive — Eetcafé in het hart van Zuilen, Utrecht
      </h1>

      <HomeClient />
    </>
  );
}
