"use client";

import { useEffect, useState } from "react";
import { m, AnimatePresence, useReducedMotion } from "@/components/motion";
import { LayoutMotionProvider } from "@/components/motion-layout";
import { ScrollReveal } from "@/components/ScrollReveal";
import { Sheet } from "@/components/Sheet";
import { SketchBee } from "@/components/SketchBee";
import { TornEdge } from "@/components/TornEdge";
import { getDict } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";

/**
 * The category the CMS relates an image to. Read at depth 1, so it arrives as
 * the document; an id on its own means the relation is broken and the image is
 * simply filed under nothing.
 */
interface GalleryCategory {
  id: string | number;
  name?: string;
}

interface GalleryImage {
  id: string;
  title: string;
  category?: GalleryCategory | string | number | null;
  description?: string;
  image?: {
    url?: string;
    alt?: string;
    sizes?: {
      card?: { url?: string };
      hero?: { url?: string };
    };
  };
}

const EASE: [number, number, number, number] = [0.16, 0.84, 0.28, 1];

/**
 * Categories are their own collection now, so the owners can add one without a
 * deploy. What the page needs from an image is a stable key to group by and a
 * name to print; both come off the related document, which Payload has already
 * resolved into the reader's language.
 */
function categoryKey(image: GalleryImage): string | null {
  const c = image.category;
  if (!c) return null;
  if (typeof c === "object") return String(c.id);
  return String(c);
}

function categoryName(image: GalleryImage): string {
  const c = image.category;
  return c && typeof c === "object" && c.name ? c.name : "";
}

// Shown until the CMS has images of its own.
function buildPlaceholders(locale: Locale): GalleryImage[] {
  const t = getDict(locale);
  return Array.from({ length: 8 }, (_, i) => ({
    id: String(i),
    title: t.gallery.placeholderTitle(i + 1),
    category: (() => {
      const names = t.gallery.placeholderCategories;
      const n = names[i % names.length];
      return { id: n, name: n };
    })(),
    description: t.gallery.placeholderDescription,
  }));
}

/**
 * Plates are laid out with rhythm rather than in a uniform block: every 7th
 * runs wide, every 5th runs tall. Derived from the index alone, so server and
 * client agree.
 */
function plateSpan(i: number): string {
  if (i % 7 === 6) return "col-span-2 row-span-2 md:col-span-8";
  if (i % 5 === 4) return "col-span-1 row-span-3 md:col-span-4";
  return "col-span-1 row-span-2 md:col-span-4";
}

/** Hand-drawn marks differ from one another; the index picks which. */
function beeVariant(i: number): 0 | 1 | 2 {
  return (i % 3) as 0 | 1 | 2;
}

/** Two strokes, drawn on the same grid as the rest of the marks. */
function CrossMark() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M3.3 3.5 L12.7 12.6" />
      <path d="M12.7 3.4 L3.2 12.7" />
    </svg>
  );
}

export function GalerijClient({
  locale,
  images: cmsImages,
}: {
  /** The dictionary is looked up here rather than passed: it holds functions. */
  locale: Locale;
  images: GalleryImage[];
}) {
  const t = getDict(locale);
  const images = cmsImages.length > 0 ? cmsImages : buildPlaceholders(locale);
  const [filter, setFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<GalleryImage | null>(null);
  const reduce = useReducedMotion();

  // One entry per category actually in use, in the order the images arrive —
  // which is the CMS's own `order`, so the filter bar follows it.
  const cats: { key: string; name: string }[] = [];
  for (const image of images) {
    const key = categoryKey(image);
    if (!key || cats.some((c) => c.key === key)) continue;
    cats.push({ key, name: categoryName(image) || key });
  }
  const filtered = filter
    ? images.filter((i) => categoryKey(i) === filter)
    : images;

  // The lightbox had no keyboard dismissal at all.
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  return (
    <>
      {/* ===== HEAD OF THE SHEET ===== */}
      <section className="relative flex min-h-[38vh] items-end overflow-hidden bg-paper">
        <div className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-12 pt-32 md:px-12 md:pb-16 lg:px-20">
          <p className="label">{t.gallery.eyebrow}</p>
          <div className="rule-ink my-5 w-14" aria-hidden="true" />
          <h1 className="heading-xl text-hive-800">{t.gallery.title}</h1>
        </div>
        <TornEdge
          color="#E8E2D4"
          lip="rgba(255,255,255,0.5)"
          variant={0}
          className="absolute inset-x-0 bottom-0 z-20"
        />
      </section>

      {/* ===== INDEX STRIP: the rank of categories ===== */}
      <section className="section-padding relative overflow-hidden bg-paper-deep">
        <ScrollReveal className="mx-auto max-w-6xl">
          <div className="grid gap-y-8 md:grid-cols-12 md:items-end md:gap-x-10">
            {/* Identical treatment to the category rank on /kaart. */}
            <div className="flex flex-wrap items-start gap-x-8 gap-y-5 md:col-span-12">
              <button
                type="button"
                onClick={() => setFilter(null)}
                aria-pressed={filter === null}
                className="group text-left"
              >
                <span
                  className={`label block transition-colors duration-500 ease-settle ${
                    filter === null
                      ? "text-honey-600"
                      : "text-hive-400 group-hover:text-honey-600"
                  }`}
                >
                  {t.gallery.all}
                </span>
                <span
                  aria-hidden="true"
                  className={`rule-ink mt-2 block w-full transition-opacity duration-500 ease-settle ${
                    filter === null ? "opacity-100" : "opacity-0"
                  }`}
                />
              </button>

              {cats.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setFilter(c.key)}
                  aria-pressed={filter === c.key}
                  className="group text-left"
                >
                  <span
                    className={`label block transition-colors duration-500 ease-settle ${
                      filter === c.key
                        ? "text-honey-600"
                        : "text-hive-400 group-hover:text-honey-600"
                    }`}
                  >
                    {c.name}
                  </span>
                  <span
                    aria-hidden="true"
                    className={`rule-ink mt-2 block w-full transition-opacity duration-500 ease-settle ${
                      filter === c.key ? "opacity-100" : "opacity-0"
                    }`}
                  />
                </button>
              ))}
            </div>

          </div>
        </ScrollReveal>

        <TornEdge
          color="#F1ECE1"
          lip="rgba(255,255,255,0.5)"
          variant={1}
          className="absolute inset-x-0 bottom-0 z-20"
        />
      </section>

      {/* ===== THE PLATES ===== */}
      <section className="section-padding relative overflow-hidden bg-paper !pt-0">
        {/* The grid, and only the grid, animates its own reflow: pick a
            category and the surviving plates travel to their new cells
            instead of vanishing and reappearing elsewhere. That is the
            `layout` prop below, and `layout` is the one thing the feature set
            the rest of the site runs on does not carry — so this subtree, and
            nothing else, is handed the heavier one. */}
        <LayoutMotionProvider>
          <div className="mx-auto max-w-6xl">
            <m.div
              layout
              className="grid auto-rows-[5.25rem] grid-cols-2 gap-4 md:auto-rows-[8rem] md:grid-cols-12 md:gap-6"
            >
              <AnimatePresence>
                {filtered.map((img, i) => (
                  <m.div
                    key={img.id}
                    layout
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{
                      duration: 0.7,
                      ease: EASE,
                      delay: reduce ? 0 : Math.min(i * 0.05, 0.4),
                    }}
                    className={`${plateSpan(i)} min-h-0`}
                  >
                    {/* A print in a mat board: cut sheet, paper margin, contact
                        shadow. The last child is <Sheet>'s content layer, which
                        has to inherit the cell height for the mat to fill it. */}
                    <Sheet
                      tone="deep"
                      edge="soft"
                      className="group h-full [&>*:last-child]:h-full"
                    >
                      <figure className="flex h-full flex-col p-2 md:p-2.5">
                        <div className="relative min-h-0 flex-1 overflow-hidden bg-paper-shade">
                          {img.image?.url ? (
                            <img
                              src={img.image.sizes?.card?.url || img.image.url}
                              alt={img.image.alt || img.title}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-paper-shade">
                              <SketchBee
                                size={96}
                                variant={beeVariant(i)}
                                strokeWidth={1}
                                className="text-sage-500/30"
                              />
                            </div>
                          )}
                        </div>

                        {/* Printed plate caption: number, title, category. */}
                        <figcaption className="flex items-baseline gap-3 pt-2.5">
                          <span
                            className="label figures-old shrink-0 !text-honey-500"
                            aria-hidden="true"
                          >
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <span className="min-w-0 flex-1 truncate font-display text-[0.8rem] text-hive-500 transition-colors duration-700 ease-settle group-hover:text-honey-600">
                            {img.title}
                          </span>
                          <span className="label hidden shrink-0 md:inline">
                            {categoryName(img)}
                          </span>
                        </figcaption>
                      </figure>

                      <button
                        type="button"
                        onClick={() => setSelected(img)}
                        aria-label={img.title}
                        className="absolute inset-0 z-10 h-full w-full cursor-pointer"
                      />
                    </Sheet>
                  </m.div>
                ))}
              </AnimatePresence>
            </m.div>
          </div>
        </LayoutMotionProvider>

        {/* No edge here: <Footer> draws its own tear up into this section. */}
      </section>

      {/* Lightbox */}
      <AnimatePresence>
        {selected && (
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
            role="dialog"
            aria-modal="true"
            aria-label={selected.title}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-hive-900/92 p-6"
            onClick={() => setSelected(null)}
          >
            <m.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 14 }}
              transition={{ duration: 0.6, ease: EASE }}
              className="relative max-h-[86vh] w-full max-w-4xl"
              onClick={(e) => e.stopPropagation()}
            >
              <Sheet tone="paper" edge="soft">
                <figure className="p-3 md:p-4">
                  {selected.image?.url ? (
                    <img
                      src={selected.image.sizes?.hero?.url || selected.image.url}
                      alt={selected.image.alt || selected.title}
                      className="mx-auto max-h-[62vh] w-auto max-w-full object-contain"
                    />
                  ) : (
                    <div className="mx-auto flex h-72 w-full max-w-md items-center justify-center bg-paper-shade md:h-96">
                      <SketchBee
                        size={148}
                        variant={1}
                        strokeWidth={1}
                        className="text-sage-500/30"
                      />
                    </div>
                  )}
                  <figcaption className="mt-4">
                    <div className="rule-ink w-full" aria-hidden="true" />
                    <p className="heading-md mt-4 text-hive-700">
                      {selected.title}
                    </p>
                    {selected.description && (
                      <p className="mt-1.5 text-sm text-hive-400">
                        {selected.description}
                      </p>
                    )}
                  </figcaption>
                </figure>
              </Sheet>
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label={t.gallery.close}
                className="absolute -right-3 -top-3 z-10 flex h-10 w-10 items-center justify-center rounded-[2px] border border-honey-600/50 bg-paper text-honey-700 transition-colors duration-700 ease-settle hover:bg-honey-400 hover:text-hive-800"
              >
                <CrossMark />
              </button>
            </m.div>
          </m.div>
        )}
      </AnimatePresence>
    </>
  );
}
