"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import Link from "next/link";
import { HexagonGrid } from "@/components/HexagonGrid";
import { ScrollReveal } from "@/components/ScrollReveal";
import { MailingListForm } from "@/components/MailingListForm";

export default function HomePage() {
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const heroY = useTransform(scrollYProgress, [0, 1], [0, 200]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);
  const heroScale = useTransform(scrollYProgress, [0, 1], [1, 1.1]);

  return (
    <>
      {/* ===== HERO ===== */}
      <section
        ref={heroRef}
        className="relative min-h-screen flex items-center justify-center overflow-hidden bg-hive-800"
      >
        {/* Background pattern */}
        <motion.div
          style={{ y: heroY, scale: heroScale }}
          className="absolute inset-0 hex-pattern opacity-30"
        />

        {/* Animated honey gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-hive-900/80 via-hive-800/50 to-honey-900/60" />

        {/* Floating hexagons */}
        <HexagonGrid count={18} />

        {/* Animated honey drip lines */}
        <div className="absolute top-0 left-0 right-0 h-32 flex justify-around">
          {[...Array(5)].map((_, i) => (
            <motion.div
              key={i}
              className="w-0.5 bg-gradient-to-b from-honey-400/60 to-transparent"
              initial={{ height: 0 }}
              animate={{ height: [0, 80, 120, 80, 0] }}
              transition={{
                duration: 4,
                delay: i * 0.8,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          ))}
        </div>

        <motion.div
          style={{ opacity: heroOpacity }}
          className="relative z-10 text-center px-6 max-w-4xl"
        >
          {/* Bee icon */}
          <motion.div
            initial={{ opacity: 0, y: -30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1 }}
            className="mb-8"
          >
            <span className="text-6xl">🐝</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="heading-xl text-honey-100 mb-6"
          >
            De Bee&apos;s{" "}
            <span className="text-honey-400 italic">Hive</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.5 }}
            className="text-xl md:text-2xl text-honey-200/80 font-light max-w-2xl mx-auto mb-10 leading-relaxed"
          >
            Waar eten en creativiteit samenkomen. Een warm eetcafé in het
            hart van Zuilen.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.7 }}
            className="flex flex-col sm:flex-row gap-4 justify-center"
          >
            <Link href="/kaart" className="btn-primary text-lg">
              Bekijk de Kaart
            </Link>
            <Link
              href="/over-ons"
              className="btn-secondary !border-honey-400/50 !text-honey-300 hover:!text-hive-800 text-lg"
            >
              Ons Verhaal
            </Link>
          </motion.div>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
        >
          <motion.div
            animate={{ y: [0, 10, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="w-6 h-10 rounded-full border-2 border-honey-400/40 flex items-start justify-center p-1.5"
          >
            <motion.div className="w-1.5 h-1.5 rounded-full bg-honey-400" />
          </motion.div>
        </motion.div>
      </section>

      {/* ===== INTRODUCTION ===== */}
      <section className="section-padding relative overflow-hidden">
        <HexagonGrid count={8} />
        <div className="max-w-6xl mx-auto relative">
          <ScrollReveal>
            <div className="text-center max-w-3xl mx-auto">
              <span className="text-honey-500 font-medium text-sm uppercase tracking-widest">
                Welkom
              </span>
              <h2 className="heading-lg text-hive-800 mt-3 mb-6">
                De kunst van het leven
              </h2>
              <p className="text-lg text-hive-400 leading-relaxed">
                De Bee&apos;s Hive ontstond uit een liefde voor alle vormen van
                kunst en creativiteit in het dagelijks leven. Begonnen in
                Zuid-Afrika, keerden wij terug naar onze Nederlandse roots om
                een plek te creëren waar het &lsquo;kunst van het leven&rsquo;
                kan floreren.
              </p>
            </div>
          </ScrollReveal>

          <div className="grid md:grid-cols-3 gap-8 mt-16">
            {[
              {
                icon: "🍳",
                title: "Creatieve Keuken",
                text: "Gerechten bereid met passie, lokale ingrediënten en een vleugje creativiteit.",
              },
              {
                icon: "🎨",
                title: "Kunst & Cultuur",
                text: "Een plek waar creativiteit, verbinding en schoonheid in elke hoek zichtbaar is.",
              },
              {
                icon: "🤝",
                title: "Verbinding",
                text: "Meer dan een restaurant — een gemeenschap waar iedereen welkom is.",
              },
            ].map((item, i) => (
              <ScrollReveal key={item.title} delay={i * 0.15}>
                <motion.div
                  whileHover={{ y: -8, scale: 1.02 }}
                  transition={{ type: "spring", stiffness: 300 }}
                  className="glass rounded-2xl p-8 text-center group cursor-default"
                >
                  <div className="text-4xl mb-4">{item.icon}</div>
                  <h3 className="heading-md text-hive-700 mb-3 group-hover:text-honey-600 transition-colors">
                    {item.title}
                  </h3>
                  <p className="text-hive-400 leading-relaxed">{item.text}</p>
                </motion.div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===== PARALLAX DIVIDER ===== */}
      <section className="relative h-[50vh] overflow-hidden">
        <motion.div
          className="absolute inset-0 bg-hive-700"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Cpath d='M40 0L80 20V60L40 80L0 60V20Z' fill='none' stroke='%23D4A017' stroke-opacity='0.08'/%3E%3C/svg%3E")`,
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-hive-800/90 via-hive-700/80 to-hive-800/90" />
        <div className="relative z-10 h-full flex items-center justify-center text-center px-6">
          <ScrollReveal>
            <blockquote className="max-w-2xl">
              <p className="font-display text-2xl md:text-4xl text-honey-200 italic leading-relaxed">
                &ldquo;Eten is kunst, en iedereen is welkom om hun creatieve
                zelf te zijn&rdquo;
              </p>
              <cite className="block mt-6 text-honey-400/70 not-italic text-sm uppercase tracking-widest">
                — De Bee&apos;s Hive
              </cite>
            </blockquote>
          </ScrollReveal>
        </div>
      </section>

      {/* ===== FEATURED SECTION ===== */}
      <section className="section-padding bg-honey-50/50 relative overflow-hidden">
        <HexagonGrid count={6} />
        <div className="max-w-6xl mx-auto relative">
          <ScrollReveal>
            <div className="text-center mb-16">
              <span className="text-honey-500 font-medium text-sm uppercase tracking-widest">
                Ontdek
              </span>
              <h2 className="heading-lg text-hive-800 mt-3">
                Wat bieden wij
              </h2>
            </div>
          </ScrollReveal>

          <div className="grid md:grid-cols-2 gap-8">
            {[
              {
                title: "Onze Kaart",
                desc: "Van verrassende voorgerechten tot huisgemaakte desserts — ontdek onze seizoensgebonden kaart.",
                link: "/kaart",
                label: "Bekijk de kaart",
                accent: "from-honey-400 to-honey-600",
              },
              {
                title: "Evenementen",
                desc: "Creatieve workshops, live muziek en thema-avonden. Er is altijd iets te beleven.",
                link: "/blog",
                label: "Lees meer",
                accent: "from-honey-500 to-hive-300",
              },
            ].map((card, i) => (
              <ScrollReveal key={card.title} delay={i * 0.15}>
                <motion.div
                  whileHover={{ y: -5 }}
                  className="rounded-3xl overflow-hidden bg-white shadow-xl shadow-honey-900/5 group"
                >
                  <div
                    className={`h-48 bg-gradient-to-br ${card.accent} flex items-center justify-center`}
                  >
                    <div className="clip-hexagon w-20 h-24 bg-white/20" />
                  </div>
                  <div className="p-8">
                    <h3 className="heading-md text-hive-700 mb-3">
                      {card.title}
                    </h3>
                    <p className="text-hive-400 mb-6 leading-relaxed">
                      {card.desc}
                    </p>
                    <Link
                      href={card.link}
                      className="text-honey-600 font-semibold hover:text-honey-700 transition-colors inline-flex items-center gap-2 group/link"
                    >
                      {card.label}
                      <span className="transition-transform group-hover/link:translate-x-1">
                        →
                      </span>
                    </Link>
                  </div>
                </motion.div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===== MAILING LIST ===== */}
      <section className="section-padding bg-hive-800 relative overflow-hidden">
        <HexagonGrid count={10} />
        <div className="max-w-2xl mx-auto text-center relative z-10">
          <ScrollReveal>
            <span className="text-honey-400 font-medium text-sm uppercase tracking-widest">
              Blijf op de hoogte
            </span>
            <h2 className="heading-lg text-honey-100 mt-3 mb-4">
              Schrijf je in
            </h2>
            <p className="text-honey-200/60 mb-10 leading-relaxed">
              Ontvang als eerste nieuws over speciale evenementen, nieuwe
              gerechten en aanbiedingen.
            </p>
          </ScrollReveal>
          <ScrollReveal delay={0.2}>
            <MailingListForm />
          </ScrollReveal>
        </div>
      </section>
    </>
  );
}
