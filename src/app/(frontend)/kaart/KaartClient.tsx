"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HexagonGrid } from "@/components/HexagonGrid";
import { ScrollReveal } from "@/components/ScrollReveal";

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

const dietaryLabels: Record<string, string> = {
  vegetarian: "🌱 Vegetarisch",
  vegan: "🌿 Veganistisch",
  "gluten-free": "🌾 Glutenvrij",
  "dairy-free": "🥛 Lactosevrij",
};

// Placeholder data when CMS is empty
const placeholderCategories = [
  { id: "1", name: "Voorgerechten", description: "Om te beginnen" },
  { id: "2", name: "Hoofdgerechten", description: "De hoofdmoot" },
  { id: "3", name: "Desserts", description: "Zoete afsluiting" },
  { id: "4", name: "Dranken", description: "Warm & koud" },
];

const placeholderItems: MenuItem[] = [
  { id: "1", name: "Seizoenssoep", description: "Met huisgebakken brood", price: 8.5, category: { id: "1" }, dietary: ["vegetarian"], featured: true },
  { id: "2", name: "Bruschetta", description: "Geroosterde tomaat, basilicum, balsamico", price: 9.5, category: { id: "1" }, dietary: ["vegan"] },
  { id: "3", name: "Bijenkorfsalade", description: "Geitenkaas, honing, walnoten, rucola", price: 10, category: { id: "1" }, dietary: ["vegetarian"] },
  { id: "4", name: "Slow-cooked Beef", description: "Zuid-Afrikaans geïnspireerd, met groenten van het seizoen", price: 22.5, category: { id: "2" }, featured: true },
  { id: "5", name: "Bobotie", description: "Traditioneel Zuid-Afrikaans ovenschotel met rijst", price: 19.5, category: { id: "2" } },
  { id: "6", name: "Risotto van het seizoen", description: "Romig en vol smaak", price: 18.5, category: { id: "2" }, dietary: ["vegetarian"] },
  { id: "7", name: "Honingcake", description: "Met crème fraîche en verse bessen", price: 8, category: { id: "3" }, dietary: ["vegetarian"], featured: true },
  { id: "8", name: "Malva Pudding", description: "Zuid-Afrikaans dessert met vanille-ijs", price: 9, category: { id: "3" } },
  { id: "9", name: "Huisgemaakte Limonade", description: "Met verse munt en honing", price: 5, category: { id: "4" }, dietary: ["vegan"] },
  { id: "10", name: "Cappuccino", description: "Met optioneel havermelk", price: 3.5, category: { id: "4" } },
];

export function KaartClient({
  categories: cmsCategories,
  items: cmsItems,
}: {
  categories: Category[];
  items: MenuItem[];
}) {
  const categories = cmsCategories.length > 0 ? cmsCategories : placeholderCategories;
  const items = cmsItems.length > 0 ? cmsItems : placeholderItems;

  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const filtered = activeCategory
    ? items.filter((item) => {
        const catId = typeof item.category === "object" ? item.category?.id : item.category;
        return catId === activeCategory;
      })
    : items;

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
            Eten & Drinken
          </span>
          <h1 className="heading-xl text-honey-100 mt-3">Onze Kaart</h1>
          <p className="text-honey-200/60 mt-4 max-w-xl mx-auto">
            Seizoensgebonden gerechten bereid met passie en creativiteit
          </p>
        </motion.div>
      </section>

      <section className="section-padding">
        <div className="max-w-4xl mx-auto">
          {/* Category filters */}
          <ScrollReveal>
            <div className="flex flex-wrap justify-center gap-3 mb-12">
              <button
                onClick={() => setActiveCategory(null)}
                className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
                  activeCategory === null
                    ? "bg-honey-400 text-hive-800"
                    : "bg-honey-100 text-hive-500 hover:bg-honey-200"
                }`}
              >
                Alles
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
                    activeCategory === cat.id
                      ? "bg-honey-400 text-hive-800"
                      : "bg-honey-100 text-hive-500 hover:bg-honey-200"
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </ScrollReveal>

          {/* Menu items */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeCategory || "all"}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              {filtered.map((item) => (
                <motion.div
                  key={item.id}
                  layout
                  className={`p-6 rounded-2xl transition-all ${
                    item.featured
                      ? "bg-honey-50 border border-honey-200/50 shadow-sm"
                      : "bg-white/60 hover:bg-white"
                  }`}
                >
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="font-display text-lg font-bold text-hive-700">
                          {item.name}
                        </h3>
                        {item.featured && (
                          <span className="text-xs bg-honey-400/20 text-honey-700 px-2 py-0.5 rounded-full">
                            Favoriet
                          </span>
                        )}
                      </div>
                      {item.description && (
                        <p className="text-hive-400 text-sm mt-1">
                          {item.description}
                        </p>
                      )}
                      {item.dietary && item.dietary.length > 0 && (
                        <div className="flex gap-2 mt-2">
                          {item.dietary.map((d) => (
                            <span
                              key={d}
                              className="text-xs text-hive-300"
                            >
                              {dietaryLabels[d] || d}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <span className="font-display text-lg font-bold text-honey-600 whitespace-nowrap">
                      €{item.price.toFixed(2).replace(".", ",")}
                    </span>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </AnimatePresence>

          {filtered.length === 0 && (
            <p className="text-center text-hive-300 py-12">
              Geen items gevonden in deze categorie.
            </p>
          )}
        </div>
      </section>
    </>
  );
}
