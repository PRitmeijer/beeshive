/**
 * Wording around the opening hours block. The times themselves are typed into
 * the CMS; these are the words that frame them.
 *
 * `closed` is doing double duty: it is the default the CMS ships with and the
 * string the rendering code matches case-insensitively to decide a day is shut,
 * so changing it means changing both sides at once.
 */
export const hoursNl = {
  heading: "Openingstijden",
  closedToday: "Vandaag gesloten",
  todayIs: (hours: string) => `Vandaag ${hours}`,
  openNow: "Nu open.",
  allTimes: "Alle tijden",
  /** Written into the CMS defaults and matched case-insensitively. */
  closed: "Gesloten",
};

export type HoursDict = typeof hoursNl;

export const hoursEn: HoursDict = {
  heading: "Opening hours",
  closedToday: "Closed today",
  todayIs: (hours: string) => `Today ${hours}`,
  openNow: "Open now.",
  allTimes: "All hours",
  closed: "Closed",
};
