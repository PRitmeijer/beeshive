"use client";

import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";

export function MailingListForm() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");

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
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center py-8"
      >
        <div className="text-4xl mb-3">🐝</div>
        <p className="font-display text-xl text-honey-600 font-bold">
          Bedankt voor je aanmelding!
        </p>
        <p className="text-hive-400 mt-1 text-sm">
          Je hoort snel van ons.
        </p>
      </motion.div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md mx-auto">
      <input
        type="text"
        placeholder="Je naam"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full px-4 py-3 rounded-xl border border-honey-200 bg-white/80
                   focus:border-honey-400 focus:ring-2 focus:ring-honey-400/20 outline-none transition-all"
      />
      <input
        type="email"
        required
        placeholder="Je e-mailadres"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full px-4 py-3 rounded-xl border border-honey-200 bg-white/80
                   focus:border-honey-400 focus:ring-2 focus:ring-honey-400/20 outline-none transition-all"
      />
      <button
        type="submit"
        disabled={status === "loading"}
        className="btn-primary w-full disabled:opacity-50"
      >
        {status === "loading" ? "Bezig..." : "Aanmelden"}
      </button>
      {status === "error" && (
        <p className="text-red-500 text-sm text-center">
          Er ging iets mis. Probeer het opnieuw.
        </p>
      )}
    </form>
  );
}
