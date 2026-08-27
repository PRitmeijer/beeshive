"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { ScrollReveal } from "@/components/ScrollReveal";
import { TornEdge } from "@/components/TornEdge";
import { Sheet } from "@/components/Sheet";
import { SketchBee } from "@/components/SketchBee";
import { CraftIcon, type CraftIconName } from "@/components/CraftIcon";
import { getDict, type Dict } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import { EVENTS, track } from "@/lib/umami";

/** Postgres hands out numbers; the sample card below is written with strings. */
type CardId = string | number;

export interface MenuItem {
  id: CardId;
  name: string;
  description?: string | null;
  price: number;
  /**
   * The record when something populated it, the bare row id when nothing did.
   * The page asks the CMS for depth 0, so from the CMS it is always the id;
   * the sample card writes it out longhand. `catIdOf` reads either.
   */
  category?: CardId | { id: CardId } | null;
  dietary?: string[] | null;
  featured?: boolean | null;
}

export interface Category {
  id: CardId;
  name: string;
  description?: string | null;
}

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

/** Stands in for the sample card on a site whose CMS has a card of its own. */
const NO_SAMPLE: { categories: Category[]; items: MenuItem[] } = {
  categories: [],
  items: [],
};

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

const catIdOf = (item: MenuItem): CardId | undefined =>
  typeof item.category === "object" ? item.category?.id : item.category;

/**
 * One printed menu line. Name and note occupy the measure, the price sits in
 * its own right-hand column, and nothing leads the eye across with dots:
 * the printed card doesn't use them.
 *
 * Memoised because the card no longer gets thrown away when the rank changes,
 * and this is what makes that worth anything: sixty dishes stay exactly as
 * they were rendered while React works out which sections are now hidden.
 * `item` comes straight off the props the page was given and `t` is a module
 * object, so both are the same value on every render and the comparison
 * genuinely holds.
 */
const MenuLine = memo(function MenuLine({
  item,
  t,
}: {
  item: MenuItem;
  t: Dict;
}) {
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
});

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
  /**
   * "Somebody read the card", and then which rank of it they asked for.
   *
   * The arrival on its own barely earns an event — Umami counts the pageview
   * of /kaart already, and this used to be strictly worse than that count,
   * because it was fired from a mount effect and lost the race with the
   * deferred script often enough to read lower than the pageview it was
   * shadowing. That race is fixed in src/lib/umami.ts now, and what makes the
   * event worth keeping is the second half: which rank was chosen is a real
   * fact about this page that its URL does not carry at all, since filtering
   * the card is a state change and never a navigation.
   *
   * The rank's name rather than its row id, because the id is a number out of
   * Postgres that means nothing in a chart, and the name is our own published
   * menu. `all` is the whole card, which is both where every reader starts and
   * a real thing to tap back to.
   */
  useEffect(() => {
    track(EVENTS.contentViewed, { kind: "menu", ref: "all" });
  }, []);

  // Built only on a site that still needs it, and then only once. Ten fresh
  // objects on every render would be a small waste on their own; what they
  // would really cost is the memo on <MenuLine>, which cannot bail out of
  // re-rendering a dish whose object is new every time.
  const needSample = cmsCategories.length === 0 || cmsItems.length === 0;
  const sample = useMemo(
    () => (needSample ? sampleCard(t) : NO_SAMPLE),
    [needSample, t],
  );
  const categories = cmsCategories.length > 0 ? cmsCategories : sample.categories;
  const items = cmsItems.length > 0 ? cmsItems : sample.items;

  const [activeCategory, setActiveCategory] = useState<CardId | null>(null);

  /**
   * Changing rank, in one step.
   *
   * This was a two-phase swap. The tap faded the whole card out over a quarter
   * of a second; a transitionend — with a 350ms timer behind it as a backstop,
   * because an interrupted transition reports cancelled instead — then
   * committed the new rank and played a second animation to bring it back in.
   * Half a second between asking for Desserts and being able to read them, on
   * the only control this page has, with the largest thing on the screen
   * moving both ways. What the movement communicated was latency.
   *
   * It was covering nothing. The sections that do not match carry `hidden`,
   * which is one attribute flip on elements that are already mounted — the
   * expensive version, where choosing a rank rebuilt thirteen hundred
   * elements, was replaced long before this and the fade outlived the stall it
   * was hiding. So the commit is immediate now and the fade is deleted rather
   * than shortened: there is no duration at which an animation over a fifth of
   * a second of real work is worth waiting for.
   *
   * What is left is the filter row marking itself, and it is kept because the
   * reader needs to see which word they hit. 150ms is the whole of it — long
   * enough not to snap, short enough to read as the control answering rather
   * than as an effect being played.
   */
  function chooseCategory(id: CardId | null) {
    // Every tap, including a tap on the rank already showing. The reader
    // asking twice, or changing their mind and coming back, is a real fact
    // about how the card is read and the count is worth having.
    track(EVENTS.contentViewed, {
      kind: "menu",
      ref: id === null
        ? "all"
        : (categories.find((cat) => cat.id === id)?.name ?? String(id)),
    });
    setActiveCategory(id);
  }

  // Every rank the card prints, always. A section that is not the selected
  // one is `hidden`, which takes it out of the flow entirely — and Tailwind's
  // `space-y-*` skips hidden siblings when it hands out the margins, so the
  // sheet is laid out exactly as it was when the other ranks were not there
  // at all.
  const groups = categories
    .map((cat) => ({
      cat,
      lines: items.filter((item) => catIdOf(item) === cat.id),
    }))
    .filter((g) => g.lines.length > 0);

  const knownIds = new Set<CardId | undefined>(categories.map((c) => c.id));
  const ungrouped = items.filter((item) => !knownIds.has(catIdOf(item)));

  // What the reader can currently see, which is the whole card until a rank
  // is chosen and that rank's dishes afterwards. Only the count is wanted, and
  // the grouping above has already done the work of counting it.
  const shown =
    activeCategory === null
      ? items.length
      : (groups.find((g) => g.cat.id === activeCategory)?.lines.length ?? 0);

  return (
    <>
      {/* ===== HERO ===== */}
      {/* No minimum height and the padding pulled in on both sides. This is a
          title over a menu, not a hero, and every point of air above it is a
          point somebody has to scroll past before they see a single dish.
          People arrive at this page hungry and impulsive; the card should be
          most of the way up the screen when it loads. */}
      <section className="relative flex items-end overflow-hidden bg-paper">
        <div className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-8 pt-24 md:px-12 md:pb-10 md:pt-28 lg:px-20">
          <p className="label">{t.menuPage.eyebrow}</p>
          <div className="rule-ink my-4 w-14" aria-hidden="true" />
          <h1 className="heading-xl text-hive-800">{t.menuPage.title}</h1>
          <p className="mt-5 max-w-xl text-lg text-hive-400">
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
      <section className="relative overflow-hidden bg-paper-deep px-6 pb-16 pt-10 md:px-12 md:pb-24 md:pt-14 lg:px-20">
        <div className="relative mx-auto max-w-6xl">
          {/* Category rank: letterpressed, ranged left, with the rule hanging
              out on its own in the right margin. */}
          <ScrollReveal>
            <div className="grid gap-y-8 md:grid-cols-12 md:items-end md:gap-x-10">
              <div className="flex flex-wrap items-start gap-x-8 gap-y-5 md:col-span-8">
                <button
                  type="button"
                  onClick={() => chooseCategory(null)}
                  aria-pressed={activeCategory === null}
                  className="group text-left"
                >
                  <span
                    className={`label block transition-colors duration-150 ease-settle ${
                      activeCategory === null
                        ? "text-honey-600"
                        : "text-hive-400 group-hover:text-honey-600"
                    }`}
                  >
                    {t.menuPage.all}
                  </span>
                  <span
                    aria-hidden="true"
                    className={`rule-ink mt-2 block w-full transition-opacity duration-150 ease-settle ${
                      activeCategory === null ? "opacity-100" : "opacity-0"
                    }`}
                  />
                </button>

                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => chooseCategory(cat.id)}
                    aria-pressed={activeCategory === cat.id}
                    className="group text-left"
                  >
                    <span
                      className={`label block transition-colors duration-150 ease-settle ${
                        activeCategory === cat.id
                          ? "text-honey-600"
                          : "text-hive-400 group-hover:text-honey-600"
                      }`}
                    >
                      {cat.name}
                    </span>
                    <span
                      aria-hidden="true"
                      className={`rule-ink mt-2 block w-full transition-opacity duration-150 ease-settle ${
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

          {/* The card's own arrival, off the stylesheet.

              This was a framer-motion element opening from `opacity: 0`, and
              the price of that was the whole page: the server sent the entire
              card — every rank, every dish, every price — wrapped in an inline
              opacity of nought, so none of it could paint until thirty-one
              kilobytes of animation library had been fetched, parsed and
              hydrated. On a mid-range phone on 4G that is a second and a half
              of blank paper, and the card is the largest thing on the screen,
              so it is also what Chrome was timing the page by. The hero had
              exactly this incident and .hero-rise is the fix it got; see the
              note above the rule in globals.css.

              The movement is unchanged and deliberately so: ten pixels, seven
              tenths of a second, the settle curve. It simply starts when the
              paper does.

              The mt was mt-16/mt-24. The filters and the card are one thing,
              and ninety-six points of nothing between them read as the end of
              the page rather than as a pause. */}
          <div className="hero-rise mt-8 md:mt-12 [--rise-delay:0s] [--rise-duration:0.7s] [--rise-travel:10px]">
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
                  <div className="px-6 pb-12 pt-8 md:px-12 md:pb-16 md:pt-10">
                    <div className="space-y-14 md:space-y-20">
                      {groups.map(({ cat, lines }) => (
                        <section
                          key={cat.id}
                          className="menu-section"
                          hidden={
                            activeCategory !== null && activeCategory !== cat.id
                          }
                          aria-labelledby={`categorie-${cat.id}`}
                        >
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

                      {/* Dishes whose category was deleted out from under
                          them. They belong to no rank, so they are only ever
                          part of the whole card. */}
                      {ungrouped.length > 0 && (
                        <div hidden={activeCategory !== null}>
                          <div className="rule-ink w-full" aria-hidden="true" />
                          <ul className="mt-8 space-y-7 md:space-y-8">
                            {ungrouped.map((item) => (
                              <MenuLine key={item.id} item={item} t={t} />
                            ))}
                          </ul>
                        </div>
                      )}

                      {shown === 0 && (
                        <p className="font-display text-lg italic text-hive-300">
                          {t.menuPage.empty}
                        </p>
                      )}
                    </div>
                  </div>
                </Sheet>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
