/**
 * Labels for the allergy and diet badges on a dish.
 *
 * The keys are not free: they are the exact `dietary` select values in
 * src/collections/MenuItems.ts, so a badge the owners tick in the admin can be
 * looked up here without a translation table in between. Adding a diet means
 * adding it in both places.
 */
export const dietaryNl = {
  vegetarian: "Vegetarisch",
  vegan: "Veganistisch",
  "gluten-free": "Glutenvrij",
  "dairy-free": "Lactosevrij",
  "nut-free": "Notenvrij",
  "contains-fish": "Bevat vis",
};

export type DietaryDict = typeof dietaryNl;

export const dietaryEn: DietaryDict = {
  vegetarian: "Vegetarian",
  vegan: "Vegan",
  "gluten-free": "Gluten free",
  "dairy-free": "Dairy free",
  "nut-free": "Nut free",
  "contains-fish": "Contains fish",
};
