/**
 * The agenda: the overview page, a single event, and the small print around the
 * "zet in mijn agenda" button.
 *
 * Repeating events are described in words rather than by printing a rule, so a
 * visitor reads "Elke laatste zondag van de maand" instead of a schedule they
 * have to decode. That is why the recurrence keys take the weekday and the
 * ordinal as arguments: the word order belongs to the language, and Dutch and
 * English do not agree on it.
 *
 * The ordinals are their own little table for the same reason. They are only
 * ever used inside `everyMonthOn`, but keeping them separate means a monthly
 * event can be described without the code having to build "vierde" by hand.
 *
 * `everyMonthOnDate` takes the day as a number rather than a ready-made string
 * because the ordinal suffix is part of the language: Dutch writes 1ste, 2de,
 * 8ste, 20ste on a rule that has nothing to do with English's st/nd/rd/th. The
 * two halves of this file each keep their own rule, and neither the agenda nor
 * the shared expansion code in src/lib/events.ts has to know either of them.
 */
export const eventsNl = {
  metaTitle: (name: string) => `Evenementen | ${name}`,
  metaDescription:
    "Workshops, live muziek, proeverijen en thema-avonden bij De Bee's Hive in Zuilen. Bekijk wat er binnenkort op de agenda staat.",
  eyebrow: "Wat er speelt",
  title: "Evenementen",
  intro:
    "Live muziek, workshops, proeverijen: er is bijna altijd iets te doen.",
  empty: "Binnenkort staat hier weer iets op de agenda.",
  upcoming: "Binnenkort",
  recurring: "Elke week",
  past: "Geweest",
  allEvents: "Alle evenementen",
  readMore: "Lees meer",
  back: "Terug naar evenementen",
  addToCalendar: "Zet in mijn agenda",
  addToCalendarHint:
    "Je downloadt een .ics-bestand dat je in je eigen agenda opent.",
  appleCalendar: "Apple Agenda",
  googleCalendar: "Google Agenda",
  outlookCalendar: "Outlook",
  downloadIcs: "Download .ics",
  free: "Gratis",
  priceLabel: "Entree",
  whenLabel: "Wanneer",
  whereLabel: "Waar",
  bookingRequired: "Aanmelden nodig",
  signUp: "Aanmelden",
  today: "Vandaag",
  tomorrow: "Morgen",
  everyWeekOn: (weekday: string) => `Elke ${weekday.toLowerCase()}`,
  everyTwoWeeksOn: (weekday: string) =>
    `Om de week op ${weekday.toLowerCase()}`,
  everyMonthOn: (ordinal: string, weekday: string) =>
    `Elke ${ordinal} ${weekday.toLowerCase()} van de maand`,
  everyMonthOnDate: (day: number) =>
    `Elke ${day}${day === 1 || day === 8 || day >= 20 ? "ste" : "de"} van de maand`,
  ordinals: {
    first: "eerste",
    second: "tweede",
    third: "derde",
    fourth: "vierde",
    last: "laatste",
  },
  dateRange: (from: string, to: string) => `van ${from} tot ${to}`,
  timeRange: (from: string, to: string) => `${from} - ${to}`,
  allDay: "Hele dag",
  cancelled: "Gaat niet door",
  standingFixture: "Vaste afspraak",
  featured: "Uitgelicht",
  nextDate: (date: string) => `Eerstvolgend: ${date}`,
  nextDates: "Volgende keren",
  seriesIcs: "Hele serie (.ics)",
  subscribeCalendar: "Abonneer op de agenda",
  subscribeHint:
    "Voeg de agenda \u00e9\u00e9n keer toe en nieuwe avonden verschijnen er vanzelf bij.",
  calendarName: (name: string) => `Agenda ${name}`,
  eventMetaTitle: (title: string, name: string) => `${title} | ${name}`,
  monthHeading: (month: string, year: number) => `${month} ${year}`,
  categories: {
    buurt: "Buurt",
    muziek: "Muziek",
    workshop: "Workshop",
    proeverij: "Proeverij",
    feest: "Feest",
    overig: "Overig",
  },
};

export type EventsDict = typeof eventsNl;

export const eventsEn: EventsDict = {
  metaTitle: (name: string) => `Events | ${name}`,
  metaDescription:
    "Workshops, live music, tastings and themed evenings at De Bee's Hive in Zuilen. See what is coming up.",
  eyebrow: "What's on",
  title: "Events",
  intro:
    "Live music, workshops, tastings: there is nearly always something on.",
  empty: "Something new will appear on the agenda soon.",
  upcoming: "Coming up",
  recurring: "Every week",
  past: "Past",
  allEvents: "All events",
  readMore: "Read more",
  back: "Back to events",
  addToCalendar: "Add to my calendar",
  addToCalendarHint:
    "This downloads an .ics file that opens in your own calendar.",
  appleCalendar: "Apple Calendar",
  googleCalendar: "Google Calendar",
  outlookCalendar: "Outlook",
  downloadIcs: "Download .ics",
  free: "Free",
  priceLabel: "Entry",
  whenLabel: "When",
  whereLabel: "Where",
  bookingRequired: "Sign-up required",
  signUp: "Sign up",
  today: "Today",
  tomorrow: "Tomorrow",
  everyWeekOn: (weekday: string) => `Every ${weekday}`,
  everyTwoWeeksOn: (weekday: string) => `Every other ${weekday}`,
  everyMonthOn: (ordinal: string, weekday: string) =>
    `Every ${ordinal} ${weekday} of the month`,
  everyMonthOnDate: (day: number) => {
    const teen = day % 100 >= 11 && day % 100 <= 13;
    const suffix = teen
      ? "th"
      : day % 10 === 1
        ? "st"
        : day % 10 === 2
          ? "nd"
          : day % 10 === 3
            ? "rd"
            : "th";
    return `Every ${day}${suffix} of the month`;
  },
  ordinals: {
    first: "first",
    second: "second",
    third: "third",
    fourth: "fourth",
    last: "last",
  },
  dateRange: (from: string, to: string) => `from ${from} to ${to}`,
  timeRange: (from: string, to: string) => `${from} - ${to}`,
  allDay: "All day",
  cancelled: "Cancelled",
  standingFixture: "Standing fixture",
  featured: "Featured",
  nextDate: (date: string) => `Next: ${date}`,
  nextDates: "Coming dates",
  seriesIcs: "Whole series (.ics)",
  subscribeCalendar: "Subscribe to the agenda",
  subscribeHint:
    "Add the agenda once and new evenings turn up in it by themselves.",
  calendarName: (name: string) => `${name} agenda`,
  eventMetaTitle: (title: string, name: string) => `${title} | ${name}`,
  monthHeading: (month: string, year: number) => `${month} ${year}`,
  categories: {
    buurt: "Neighbourhood",
    muziek: "Music",
    workshop: "Workshop",
    proeverij: "Tasting",
    feest: "Party",
    overig: "Other",
  },
};
