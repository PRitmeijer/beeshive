import Link from "next/link";
import { getSiteSettings } from "@/lib/payload";
import { TornEdge } from "@/components/TornEdge";
import { SocialRow, socialLinks } from "@/components/SocialMarks";
import { OutboundLinkTracker } from "@/components/AddToCalendarTracker";
import { getDict } from "@/i18n/dictionaries";
import { localeHref, localeTags, type Locale } from "@/i18n/config";

export async function Footer({ locale }: { locale: Locale }) {
  const s = await getSiteSettings(locale);
  const t = getDict(locale);

  const links = socialLinks(s);

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
            {/* The telephone number down here is tapped more than every other
                one on the site put together, because it is on every page,
                and it was the one nobody counted — so "how many people rang
                us" read as a fraction of itself, weighted towards whoever
                happened to be on the contact page. This footer is rendered on
                the server, so the tap is heard by delegation rather than by a
                handler; see the component's own note. */}
            <OutboundLinkTracker surface="footer">
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
            </OutboundLinkTracker>
          </div>

          {/* Social */}
          {links.length > 0 && (
            <div className="md:col-span-2">
              <h4 className="label-light">{t.footer.follow}</h4>
              <div className="rule-ink-light mt-3 mb-4" aria-hidden="true" />
              <SocialRow
                links={links}
                gap="gap-2.5"
                className="flex h-10 w-10 items-center justify-center rounded-[2px] border border-honey-300/25 text-honey-300 transition-colors duration-500 ease-settle hover:border-honey-400 hover:bg-honey-400 hover:text-hive-800"
              />
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
