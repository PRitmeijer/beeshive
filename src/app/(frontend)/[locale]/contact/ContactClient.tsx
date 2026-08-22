"use client";

import { Fragment, useState, type FormEvent } from "react";
import Link from "next/link";
import { CraftIcon } from "@/components/CraftIcon";
import { ScrollReveal } from "@/components/ScrollReveal";
import { Sheet } from "@/components/Sheet";
import { TornEdge } from "@/components/TornEdge";
import type { SiteSettingsData } from "@/lib/payload";
import { getDict } from "@/i18n/dictionaries";
import { localeHref, type Locale } from "@/i18n/config";

interface Props {
  /** The dictionary is looked up here rather than passed: it holds functions. */
  locale: Locale;
  settings: SiteSettingsData;
}

/**
 * Letterpress field: no box, just a rule the ink sits on. Paper ground.
 * Kept byte-identical to <MailingListForm> so the two forms on the site are
 * demonstrably the same piece of printing.
 */
const fieldClass =
  "mt-2 block w-full rounded-none border-0 border-b border-hive-700/25 bg-transparent " +
  "px-0 py-3 font-body text-hive-700 placeholder:text-hive-300/70 outline-none " +
  "transition-colors duration-300 ease-settle " +
  "focus:border-honey-400 focus:shadow-[inset_0_-2px_0_0_#B4735E]";

// The grounds this sheet is printed on, cream sheet, second sheet, then the
// sand of their existing site under the map mount. These must stay in step
// with `bg-paper-deep` / `bg-paper-shade` in tailwind.config.ts, since a torn
// edge is the incoming section's fill painted into the outgoing one.
const PAPER_DEEP = "#E8E2D4";
const SAND = "#DCD5AC";
const LIP_LIGHT = "rgba(255,255,255,0.5)";

/** The weekday names the CMS stores, in order, used only for matching. */
const NL_WEEKDAYS = [
  "Maandag",
  "Dinsdag",
  "Woensdag",
  "Donderdag",
  "Vrijdag",
  "Zaterdag",
  "Zondag",
];

export function ContactClient({ locale, settings: s }: Props) {
  const t = getDict(locale);

  const countryName = (() => {
    try {
      return (
        new Intl.DisplayNames([locale === "en" ? "en-GB" : "nl-NL"], {
          type: "region",
        }).of(s.address.countryCode) || s.address.country
      );
    } catch {
      return s.address.country;
    }
  })();
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [status, setStatus] = useState<"idle" | "sent">("idle");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    // Both halves are encoded: the translated subject and sign-off carry
    // characters a mail client would otherwise read as query syntax.
    const subject = encodeURIComponent(t.contact.mailSubject(form.name));
    const body = encodeURIComponent(
      `${form.message}\n\n${t.contact.mailFrom}: ${form.name} (${form.email})`,
    );
    window.location.href = `mailto:${s.contactEmail}?subject=${subject}&body=${body}`;
    setStatus("sent");
  };

  // The CMS stores one row per weekday with a Dutch name. Match on position in
  // the Dutch list rather than on the string, so a translated label still finds
  // its row, and print the name in the reader's language.
  const dayName = (day: string) => {
    const i = NL_WEEKDAYS.findIndex(
      (d) => d.toLowerCase() === day.trim().toLowerCase(),
    );
    return i === -1 ? day : t.weekdays[i];
  };

  const openingHours = (s.openingHours || []) as {
    day: string;
    hours: string;
  }[];

  const hasMap = Boolean(s.googleMapsEmbedUrl);

  // Extract Instagram handle from URL
  const instagramHandle = s.socialMedia.instagram
    ? "@" +
      s.socialMedia.instagram
        .replace(/\/$/, "")
        .split("/")
        .pop()
    : "";

  return (
    <>
      {/* ===== HERO: the sheet itself ===== */}
      <section className="relative flex min-h-[38vh] items-end overflow-hidden bg-paper">
        <div className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-12 pt-32 md:px-12 md:pb-16 lg:px-20">
          <p className="label">{t.contact.eyebrow}</p>
          <div className="rule-ink my-5 w-14" aria-hidden="true" />
          <h1 className="heading-xl text-hive-800">{t.contact.title}</h1>
        </div>
        <TornEdge
          color={PAPER_DEEP}
          lip={LIP_LIGHT}
          variant={0}
          className="absolute inset-x-0 bottom-0 z-20"
        />
      </section>

      {/* ===== DETAILS + FORM ===== */}
      <section className="section-padding relative overflow-hidden bg-paper-deep">
        <div className="mx-auto max-w-6xl">
          {/* Heading hangs left, the rule runs out to the right margin. */}
          <ScrollReveal>
            <div className="grid gap-y-8 md:grid-cols-12 md:items-end md:gap-x-10">
              <h2 className="heading-lg max-w-[15ch] text-hive-800 md:col-span-7">
                {t.contact.heading}
              </h2>
              <div
                className="rule-ink w-full md:col-span-4 md:col-start-9 md:mb-4"
                aria-hidden="true"
              />
            </div>
          </ScrollReveal>

          <div className="mt-14 grid gap-y-16 md:mt-20 md:grid-cols-12 md:gap-x-10 lg:gap-x-16">
            {/* -- 01 · the narrow rail ------------------------------------ */}
            <ScrollReveal className="md:col-span-4">
              <span className="label figures-old mb-6 block" aria-hidden="true">
                01
              </span>

              <address className="space-y-7 not-italic text-hive-500">
                <div>
                  <h3 className="label">{t.contact.address}</h3>
                  <p className="mt-2.5 leading-relaxed">
                    {s.address.street && (
                      <>
                        {s.address.street}
                        <br />
                      </>
                    )}
                    {s.address.postalCode && `${s.address.postalCode} `}
                    {s.address.area
                      ? `${s.address.area}, ${s.address.city}`
                      : s.address.city}
                    <br />
                    {countryName}
                  </p>
                </div>

                <div className="rule-ink" aria-hidden="true" />

                <div>
                  <h3 className="label">{t.contact.email}</h3>
                  <a
                    href={`mailto:${s.contactEmail}`}
                    className="ink-link mt-2.5 break-words"
                  >
                    {s.contactEmail}
                  </a>
                </div>

                {s.phone && (
                  <>
                    <div className="rule-ink" aria-hidden="true" />
                    <div>
                      <h3 className="label">{t.contact.phone}</h3>
                      <a
                        href={`tel:${s.phone.replace(/\s/g, "")}`}
                        className="ink-link figures-old mt-2.5"
                      >
                        {s.phone}
                      </a>
                    </div>
                  </>
                )}

                {s.socialMedia.instagram && (
                  <>
                    <div className="rule-ink" aria-hidden="true" />
                    <div>
                      <h3 className="label">{t.contact.follow}</h3>
                      <a
                        href={s.socialMedia.instagram}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ink-link mt-2.5"
                      >
                        {instagramHandle}
                      </a>
                    </div>
                  </>
                )}
              </address>

              {openingHours.length > 0 && (
                <div className="mt-10">
                  {/* The printed category bar, straight off the menu. */}
                  <h3 className="section-bar">{t.hours.heading}</h3>
                  {/* Day left, hours right. No leaders, the menu has none. */}
                  <dl className="mt-5 grid grid-cols-[1fr_auto] gap-x-12 gap-y-3 text-sm">
                    {openingHours.map((h) => (
                      <Fragment key={h.day}>
                        <dt className="text-hive-500">{dayName(h.day)}</dt>
                        <dd className="figures-old text-right text-hive-400">
                          {h.hours}
                        </dd>
                      </Fragment>
                    ))}
                  </dl>
                  {s.openingHoursNote ? (
                    <p className="mt-4 text-sm italic leading-snug text-hive-400">
                      {s.openingHoursNote}
                    </p>
                  ) : null}
                </div>
              )}

              {/* A table is a separate errand from a message, so it gets its
                  own pointer rather than a line buried in the form. */}
              <div className="mt-10">
                <div className="rule-ink" aria-hidden="true" />
                <h3 className="label mt-7">{t.contact.reserveHeading}</h3>
                <p className="mt-2.5 leading-relaxed text-hive-500">
                  {t.contact.reserveText}
                </p>
                <Link
                  href={localeHref(locale, "/reserveren")}
                  className="btn-secondary mt-5"
                >
                  {t.contact.reserveCta}
                </Link>
              </div>
            </ScrollReveal>

            {/* -- 02 · the wide column ----------------------------------- */}
            <ScrollReveal delay={0.15} className="md:col-span-7 md:col-start-6">
              <span className="label figures-old mb-6 block" aria-hidden="true">
                02
              </span>

              {status === "sent" ? (
                <div role="status" className="py-2">
                  <CraftIcon
                    name="bee"
                    size={48}
                    weight={1}
                    className="text-honey-600"
                  />
                  <div className="rule-ink mt-6 w-16" aria-hidden="true" />
                  <p className="mt-6 font-display text-2xl text-hive-700">
                    {t.contact.sentTitle}
                  </p>
                  <p className="mt-2 text-hive-400">{t.contact.sentText}</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-9">
                  <div className="grid gap-9 sm:grid-cols-2">
                    <div>
                      <label htmlFor="contact-name" className="label block">
                        {t.contact.formName}
                      </label>
                      <input
                        id="contact-name"
                        type="text"
                        required
                        value={form.name}
                        onChange={(e) =>
                          setForm({ ...form, name: e.target.value })
                        }
                        className={fieldClass}
                      />
                    </div>
                    <div>
                      <label htmlFor="contact-email" className="label block">
                        {t.contact.formEmail}
                      </label>
                      <input
                        id="contact-email"
                        type="email"
                        required
                        value={form.email}
                        onChange={(e) =>
                          setForm({ ...form, email: e.target.value })
                        }
                        className={fieldClass}
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="contact-message" className="label block">
                      {t.contact.formMessage}
                    </label>
                    <textarea
                      id="contact-message"
                      required
                      rows={5}
                      value={form.message}
                      onChange={(e) =>
                        setForm({ ...form, message: e.target.value })
                      }
                      className={`${fieldClass} resize-none`}
                    />
                  </div>
                  <div className="pt-2">
                    <button type="submit" className="btn-primary">
                      {t.contact.formSubmit}
                    </button>
                  </div>
                </form>
              )}
            </ScrollReveal>
          </div>
        </div>

        {hasMap && (
          <TornEdge
            color={SAND}
            lip={LIP_LIGHT}
            variant={1}
            className="absolute inset-x-0 bottom-0 z-20"
          />
        )}
      </section>

      {/* ===== 03 · THE MAP, MOUNTED ON A CUT SHEET ===== */}
      {s.googleMapsEmbedUrl && (
        <section className="section-padding relative overflow-hidden bg-paper-shade">
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-y-8 md:grid-cols-12 md:gap-x-10">
              <div className="md:col-span-2 md:pt-1">
                <ScrollReveal>
                  <span
                    className="label figures-old block"
                    aria-hidden="true"
                  >
                    03
                  </span>
                  <div className="rule-ink mt-5 w-12" aria-hidden="true" />
                </ScrollReveal>
              </div>

              <ScrollReveal delay={0.1} className="md:col-span-9 md:col-start-4">
                <figure>
                  <Sheet tone="deep" edge="soft">
                    <div className="p-3 md:p-4">
                      <iframe
                        src={s.googleMapsEmbedUrl}
                        width="100%"
                        height="400"
                        // Sepia pulls the map into the pigment range of the page.
                        style={{
                          border: 0,
                          filter: "sepia(0.22) saturate(0.85) contrast(0.96)",
                        }}
                        allowFullScreen
                        loading="lazy"
                        referrerPolicy="no-referrer-when-downgrade"
                        title={t.contact.mapTitle}
                        className="block w-full"
                      />
                    </div>
                  </Sheet>
                </figure>
              </ScrollReveal>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
