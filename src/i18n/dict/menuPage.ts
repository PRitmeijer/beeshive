/**
 * De Kaart. Everything under `sampleCategories` and `sampleItems` is a
 * demonstration menu: it is only rendered while the CMS has no dishes of its
 * own, so a new install shows a plausible card instead of an empty page. Once
 * the owners have entered their kaart these strings are dead weight that nobody
 * ever sees, which is why they may be deleted without ceremony.
 *
 * `price` differs per language on purpose: Dutch writes €12,50 with a comma,
 * English writes €12.50 with a point.
 */
export const menuPageNl = {
  metaTitle: (name: string) => `Kaart | ${name}`,
  metaDescription:
    "Bekijk de menukaart van De Bee's Hive. Seizoensgebonden gerechten met lokale ingrediënten, creatief bereid met een Zuid-Afrikaanse twist.",
  eyebrow: "Eten & Drinken",
  title: "Onze Kaart",
  subtitle: "Seizoensgebonden gerechten bereid met passie en creativiteit",
  /** Decimal comma in Dutch, decimal point in English. */
  price: (value: number) => `€${value.toFixed(2).replace(".", ",")}`,
  all: "Alles",
  featured: "Favoriet",
  empty: "Geen items gevonden in deze categorie.",
  /** Shown until the CMS has a card of its own. */
  sampleCategories: {
    starters: { name: "Voorgerechten", description: "Om te beginnen" },
    mains: { name: "Hoofdgerechten", description: "De hoofdmoot" },
    desserts: { name: "Desserts", description: "Zoete afsluiting" },
    drinks: { name: "Dranken", description: "Warm & koud" },
  },
  sampleItems: {
    soup: { name: "Seizoenssoep", description: "Met huisgebakken brood" },
    bruschetta: {
      name: "Bruschetta",
      description: "Geroosterde tomaat, basilicum, balsamico",
    },
    salad: {
      name: "Bijenkorfsalade",
      description: "Geitenkaas, honing, walnoten, rucola",
    },
    beef: {
      name: "Slow-cooked Beef",
      description: "Zuid-Afrikaans geïnspireerd, met groenten van het seizoen",
    },
    bobotie: {
      name: "Bobotie",
      description: "Traditioneel Zuid-Afrikaans ovenschotel met rijst",
    },
    risotto: {
      name: "Risotto van het seizoen",
      description: "Romig en vol smaak",
    },
    honeycake: {
      name: "Honingcake",
      description: "Met crème fraîche en verse bessen",
    },
    malva: {
      name: "Malva Pudding",
      description: "Zuid-Afrikaans dessert met vanille-ijs",
    },
    lemonade: {
      name: "Huisgemaakte Limonade",
      description: "Met verse munt en honing",
    },
    cappuccino: { name: "Cappuccino", description: "Met optioneel havermelk" },
  },
};

export type MenuPageDict = typeof menuPageNl;

export const menuPageEn: MenuPageDict = {
  metaTitle: (name: string) => `Menu | ${name}`,
  metaDescription:
    "Browse the menu at De Bee's Hive. Seasonal dishes with local ingredients, prepared with creativity and a South African twist.",
  eyebrow: "Food & Drink",
  title: "Our Menu",
  subtitle: "Seasonal dishes prepared with passion and creativity",
  price: (value: number) => `€${value.toFixed(2)}`,
  all: "All",
  featured: "Favourite",
  empty: "No items found in this category.",
  sampleCategories: {
    starters: { name: "Starters", description: "To begin with" },
    mains: { name: "Mains", description: "The main event" },
    desserts: { name: "Desserts", description: "A sweet finish" },
    drinks: { name: "Drinks", description: "Hot & cold" },
  },
  sampleItems: {
    soup: { name: "Soup of the season", description: "With house-baked bread" },
    bruschetta: {
      name: "Bruschetta",
      description: "Roasted tomato, basil, balsamic",
    },
    salad: {
      name: "Beehive salad",
      description: "Goat's cheese, honey, walnuts, rocket",
    },
    beef: {
      name: "Slow-cooked beef",
      description: "South African inspired, with vegetables of the season",
    },
    bobotie: {
      name: "Bobotie",
      description: "Traditional South African bake served with rice",
    },
    risotto: {
      name: "Risotto of the season",
      description: "Creamy and full of flavour",
    },
    honeycake: {
      name: "Honey cake",
      description: "With crème fraîche and fresh berries",
    },
    malva: {
      name: "Malva pudding",
      description: "South African dessert with vanilla ice cream",
    },
    lemonade: {
      name: "House lemonade",
      description: "With fresh mint and honey",
    },
    cappuccino: { name: "Cappuccino", description: "Oat milk on request" },
  },
};
