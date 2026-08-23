/**
 * Every label, hint and refusal in the reservation form. It is the longest
 * namespace on the site because a booking can fail in a great many ways and
 * each one deserves a sentence a guest can act on.
 *
 * The last few keys are not about failing at all. Once a request is stored,
 * /api/reserve hands back the link to that table's own guest pass, and the
 * success screen offers it to the one person who can pass it on. Those lines
 * are the closest thing the site has to the café leaning over and saying "here,
 * send this to the others" — so they are short, and they ask for nothing.
 */
export const reservationFormNl = {
  name: "Naam",
  email: "E-mailadres",
  phone: "Telefoonnummer",
  phoneHint: "Alleen voor het geval we je iets moeten vragen.",
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
  /**
   * A sitting that is already given away. The form learns which ones from
   * /api/availability the moment a date is picked, so the word arrives before
   * the guest has typed anything rather than as a refusal afterwards. "Vol" is
   * what they would be told on the phone; "niet beschikbaar" is what a website
   * says.
   */
  timeOptionFull: (slot: string) => `${slot} uur \u2014 vol`,
  /** Shown before a date has been picked, when the day is still unknown. */
  timeHint: "Kies een datum, dan laten we zien welke tijden vrij zijn.",
  /** Once the day is known, the hours come straight uit de openingstijden. */
  timeHintForDay: (hours: string, last: string) =>
    `Open ${hours}. Laatste tafel om ${last} uur.`,
  /**
   * Every sitting that day is taken, so picking another time is not the
   * answer. Says the same thing as `errors.dayFull` and stays a separate line
   * because this one is read before the button, where it can still save
   * somebody the trouble.
   */
  timeDayFull: "Deze dag zit vol. Kies een andere datum, of bel ons even.",
  notes: "Opmerkingen",
  notesHint:
    "Allergieën, een verjaardag, een kinderstoel, een rustige tafel: laat het weten.",
  honeypot: "Laat dit veld leeg",
  /**
   * The offer to be remembered, and the line under it. Both sit beside the
   * button because that is where they can be read honestly: a tickbox at the
   * top of a form is a setting to be decided before you know what you are
   * deciding about, while one beside the button is an offer made to somebody
   * who has just finished typing the very thing being offered back.
   *
   * Worded as an offer throughout, and in the guest's own voice. "Onthoud mijn
   * gegevens" is something they ask us to do; "Gegevens onthouden" would be a
   * preference, and a preference wants a settings screen and an explanation.
   * The box starts empty and ticking it does nothing whatever until a booking
   * has actually gone through.
   */
  remember:
    "Onthoud mijn gegevens op dit apparaat, dan hoef ik ze de volgende keer niet opnieuw in te typen.",
  /**
   * The whole of what happens to those three fields, in one sentence, in the
   * register of the mailing list's "hooguit een mail per maand, nooit spam".
   * Short because everything it has to say is small: het blijft hier, wij zien
   * het niet, en het gaat weg zodra je dat wilt. Every clause of it is literally
   * true of localStorage and would not have been of a cookie — zie de kop van
   * src/lib/rememberMe.ts.
   */
  rememberNote:
    "Alleen in deze browser, op dit apparaat. Er wordt niets naar ons verstuurd, en je haalt het er zelf zo weer uit.",
  /**
   * Shown above the form when the fields arrived already filled in. A form that
   * silently knows your telefoonnummer is unsettling until it says how it knows,
   * so it says so first, in one line, before anything else is read.
   */
  rememberedNotice:
    "Je naam, e-mailadres en telefoonnummer stonden nog op dit apparaat, dus die hebben we alvast ingevuld.",
  /**
   * Beside that line: empties the three fields and wipes what was stored, in
   * one go. Phrased as the guest's own conclusion rather than as an
   * instruction, because the person most likely to need it is somebody else on
   * the household laptop who has just been called by the wrong name.
   */
  rememberedForget: "Dit ben ik niet \u2014 vergeet mijn gegevens",
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
    phoneRequired:
      "Vul je telefoonnummer in, voor het geval we ergens op moeten terugkomen.",
    emailRequired: "Vul je e-mailadres in.",
    emailInvalid: "Vul een geldig e-mailadres in.",
    phoneTooLong: "Je telefoonnummer is te lang.",
    /**
     * The Gelegenheid field is gone from the form: asking a stranger why they
     * are coming out to eat reads as nosy, and the one useful answer to it —
     * a birthday — belongs in the notes with the allergies and the high chair.
     * The server still validates the column for browsers holding an older copy
     * of the page, so the sentence has to stay here to be shown.
     */
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
    /**
     * The three refusals that come from the owners rather than from the clock:
     * online reserveren switched off in the CMS, that half hour already
     * seated, or the whole day seated. `dayFull` and `slotFull` are kept apart
     * on purpose — one of them is worth trying another time for, the other is
     * not, and telling a guest to pick another time on a day that has nothing
     * left is the sort of small lie that costs a table.
     */
    reservationsClosed:
      "Online reserveren staat op dit moment uit. Bel of mail ons gerust, dan regelen we het samen.",
    slotFull:
      "Dat tijdstip is helaas vol. Kies een andere tijd, of bel ons \u2014 soms lukt er meer dan de agenda laat zien.",
    dayFull:
      "Die dag zit helemaal vol. Kies een andere datum, of bel ons \u2014 soms lukt er meer dan de agenda laat zien.",
    server: "Er ging iets mis aan onze kant. Probeer het opnieuw.",
  },
  successTitle: "Bedankt, we hebben het ontvangen",
  successText:
    "Je aanvraag staat genoteerd; een bevestiging is het nog niet. Je hoort van ons of de tafel vrij is.",
  /**
   * The one line about the link, on the screen the guest is looking at the
   * second they have booked. It is the only way the address reaches them: the
   * owners get it in their notification mail, and there is no mail to the guest
   * yet at all.
   *
   * Deliberately not the wording from src/i18n/dict/guestPass.ts, which says
   * much the same thing on the pass itself. There, the reader has the page open
   * in front of them and can see what it is; here, nobody has seen it yet, so
   * this has to say what the link leads to before it asks anyone to send it on.
   */
  shareText:
    "Dit is de pagina van jullie tafel. Stuur hem door naar wie er meekomt \u2014 zij zien wanneer en waar, en kunnen hun wensen alvast doorgeven.",
  copyLink: "Kopieer de link",
  copied: "Gekopieerd",
  shareWhatsApp: "Stuur via WhatsApp",
  /** What WhatsApp opens with. The guest may rewrite every word of it. */
  whatsAppMessage: (url: string) =>
    `Ik heb een tafel geregeld. Hier staan de details, en je kunt doorgeven of je erbij bent: ${url}`,
  successAgain: "Nog een tafel reserveren",
};

export type ReservationFormDict = typeof reservationFormNl;

export const reservationFormEn: ReservationFormDict = {
  name: "Name",
  email: "Email address",
  phone: "Phone number",
  phoneHint: "Only in case we need to ask you something.",
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
  timeOptionFull: (slot: string) => `${slot} \u2014 fully booked`,
  timeHint: "Choose a date and we will show you which times are free.",
  timeHintForDay: (hours: string, last: string) =>
    `Open ${hours}. Last table at ${last}.`,
  timeDayFull:
    "That day is fully booked. Please choose another date, or give us a ring.",
  notes: "Notes",
  notesHint:
    "Allergies, a birthday, a high chair, a quiet table: do let us know.",
  honeypot: "Leave this field empty",
  remember:
    "Remember my details on this device, so I do not have to type them again next time.",
  rememberNote:
    "In this browser, on this device only. Nothing is sent to us, and you can take it out again yourself whenever you like.",
  rememberedNotice:
    "Your name, email address and phone number were still on this device, so we have filled them in for you.",
  rememberedForget: "This is not me \u2014 forget my details",
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
    phoneRequired:
      "Please fill in your phone number, in case we need to check something with you.",
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
    reservationsClosed:
      "Online booking is switched off at the moment. Do call or email us and we will sort it out together.",
    slotFull:
      "That time is fully booked. Please pick another time, or call us \u2014 sometimes more is possible than the diary shows.",
    dayFull:
      "That day is fully booked. Please pick another date, or call us \u2014 sometimes more is possible than the diary shows.",
    server: "Something went wrong on our side. Please try again.",
  },
  successTitle: "Thank you, we have got it",
  successText:
    "Your request is noted; it is not a confirmation yet. We will let you know whether the table is free.",
  shareText:
    "This is your table's own page. Send it on to whoever is coming \u2014 they will see when and where, and can pass on their wishes in advance.",
  copyLink: "Copy the link",
  copied: "Copied",
  shareWhatsApp: "Send on WhatsApp",
  whatsAppMessage: (url: string) =>
    `I have booked us a table. All the details are here, and you can let them know whether you are joining: ${url}`,
  successAgain: "Book another table",
};
