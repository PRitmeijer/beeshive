"use client";

import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { HexagonGrid } from "@/components/HexagonGrid";
import { ScrollReveal } from "@/components/ScrollReveal";

export default function ContactPage() {
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [status, setStatus] = useState<"idle" | "sent">("idle");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    // In production, integrate with email service
    const mailto = `mailto:info@debeeshive.nl?subject=Bericht van ${form.name}&body=${encodeURIComponent(form.message)}%0A%0AVan: ${form.name} (${form.email})`;
    window.location.href = mailto;
    setStatus("sent");
  };

  return (
    <>
      <section className="relative min-h-[50vh] flex items-center justify-center bg-hive-800 overflow-hidden">
        <HexagonGrid count={10} />
        <div className="absolute inset-0 bg-gradient-to-b from-hive-900/60 to-hive-800/80" />
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10 text-center px-6"
        >
          <span className="text-honey-400 font-medium text-sm uppercase tracking-widest">
            Neem contact op
          </span>
          <h1 className="heading-xl text-honey-100 mt-3">Contact</h1>
        </motion.div>
      </section>

      <section className="section-padding">
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-16">
          {/* Contact Info */}
          <ScrollReveal>
            <div>
              <h2 className="heading-md text-hive-700 mb-6">
                Kom langs of stuur een bericht
              </h2>
              <div className="space-y-6 text-hive-500">
                <div>
                  <h3 className="font-semibold text-hive-700 mb-1">Adres</h3>
                  <p>Zuilen, Utrecht<br />Nederland</p>
                </div>
                <div>
                  <h3 className="font-semibold text-hive-700 mb-1">E-mail</h3>
                  <a
                    href="mailto:info@debeeshive.nl"
                    className="text-honey-600 hover:text-honey-700 transition-colors"
                  >
                    info@debeeshive.nl
                  </a>
                </div>
                <div>
                  <h3 className="font-semibold text-hive-700 mb-1">Volg ons</h3>
                  <a
                    href="https://instagram.com/debeeshive"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-honey-600 hover:text-honey-700 transition-colors"
                  >
                    @debeeshive
                  </a>
                </div>
                <div>
                  <h3 className="font-semibold text-hive-700 mb-1">
                    Openingstijden
                  </h3>
                  <ul className="space-y-1 text-sm">
                    <li>Woensdag – Zondag: 12:00 – 22:00</li>
                    <li>Maandag – Dinsdag: Gesloten</li>
                  </ul>
                </div>
              </div>
            </div>
          </ScrollReveal>

          {/* Contact Form */}
          <ScrollReveal delay={0.15}>
            {status === "sent" ? (
              <div className="text-center py-12">
                <span className="text-4xl">🐝</span>
                <p className="font-display text-xl text-honey-600 font-bold mt-4">
                  Bedankt voor je bericht!
                </p>
                <p className="text-hive-400 mt-2">
                  We nemen zo snel mogelijk contact met je op.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-hive-600 mb-1.5">
                    Naam
                  </label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) =>
                      setForm({ ...form, name: e.target.value })
                    }
                    className="w-full px-4 py-3 rounded-xl border border-honey-200 bg-white/80
                               focus:border-honey-400 focus:ring-2 focus:ring-honey-400/20 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-hive-600 mb-1.5">
                    E-mail
                  </label>
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) =>
                      setForm({ ...form, email: e.target.value })
                    }
                    className="w-full px-4 py-3 rounded-xl border border-honey-200 bg-white/80
                               focus:border-honey-400 focus:ring-2 focus:ring-honey-400/20 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-hive-600 mb-1.5">
                    Bericht
                  </label>
                  <textarea
                    required
                    rows={5}
                    value={form.message}
                    onChange={(e) =>
                      setForm({ ...form, message: e.target.value })
                    }
                    className="w-full px-4 py-3 rounded-xl border border-honey-200 bg-white/80
                               focus:border-honey-400 focus:ring-2 focus:ring-honey-400/20 outline-none transition-all resize-none"
                  />
                </div>
                <button type="submit" className="btn-primary w-full">
                  Verstuur bericht
                </button>
              </form>
            )}
          </ScrollReveal>
        </div>
      </section>
    </>
  );
}
