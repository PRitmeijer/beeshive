/**
 * Every label, hint and refusal in the reservation form. It is the longest
 * namespace on the site because a booking can fail in a great many ways and
 * each one deserves a sentence a guest can act on.
 */
export const reservationFormNl = {
  name: "Naam",
  email: "E-mailadres",
  phone: "Telefoonnummer",
  phoneHint: "Hierop bellen we je om de tafel te bevestigen.",
  guests: "Aantal personen",
  guestsHint: "Maximaal 20 personen.",
  date: "Datum",
  datePlaceholder: "Kies een dag",
  dateHint: "Alleen de dagen waarop we open zijn staan in de lijst.",
  time: "Tijd",
  timePlaceholder: "Kies een tijd",
  timeNeedsDate: "Kies eerst een datum",
  timeNoneThatDay: "Deze dag zijn we gesloten",
  timeOption: (slot: string) => `${slot} uur`,
  /** Shown before a date has been picked, when the day is still unknown. */
  timeHint: "Kies een datum, dan laten we zien welke tijden vrij zijn.",
  /** Once the day is known, the hours come straight uit de openingstijden. */
  timeHintForDay: (hours: string, last: string) =>
    `Open ${hours}. Laatste tafel om ${last} uur.`,
  occasion: "Gelegenheid",
  occasionPlaceholder: "Verjaardag, familiediner, zomaar",
  notes: "Opmerkingen",
  notesHint: "Allergieën, een kinderstoel, een rustige tafel: laat het weten.",
  honeypot: "Laat dit veld leeg",
  submit: "Reserveren",
  submitting: "Bezig...",
  error: "Er ging iets mis. Probeer het opnieuw.",
  /**
   * One line per refusal /api/reserve can answer with. The keys are the
   * codes in src/lib/reservationErrors.ts; the server picks the code, this
   * table picks the words. Anything unrecognised falls back to `error`.
   */
  errors: {
    rateLimited:
      "Je hebt net al een aanvraag gestuurd. Probeer het over een paar minuten opnieuw.",
    badRequest: "We konden het formulier niet lezen. Probeer het opnieuw.",
    tooLarge: "Je bericht is te lang. Kort het wat in en probeer het opnieuw.",
    nameRequired: "Vul je naam in.",
    nameTooLong: "Je naam is te lang.",
    phoneRequired: "Vul je telefoonnummer in, daarop bevestigen we de tafel.",
    emailRequired: "Vul je e-mailadres in.",
    emailInvalid: "Vul een geldig e-mailadres in.",
    phoneTooLong: "Je telefoonnummer is te lang.",
    occasionTooLong: "De gelegenheid is te lang.",
    notesTooLong: "Je opmerking is te lang, houd het onder 2000 tekens.",
    guestsInvalid: "Vul een aantal personen in tussen 1 en 20.",
    dateRequired: "Kies een datum.",
    dateInvalid: "Die datum bestaat niet. Kies een geldige datum.",
    datePast: "Kies een datum vanaf vandaag.",
    dateTooFar: "Kies een datum binnen een jaar, bel ons voor later.",
    timeInvalid: "Kies een tijd.",
    dayClosed: "Op die dag zijn we gesloten. Kies een andere datum.",
    timeOutsideHours:
      "Die tijd valt buiten onze openingstijden. Kies een tijd uit de lijst.",
    timePassed:
      "Die tijd is al geweest. Kies een latere tijd, of bel ons voor vandaag.",
    server: "Er ging iets mis aan onze kant. Probeer het opnieuw.",
  },
  successTitle: "Bedankt, we hebben het ontvangen",
  successText: "We nemen contact met je op om de tafel te bevestigen.",
  successAgain: "Nog een tafel reserveren",
};

export type ReservationFormDict = typeof reservationFormNl;

export const reservationFormEn: ReservationFormDict = {
  name: "Name",
  email: "Email address",
  phone: "Phone number",
  phoneHint: "We ring this number to confirm your table.",
  guests: "Number of guests",
  guestsHint: "Up to 20 guests.",
  date: "Date",
  datePlaceholder: "Choose a day",
  dateHint: "Only the days we are open are listed.",
  time: "Time",
  timePlaceholder: "Choose a time",
  timeNeedsDate: "Choose a date first",
  timeNoneThatDay: "We are closed that day",
  timeOption: (slot: string) => `${slot}`,
  timeHint: "Choose a date and we will show you which times are free.",
  timeHintForDay: (hours: string, last: string) =>
    `Open ${hours}. Last table at ${last}.`,
  occasion: "Occasion",
  occasionPlaceholder: "Birthday, family dinner, no reason at all",
  notes: "Notes",
  notesHint: "Allergies, a high chair, a quiet table: do let us know.",
  honeypot: "Leave this field empty",
  submit: "Book a table",
  submitting: "Sending...",
  error: "Something went wrong. Please try again.",
  errors: {
    rateLimited:
      "You have just sent a request. Please try again in a few minutes.",
    badRequest: "We could not read the form. Please try again.",
    tooLarge: "Your message is too long. Shorten it and try again.",
    nameRequired: "Please fill in your name.",
    nameTooLong: "Your name is too long.",
    phoneRequired: "Please fill in your phone number; that is how we confirm the table.",
    emailRequired: "Please fill in your email address.",
    emailInvalid: "Please fill in a valid email address.",
    phoneTooLong: "Your phone number is too long.",
    occasionTooLong: "The occasion is too long.",
    notesTooLong: "Your note is too long, please keep it under 2000 characters.",
    guestsInvalid: "Please enter a number of guests between 1 and 20.",
    dateRequired: "Please choose a date.",
    dateInvalid: "That date does not exist. Please choose a valid date.",
    datePast: "Please choose a date from today onwards.",
    dateTooFar: "Please choose a date within a year, and call us for anything later.",
    timeInvalid: "Please choose a time.",
    dayClosed: "We are closed that day. Please choose another date.",
    timeOutsideHours:
      "That time falls outside our opening hours. Please pick one from the list.",
    timePassed:
      "That time has already passed. Pick a later one, or call us for today.",
    server: "Something went wrong on our side. Please try again.",
  },
  successTitle: "Thank you, we have got it",
  successText: "We will be in touch to confirm your table.",
  successAgain: "Book another table",
};
