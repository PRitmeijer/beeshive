/**
 * The page around the reservation form: heading, the nudge to phone instead for
 * a large group, and the line that sends anything else to the contact page. The
 * form's own labels are a namespace of their own, in reservationForm.ts.
 */
export const reserveNl = {
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
};

export type ReserveDict = typeof reserveNl;

export const reserveEn: ReserveDict = {
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
};
