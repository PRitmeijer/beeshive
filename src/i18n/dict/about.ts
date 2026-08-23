/**
 * Over Ons. The three `fallbackStory*` paragraphs are the version of the story
 * that shipped before the owners had written their own; they are only rendered
 * while the rich text field in Payload is still empty, so the page is never
 * blank on a fresh install.
 */
export const aboutNl = {
  /** Accessible name for the photo or video, when no caption is set. */
  mediaTitle: "De Bee's Hive",
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
};

export type AboutDict = typeof aboutNl;

export const aboutEn: AboutDict = {
  mediaTitle: "De Bee's Hive",
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
};
