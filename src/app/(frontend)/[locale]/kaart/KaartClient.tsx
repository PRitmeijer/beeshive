"use client";

import { useEffect, useState } from "react";
import { m, AnimatePresence, useReducedMotion } from "@/components/motion";
import { ScrollReveal } from "@/components/ScrollReveal";
import { TornEdge } from "@/components/TornEdge";
import { Sheet } from "@/components/Sheet";
import { SketchBee } from "@/components/SketchBee";
import { CraftIcon, type CraftIconName } from "@/components/CraftIcon";
import { getDict, type Dict } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import { EVENTS, track } from "@/lib/umami";

interface MenuItem {
  id: string;
  name: string;
  description?: string;
  price: number;
  category: any;
  dietary?: string[];
  featured?: boolean;
}

interface Category {
  id: string;
  name: string;
  description?: string;
}

const EASE: [number, number, number, number] = [0.16, 0.84, 0.28, 1];

// The mark is drawn here, the wording comes from the dictionary: an icon reads
// the same in both languages, a label does not, and neither may be an emoji.
const dietaryIcons: Record<string, CraftIconName> = {
  vegetarian: "sprig",
  vegan: "sprig",
  "gluten-free": "wheat",
  "dairy-free": "milk",
};

/** Falls back to the raw CMS value for a diet the dictionary does not name. */
function dietaryLabel(t: Dict, key: string): string {
  return (t.dietary as Record<string, string>)[key] || key;
}

/**
 * The sample card, shown until the CMS holds one of its own. Names and notes
 * come from the dictionary so the English page never falls back to Dutch dummy
 * copy; prices and grouping stay here, being the same card in either language.
 */
function sampleCard(t: Dict): { categories: Category[]; items: MenuItem[] } {
  const c = t.menuPage.sampleCategories;
  const i = t.menuPage.sampleItems;
  return {
    categories: [
      { id: "1", ...c.starters },
      { id: "2", ...c.mains },
      { id: "3", ...c.desserts },
      { id: "4", ...c.drinks },
    ],
    items: [
      { id: "1", ...i.soup, price: 8.5, category: { id: "1" }, dietary: ["vegetarian"], featured: true },
      { id: "2", ...i.bruschetta, price: 9.5, category: { id: "1" }, dietary: ["vegan"] },
      { id: "3", ...i.salad, price: 10, category: { id: "1" }, dietary: ["vegetarian"] },
      { id: "4", ...i.beef, price: 22.5, category: { id: "2" }, featured: true },
      { id: "5", ...i.bobotie, price: 19.5, category: { id: "2" } },
      { id: "6", ...i.risotto, price: 18.5, category: { id: "2" }, dietary: ["vegetarian"] },
      { id: "7", ...i.honeycake, price: 8, category: { id: "3" }, dietary: ["vegetarian"], featured: true },
      { id: "8", ...i.malva, price: 9, category: { id: "3" } },
      { id: "9", ...i.lemonade, price: 5, category: { id: "4" }, dietary: ["vegan"] },
      { id: "10", ...i.cappuccino, price: 3.5, category: { id: "4" } },
    ],
  };
}

const catIdOf = (item: MenuItem) =>
  typeof item.category === "object" ? item.category?.id : item.category;

/**
 * One printed menu line. Name and note occupy the measure, the price sits in
 * its own right-hand column, and nothing leads the eye across with dots:
 * the printed card doesn't use them.
 */
function MenuLine({ item, t }: { item: MenuItem; t: Dict }) {
  return (
    <li className="menu-row">
      <div>
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h3 className="menu-name">{item.name}</h3>
          {item.featured && (
            <span className="label shrink-0 self-center rounded-[2px] border border-honey-400/60 px-1.5 py-[0.15rem] text-[0.5625rem] leading-none text-honey-600">
              {t.menuPage.featured}
            </span>
          )}
        </div>

        {item.description && (
          <p className="menu-desc max-w-[54ch]">{item.description}</p>
        )}

        {item.dietary && item.dietary.length > 0 && (
          <ul className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-2">
            {item.dietary.map((d) => (
              <li key={d} className="flex items-center gap-1.5 text-sage-500">
                <CraftIcon name={dietaryIcons[d] || "mark"} size={15} weight={1.4} />
                <span className="label text-[0.625rem] text-sage-500">
                  {dietaryLabel(t, d)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <span className="menu-price figures-old">
        {t.menuPage.price(item.price)}
      </span>
    </li>
  );
}

export function KaartClient({
  locale,
  categories: cmsCategories,
  items: cmsItems,
}: {
  /** The dictionary is looked up here rather than passed: it holds functions. */
  locale: Locale;
  categories: Category[];
  items: MenuItem[];
}) {
  const t = getDict(locale);
  // "Somebody read the card." Fired once on mount rather than on a scroll
  // depth: the whole menu is one page, and arriving on it is the interesting
  // fact. `track()` swallows everything, so the effect cannot fail.
  useEffect(() => {
    track(EVENTS.menuViewed);
  }, []);
  const reduce = useReducedMotion();
  const sample = sampleCard(t);
  const categories = cmsCategories.length > 0 ? cmsCategories : sample.categories;
  const items = cmsItems.length > 0 ? cmsItems : sample.items;

  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const filtered = activeCategory
    ? items.filter((item) => {
        const catId = typeof item.category === "object" ? item.category?.id : item.category;
        return catId === activeCategory;
      })
    : items;

  // Unfiltered, the flat list is set back into its printed sections; with a
  // category selected only that section survives the filter above.
  const groups = categories
    .map((cat) => ({
      cat,
      lines: filtered.filter((item) => catIdOf(item) === cat.id),
    }))
    .filter((g) => g.lines.length > 0);

  const knownIds = new Set(categories.map((c) => c.id));
  const ungrouped = filtered.filter((item) => !knownIds.has(catIdOf(item)));

  return (
    <>
      {/* ===== HERO ===== */}
      <section className="relative flex min-h-[38vh] items-end overflow-hidden bg-paper">
        <div className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-12 pt-32 md:px-12 md:pb-16 lg:px-20">
          <p className="label">{t.menuPage.eyebrow}</p>
          <div className="rule-ink my-5 w-14" aria-hidden="true" />
          <h1 className="heading-xl text-hive-800">{t.menuPage.title}</h1>
          <p className="mt-6 max-w-xl text-lg text-hive-400">
            {t.menuPage.subtitle}
          </p>
        </div>

        <TornEdge
          color="#E8E2D4"
          lip="rgba(255,255,255,0.5)"
          variant={0}
          className="absolute inset-x-0 bottom-0 z-20"
        />
      </section>

      {/* ===== THE CARD ===== */}
      <section className="section-padding relative overflow-hidden bg-paper-deep">
        <div className="relative mx-auto max-w-6xl">
          {/* Category rank: letterpressed, ranged left, with the rule hanging
              out on its own in the right margin. */}
          <ScrollReveal>
            <div className="grid gap-y-8 md:grid-cols-12 md:items-end md:gap-x-10">
              <div className="flex flex-wrap items-start gap-x-8 gap-y-5 md:col-span-8">
                <button
                  type="button"
                  onClick={() => setActiveCategory(null)}
                  aria-pressed={activeCategory === null}
                  className="group text-left"
                >
                  <span
                    className={`label block transition-colors duration-500 ease-settle ${
                      activeCategory === null
                        ? "text-honey-600"
                        : "text-hive-400 group-hover:text-honey-600"
                    }`}
                  >
                    {t.menuPage.all}
                  </span>
                  <span
                    aria-hidden="true"
                    className={`rule-ink mt-2 block w-full transition-opacity duration-500 ease-settle ${
                      activeCategory === null ? "opacity-100" : "opacity-0"
                    }`}
                  />
                </button>

                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setActiveCategory(cat.id)}
                    aria-pressed={activeCategory === cat.id}
                    className="group text-left"
                  >
                    <span
                      className={`label block transition-colors duration-500 ease-settle ${
                        activeCategory === cat.id
                          ? "text-honey-600"
                          : "text-hive-400 group-hover:text-honey-600"
                      }`}
                    >
                      {cat.name}
                    </span>
                    <span
                      aria-hidden="true"
                      className={`rule-ink mt-2 block w-full transition-opacity duration-500 ease-settle ${
                        activeCategory === cat.id ? "opacity-100" : "opacity-0"
                      }`}
                    />
                  </button>
                ))}
              </div>

              <div
                className="hidden md:col-span-3 md:col-start-10 md:block"
                aria-hidden="true"
              >
                <div className="rule-ink ml-auto w-16" />
              </div>
            </div>
          </ScrollReveal>

          <AnimatePresence mode="wait">
            <m.div
              key={activeCategory || "all"}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={reduce ? { duration: 0 } : { duration: 0.7, ease: EASE }}
              className="mt-16 md:mt-24"
            >
              <div className="grid md:grid-cols-12 md:gap-x-10">
                {/* The marginal bee, as it is drawn in the gutter of the card. */}
                <div className="hidden md:col-span-2 md:block" aria-hidden="true">
                  <SketchBee
                    size={38}
                    variant={0}
                    strokeWidth={1.05}
                    className="text-sage-400"
                  />
                  <div className="rule-ink mt-6 w-10" />
                </div>

                {/* The card itself: a cut sheet laid on the heavier stock. */}
                <div className="md:col-span-10 md:col-start-3">
                  <Sheet tone="paper" edge="soft">
                    <div className="px-6 py-12 md:px-12 md:py-16">
                      <div className="space-y-14 md:space-y-20">
                        {groups.map(({ cat, lines }) => (
                          <section key={cat.id} aria-labelledby={`categorie-${cat.id}`}>
                            <h2 id={`categorie-${cat.id}`} className="section-bar">
                              <span>{cat.name}</span>
                            </h2>

                            {cat.description && (
                              <p className="mt-4 font-display text-[0.8rem] font-light italic leading-relaxed text-hive-300">
                                {cat.description}
                              </p>
                            )}

                            <ul className="mt-8 space-y-7 md:space-y-8">
                              {lines.map((item) => (
                                <MenuLine key={item.id} item={item} t={t} />
                              ))}
                            </ul>
                          </section>
                        ))}

                        {ungrouped.length > 0 && (
                          <div>
                            <div className="rule-ink w-full" aria-hidden="true" />
                            <ul className="mt-8 space-y-7 md:space-y-8">
                              {ungrouped.map((item) => (
                                <MenuLine key={item.id} item={item} t={t} />
                              ))}
                            </ul>
                          </div>
                        )}

                        {filtered.length === 0 && (
                          <p className="font-display text-lg italic text-hive-300">
                            {t.menuPage.empty}
                          </p>
                        )}
                      </div>
                    </div>
                  </Sheet>
                </div>
              </div>
            </m.div>
          </AnimatePresence>
        </div>
      </section>
    </>
  );
}
