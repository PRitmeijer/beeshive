import type { Metadata } from "next";
import { getSiteSettings } from "@/lib/payload";
import { HomeClient } from "./HomeClient";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSiteSettings();
  return {
    title: `${s.siteName} — Eetcafé in het hart van ${s.address.area}`,
    description: s.description,
    alternates: { canonical: "https://debeeshive.nl" },
  };
}

// Map Dutch day names to English for schema.org
const dayMap: Record<string, string> = {
  maandag: "Monday",
  dinsdag: "Tuesday",
  woensdag: "Wednesday",
  donderdag: "Thursday",
  vrijdag: "Friday",
  zaterdag: "Saturday",
  zondag: "Sunday",
};

function buildOpeningHoursSpec(
  hours: { day: string; hours: string }[],
) {
  return hours
    .filter((h) => h.hours.toLowerCase() !== "gesloten")
    .map((h) => {
      const match = h.hours.match(/(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})/);
      return {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: dayMap[h.day.toLowerCase()] || h.day,
        opens: match?.[1] || "12:00",
        closes: match?.[2] || "22:00",
      };
    });
}

export default async function HomePage() {
  const s = await getSiteSettings();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: s.siteName,
    description: s.description,
    url: "https://debeeshive.nl",
    email: s.contactEmail,
    ...(s.phone ? { telephone: s.phone } : {}),
    servesCuisine: s.cuisines
      .split(",")
      .map((c: string) => c.trim()),
    priceRange: s.priceRange,
    address: {
      "@type": "PostalAddress",
      ...(s.address.street
        ? { streetAddress: s.address.street }
        : {}),
      addressLocality: s.address.city,
      addressRegion: s.address.city,
      ...(s.address.postalCode
        ? { postalCode: s.address.postalCode }
        : {}),
      addressCountry: s.address.countryCode,
    },
    openingHoursSpecification: buildOpeningHoursSpec(
      s.openingHours as { day: string; hours: string }[],
    ),
    sameAs: [
      s.socialMedia.instagram,
      s.socialMedia.facebook,
      s.socialMedia.tripadvisor,
    ].filter(Boolean),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <h1 className="sr-only">
        {s.siteName} — Eetcafé in het hart van {s.address.area},{" "}
        {s.address.city}
      </h1>
      <HomeClient settings={s} />
    </>
  );
}
