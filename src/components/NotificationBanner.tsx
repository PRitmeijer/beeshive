"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Notification {
  id: string;
  title: string;
  message: string;
  type: "info" | "offer" | "event" | "important";
  displayMode?: "banner" | "popup";
  link?: string;
  dismissible: boolean;
}

const typeStyles = {
  info: {
    banner: "bg-blue-600",
    popup: "bg-blue-600",
    accent: "text-blue-100",
    icon: "ℹ️",
  },
  offer: {
    banner: "bg-honey-500",
    popup: "bg-honey-500",
    accent: "text-honey-100",
    icon: "🏷️",
  },
  event: {
    banner: "bg-emerald-600",
    popup: "bg-emerald-600",
    accent: "text-emerald-100",
    icon: "🎉",
  },
  important: {
    banner: "bg-red-600",
    popup: "bg-red-600",
    accent: "text-red-100",
    icon: "⚠️",
  },
};

export function NotificationBanner() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/active-notifications")
      .then((res) => {
        if (!res.ok) throw new Error("fetch failed");
        return res.json();
      })
      .then((data) => {
        if (data?.docs) setNotifications(data.docs);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const dismiss = useCallback((id: string) => {
    setDismissed((prev) => new Set(prev).add(id));
  }, []);

  const active = notifications.filter((n) => !dismissed.has(n.id));
  const banners = active.filter((n) => (n.displayMode || "banner") === "banner");
  const popups = active.filter((n) => (n.displayMode || "banner") === "popup");

  const currentBanner = banners[0] || null;
  const currentPopup = popups[0] || null;

  if (!loaded) return null;

  return (
    <>
      {/* ===== BANNER MODE ===== */}
      <div className="relative z-50">
        <AnimatePresence mode="wait">
          {currentBanner && (
            <motion.div
              key={currentBanner.id}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.35, ease: "easeInOut" }}
              className={`${typeStyles[currentBanner.type].banner} text-white text-center text-sm relative overflow-hidden`}
            >
              <div className="px-6 py-2.5 max-w-7xl mx-auto flex items-center justify-center gap-3">
                <span className="font-medium">{currentBanner.title}</span>
                <span className="opacity-80">—</span>
                <span className="opacity-90">{currentBanner.message}</span>
                {currentBanner.link && (
                  <a
                    href={currentBanner.link}
                    className="underline underline-offset-2 font-medium hover:opacity-80 transition-opacity"
                  >
                    Meer info
                  </a>
                )}
                {currentBanner.dismissible && (
                  <button
                    onClick={() => dismiss(currentBanner.id)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 opacity-70 hover:opacity-100 transition-opacity"
                    aria-label="Sluiten"
                  >
                    ✕
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ===== POPUP MODE ===== */}
      <AnimatePresence>
        {currentPopup && (
          <motion.div
            key={`popup-overlay-${currentPopup.id}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
            onClick={(e) => {
              if (e.target === e.currentTarget && currentPopup.dismissible) {
                dismiss(currentPopup.id);
              }
            }}
          >
            <motion.div
              key={`popup-${currentPopup.id}`}
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="relative w-full max-w-md rounded-2xl overflow-hidden shadow-2xl"
            >
              {/* Header */}
              <div
                className={`${typeStyles[currentPopup.type].popup} px-6 py-4 flex items-center gap-3`}
              >
                <span className="text-xl" aria-hidden="true">
                  {typeStyles[currentPopup.type].icon}
                </span>
                <h3 className="text-white font-display font-bold text-lg">
                  {currentPopup.title}
                </h3>
                {currentPopup.dismissible && (
                  <button
                    onClick={() => dismiss(currentPopup.id)}
                    className="ml-auto text-white/70 hover:text-white transition-colors text-lg"
                    aria-label="Sluiten"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Body */}
              <div className="bg-white px-6 py-5">
                <p className="text-hive-600 leading-relaxed">
                  {currentPopup.message}
                </p>
                <div className="mt-5 flex items-center gap-3">
                  {currentPopup.link && (
                    <a
                      href={currentPopup.link}
                      className="btn-primary text-sm !px-5 !py-2"
                    >
                      Meer info
                    </a>
                  )}
                  {currentPopup.dismissible && (
                    <button
                      onClick={() => dismiss(currentPopup.id)}
                      className="text-sm text-hive-400 hover:text-hive-600 transition-colors font-medium"
                    >
                      Sluiten
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
