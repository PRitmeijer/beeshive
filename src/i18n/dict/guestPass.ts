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
 *
 * `calendar` names the four ways out of <AddToCalendar>. They live in this
 * namespace because the guest pass is the only thing that offers a calendar
 * today; the moment a second page does, move that object into a namespace of
 * its own rather than teaching another page to reach in here.
 *
 * `icsTitle` and `icsDescription` are the only strings in this file that are
 * never rendered on the page: they end up inside the downloaded .ics, and are
 * read months later in somebody's calendar app, with no surrounding context at
 * all. So they name the restaurant outright where the page can simply say "we".
 * `icsDescription` also carries the house's note into the calendar when there
 * is one, which is why it takes three arguments and lays them out over
 * paragraphs rather than running them into one sentence.
 *
 * `houseNoteLabel` heads the one piece of free text on the page: the line the
 * owners wrote to the whole party in the admin. It sits with the date and the
 * address because that is what it is, part of the booking. Nothing runs the
 * other way — a companion answers with a name and a few ticked boxes and that
 * is all, which is why the only words on this page that were typed by a person
 * are the house's own.
 */
export const guestPassNl = {
  metaTitle: (name: string) => `Je tafel bij ${name}`,
  heading: "Jullie tafel",
  subheading: (name: string) => `${name} heeft gereserveerd`,
  notFound: "Deze link werkt niet meer",
  notFoundBody:
    "De link klopt niet of de reservering is inmiddels verlopen. Vraag degene die gereserveerd heeft om de link nog eens door te sturen, of bel ons even.",
  backToSite: "Naar de website",
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
  guestsUnknown: "niet doorgegeven",
  houseNoteLabel: "Nog even dit",
  pastNotice: "Deze avond is geweest. Leuk dat jullie er waren.",
  cancelledNotice:
    "Deze reservering is geannuleerd. Bel ons als dat niet klopt.",
  addToCalendar: "Zet in mijn agenda",
  calendar: {
    apple: "Apple Agenda",
    google: "Google Agenda",
    outlook: "Outlook",
    download: "Los bestand (.ics)",
  },
  icsTitle: (name: string) => `Tafel bij ${name}`,
  icsDescription: (name: string, url: string, note: string) =>
    note
      ? `Gereserveerd bij ${name}.\n\n${note}\n\nAlle details en wie er meekomen: ${url}`
      : `Gereserveerd bij ${name}. Alle details en wie er meekomen: ${url}`,
  directions: "Route hierheen",
  directionsGoogle: "Google Maps",
  directionsApple: "Apple Kaarten",
  callUs: "Bel ons",
  shareHeading: "Deel met je gezelschap",
  shareHint: "Stuur deze link door, dan kan iedereen zijn wensen doorgeven.",
  copyLink: "Kopieer link",
  copied: "Gekopieerd",
  shareWhatsApp: "Deel via WhatsApp",
  whatsAppMessage: (name: string, url: string) =>
    `We eten bij ${name}. Geef hier even door of je erbij bent: ${url}`,
  joinHeading: "Kom je ook?",
  joinHint: "Laat even weten dat je erbij bent, dan weten wij het ook.",
  yourName: "Je naam",
  nameRequired: "Vul even je naam in.",
  dietaryHeading: "Dieetwensen",
  dietaryHint: "Allergie, vegetarisch, iets anders: we houden er rekening mee.",
  drinksHeading: "Alvast wat te drinken?",
  drinksHint: "Niet verplicht, maar het scheelt wachten bij binnenkomst.",
  submit: "Doorgeven",
  submitting: "Bezig...",
  update: "Wijziging doorgeven",
  edit: "Iets aanpassen",
  editCancel: "Laat maar",
  thanks: "Genoteerd, tot dan.",
  thanksBody:
    "We zien je op de dag zelf. Je kunt deze pagina open laten staan.",
  alreadyJoined: "Je staat al op de lijst.",
  error: "Er ging iets mis. Probeer het opnieuw.",
  full: "De lijst zit vol. Bel ons even, dan schrijven we je erbij.",
  attending: "Wie er komen",
  noneYet: "Nog niemand heeft zich aangemeld.",
  nothingPicked: "geen wensen doorgegeven",
  you: "jij",
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
  backToSite: "Go to the website",
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
  guestsUnknown: "not given",
  houseNoteLabel: "One more thing",
  pastNotice: "This evening has been and gone. Lovely to have had you.",
  cancelledNotice:
    "This booking has been cancelled. Give us a ring if that is not right.",
  addToCalendar: "Add to my calendar",
  calendar: {
    apple: "Apple Calendar",
    google: "Google Calendar",
    outlook: "Outlook",
    download: "Plain file (.ics)",
  },
  icsTitle: (name: string) => `Table at ${name}`,
  icsDescription: (name: string, url: string, note: string) =>
    note
      ? `Booked at ${name}.\n\n${note}\n\nAll the details and who else is coming: ${url}`
      : `Booked at ${name}. All the details and who else is coming: ${url}`,
  directions: "Directions",
  directionsGoogle: "Google Maps",
  directionsApple: "Apple Maps",
  callUs: "Call us",
  shareHeading: "Share with your party",
  shareHint:
    "Pass this link on so everyone can let us know what they would like.",
  copyLink: "Copy link",
  copied: "Copied",
  shareWhatsApp: "Share on WhatsApp",
  whatsAppMessage: (name: string, url: string) =>
    `We are eating at ${name}. Let them know here whether you are joining: ${url}`,
  joinHeading: "Are you coming too?",
  joinHint: "Let us know you are joining and we will count you in.",
  yourName: "Your name",
  nameRequired: "Please fill in your name.",
  dietaryHeading: "Dietary wishes",
  dietaryHint:
    "An allergy, vegetarian, anything else: we will take it into account.",
  drinksHeading: "Something to drink already?",
  drinksHint: "Not required, but it saves waiting when you arrive.",
  submit: "Send it through",
  submitting: "Sending...",
  update: "Send the change through",
  edit: "Change something",
  editCancel: "Never mind",
  thanks: "Noted, see you then.",
  thanksBody: "We will see you on the day. Feel free to leave this page open.",
  alreadyJoined: "You are already on the list.",
  error: "Something went wrong. Please try again.",
  full: "The list is full. Give us a ring and we will add you ourselves.",
  attending: "Who is coming",
  noneYet: "Nobody has signed up yet.",
  nothingPicked: "no wishes passed on",
  you: "you",
  privacyNote: "Only people with the link can see this page.",
};
