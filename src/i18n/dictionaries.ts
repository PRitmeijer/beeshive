import type { Locale } from "@/i18n/config";

/**
 * Every visible string that is written in the code rather than typed into the
 * CMS lives here, once per language.
 *
 * The Dutch object is the source of truth: `Dict` is derived from it, so the
 * English object cannot compile while a key is missing or misspelt. Anything an
 * editor can change (page copy, menu items, blog posts) belongs in Payload
 * instead, where it is stored per locale; see src/lib/payload.ts.
 *
 * Two conventions worth keeping:
 *  - keys are grouped by the page or component that reads them;
 *  - a value that needs a runtime number or name is a function, so the word
 *    order stays inside the language rather than being spliced in the JSX.
 *
 * Because some values are functions, a Dict can never be handed to a client
 * component as a prop: functions are not serialisable across that boundary.
 * Pass the `locale` string instead and let the client component call getDict()
 * itself. This module has no server-only imports, so it bundles either side.
 */
const nl = {
  nav: {
    home: "Home",
    about: "Over Ons",
    menu: "Kaart",
    gallery: "Galerij",
    blog: "Blog",
    contact: "Contact",
    reserve: "Reserveren",
    /** aria-label on the hamburger button. */
    menuToggle: "Menu",
    /** aria-label on the language switcher. */
    language: "Taal",
  },

  footer: {
    navigation: "Navigatie",
    contact: "Contact",
    follow: "Volg Ons",
    rights: "Alle rechten voorbehouden.",
  },

  hours: {
    heading: "Openingstijden",
    closedToday: "Vandaag gesloten",
    todayIs: (hours: string) => `Vandaag ${hours}`,
    openNow: "Nu open.",
    allTimes: "Alle tijden",
    /** Written into the CMS defaults and matched case-insensitively. */
    closed: "Gesloten",
  },

  /** Weekday names, Monday first, used to match the CMS opening hours rows. */
  weekdays: [
    "Maandag",
    "Dinsdag",
    "Woensdag",
    "Donderdag",
    "Vrijdag",
    "Zaterdag",
    "Zondag",
  ],

  home: {
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
      familyCaption: "De Bee's Hive",
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
  },

  about: {
    metaTitle: (name: string) => `Over Ons | ${name}`,
    metaDescription: (name: string, intro: string) =>
      `Ontdek het verhaal achter ${name}. ${intro}`,
    eyebrow: "Ons Verhaal",
    title: "Over Ons",
    /** Shown only while the CMS rich text story is still empty. */
    fallbackStoryOrigin:
      "Ons verhaal begon in Zuid-Afrika, waar wij onze liefde voor alle vormen van kunst en creativiteit in het dagelijks leven ontdekten. Na jarenlange ervaring en inspiratie op te doen, keerden wij terug naar onze Nederlandse roots met een droom: een warm eetcafé creëren waar het ‘kunst van het leven’ kan floreren.",
    fallbackStoryCraft: (name: string) =>
      `Bij ${name} geloven wij dat eten bereiden een kunstvorm is. Elk gerecht wordt met zorg en creativiteit bereid, met lokale ingrediënten en seizoensgebonden producten. Onze kaart weerspiegelt onze reis: van Zuid-Afrikaanse smaken tot Nederlandse klassiekers, altijd met een creatieve twist.`,
    fallbackStoryCommunity: (name: string) =>
      `Maar ${name} is meer dan alleen eten. Het is een gemeenschap. Een plek waar buren vrienden worden, waar kunstenaars hun werk delen, en waar iedereen welkom is om hun creatieve zelf te zijn.`,
  },

  menuPage: {
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
  },

  /** Keys match the `dietary` select values in src/collections/MenuItems.ts. */
  dietary: {
    vegetarian: "Vegetarisch",
    vegan: "Veganistisch",
    "gluten-free": "Glutenvrij",
    "dairy-free": "Lactosevrij",
    "nut-free": "Notenvrij",
    "contains-fish": "Bevat vis",
  },

  gallery: {
    metaTitle: (name: string) => `Galerij | ${name}`,
    metaDescription:
      "Bekijk foto's van De Bee's Hive: ons restaurant, gerechten, evenementen en sfeerbeelden uit het hart van Zuilen.",
    eyebrow: "Beelden",
    title: "Galerij",
    all: "Alles",
    close: "Sluiten",
    placeholderTitle: (n: number) => `De Bee's Hive ${n}`,
    placeholderDescription: "Binnenkort echte foto's",
    /** Keys match the `category` select in src/collections/GalleryImages.ts. */
    categories: {
      restaurant: "Restaurant",
      food: "Eten & Drinken",
      events: "Evenementen",
      ambiance: "Sfeer",
      art: "Kunst",
      team: "Team",
    },
  },

  blog: {
    metaTitle: (name: string) => `Blog | ${name}`,
    /** Title of a single article; the headline carries the language. */
    postMetaTitle: (title: string, name: string) => `${title} | ${name}`,
    metaDescription:
      "Lees het laatste nieuws van De Bee's Hive: recepten, evenementen, verhalen en meer uit ons eetcafé in Zuilen.",
    eyebrow: "Verhalen & Nieuws",
    title: "Blog",
    readMore: "Lees meer",
    empty: "Binnenkort verschijnen hier onze verhalen.",
    back: "Terug naar blog",
    by: (name: string) => `Door ${name}`,
    cmsNoticeBefore: "De volledige inhoud van dit artikel wordt geladen vanuit het CMS. Beheer je content via het ",
    cmsNoticeLink: "admin paneel",
    cmsNoticeAfter: ".",
    samplePosts: {
      welcome: {
        title: "Welkom bij De Bee's Hive",
        excerpt:
          "We zijn verheugd om onze deuren te openen in het hart van Zuilen. Lees meer over onze reis en wat je kunt verwachten.",
      },
      seasonal: {
        title: "De kunst van seizoensgebonden koken",
        excerpt:
          "Ontdek hoe wij elk seizoen vieren met verse, lokale ingrediënten en creatieve recepten.",
      },
      southAfrican: {
        title: "Zuid-Afrikaanse smaken in Utrecht",
        excerpt:
          "Van bobotie tot malva pudding: hoe onze Zuid-Afrikaanse roots onze keuken beïnvloeden.",
      },
    },
  },

  contact: {
    metaTitle: (name: string) => `Contact | ${name}`,
    metaDescription: (name: string, area: string, city: string) =>
      `Neem contact op met ${name} in ${area}, ${city}. Stuur ons een bericht of kom langs.`,
    eyebrow: "Neem contact op",
    title: "Contact",
    heading: "Kom langs of stuur een bericht",
    address: "Adres",
    email: "E-mail",
    phone: "Telefoon",
    follow: "Volg ons",
    mapTitle: "Google Maps locatie",
    reserveHeading: "Een tafel reserveren",
    reserveText:
      "Wil je bij ons komen eten? Doe een aanvraag, dan bellen of mailen we je persoonlijk terug om het vast te leggen.",
    reserveCta: "Tafel aanvragen",
    formName: "Naam",
    formEmail: "E-mail",
    formMessage: "Bericht",
    formSubmit: "Verstuur bericht",
    sentTitle: "Bedankt voor je bericht!",
    sentText: "We nemen zo snel mogelijk contact met je op.",
    mailSubject: (name: string) => `Bericht van ${name}`,
    mailFrom: "Van",
  },

  reserve: {
    metaTitle: (name: string) => `Reserveren | ${name}`,
    metaDescription: (name: string, area: string, city: string) =>
      `Reserveer een tafel bij ${name} in ${area}, ${city}.`,
    eyebrow: "Een tafel",
    title: "Reserveren",
    heading: "Reserveer een tafel",
    directHeading: "Liever even bellen",
    directText:
      "Grote groepen of een besloten avond? Bel ons, dan regelen we het samen.",
    elseBefore: "Iets anders te vragen? Ga naar ",
    elseLink: "contact",
    elseAfter: ".",
  },

  reservationForm: {
    name: "Naam",
    email: "E-mailadres",
    phone: "Telefoonnummer",
    phoneHint: "Optioneel, maar dan kunnen we je even bellen.",
    guests: "Aantal personen",
    guestsHint: "Met meer dan 30 personen: bel ons even.",
    date: "Datum",
    time: "Tijd",
    timePlaceholder: "Kies een tijd",
    timeOption: (slot: string) => `${slot} uur`,
    timeHint: "We serveren van 12:00 tot 22:00 uur.",
    occasion: "Gelegenheid",
    occasionPlaceholder: "Verjaardag, familiediner, zomaar",
    notes: "Opmerkingen",
    notesHint: "Allergieën, een kinderstoel, een rustige tafel: laat het weten.",
    honeypot: "Laat dit veld leeg",
    submit: "Reserveren",
    submitting: "Bezig...",
    error: "Er ging iets mis. Probeer het opnieuw.",
    successTitle: "Bedankt, we hebben het ontvangen",
    successText: "We nemen contact met je op om de tafel te bevestigen.",
    successAgain: "Nog een tafel reserveren",
  },

  newsletter: {
    name: "Je naam",
    email: "Je e-mailadres",
    submit: "Aanmelden",
    submitting: "Bezig...",
    error: "Er ging iets mis. Probeer het opnieuw.",
    successTitle: "Bedankt voor je aanmelding!",
    successText: "Je hoort snel van ons.",
  },

  notifications: {
    moreInfo: "Meer info",
    close: "Sluiten",
  },
} satisfies Record<string, unknown>;

export type Dict = typeof nl;

const en: Dict = {
  nav: {
    home: "Home",
    about: "About Us",
    menu: "Menu",
    gallery: "Gallery",
    blog: "Blog",
    contact: "Contact",
    reserve: "Book a table",
    menuToggle: "Menu",
    language: "Language",
  },

  footer: {
    navigation: "Navigation",
    contact: "Contact",
    follow: "Follow Us",
    rights: "All rights reserved.",
  },

  hours: {
    heading: "Opening hours",
    closedToday: "Closed today",
    todayIs: (hours: string) => `Today ${hours}`,
    openNow: "Open now.",
    allTimes: "All hours",
    closed: "Closed",
  },

  weekdays: [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ],

  home: {
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
      familyCaption: "De Bee's Hive",
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
  },

  about: {
    metaTitle: (name: string) => `About Us | ${name}`,
    metaDescription: (name: string, intro: string) =>
      `Discover the story behind ${name}. ${intro}`,
    eyebrow: "Our Story",
    title: "About Us",
    fallbackStoryOrigin:
      "Our story began in South Africa, where we discovered our love for every form of art and creativity in daily life. After years of gathering experience and inspiration, we returned to our Dutch roots with a dream: to create a warm eetcafé where the ‘art of living’ can flourish.",
    fallbackStoryCraft: (name: string) =>
      `At ${name} we believe that cooking is an art form. Every dish is prepared with care and creativity, using local ingredients and seasonal produce. Our menu mirrors our journey: from South African flavours to Dutch classics, always with a creative twist.`,
    fallbackStoryCommunity: (name: string) =>
      `But ${name} is about more than food. It is a community. A place where neighbours become friends, where artists share their work, and where everyone is welcome to be their creative self.`,
  },

  menuPage: {
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
  },

  dietary: {
    vegetarian: "Vegetarian",
    vegan: "Vegan",
    "gluten-free": "Gluten free",
    "dairy-free": "Dairy free",
    "nut-free": "Nut free",
    "contains-fish": "Contains fish",
  },

  gallery: {
    metaTitle: (name: string) => `Gallery | ${name}`,
    metaDescription:
      "Photographs of De Bee's Hive: our restaurant, our dishes, our events and the atmosphere in the heart of Zuilen.",
    eyebrow: "Images",
    title: "Gallery",
    all: "All",
    close: "Close",
    placeholderTitle: (n: number) => `De Bee's Hive ${n}`,
    placeholderDescription: "Real photographs coming soon",
    categories: {
      restaurant: "Restaurant",
      food: "Food & Drink",
      events: "Events",
      ambiance: "Atmosphere",
      art: "Art",
      team: "Team",
    },
  },

  blog: {
    metaTitle: (name: string) => `Blog | ${name}`,
    /** Title of a single article; the headline carries the language. */
    postMetaTitle: (title: string, name: string) => `${title} | ${name}`,
    metaDescription:
      "The latest from De Bee's Hive: recipes, events, stories and more from our eetcafé in Zuilen.",
    eyebrow: "Stories & News",
    title: "Blog",
    readMore: "Read more",
    empty: "Our stories will appear here soon.",
    back: "Back to the blog",
    by: (name: string) => `By ${name}`,
    cmsNoticeBefore: "The full text of this article is loaded from the CMS. Manage your content in the ",
    cmsNoticeLink: "admin panel",
    cmsNoticeAfter: ".",
    samplePosts: {
      welcome: {
        title: "Welcome to De Bee's Hive",
        excerpt:
          "We are delighted to open our doors in the heart of Zuilen. Read about our journey and what to expect.",
      },
      seasonal: {
        title: "The art of cooking with the seasons",
        excerpt:
          "Discover how we celebrate every season with fresh, local ingredients and creative recipes.",
      },
      southAfrican: {
        title: "South African flavours in Utrecht",
        excerpt:
          "From bobotie to malva pudding: how our South African roots shape our kitchen.",
      },
    },
  },

  contact: {
    metaTitle: (name: string) => `Contact | ${name}`,
    metaDescription: (name: string, area: string, city: string) =>
      `Get in touch with ${name} in ${area}, ${city}. Send us a message or simply drop by.`,
    eyebrow: "Get in touch",
    title: "Contact",
    heading: "Drop by or send a message",
    address: "Address",
    email: "Email",
    phone: "Phone",
    follow: "Follow us",
    mapTitle: "Google Maps location",
    reserveHeading: "Booking a table",
    reserveText:
      "Would you like to eat with us? Send a request and we will call or email you back personally to confirm it.",
    reserveCta: "Request a table",
    formName: "Name",
    formEmail: "Email",
    formMessage: "Message",
    formSubmit: "Send message",
    sentTitle: "Thank you for your message!",
    sentText: "We will get back to you as soon as we can.",
    mailSubject: (name: string) => `Message from ${name}`,
    mailFrom: "From",
  },

  reserve: {
    metaTitle: (name: string) => `Book a table | ${name}`,
    metaDescription: (name: string, area: string, city: string) =>
      `Book a table at ${name} in ${area}, ${city}.`,
    eyebrow: "A table",
    title: "Book a table",
    heading: "Book a table",
    directHeading: "Rather give us a ring",
    directText:
      "Large groups or a private evening? Call us and we will sort it out together.",
    elseBefore: "Something else on your mind? Go to ",
    elseLink: "contact",
    elseAfter: ".",
  },

  reservationForm: {
    name: "Name",
    email: "Email address",
    phone: "Phone number",
    phoneHint: "Optional, but it lets us give you a quick call.",
    guests: "Number of guests",
    guestsHint: "For more than 30 guests: please call us.",
    date: "Date",
    time: "Time",
    timePlaceholder: "Choose a time",
    timeOption: (slot: string) => `${slot}`,
    timeHint: "We serve from 12:00 to 22:00.",
    occasion: "Occasion",
    occasionPlaceholder: "Birthday, family dinner, no reason at all",
    notes: "Notes",
    notesHint: "Allergies, a high chair, a quiet table: do let us know.",
    honeypot: "Leave this field empty",
    submit: "Book a table",
    submitting: "Sending...",
    error: "Something went wrong. Please try again.",
    successTitle: "Thank you, we have got it",
    successText: "We will be in touch to confirm your table.",
    successAgain: "Book another table",
  },

  newsletter: {
    name: "Your name",
    email: "Your email address",
    submit: "Sign up",
    submitting: "Sending...",
    error: "Something went wrong. Please try again.",
    successTitle: "Thank you for signing up!",
    successText: "You will hear from us soon.",
  },

  notifications: {
    moreInfo: "More info",
    close: "Close",
  },
};

const dictionaries: Record<Locale, Dict> = { nl, en };

export function getDict(locale: Locale): Dict {
  return dictionaries[locale];
}
