/**
 * The main menu and the two controls that sit next to it. Short enough that a
 * wrong word is spotted immediately, which is exactly why it is worth keeping
 * out of the way of the longer page copy.
 */
export const navNl = {
  home: "Home",
  about: "Over Ons",
  menu: "Kaart",
  gallery: "Galerij",
  events: "Evenementen",
  blog: "Blog",
  contact: "Contact",
  reserve: "Reserveren",
  /** aria-label on the hamburger button. */
  menuToggle: "Menu",
  /** aria-label on the language switcher. */
  language: "Taal",
};

export type NavDict = typeof navNl;

export const navEn: NavDict = {
  home: "Home",
  about: "About Us",
  menu: "Menu",
  gallery: "Gallery",
  events: "Events",
  blog: "Blog",
  contact: "Contact",
  reserve: "Book a table",
  menuToggle: "Menu",
  language: "Language",
};
