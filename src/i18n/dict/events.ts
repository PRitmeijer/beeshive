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
 */
export const eventsNl = {
  metaTitle: (name: string) => `Evenementen | ${name}`,
  metaDescription:
    "Workshops, live muziek, proeverijen en thema-avonden bij De Bee's Hive in Zuilen. Bekijk wat er binnenkort op de agenda staat.",
  eyebrow: "Wat er speelt",
  title: "Evenementen",
  intro:
    "Van live muziek tot een avond koken met de buurt: er is bijna altijd iets te doen.",
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
};

export type EventsDict = typeof eventsNl;

export const eventsEn: EventsDict = {
  metaTitle: (name: string) => `Events | ${name}`,
  metaDescription:
    "Workshops, live music, tastings and themed evenings at De Bee's Hive in Zuilen. See what is coming up.",
  eyebrow: "What's on",
  title: "Events",
  intro:
    "From live music to an evening of cooking with the neighbourhood: there is nearly always something on.",
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
};
