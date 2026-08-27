"use client";

import { CraftIcon } from "@/components/CraftIcon";
import { ShareActions } from "@/components/ShareActions";
import { getDict } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import { EVENTS, track } from "@/lib/umami";

/**
 * The end of the booking, moved out of the form it used to live in and changed
 * in not one respect.
 *
 * It is the best-designed part of the whole flow and the owners did not
 * complain about it, so the redesign leaves it exactly where it stood: the bee
 * mark, a rule, the two sentences, the calendar link first and the guest pass
 * second, and "nog een tafel" underneath. Everything above it on the way in has
 * been rebuilt; this has been carried across.
 */
export function Confirmation({
  locale,
  passUrl,
  onAgain,
}: {
  locale: Locale;
  /**
   * The link to the table's own page, as /api/reserve hands it back. Null
   * whenever the owners have the guest pass switched off in the CMS, and the
   * screen then looks exactly as it did before any of it existed — a switch
   * that only half works would be worse than no switch.
   */
  passUrl: string | null;
  onAgain: () => void;
}) {
  const t = getDict(locale).reservationForm;

  /**
   * The token out of the guest pass URL: the only key the calendar endpoint
   * reads a booking by. Derived rather than held, so there is exactly one place
   * the secret lives and exactly one place to clear it.
   */
  const passToken = passUrl ? (passUrl.split("/").pop() ?? "") : "";

  return (
    // Plays once, when the confirmation replaces the form, and never again —
    // so it is a keyframe rather than an animated element, and .hero-rise is
    // that keyframe already. Its travel and duration are custom properties, so
    // these are the same numbers as before.
    <div
      role="status"
      className="hero-rise py-2 [--rise-delay:0s] [--rise-duration:0.8s] [--rise-travel:12px]"
    >
      <CraftIcon name="bee" size={48} weight={1} className="text-sage-500" />
      <div className="rule-ink mt-6 w-16" aria-hidden="true" />
      <p className="mt-6 font-display text-2xl text-hive-700">
        {t.successTitle}
      </p>
      <p className="mt-3 max-w-prose leading-relaxed text-hive-500">
        {t.successText}
      </p>
      {/* The link to the party's own page, and the two ways it travels. This is
          the whole point of the guest pass reaching anybody: the person reading
          this screen is the only one who knows who else is coming, and until it
          was printed here they were the one person never given the address —
          the owners have it in their notification mail, and there is no mail to
          the guest at all yet.

          The link opens in its own tab on purpose. Tapping it is how somebody
          checks what they are about to forward, and this screen is React state
          on a page that has no route of its own: navigating away from it and
          pressing back returns an empty form, with the copy button and the
          address gone with it. */}
      {passUrl ? (
        <div className="mt-8">
          {/* The calendar before the share block, and deliberately so. Most
              people who have just booked want the evening off their mind and
              into their phone; passing the link on is the second thought, and
              for plenty of tables it never comes at all. A plain link to a
              plain URL answering with text/calendar is also the only shape
              every phone agrees to hand to the calendar app — see the note in
              src/app/api/guest-pass/route.ts. */}
          {passToken ? (
            <div className="mb-10">
              <div className="rule-ink w-10" aria-hidden="true" />
              <p className="mt-4 max-w-prose leading-relaxed text-hive-500">
                {t.calendarText}
              </p>
              <a
                href={`/api/guest-pass?ics=1&token=${encodeURIComponent(passToken)}&locale=${locale}`}
                onClick={() =>
                  track(EVENTS.outboundClicked, {
                    kind: "calendar",
                    target: "ics",
                    surface: "confirmation",
                  })
                }
                className="ink-link mt-4 inline-block"
              >
                {t.addToCalendar}
              </a>
            </div>
          ) : null}
          <div className="rule-ink w-10" aria-hidden="true" />
          <p className="mt-4 max-w-prose leading-relaxed text-hive-500">
            {t.shareText}
          </p>
          <a
            href={passUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ink-link mt-4 break-all text-sm"
          >
            {passUrl}
          </a>
          <ShareActions
            url={passUrl}
            context="confirmation"
            message={t.whatsAppMessage(passUrl)}
            copyLabel={t.copyLink}
            copiedLabel={t.copied}
            whatsAppLabel={t.shareWhatsApp}
            className="mt-5"
          />
        </div>
      ) : null}
      <button type="button" onClick={onAgain} className="ink-link mt-6 text-sm">
        {t.successAgain}
      </button>
    </div>
  );
}
