"use client";

import { Fragment, useState, type FormEvent } from "react";
import { CraftIcon } from "@/components/CraftIcon";
import { ScrollReveal } from "@/components/ScrollReveal";
import { Sheet } from "@/components/Sheet";
import { SocialRow, followLinks, reviewLink } from "@/components/SocialMarks";
import { TornEdge } from "@/components/TornEdge";
import type { SiteSettingsData } from "@/lib/payload";
import { isContactError } from "@/lib/contactErrors";
import { getDict } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";

interface Props {
  /** The dictionary is looked up here rather than passed: it holds functions. */
  locale: Locale;
  settings: SiteSettingsData;
}

/**
 * Letterpress field: no box, just a rule the ink sits on. Paper ground.
 * Kept byte-identical to <MailingListForm> so the forms on the site are
 * demonstrably the same piece of printing.
 */
const fieldClass =
  "mt-2 block w-full rounded-none border-0 border-b border-hive-700/25 bg-transparent " +
  "px-0 py-3 font-body text-hive-700 placeholder:text-hive-300/70 outline-none " +
  "transition-colors duration-300 ease-settle " +
  "focus:border-honey-400 focus:shadow-[inset_0_-2px_0_0_#B4735E]";

// Must stay in step with `bg-paper-deep` in tailwind.config.ts: a torn edge is
// the incoming section's fill painted into the outgoing one.
const PAPER_DEEP = "#E8E2D4";
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
  // Honeypot, kept out of `form` so it can never be mistaken for real input.
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "sent" | "error"
  >("idle");
  const [error, setError] = useState(t.contact.genericError);

  /** The endpoint answers a refusal with a code; the words come from here. */
  const messageFrom = (data: unknown): string => {
    const code =
      data && typeof data === "object"
        ? (data as { error?: unknown }).error
        : undefined;
    return isContactError(code) ? t.contact.errors[code] : t.contact.genericError;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, website }),
      });
      if (res.ok) {
        setStatus("sent");
        setForm({ name: "", email: "", message: "" });
        return;
      }
      setError(messageFrom(await res.json().catch(() => null)));
      setStatus("error");
    } catch {
      setError(t.contact.genericError);
      setStatus("error");
    }
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
  const follow = followLinks(s);
  const review = reviewLink(s);

  return (
    <>
      {/* ===== HERO: shallow. This page is a reference, not an essay. ===== */}
      <section className="relative overflow-hidden bg-paper">
        <div className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-10 pt-28 md:px-12 md:pb-12 lg:px-20">
          <p className="label">{t.contact.eyebrow}</p>
          <div className="rule-ink my-4 w-14" aria-hidden="true" />
          <h1 className="heading-xl text-hive-800">{t.contact.title}</h1>
        </div>
        <TornEdge
          color={PAPER_DEEP}
          lip={LIP_LIGHT}
          variant={0}
          className="absolute inset-x-0 bottom-0 z-20"
        />
      </section>

      {/* ===== EVERYTHING YOU CAME FOR, ON ONE SCREEN =====
           Hours, where we are, how to reach us and a message box used to be
           four numbered chapters down a long page. They are four short
           columns; the page is a reference card, so it is set as one. */}
      <section className="relative overflow-hidden bg-paper-deep px-6 py-14 md:px-12 md:py-20 lg:px-20">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-x-10 gap-y-12 md:grid-cols-12 lg:gap-x-16">
            {/* -- the two things you write down: when, and to whom --- */}
            <div className="space-y-12 md:col-span-6">
              {/* -- when ------------------------------------------------- */}
              <ScrollReveal className="md:col-span-6">
                {openingHours.length > 0 && (
                  <>
                    {/* The printed category bar, straight off the menu. */}
                    <h2 className="section-bar">{t.hours.heading}</h2>
                    {/* Day left, hours right. No leaders, the menu has none. */}
                    <dl className="mt-4 grid grid-cols-[1fr_auto] gap-x-8 gap-y-2 text-sm">
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
                  </>
                )}

              </ScrollReveal>
              {/* -- and a word, if you want one --------------------------- */}
              <ScrollReveal delay={0.14} className="md:col-span-12">
                <h2 className="section-bar">{t.contact.messageHeading}</h2>

                {status === "sent" ? (
                  <div role="status" className="pt-6">
                    <CraftIcon
                      name="bee"
                      size={40}
                      weight={1}
                      className="text-honey-600"
                    />
                    <p className="mt-5 font-display text-xl text-hive-700">
                      {t.contact.sentTitle}
                    </p>
                    <p className="mt-2 text-sm text-hive-400">
                      {t.contact.sentText}
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="relative mt-5 space-y-6">
                    <div className="grid gap-6 sm:grid-cols-2">
                      <div>
                        <label htmlFor="contact-name" className="label block">
                          {t.contact.formName}
                        </label>
                        <input
                          id="contact-name"
                          name="name"
                          type="text"
                          required
                          maxLength={120}
                          autoComplete="name"
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
                          name="email"
                          type="email"
                          required
                          maxLength={200}
                          autoComplete="email"
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
                        name="message"
                        required
                        rows={4}
                        maxLength={4000}
                        value={form.message}
                        onChange={(e) =>
                          setForm({ ...form, message: e.target.value })
                        }
                        className={`${fieldClass} resize-none`}
                      />
                    </div>

                    {/* Honeypot. Off screen rather than display:none, and hidden
                        from the accessibility tree, so only a bot reaches it. */}
                    <div
                      aria-hidden="true"
                      className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden"
                    >
                      <label htmlFor="contact-website">{t.contact.honeypot}</label>
                      <input
                        id="contact-website"
                        name="website"
                        type="text"
                        tabIndex={-1}
                        autoComplete="off"
                        value={website}
                        onChange={(e) => setWebsite(e.target.value)}
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={status === "loading"}
                      className="btn-primary disabled:opacity-50"
                    >
                      {status === "loading"
                        ? t.contact.formSubmitting
                        : t.contact.formSubmit}
                    </button>

                    {status === "error" && (
                      <p
                        role="alert"
                        className="flex items-center gap-2 text-sm text-honey-600"
                      >
                        <svg
                          viewBox="0 0 12 12"
                          width="12"
                          height="12"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.4"
                          strokeLinecap="round"
                          aria-hidden="true"
                          focusable="false"
                          className="shrink-0"
                        >
                          <path d="M2.2 2.4 L9.8 9.6" />
                          <path d="M9.7 2.3 L2.3 9.7" />
                        </svg>
                        {error}
                      </p>
                    )}
                  </form>
                )}
              </ScrollReveal>
            </div>

            {/* -- where, and how ---------------------------------------- */}
            <ScrollReveal delay={0.08} className="md:col-span-6">
              <h2 className="section-bar">{t.contact.detailsHeading}</h2>
              <address className="mt-4 space-y-4 text-sm not-italic leading-relaxed text-hive-500">
                <p>
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
                <p className="flex flex-col gap-1">
                  {s.phone && (
                    <a
                      href={`tel:${s.phone.replace(/\s/g, "")}`}
                      className="ink-link figures-old"
                    >
                      {s.phone}
                    </a>
                  )}
                  <a
                    href={`mailto:${s.contactEmail}`}
                    className="ink-link break-words"
                  >
                    {s.contactEmail}
                  </a>
                </p>
              </address>

              {/* The map sits with the address it belongs to. */}
              {s.googleMapsEmbedUrl && (
                <figure className="mt-6">
                  <Sheet tone="deep" edge="soft">
                    <div className="p-2.5 md:p-3">
                      <iframe
                        src={s.googleMapsEmbedUrl}
                        width="100%"
                        height="240"
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
              )}

              {/* Marks, not a list of handles: one row that reads as one
                  thing, and the same marks the footer prints. */}
              {follow.length > 0 && (
                <div className="mt-8">
                  <h3 className="label">{t.contact.follow}</h3>
                  <SocialRow
                    links={follow}
                    size={19}
                    gap="gap-4"
                    className="mt-3 block text-hive-400 transition-colors duration-500 ease-settle hover:text-honey-600"
                  />
                </div>
              )}

              {/* Google is a place you read reviews, not one you follow. */}
              {review && (
                <div className="mt-7">
                  <h3 className="label">{t.contact.reviewsHeading}</h3>
                  <a
                    href={review.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ink-link mt-3 inline-flex items-center gap-2.5 text-sm"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden="true"
                      focusable="false"
                      className="shrink-0"
                    >
                      <path d={review.path} />
                    </svg>
                    {t.contact.reviewsLink}
                  </a>
                </div>
              )}
            </ScrollReveal>
          </div>
        </div>
      </section>
    </>
  );
}
