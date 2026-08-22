"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { localeHref, type Locale } from "@/i18n/config";

/**
 * A standing reservation button on phones.
 *
 * The desktop navigation carries one, but on a phone that lives behind the
 * hamburger, so the single thing a visitor most often wants is two taps away.
 * This keeps it one tap from anywhere. Hidden on the reservation page itself,
 * where it would only point at the page you are already reading.
 */
export function MobileReserveBar({
  locale,
  label,
  reservationUrl,
}: {
  locale: Locale;
  label: string;
  reservationUrl?: string;
}) {
  const pathname = usePathname();
  const target = localeHref(locale, "/reserveren");
  if (pathname === target || pathname.endsWith("/reserveren")) return null;

  const shared =
    "btn-primary w-full justify-center shadow-lift";

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-hive-700/12 bg-paper/95 px-4 py-3 md:hidden">
      {reservationUrl ? (
        <a
          href={reservationUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={shared}
        >
          {label}
        </a>
      ) : (
        <Link href={target} className={shared}>
          {label}
        </Link>
      )}
    </div>
  );
}
