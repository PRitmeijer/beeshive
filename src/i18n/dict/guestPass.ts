/**
 * The guest pass: the page a guest lands on after following the link that comes
 * with a reservation, where the whole table can see the booking and pass on
 * their own name, diet and drink order.
 *
 * The tone is warmer and more informal than the reservation form, because by
 * the time someone reads this the table is already booked; nothing here is a
 * request, it is a confirmation with a few optional extras.
 *
 * The link is unguessable rather than protected by a login, which is a
 * deliberate trade: the owners cannot ask a whole party to make an account.
 * `privacyNote` is what says so out loud, and it should not quietly disappear.
 *
 * The keys under `status` are the reservation statuses as they are stored in
 * Payload, in Dutch, so a status can be looked up directly without a mapping
 * table in between; that is why they read `nieuw` and `gebeld` even in the
 * English object.
 */
export const guestPassNl = {
  metaTitle: (name: string) => `Je tafel bij ${name}`,
  heading: "Jullie tafel",
  subheading: (name: string) => `${name} heeft gereserveerd`,
  notFound: "Deze link werkt niet meer",
  notFoundBody:
    "De link klopt niet of de reservering is inmiddels verlopen. Vraag degene die gereserveerd heeft om de link nog eens door te sturen, of bel ons even.",
  whenLabel: "Wanneer",
  whereLabel: "Waar",
  guestsLabel: "Aantal personen",
  nameLabel: "Op naam van",
  statusLabel: "Status",
  status: {
    nieuw: "Aangevraagd",
    gebeld: "We hebben gebeld",
    bevestigd: "Bevestigd",
    geannuleerd: "Geannuleerd",
  },
  guestsValue: (n: number) => (n === 1 ? "1 persoon" : `${n} personen`),
  addToCalendar: "Zet in mijn agenda",
  directions: "Route hierheen",
  callUs: "Bel ons",
  shareHeading: "Deel met je gezelschap",
  shareHint: "Stuur deze link door, dan kan iedereen zijn wensen doorgeven.",
  copyLink: "Kopieer link",
  copied: "Gekopieerd",
  shareWhatsApp: "Deel via WhatsApp",
  joinHeading: "Kom je ook?",
  joinHint: "Laat even weten dat je erbij bent, dan weten wij het ook.",
  yourName: "Je naam",
  dietaryHeading: "Dieetwensen",
  dietaryHint: "Allergie, vegetarisch, iets anders: we houden er rekening mee.",
  drinksHeading: "Alvast wat te drinken?",
  drinksHint: "Niet verplicht, maar het scheelt wachten bij binnenkomst.",
  submit: "Doorgeven",
  submitting: "Bezig...",
  thanks: "Genoteerd, tot dan.",
  thanksBody:
    "We zien je op de dag zelf. Je kunt deze pagina open laten staan.",
  alreadyJoined: "Je staat al op de lijst.",
  error: "Er ging iets mis. Probeer het opnieuw.",
  attending: "Wie er komen",
  noneYet: "Nog niemand heeft zich aangemeld.",
  privacyNote: "Alleen wie de link heeft, ziet deze pagina.",
};

export type GuestPassDict = typeof guestPassNl;

export const guestPassEn: GuestPassDict = {
  metaTitle: (name: string) => `Your table at ${name}`,
  heading: "Your table",
  subheading: (name: string) => `${name} made the booking`,
  notFound: "This link no longer works",
  notFoundBody:
    "The link is wrong or the booking has expired. Ask whoever booked to send the link again, or give us a ring.",
  whenLabel: "When",
  whereLabel: "Where",
  guestsLabel: "Number of guests",
  nameLabel: "Booked by",
  statusLabel: "Status",
  status: {
    nieuw: "Requested",
    gebeld: "We have called",
    bevestigd: "Confirmed",
    geannuleerd: "Cancelled",
  },
  guestsValue: (n: number) => (n === 1 ? "1 guest" : `${n} guests`),
  addToCalendar: "Add to my calendar",
  directions: "Directions",
  callUs: "Call us",
  shareHeading: "Share with your party",
  shareHint:
    "Pass this link on so everyone can let us know what they would like.",
  copyLink: "Copy link",
  copied: "Copied",
  shareWhatsApp: "Share on WhatsApp",
  joinHeading: "Are you coming too?",
  joinHint: "Let us know you are joining and we will count you in.",
  yourName: "Your name",
  dietaryHeading: "Dietary wishes",
  dietaryHint:
    "An allergy, vegetarian, anything else: we will take it into account.",
  drinksHeading: "Something to drink already?",
  drinksHint: "Not required, but it saves waiting when you arrive.",
  submit: "Send it through",
  submitting: "Sending...",
  thanks: "Noted, see you then.",
  thanksBody: "We will see you on the day. Feel free to leave this page open.",
  alreadyJoined: "You are already on the list.",
  error: "Something went wrong. Please try again.",
  attending: "Who is coming",
  noneYet: "Nobody has signed up yet.",
  privacyNote: "Only people with the link can see this page.",
};
