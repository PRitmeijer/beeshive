"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { CraftIcon } from "@/components/CraftIcon";
import { getDict } from "@/i18n/dictionaries";
import { defaultLocale, type Locale } from "@/i18n/config";

interface Notification {
  id: string;
  title: string;
  message: string;
  type: "info" | "offer" | "event" | "important";
  displayMode?: "banner" | "popup";
  link?: string;
  dismissible: boolean;
}

/**
 * Four inks rather than four UI colours: a solid ground with paper ink on top,
 * the same move the menu makes with its category bars. One token per scale, so
 * the four are told apart by hue (chocolate, gold, olive, terracotta) rather
 * than by four arbitrary UI colours.
 *
 * Every pairing is the paper ink #F1ECE1 and clears 4.5:1 at FULL opacity:
 *   info      #331E0C  hive-800   13.4:1
 *   offer     #6E5525  honey-600   6.0:1
 *   event     #616949  sage-600    4.9:1
 *   important #935644  clay-500    4.9:1
 *
 * The lighter three have little headroom, so no text on these grounds may
 * carry an opacity modifier: a 90% span drops event to 4.35 and fails. The
 * shallower tokens all fail outright and must not be used here, honey-500
 * is 2.9:1, sage-500 3.3:1, clay-400 3.2:1.
 */
const typeStyles: Record<
  Notification["type"],
  { ground: string; ink: string; icon: string }
> = {
  info: { ground: "#331E0C", ink: "#F1ECE1", icon: "mark" },
  offer: { ground: "#6E5525", ink: "#F1ECE1", icon: "wheat" },
  event: { ground: "#616949", ink: "#F1ECE1", icon: "heart" },
  important: { ground: "#935644", ink: "#F1ECE1", icon: "mark" },
};

const SETTLE: [number, number, number, number] = [0.16, 0.84, 0.28, 1];

/** Two strokes crossed by hand: never a glyph. */
function CrossMark({ size = 14 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M3.3 3.1 L12.8 12.9" />
      <path d="M12.9 3.2 L3.1 12.8" />
    </svg>
  );
}

export function NotificationBanner({
  locale = defaultLocale,
}: {
  locale?: Locale;
}) {
  const t = getDict(locale).notifications;
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const reduce = useReducedMotion();

  useEffect(() => {
    // The title and message are localized in Payload, so the language has to
    // travel with the request.
    fetch(`/api/active-notifications?locale=${locale}`)
      .then((res) => {
        if (!res.ok) throw new Error("fetch failed");
        return res.json();
      })
      .then((data) => {
        if (data?.docs) setNotifications(data.docs);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [locale]);

  const dismiss = useCallback((id: string) => {
    setDismissed((prev) => new Set(prev).add(id));
  }, []);

  const active = notifications.filter((n) => !dismissed.has(n.id));
  const banners = active.filter((n) => (n.displayMode || "banner") === "banner");
  const popups = active.filter((n) => (n.displayMode || "banner") === "popup");

  const currentBanner = banners[0] || null;
  const currentPopup = popups[0] || null;

  // A modal with no keyboard exit is a trap.
  useEffect(() => {
    if (!currentPopup?.dismissible) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss(currentPopup.id);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentPopup, dismiss]);

  if (!loaded) return null;

  const bannerStyle = currentBanner ? typeStyles[currentBanner.type] : null;
  const popupStyle = currentPopup ? typeStyles[currentPopup.type] : null;

  return (
    <>
      {/* ===== BANNER MODE ===== */}
      <div className="relative z-50">
        <AnimatePresence mode="wait">
          {currentBanner && bannerStyle && (
            <motion.div
              key={currentBanner.id}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.6, ease: SETTLE }}
              role="status"
              className="relative overflow-hidden text-sm"
              style={{
                backgroundColor: bannerStyle.ground,
                color: bannerStyle.ink,
              }}
            >
              <div className="px-6 md:px-12 py-2.5 pr-12 max-w-7xl mx-auto flex flex-wrap items-center gap-x-3 gap-y-1">
                <CraftIcon
                  name={bannerStyle.icon}
                  size={17}
                  weight={1.4}
                  className="shrink-0 opacity-80"
                />
                <span className="label" style={{ color: "inherit" }}>
                  {currentBanner.title}
                </span>
                <span className="opacity-70" aria-hidden="true">
                  &middot;
                </span>
                <span>{currentBanner.message}</span>
                {currentBanner.link && (
                  <a
                    href={currentBanner.link}
                    className="label underline underline-offset-4 decoration-1 transition-opacity duration-500 ease-settle hover:opacity-70"
                    style={{ color: "inherit" }}
                  >
                    {t.moreInfo}
                  </a>
                )}
                {currentBanner.dismissible && (
                  <button
                    onClick={() => dismiss(currentBanner.id)}
                    className="absolute right-4 md:right-6 top-1/2 -translate-y-1/2 p-1 opacity-80 transition-opacity duration-500 ease-settle hover:opacity-100"
                    aria-label={t.close}
                  >
                    <CrossMark />
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ===== POPUP MODE ===== */}
      <AnimatePresence>
        {currentPopup && popupStyle && (
          <motion.div
            key={`popup-overlay-${currentPopup.id}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: SETTLE }}
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-hive-900/55"
            onClick={(e) => {
              if (e.target === e.currentTarget && currentPopup.dismissible) {
                dismiss(currentPopup.id);
              }
            }}
          >
            <motion.div
              key={`popup-${currentPopup.id}`}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 14 }}
              transition={{ duration: reduce ? 0 : 0.6, ease: SETTLE }}
              role="dialog"
              aria-modal="true"
              aria-labelledby={`notification-title-${currentPopup.id}`}
              className="relative w-full max-w-md rounded-[2px] overflow-hidden shadow-lift"
            >
              {/* Header */}
              <div
                className="px-6 py-4 flex items-center gap-3"
                style={{
                  backgroundColor: popupStyle.ground,
                  color: popupStyle.ink,
                }}
              >
                <CraftIcon name={popupStyle.icon} size={22} weight={1.3} />
                <h3
                  id={`notification-title-${currentPopup.id}`}
                  className="font-display text-lg font-semibold tracking-[-0.01em]"
                >
                  {currentPopup.title}
                </h3>
                {currentPopup.dismissible && (
                  <button
                    onClick={() => dismiss(currentPopup.id)}
                    className="ml-auto p-1 opacity-80 transition-opacity duration-500 ease-settle hover:opacity-100"
                    aria-label={t.close}
                  >
                    <CrossMark size={16} />
                  </button>
                )}
              </div>

              {/* Body: the sheet, never white. */}
              <div className="bg-paper px-6 py-6">
                <div className="rule-ink w-12 mb-5" aria-hidden="true" />
                <p className="text-hive-500 leading-relaxed">
                  {currentPopup.message}
                </p>
                <div className="mt-6 flex items-center gap-5">
                  {currentPopup.link && (
                    <a
                      href={currentPopup.link}
                      className="btn-primary !px-5 !py-2.5"
                    >
                      {t.moreInfo}
                    </a>
                  )}
                  {currentPopup.dismissible && (
                    <button
                      onClick={() => dismiss(currentPopup.id)}
                      className="label text-hive-400 hover:text-hive-600 transition-colors duration-500 ease-settle"
                    >
                      {t.close}
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
