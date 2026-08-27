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

/**
 * "1 persoon" or "2 personen", written once.
 *
 * Half a dozen sentences in this file name a party size — the full day, the
 * empty window, the docket at the top of the details screen, three of the
 * announcements — and a table for one is not a rare case: it is the guest
 * eating at the bar with a book. Spelling the plural out at each of those call
 * sites is six chances to write "1 personen" and only ever find five of them.
 */
const peopleNl = (n: number) => (n === 1 ? "1 persoon" : `${n} personen`);
const peopleEn = (n: number) => (n === 1 ? "1 guest" : `${n} guests`);

export const reservationFormNl = {
  name: "Naam",
  email: "E-mailadres",
  phone: "Telefoonnummer",
  people: peopleNl,
  /**
   * The ceiling is a CMS setting — "Grootste gezelschap" in Site Instellingen
   * — so the sentence takes it rather than naming twenty. It said twenty for
   * as long as it was a constant in the component, which meant an owner who
   * lowered it to twelve had a form promising a party of twenty and refusing
   * one of fourteen.
   */
  guestsHint: (max: number) => `Maximaal ${max} personen.`,
  /**
   * A party of twenty-two is not a refusal, it is a phone call, and the form
   * used to leave them at a dead end: a number the field would not accept and
   * nothing to do about it but close the page. The three parts are the shape
   * this file already uses wherever a sentence has a link in the middle of it
   * (see `reserve.elseBefore` and the blog's CMS notice), because splicing an
   * anchor into a translated string is how word order gets decided by the JSX
   * instead of by the language.
   */
  guestsMoreBefore: "Met meer? ",
  guestsMoreLink: "Neem contact op",
  guestsMoreAfter: " en we kijken samen wat er kan.",

  /**
   * The three questions the flow asks, in the order it asks them, and the one
   * word that undoes any of them.
   *
   * They are headings on a sheet of paper rather than field labels: each one
   * stands over an open band while it is being answered and stays on the same
   * line as the answer once it is, which is the whole of what makes an
   * accordion legible. "Aantal personen" is the label on a form; "Voor hoeveel
   * personen" is the question a waiter asks, and the difference is the whole
   * register of this flow.
   */
  partyLegend: "Voor hoeveel personen",
  dateLegend: "Wanneer",
  timeLegend: "Hoe laat",
  /**
   * Lower case, and a word rather than a pencil. It sits at the end of a line
   * that already reads "Wanneer — zaterdag 29 augustus", where a capital would
   * make it a second heading and an icon would make it a puzzle.
   */
  changeAnswer: "wijzig",
  /** What that word means when it is read out on its own, band by band. */
  changeLabel: (what: string) => `Wijzig ${what.toLowerCase()}`,

  /**
   * The last tile. It is "6+" and not "7+" because the list beneath it starts
   * at six: a tile promising seven over a menu offering six is the sort of
   * small contradiction that makes somebody count their own party twice.
   */
  partyMore: "6+",
  partyMoreLabel: "Met hoeveel zijn jullie?",
  /**
   * The whole horizon is shut, or full for a party this size — which is why
   * the sentence names the size. Rare, but the band would otherwise be an
   * empty rule with nothing to say for itself.
   */
  dateNoneForParty: (people: string) =>
    `Er staat op dit moment geen dag open voor ${people}. Bel of mail ons gerust, dan kijken we samen.`,

  /**
   * The three days offered before anybody opens a calendar.
   *
   * "Vanavond" is the whole reason the chips beat the grid, and it is also the
   * one that can be a small lie — a café open from eleven has plenty of days
   * whose remaining sittings are lunch — so the flow only reaches for it when
   * the first free sitting really is an evening one, and "Vandaag" carries the
   * rest. Everything past tomorrow is called by its weekday, which is how
   * somebody deciding between two Saturdays thinks about it.
   */
  tonight: "Vanavond",
  todayWord: "Vandaag",
  tomorrow: "Morgen",
  /**
   * The month grid, behind one tap. It has to be visible without scrolling and
   * it must not read as a footnote: some guests want a particular Saturday
   * three weeks out, and for them this is the whole control.
   */
  otherDay: "Andere dag",
  /** The two ways through the months, for the buttons either side of the head. */
  monthPrevious: "Vorige maand",
  monthNext: "Volgende maand",
  /**
   * The column heads. Two letters because seven of them have to fit across the
   * narrowest phone beside a day number, and because "ma di wo do vr za zo" is
   * how a Dutch wall calendar prints them. The full name is on every cell's own
   * label, so nothing is lost to a screen reader.
   */
  weekdayShort: ["ma", "di", "wo", "do", "vr", "za", "zo"],
  /**
   * What a day that cannot be chosen is, said in words rather than in grey.
   *
   * Closed and full are kept apart here for the same reason /api/reserve keeps
   * `dayClosed` and `dayFull` apart: one of them is answered by trying another
   * time, the other only by trying another day. A guest who is told "vol"
   * about a Saturday knows to look at the next one; one who is told nothing at
   * all taps the square again.
   */
  dayClosedLabel: (day: string) => `${day}, gesloten`,
  dayFullLabel: (day: string) => `${day}, vol`,
  /**
   * The two ends of the calendar, and why they are two lines and not one.
   *
   * They were one for a while, and it was `dayBeyondLabel` for both: a month
   * grid draws the days before today as well as the days after the horizon,
   * so a reader arrowing off today to the left was told the 23rd of August was
   * "nog niet te reserveren" — a sentence about a day that is over. "Geweest"
   * is the word the café would use on the telephone, and it is the same one
   * `errors.timePassed` already uses about an hour that has gone by.
   */
  dayPastLabel: (day: string) => `${day}, geweest`,
  dayBeyondLabel: (day: string) => `${day}, nog niet te reserveren`,
  timeOption: (slot: string) => `${slot} uur`,
  /**
   * The six honest answers.
   *
   * Four of them used to be the same grey silence, and the fifth was a column
   * of struck-through chips. Each is a different situation with a different
   * thing to do about it, so each gets its own sentence and its own way
   * forward, and none of them is a dead end. The sixth, `dayOverOn`, was
   * carved out of the first: "we zijn dicht" was being said about an evening
   * the café was open on and had merely stopped taking bookings for.
   *
   * The full day names the party size, and that is not decoration: a Saturday
   * with no room for six may have a table for two, so "we zitten vol" on its
   * own is a sentence that turns away a booking the café could have taken. It
   * is also the one place where the telephone outranks the form — the diary
   * shows what is booked and not what the owners can shuffle, and they would
   * rather be rung.
   */
  fullAt: (times: string) => `Vol om ${times}.`,
  /**
   * "19:00 en 19:30", or "19:00, 19:30 en 20:00".
   *
   * Written out rather than comma-separated, because both lines that use it are
   * read as sentences and a list with an "en" in it is how a person says which
   * two sittings have gone. It lives in the dictionary rather than beside
   * either call site because the joining word is the one part of it that is
   * language and not formatting.
   */
  joinTimes: (times: string[]) =>
    times.length <= 1
      ? times.join("")
      : `${times.slice(0, -1).join(", ")} en ${times[times.length - 1]}`,
  dayClosedOn: (day: string) => `${day} zijn we dicht.`,
  /**
   * Open, and nothing left to book. Two very different days end here and one
   * sentence is true of both: tonight after the laatste tijdstip has gone by,
   * and a dag waarop de ingestelde tijd vóór sluiting alle tijdstippen opeet.
   *
   * It used to be `dayClosedOn` for both, which said "we zijn dicht" about an
   * evening the café was open and serving — the sort of sentence a guest reads
   * at half past acht, believes, and acts on by not coming. This is the same
   * wording `announceDayOver` has always spoken aloud, so what is heard and
   * what is printed about one day are one sentence.
   */
  dayOverOn: (day: string) => `Voor ${day} kunnen we niets meer aannemen.`,
  dayFullForParty: (day: string, people: string) =>
    `${day} zitten we vol voor ${people}.`,
  /** Offered under a dead end, with the day itself as a chip beneath it. */
  nextOpenLead: "De eerstvolgende dag die wel kan:",
  callUs: "Bel ons even, soms schuift er iets.",
  /**
   * Past the horizon the owners set. The month arrows stop at that month
   * rather than paging into a wall of dim numerals, so this is read by
   * somebody who arrived on an old link rather than by somebody who wandered.
   */
  beyondHorizon: (day: string) =>
    `We nemen reserveringen aan tot en met ${day}. Verder vooruit? Bel of mail ons.`,

  /**
   * What is said out loud when a band folds shut and the next one opens.
   *
   * One live region per screen, reused, never two competing. The band that
   * just closed took the control that was pressed with it, so without these a
   * screen reader is left saying nothing at all at the exact moment the screen
   * changed underneath it.
   */
  announceDate: (day: string) => `Datum gekozen: ${day}. Kies nu een tijd.`,
  announceTime: (time: string) => `Tijd gekozen: ${time} uur.`,
  announceCalendar: "De kalender staat open. Kies een dag.",
  announceTimeGone: (time: string, others: string) =>
    `${time} zit vol. ${others} ${others.includes(" en ") ? "zijn" : "is"} nog vrij.`,
  /** The same, when there is nothing left of that evening to offer instead. */
  announceTimeGoneAlone: (time: string) => `${time} zit vol.`,
  /**
   * A sitting that is not gone but simply is not there any more.
   *
   * The owners narrow a day in de CMS — an afwijkende dag that closes at zes —
   * and the half past negen somebody had already chosen stops existing rather
   * than filling up. "Vol" would be the wrong word for it twice over: nobody
   * booked it, and it is not going to free up either.
   */
  announceTimeOffGrid: (time: string, others: string) =>
    `${time} kan op deze dag niet meer. ${others} ${others.includes(" en ") ? "kunnen" : "kan"} wel.`,
  announceTimeOffGridAlone: (time: string) =>
    `${time} kan op deze dag niet meer.`,
  /**
   * The party grew and took the evening with it. Two sentences rather than
   * one, because the two situations are answered differently: a time that is
   * gone leaves the day standing, and a day that is gone does not.
   *
   * Both of these put the party size first, because in these two the party
   * size is the news: nothing changed about the Saturday, the guest changed
   * their mind about how many were coming and the Saturday no longer fits.
   * `announceDayFull` below is the same fact without that cause, and it reads
   * the other way round for the same reason.
   */
  announcePartyTimeGone: (people: string, time: string) =>
    `Voor ${people} is ${time} vol. Dit zijn de tijden die wel kunnen.`,
  announcePartyDayGone: (people: string, day: string) =>
    `Voor ${people} is ${day} vol. Kies een andere dag.`,
  /**
   * The five ways a chosen day can stop being bookable, each with its own
   * sentence, because for a long time all five were announced as "vol".
   *
   * A guest who cannot see the screen hears only this line, so a Tuesday the
   * café is shut being announced as full is not a rough edge — it is the whole
   * of what they were told, and it is false. "Vol" belongs to exactly one of
   * the five, and only that one names the party size: a Saturday with no room
   * for six may still have a table for two, so the number is part of the fact.
   */
  announceDayClosed: (day: string) => `${day} zijn we dicht. Kies een andere dag.`,
  announceDayFull: (day: string, people: string) =>
    `${day} zit vol voor ${people}. Kies een andere dag.`,
  announceDayOver: (day: string) =>
    `Voor ${day} kunnen we niets meer aannemen. Kies een andere dag.`,
  announceDayPast: (day: string) => `${day} is geweest. Kies een andere dag.`,
  announceDayBeyond: (day: string) =>
    `${day} ligt verder vooruit dan we nu kunnen boeken. Kies een andere dag.`,
  /**
   * Online reserveren staat uit in de CMS. Two places show it: the reserveren
   * page, which prints it where the form would have been, and the booking
   * sheet on phones. The sentence itself is `errors.reservationsClosed`, the
   * same one the endpoint's refusal carries, so a guest cannot be told two
   * different things about one switch.
   */
  closedHeading: "Reserveren gaat nu even telefonisch",
  /**
   * The other reason /reserveren/gegevens can refuse, and it is not the one
   * above.
   *
   * That page is a real URL with a party size, a day and a sitting in it, so it
   * gets pasted into WhatsApp and opened three days later, and it gets typed at
   * by hand. Every one of those refusals — a party of ninety-nine, a date that
   * does not exist, a Tuesday we are shut, an evening that has gone — wore the
   * telephone heading for a while, which told the guest that online booking was
   * off when it was running perfectly well and the link was simply stale. This
   * heading says what is actually the matter: the request, not the café.
   */
  degradedHeading: "Deze reservering kunnen we zo niet aannemen",
  /**
   * And the way back, which is the accordion with the whole window in front of
   * it. It was labelled "Andere dag" — the calendar's own label — which promised
   * a calendar and delivered the entire form, and which was plainly wrong for
   * the half of these refusals where the day is fine and the sitting is not.
   */
  pickAnotherSlot: "Kies een andere dag of tijd",
  notes: "Opmerkingen",
  /**
   * The notes box, folded away behind one line.
   *
   * Most tables have nothing to say and a four-row textarea asks all of them
   * the question anyway. The three examples are in the link rather than in a
   * hint underneath it, so the guest who has an allergy to declare recognises
   * themselves in the line and everybody else reads past it.
   */
  notesReveal:
    "Iets wat we moeten weten? (allergieën, kinderstoel, gelegenheid)",
  honeypot: "Laat dit veld leeg",
  /**
   * The offer to be remembered. It sits beside the
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
  remember: "Onthoud mijn gegevens op dit apparaat",
  /**
   * A remembered guest, and the whole of screen two collapsed into one line.
   *
   * Three prefilled fields are still three fields to read past, and reading
   * past them is the only thing left between a regular and their table. So the
   * fields fold away behind their own answer and the button is one tap below
   * it. The two ways out are in the same line and they are different: "wijzig"
   * opens the fields with the details still in them, "iemand anders" is the
   * partner on the household laptop who has just been called by the wrong
   * name, and for them the details go entirely.
   */
  filledInAs: (name: string) => `Ingevuld als ${name}`,
  someoneElse: "iemand anders",
  /**
   * The docket at the top of the details screen. It is a heading rather than a
   * card: the same three facts a waiter writes on the pad, between two rules,
   * with nothing round them.
   */
  docketHeading: (people: string) => `Tafel voor ${people}`,
  /** Back to the accordion. The one navigation on screen two. */
  backToWhen: "Wijzigen",
  /**
   * Somebody else took the table while this one was being typed.
   *
   * Not an error paragraph under the button: the docket itself is replaced by
   * what happened, and that day's remaining sittings are printed straight
   * underneath so one tap re-points the booking. Nothing typed is ever cleared
   * — being refused at the button must never cost a guest a keystroke.
   */
  slotJustTaken: (time: string) => `Net weg — ${time} is zojuist geboekt.`,
  stillFree: "Deze tijden zijn er nog:",
  submit: "Reserveer deze tafel",
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
    notesTooLong: "Je opmerking is te lang, houd het onder 2000 tekens.",
    guestsInvalid: (max: number) =>
      `Vul een aantal personen in tussen 1 en ${max}.`,
    dateRequired: "Kies een datum.",
    dateInvalid: "Die datum bestaat niet. Kies een geldige datum.",
    datePast: "Kies een datum vanaf vandaag.",
    /**
     * The number comes from the endpoint, which sends the horizon it just
     * measured against beside the code. This line used to say "binnen een
     * jaar" — left over from when the endpoint really did allow one — while
     * anything past ninety days was refused, so a guest who had picked a date
     * eleven weeks out tried another one inside the year and was refused
     * again, by the same sentence.
     */
    dateTooFar: (days: number) =>
      `Zo ver vooruit kunnen we nog niet boeken. Kies een datum binnen ${days} dagen, of bel ons.`,
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
      "Dat tijdstip is helaas vol. Kies een andere tijd, of bel ons: soms lukt er meer dan de agenda laat zien.",
    dayFull:
      "Die dag zit helemaal vol. Kies een andere datum, of bel ons: soms lukt er meer dan de agenda laat zien.",
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
  calendarText:
    "Zet de avond meteen in je agenda, dan hoef je er niet meer aan te denken.",
  addToCalendar: "Zet in mijn agenda",
  shareText:
    "Dit is de pagina van jullie tafel. Stuur hem door naar wie er meekomt: zij zien wanneer en waar, kunnen doorgeven wat ze niet eten, en zetten hem in hun eigen agenda.",
  copyLink: "Kopieer de link",
  copied: "Gekopieerd",
  shareWhatsApp: "Stuur via WhatsApp",
  /** What WhatsApp opens with. The guest may rewrite every word of it. */
  whatsAppMessage: (url: string) =>
    `Ik heb een tafel geregeld. Hier staat alles: wanneer, waar, en zo in je agenda: ${url}`,
  successAgain: "Nog een tafel reserveren",
};

export type ReservationFormDict = typeof reservationFormNl;

export const reservationFormEn: ReservationFormDict = {
  name: "Name",
  email: "Email address",
  phone: "Phone number",
  people: peopleEn,
  guestsHint: (max: number) => `Up to ${max} guests.`,
  guestsMoreBefore: "More than that? ",
  guestsMoreLink: "Get in touch",
  guestsMoreAfter: " and we will work it out together.",
  partyLegend: "How many of you",
  dateLegend: "When",
  timeLegend: "What time",
  changeAnswer: "change",
  changeLabel: (what: string) => `Change ${what.toLowerCase()}`,
  partyMore: "6+",
  partyMoreLabel: "How many of you are there?",
  dateNoneForParty: (people: string) =>
    `There is no day open for ${people} at the moment. Do call or email us and we will see what we can do.`,
  tonight: "Tonight",
  todayWord: "Today",
  tomorrow: "Tomorrow",
  otherDay: "Another day",
  monthPrevious: "Previous month",
  monthNext: "Next month",
  weekdayShort: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  dayClosedLabel: (day: string) => `${day}, closed`,
  dayFullLabel: (day: string) => `${day}, fully booked`,
  dayPastLabel: (day: string) => `${day}, already past`,
  dayBeyondLabel: (day: string) => `${day}, not open for booking yet`,
  timeOption: (slot: string) => `${slot}`,
  joinTimes: (times: string[]) =>
    times.length <= 1
      ? times.join("")
      : `${times.slice(0, -1).join(", ")} and ${times[times.length - 1]}`,
  fullAt: (times: string) => `Fully booked at ${times}.`,
  dayClosedOn: (day: string) => `We are closed on ${day}.`,
  dayOverOn: (day: string) => `We cannot take any more bookings for ${day}.`,
  dayFullForParty: (day: string, people: string) =>
    `We are fully booked for ${people} on ${day}.`,
  nextOpenLead: "The next day we can do:",
  callUs: "Do give us a ring — sometimes something shifts.",
  beyondHorizon: (day: string) =>
    `We take bookings up to and including ${day}. Further ahead than that? Call or email us.`,
  announceDate: (day: string) => `Date chosen: ${day}. Now pick a time.`,
  announceTime: (time: string) => `Time chosen: ${time}.`,
  announceCalendar: "The calendar is open. Pick a day.",
  announceTimeGone: (time: string, others: string) =>
    `${time} is fully booked. ${others} ${others.includes(" and ") ? "are" : "is"} still free.`,
  announceTimeGoneAlone: (time: string) => `${time} is fully booked.`,
  announceTimeOffGrid: (time: string, others: string) =>
    `${time} is no longer one of this day's times. ${others} ${others.includes(" and ") ? "are" : "is"} available.`,
  announceTimeOffGridAlone: (time: string) =>
    `${time} is no longer one of this day's times.`,
  announcePartyTimeGone: (people: string, time: string) =>
    `For ${people}, ${time} is fully booked. These are the times that do work.`,
  announcePartyDayGone: (people: string, day: string) =>
    `For ${people}, ${day} is fully booked. Please pick another day.`,
  announceDayClosed: (day: string) =>
    `We are closed on ${day}. Please pick another day.`,
  announceDayFull: (day: string, people: string) =>
    `${day} is fully booked for ${people}. Please pick another day.`,
  announceDayOver: (day: string) =>
    `We cannot take any more bookings for ${day}. Please pick another day.`,
  announceDayPast: (day: string) =>
    `${day} has already been. Please pick another day.`,
  announceDayBeyond: (day: string) =>
    `${day} is further ahead than we can book at the moment. Please pick another day.`,
  closedHeading: "Booking is by phone for now",
  degradedHeading: "We cannot take this booking as it stands",
  pickAnotherSlot: "Pick another day or time",
  notes: "Notes",
  notesReveal: "Anything we should know? (allergies, high chair, occasion)",
  honeypot: "Leave this field empty",
  remember: "Remember my details on this device",
  filledInAs: (name: string) => `Filled in as ${name}`,
  someoneElse: "someone else",
  docketHeading: (people: string) => `Table for ${people}`,
  backToWhen: "Change",
  slotJustTaken: (time: string) => `Just gone — ${time} has this minute been taken.`,
  stillFree: "These times are still free:",
  submit: "Book this table",
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
    notesTooLong: "Your note is too long, please keep it under 2000 characters.",
    guestsInvalid: (max: number) =>
      `Please enter a number of guests between 1 and ${max}.`,
    dateRequired: "Please choose a date.",
    dateInvalid: "That date does not exist. Please choose a valid date.",
    datePast: "Please choose a date from today onwards.",
    dateTooFar: (days: number) =>
      `We cannot take bookings that far ahead yet. Please choose a date within ${days} days, or give us a ring.`,
    timeInvalid: "Please choose a time.",
    dayClosed: "We are closed that day. Please choose another date.",
    timeOutsideHours:
      "That time falls outside our opening hours. Please pick one from the list.",
    timePassed:
      "That time has already passed. Pick a later one, or call us for today.",
    reservationsClosed:
      "Online booking is switched off at the moment. Do call or email us and we will sort it out together.",
    slotFull:
      "That time is fully booked. Please pick another time, or call us: sometimes more is possible than the diary shows.",
    dayFull:
      "That day is fully booked. Please pick another date, or call us: sometimes more is possible than the diary shows.",
    server: "Something went wrong on our side. Please try again.",
  },
  successTitle: "Thank you, we have got it",
  successText:
    "Your request is noted; it is not a confirmation yet. We will let you know whether the table is free.",
  calendarText:
    "Put the evening straight into your calendar, so you can stop holding it in your head.",
  addToCalendar: "Add to my calendar",
  shareText:
    "This is your table's own page. Send it on to whoever is coming: they will see when and where, can pass on what they do not eat, and put it in their own calendar.",
  copyLink: "Copy the link",
  copied: "Copied",
  shareWhatsApp: "Send on WhatsApp",
  whatsAppMessage: (url: string) =>
    `I have booked us a table. Everything is here: when, where, and straight into your calendar: ${url}`,
  successAgain: "Book another table",
};
