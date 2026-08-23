/**
 * De Galerij. The `placeholder*` keys only ever appear on the stand-in plates
 * shown before any photographs have been uploaded; the real categories are a
 * collection of their own, named by the owners, and are never translated here.
 */
export const galleryNl = {
  metaTitle: (name: string) => `Galerij | ${name}`,
  metaDescription:
    "Bekijk foto's van De Bee's Hive: ons restaurant, gerechten, evenementen en sfeerbeelden uit het hart van Zuilen.",
  eyebrow: "Beelden",
  title: "Galerij",
  all: "Alles",
  close: "Sluiten",
  placeholderTitle: (n: number) => `De Bee's Hive ${n}`,
  placeholderDescription: "Binnenkort echte foto's",
  /**
   * Only for the stand-in plates shown before the CMS has any photographs.
   * Real categories are their own collection, named by the owners.
   */
  placeholderCategories: ["Restaurant", "Eten & Drinken", "Sfeer", "Kunst"],
};

export type GalleryDict = typeof galleryNl;

export const galleryEn: GalleryDict = {
  metaTitle: (name: string) => `Gallery | ${name}`,
  metaDescription:
    "Photographs of De Bee's Hive: our restaurant, our dishes, our events and the atmosphere in the heart of Zuilen.",
  eyebrow: "Images",
  title: "Gallery",
  all: "All",
  close: "Close",
  placeholderTitle: (n: number) => `De Bee's Hive ${n}`,
  placeholderDescription: "Real photographs coming soon",
  placeholderCategories: ["Restaurant", "Food & Drink", "Atmosphere", "Art"],
};
