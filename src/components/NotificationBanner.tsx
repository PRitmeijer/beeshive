"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Notification {
  id: string;
  title: string;
  message: string;
  type: "info" | "offer" | "event" | "important";
  link?: string;
  dismissible: boolean;
}

const typeStyles = {
  info: "bg-blue-600",
  offer: "bg-honey-500",
  event: "bg-emerald-600",
  important: "bg-red-600",
};

export function NotificationBanner() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/notifications")
      .then((res) => res.json())
      .then((data) => {
        if (data?.docs) setNotifications(data.docs);
      })
      .catch(() => {});
  }, []);

  const activeNotifications = notifications.filter(
    (n) => !dismissed.has(n.id)
  );

  if (activeNotifications.length === 0) return null;

  const current = activeNotifications[0];

  return (
    <AnimatePresence>
      <motion.div
        key={current.id}
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: "auto", opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        className={`${typeStyles[current.type]} text-white text-center text-sm relative`}
      >
        <div className="px-6 py-2.5 max-w-7xl mx-auto flex items-center justify-center gap-3">
          <span className="font-medium">{current.title}</span>
          <span className="opacity-80">—</span>
          <span className="opacity-90">{current.message}</span>
          {current.link && (
            <a
              href={current.link}
              className="underline underline-offset-2 font-medium hover:opacity-80"
            >
              Meer info
            </a>
          )}
          {current.dismissible && (
            <button
              onClick={() =>
                setDismissed((prev) => new Set(prev).add(current.id))
              }
              className="absolute right-4 top-1/2 -translate-y-1/2 opacity-70 hover:opacity-100"
              aria-label="Sluiten"
            >
              ✕
            </button>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
