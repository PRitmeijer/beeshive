"use client";

import { useState, type FormEvent } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { CraftIcon } from "@/components/CraftIcon";
import { getDict } from "@/i18n/dictionaries";
import { defaultLocale, type Locale } from "@/i18n/config";
import { EVENTS, track } from "@/lib/umami";

/**
 * The mailing list sign-up.
 *
 * The one thing standing between a visitor and the address field is the fear
 * of what happens to the address afterwards, so the form says so itself rather
 * than leaving it to whichever page happens to be hosting it. The sentence is
 * CMS content — the owners can promise whatever they can keep — but the form
 * carries a dictionary line of its own as well, because a component that is
 * dropped somewhere without settings to hand must not go quiet on exactly the
 * point the reader is weighing up.
 */

/** Letterpress field: no box, just a rule the ink sits on. Paper ground. */
const fieldClass =
  "mt-2 block w-full rounded-none border-0 border-b border-hive-700/25 bg-transparent " +
  "px-0 py-3 font-body text-hive-700 placeholder:text-hive-300/70 outline-none " +
  "transition-colors duration-300 ease-settle " +
  "focus:border-honey-400 focus:shadow-[inset_0_-2px_0_0_#B4735E]";

export function MailingListForm({
  locale = defaultLocale,
  privacyNote,
}: {
  locale?: Locale;
  /**
   * Site Instellingen -> Homepage -> `newsletterPrivacyNote`, already resolved
   * for this locale by the page that renders the form. Left out, the
   * dictionary's own wording stands in.
   */
  privacyNote?: string;
}) {
  const t = getDict(locale).newsletter;
  const note = privacyNote?.trim() || t.privacyNote;
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const reduce = useReducedMotion();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name }),
      });
      if (res.ok) {
        track(EVENTS.newsletterSubscribed);
        setStatus("success");
        setEmail("");
        setName("");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  };

  if (status === "success") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduce ? 0 : 0.8, ease: [0.16, 0.84, 0.28, 1] }}
        role="status"
        className="max-w-md mx-auto py-6 text-left"
      >
        <CraftIcon
          name="bee"
          size={44}
          weight={1}
          className="text-sage-500"
        />
        <div className="rule-ink w-14 mt-5" aria-hidden="true" />
        <p className="font-display text-xl text-hive-700 mt-5">
          {t.successTitle}
        </p>
        <p className="text-hive-400 mt-2 text-sm">{t.successText}</p>
      </motion.div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-8 max-w-md mx-auto text-left"
    >
      <div>
        <label htmlFor="newsletter-name" className="label block">
          {t.name}
        </label>
        <input
          id="newsletter-name"
          type="text"
          placeholder={t.name}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={fieldClass}
        />
      </div>
      <div>
        <label htmlFor="newsletter-email" className="label block">
          {t.email}
        </label>
        <input
          id="newsletter-email"
          type="email"
          required
          placeholder={t.email}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-describedby="newsletter-privacy"
          className={fieldClass}
        />
        <p
          id="newsletter-privacy"
          className="mt-3 text-sm leading-snug text-hive-400"
        >
          {note}
        </p>
      </div>
      <button
        type="submit"
        disabled={status === "loading"}
        className="btn-primary w-full disabled:opacity-50"
      >
        {status === "loading" ? t.submitting : t.submit}
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
          {t.error}
        </p>
      )}
    </form>
  );
}
