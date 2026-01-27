"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HexagonGrid } from "@/components/HexagonGrid";
import { ScrollReveal } from "@/components/ScrollReveal";

interface GalleryImage {
  id: string;
  title: string;
  category: string;
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

const categoryLabels: Record<string, string> = {
  restaurant: "Restaurant",
  food: "Eten & Drinken",
  events: "Evenementen",
  ambiance: "Sfeer",
  art: "Kunst",
};

// Placeholder grid with gradient backgrounds
const placeholderImages: GalleryImage[] = Array.from({ length: 8 }, (_, i) => ({
  id: String(i),
  title: `De Bee's Hive ${i + 1}`,
  category: ["restaurant", "food", "ambiance", "art"][i % 4],
  description: "Binnenkort echte foto's",
}));

export function GalerijClient({ images: cmsImages }: { images: GalleryImage[] }) {
  const images = cmsImages.length > 0 ? cmsImages : placeholderImages;
  const [filter, setFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<GalleryImage | null>(null);

  const cats = [...new Set(images.map((i) => i.category))];
  const filtered = filter ? images.filter((i) => i.category === filter) : images;

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
            Beelden
          </span>
          <h1 className="heading-xl text-honey-100 mt-3">Galerij</h1>
        </motion.div>
      </section>

      <section className="section-padding">
        <div className="max-w-6xl mx-auto">
          <ScrollReveal>
            <div className="flex flex-wrap justify-center gap-3 mb-12">
              <button
                onClick={() => setFilter(null)}
                className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
                  filter === null
                    ? "bg-honey-400 text-hive-800"
                    : "bg-honey-100 text-hive-500 hover:bg-honey-200"
                }`}
              >
                Alles
              </button>
              {cats.map((c) => (
                <button
                  key={c}
                  onClick={() => setFilter(c)}
                  className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
                    filter === c
                      ? "bg-honey-400 text-hive-800"
                      : "bg-honey-100 text-hive-500 hover:bg-honey-200"
                  }`}
                >
                  {categoryLabels[c] || c}
                </button>
              ))}
            </div>
          </ScrollReveal>

          <motion.div layout className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <AnimatePresence>
              {filtered.map((img, i) => (
                <motion.div
                  key={img.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => setSelected(img)}
                  className="aspect-square rounded-2xl overflow-hidden cursor-pointer group relative"
                >
                  {img.image?.url ? (
                    <img
                      src={img.image.sizes?.card?.url || img.image.url}
                      alt={img.image.alt || img.title}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-honey-200 via-honey-300 to-honey-400 flex items-center justify-center">
                      <span className="text-4xl opacity-30">🐝</span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-hive-900/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                    <div>
                      <p className="text-honey-100 font-medium text-sm">{img.title}</p>
                      <p className="text-honey-300/70 text-xs">{categoryLabels[img.category] || img.category}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        </div>
      </section>

      {/* Lightbox */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-hive-900/90 backdrop-blur-sm flex items-center justify-center p-6"
            onClick={() => setSelected(null)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="max-w-4xl max-h-[80vh] relative"
              onClick={(e) => e.stopPropagation()}
            >
              {selected.image?.url ? (
                <img
                  src={selected.image.sizes?.hero?.url || selected.image.url}
                  alt={selected.image.alt || selected.title}
                  className="max-w-full max-h-[70vh] object-contain rounded-2xl"
                />
              ) : (
                <div className="w-96 h-96 bg-gradient-to-br from-honey-200 to-honey-400 rounded-2xl flex items-center justify-center">
                  <span className="text-6xl opacity-30">🐝</span>
                </div>
              )}
              <div className="text-center mt-4">
                <p className="text-honey-100 font-display text-xl">{selected.title}</p>
                {selected.description && (
                  <p className="text-honey-300/60 mt-1">{selected.description}</p>
                )}
              </div>
              <button
                onClick={() => setSelected(null)}
                className="absolute -top-3 -right-3 w-10 h-10 bg-honey-400 text-hive-800 rounded-full flex items-center justify-center font-bold hover:bg-honey-300 transition-colors"
              >
                ✕
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
