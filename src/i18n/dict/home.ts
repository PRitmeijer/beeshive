/**
 * The homepage: section labels for screen readers, the three photo stamps and
 * the two cards under "Ontdek". Most of the visible homepage text comes from
 * Payload; what is left here is the scaffolding around it, plus the stand-in
 * captions the stamps use until the owners swap the photographs.
 */
export const homeNl = {
  metaTitle: (name: string, area: string) =>
    `${name} | Eetcafé in het hart van ${area}`,
  srHeading: (name: string, area: string, city: string) =>
    `${name}, eetcafé in het hart van ${area}, ${city}`,
  heroLabel: "Hero",
  introLabel: "Introductie",
  quoteLabel: "Quote",
  discoverLabel: "Ontdek",
  newsletterLabel: "Nieuwsbrief",
  ctaMenu: "Bekijk de Kaart",
  ctaAbout: "Ons Verhaal",
  welcome: "Welkom",
  discoverEyebrow: "Ontdek",
  discoverTitle: "Wat bieden wij",
  newsletterEyebrow: "Blijf op de hoogte",
  stamps: {
    kitchenCaption: "Uit de keuken",
    kitchenAlt: "Carpaccio met rucola, cashewnoten en Parmezaanse kaas",
    familyCaption: "De Bee's",
    familyAlt: "De familie achter De Bee's Hive voor het eetcafé in Zuilen",
    seasonCaption: "Van het seizoen",
    seasonAlt: "Hoofdgerecht met aardappels, seizoensgroenten en rode kool",
  },
  cards: {
    menuTitle: "Onze Kaart",
    menuText:
      "Van verrassende voorgerechten tot huisgemaakte desserts. Ontdek onze seizoensgebonden kaart.",
    menuLink: "Bekijk de kaart",
    eventsTitle: "Evenementen",
    eventsText:
      "Creatieve workshops, live muziek en thema-avonden. Er is altijd iets te beleven.",
    eventsLink: "Lees meer",
  },
};

export type HomeDict = typeof homeNl;

export const homeEn: HomeDict = {
  metaTitle: (name: string, area: string) =>
    `${name} | Eetcafé in the heart of ${area}`,
  srHeading: (name: string, area: string, city: string) =>
    `${name}, eetcafé in the heart of ${area}, ${city}`,
  heroLabel: "Hero",
  introLabel: "Introduction",
  quoteLabel: "Quote",
  discoverLabel: "Discover",
  newsletterLabel: "Newsletter",
  ctaMenu: "See the Menu",
  ctaAbout: "Our Story",
  welcome: "Welcome",
  discoverEyebrow: "Discover",
  discoverTitle: "What we offer",
  newsletterEyebrow: "Stay in touch",
  stamps: {
    kitchenCaption: "From the kitchen",
    kitchenAlt: "Carpaccio with rocket, cashew nuts and Parmesan",
    familyCaption: "De Bee's",
    familyAlt: "The family behind De Bee's Hive outside the eetcafé in Zuilen",
    seasonCaption: "In season",
    seasonAlt: "Main course with potatoes, seasonal vegetables and red cabbage",
  },
  cards: {
    menuTitle: "Our Menu",
    menuText:
      "From surprising starters to house-made desserts. Discover our seasonal menu.",
    menuLink: "See the menu",
    eventsTitle: "Events",
    eventsText:
      "Creative workshops, live music and themed evenings. There is always something on.",
    eventsLink: "Read more",
  },
};
