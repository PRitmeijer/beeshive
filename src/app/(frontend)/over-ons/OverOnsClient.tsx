"use client";

import { motion } from "framer-motion";
import { HexagonGrid } from "@/components/HexagonGrid";
import { ScrollReveal } from "@/components/ScrollReveal";
import type { SiteSettingsData } from "@/lib/payload";

interface Props {
  settings: SiteSettingsData;
}

export function OverOnsClient({ settings: s }: Props) {
  const values =
    (s.values as { icon: string; title: string; text: string }[]) || [];

  return (
    <>
      {/* Hero */}
      <section className="relative min-h-[60vh] flex items-center justify-center bg-hive-800 overflow-hidden">
        <HexagonGrid count={12} />
        <div className="absolute inset-0 bg-gradient-to-b from-hive-900/60 to-hive-800/80" />
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="relative z-10 text-center px-6"
        >
          <span className="text-honey-400 font-medium text-sm uppercase tracking-widest">
            Ons Verhaal
          </span>
          <h1 className="heading-xl text-honey-100 mt-3">Over Ons</h1>
        </motion.div>
      </section>

      {/* Story */}
      <section className="section-padding">
        <div className="max-w-4xl mx-auto">
          <ScrollReveal>
            <div className="prose prose-lg max-w-none">
              <div className="space-y-8 text-hive-500 leading-relaxed">
                <p className="text-xl text-hive-600 font-medium">
                  {s.aboutIntro}
                </p>

                {/* Rich text story from CMS, or fallback paragraphs */}
                {s.aboutStory ? (
                  <div
                    dangerouslySetInnerHTML={{
                      __html:
                        typeof s.aboutStory === "string"
                          ? s.aboutStory
                          : "",
                    }}
                  />
                ) : (
                  <>
                    <p>
                      Ons verhaal begon in Zuid-Afrika, waar wij onze liefde
                      voor alle vormen van kunst en creativiteit in het
                      dagelijks leven ontdekten. Na jarenlange ervaring en
                      inspiratie op te doen, keerden wij terug naar onze
                      Nederlandse roots met een droom: een warm eetcafé creëren
                      waar het &lsquo;kunst van het leven&rsquo; kan floreren.
                    </p>

                    <p>
                      Bij {s.siteName} geloven wij dat eten bereiden een
                      kunstvorm is. Elk gerecht wordt met zorg en creativiteit
                      bereid, met lokale ingrediënten en seizoensgebonden
                      producten. Onze kaart weerspiegelt onze reis — van
                      Zuid-Afrikaanse smaken tot Nederlandse klassiekers, altijd
                      met een creatieve twist.
                    </p>

                    <p>
                      Maar {s.siteName} is meer dan alleen eten. Het is een
                      gemeenschap. Een plek waar buren vrienden worden, waar
                      kunstenaars hun werk delen, en waar iedereen welkom is om
                      hun creatieve zelf te zijn.
                    </p>
                  </>
                )}

                <div className="my-12 p-8 rounded-3xl bg-honey-50 border border-honey-200/50">
                  <blockquote className="text-center">
                    <p className="font-display text-2xl text-hive-700 italic">
                      &ldquo;{s.aboutQuote}&rdquo;
                    </p>
                  </blockquote>
                </div>
              </div>
            </div>
          </ScrollReveal>

          {/* Values */}
          {values.length > 0 && (
            <div className="grid md:grid-cols-3 gap-8 mt-20">
              {values.map((v, i) => (
                <ScrollReveal key={v.title} delay={i * 0.15}>
                  <article className="text-center p-6">
                    <div className="text-4xl mb-4" aria-hidden="true">
                      {v.icon}
                    </div>
                    <h3 className="heading-md text-hive-700 mb-3">
                      {v.title}
                    </h3>
                    <p className="text-hive-400 leading-relaxed">{v.text}</p>
                  </article>
                </ScrollReveal>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
