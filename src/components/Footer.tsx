import Link from "next/link";
import { getSiteSettings } from "@/lib/payload";
import { TornEdge } from "@/components/TornEdge";
import { getDict } from "@/i18n/dictionaries";
import { localeHref, localeTags, type Locale } from "@/i18n/config";

export async function Footer({ locale }: { locale: Locale }) {
  const s = await getSiteSettings(locale);
  const t = getDict(locale);

  const socialLinks = [
    {
      name: "Instagram",
      url: s.socialMedia.instagram,
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
        </svg>
      ),
    },
    {
      name: "Facebook",
      url: s.socialMedia.facebook,
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
      ),
    },
    {
      name: "TripAdvisor",
      url: s.socialMedia.tripadvisor,
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12.006 4.295c-2.67 0-5.338.784-7.645 2.353H0l1.963 2.135a5.997 5.997 0 004.04 10.43 5.976 5.976 0 004.075-1.6L12 19.525l1.922-1.912a5.976 5.976 0 004.075 1.6 5.997 5.997 0 004.04-10.43L24 6.648h-4.35a13.573 13.573 0 00-7.644-2.353zM6.003 17.212a3.997 3.997 0 110-7.994 3.997 3.997 0 010 7.994zm11.994 0a3.997 3.997 0 110-7.994 3.997 3.997 0 010 7.994zM6.003 11.218a2 2 0 100 4 2 2 0 000-4zm11.994 0a2 2 0 100 4 2 2 0 000-4z" />
        </svg>
      ),
    },
  ].filter((l) => l.url);

  // The country is one address field Payload does not keep per language, so it
  // is stored once as "Nederland". The ISO code beside it does carry the
  // meaning, so the reader's own language can supply the word.
  const country = (() => {
    try {
      return (
        new Intl.DisplayNames([localeTags[locale]], { type: "region" }).of(
          s.address.countryCode,
        ) || s.address.country
      );
    } catch {
      return s.address.country;
    }
  })();

  // Written as the Dutch paths the site is indexed under; localeHref adds the
  // /en prefix on the English side.
  const navItems: [string, string][] = [
    ["/", t.nav.home],
    ["/over-ons", t.nav.about],
    ["/kaart", t.nav.menu],
    ["/galerij", t.nav.gallery],
    ["/blog", t.nav.blog],
    ["/contact", t.nav.contact],
    ["/reserveren", t.nav.reserve],
  ];

  return (
    <footer className="relative bg-hive-800 text-honey-100">
      {/* The back cover: the one dark sheet left in the book. It tears UP into
          whatever paper section ends the page, so it is anchored at bottom-full
          outside the footer box. The footer must therefore never carry
          `overflow-hidden`, and the last section of every page must not draw a
          competing edge of its own. */}
      <TornEdge
        color="#331E0C"
        lip="rgba(216,190,126,0.3)"
        variant={1}
        className="absolute inset-x-0 bottom-full z-10"
      />

      <div
        aria-hidden="true"
        className="honeycomb-frame absolute inset-0 pointer-events-none opacity-60"
      />

      <div className="relative max-w-6xl mx-auto px-6 md:px-12 py-20 md:py-24">
        <div className="grid md:grid-cols-12 gap-x-8 gap-y-14">
          {/* Brand: the widest measure, the rest hangs off to the right */}
          <div className="md:col-span-4">
            <h3 className="heading-md text-honey-200">{s.siteName}</h3>
            <div className="rule-ink-light w-14 mt-5 mb-5" aria-hidden="true" />
            <p className="text-honey-200/70 text-sm leading-relaxed max-w-sm">
              {s.description}
            </p>
          </div>

          {/* Links */}
          <div className="md:col-start-6 md:col-span-2">
            <h4 className="label-light">{t.footer.navigation}</h4>
            <div className="rule-ink-light mt-3 mb-4" aria-hidden="true" />
            <ul className="space-y-2.5 text-sm">
              {navItems.map(([href, label], i) => (
                <li key={href} className="flex items-baseline gap-3">
                  <span
                    aria-hidden="true"
                    className="figures-old text-[0.6875rem] tracking-label text-honey-300/70"
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <Link
                    href={localeHref(locale, href)}
                    className="text-honey-200/70 hover:text-honey-300 transition-colors duration-500 ease-settle"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div className="md:col-span-3">
            <h4 className="label-light">{t.footer.contact}</h4>
            <div className="rule-ink-light mt-3 mb-4" aria-hidden="true" />
            <address className="not-italic">
              <ul className="space-y-2.5 text-sm text-honey-200/70">
                <li>
                  <a
                    href={`mailto:${s.contactEmail}`}
                    className="hover:text-honey-300 transition-colors duration-500 ease-settle break-words"
                  >
                    {s.contactEmail}
                  </a>
                </li>
                {s.phone && (
                  <li>
                    <a
                      href={`tel:${s.phone.replace(/\s/g, "")}`}
                      className="figures-old hover:text-honey-300 transition-colors duration-500 ease-settle"
                    >
                      {s.phone}
                    </a>
                  </li>
                )}
                <li>
                  {s.address.area
                    ? `${s.address.area}, ${s.address.city}`
                    : s.address.city}
                </li>
                <li>{country}</li>
              </ul>
            </address>
          </div>

          {/* Social */}
          {socialLinks.length > 0 && (
            <div className="md:col-span-2">
              <h4 className="label-light">{t.footer.follow}</h4>
              <div className="rule-ink-light mt-3 mb-4" aria-hidden="true" />
              <div className="flex gap-2.5">
                {socialLinks.map((link) => (
                  <a
                    key={link.name}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-10 h-10 rounded-[2px] border border-honey-300/25 flex items-center justify-center text-honey-300 hover:border-honey-400 hover:bg-honey-400 hover:text-hive-800 transition-colors duration-500 ease-settle"
                    aria-label={link.name}
                  >
                    {link.icon}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Colophon line */}
        <div className="rule-ink-light mt-20" aria-hidden="true" />
        <div className="pt-6 grid md:grid-cols-12 gap-3 items-baseline">
          {/* Pale gold on the dark cover still has to be readable: honey-200
              at 70% is 6.0:1 on hive-800, the tagline at full honey-300 is
              8.7:1. The old /45 and /55 sat at 3.3 and 3.6. */}
          <p className="md:col-span-7 text-honey-200/70 text-sm">
            &copy;{" "}
            <span className="figures-old">{new Date().getFullYear()}</span>{" "}
            {s.siteName}. {t.footer.rights}
          </p>
          <p className="md:col-start-9 md:col-span-4 md:text-right label-light">
            {s.footerTagline}
          </p>
        </div>
      </div>
    </footer>
  );
}
