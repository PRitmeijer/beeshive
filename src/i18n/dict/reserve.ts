/**
 * The page around the reservation form: heading, the nudge to phone instead for
 * a large group, and the line that sends anything else to the contact page. The
 * form's own labels are a namespace of their own, in reservationForm.ts.
 *
 * `eyebrow` is set above `title` on /reserveren and above `heading` in the
 * booking sheet on phones, so it has to be a category and never the opening
 * half of either sentence. It used to read "Een tafel", which printed directly
 * over "Reserveer een tafel" and landed as one broken line: "Een tafel
 * Reserveer een tafel". Naming the house instead survives both settings.
 */
export const reserveNl = {
  metaTitle: (name: string) => `Reserveren | ${name}`,
  metaDescription: (name: string, area: string, city: string) =>
    `Reserveer een tafel bij ${name} in ${area}, ${city}.`,
  eyebrow: "Bij De Bee's Hive",
  title: "Reserveren",
  heading: "Reserveer een tafel",
  directHeading: "Liever even bellen",
  directText:
    "Grote groepen of een besloten avond regelen we het liefst even samen. Bel of mail gerust, wanneer het jou uitkomt.",
  elseBefore: "Iets anders te vragen? Ga naar ",
  elseLink: "contact",
  elseAfter: ".",
};

export type ReserveDict = typeof reserveNl;

export const reserveEn: ReserveDict = {
  metaTitle: (name: string) => `Book a table | ${name}`,
  metaDescription: (name: string, area: string, city: string) =>
    `Book a table at ${name} in ${area}, ${city}.`,
  eyebrow: "At De Bee's Hive",
  title: "Book a table",
  heading: "Book a table",
  directHeading: "Rather give us a ring",
  directText:
    "Large groups or a private evening are easiest to arrange together. Call or email whenever it suits you.",
  elseBefore: "Something else on your mind? Go to ",
  elseLink: "contact",
  elseAfter: ".",
};
