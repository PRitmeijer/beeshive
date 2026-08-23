/**
 * Month and weekday names, kept together because they are the same kind of
 * thing: a fixed list whose order carries meaning and must never be sorted.
 *
 * We write them out by hand rather than asking Intl, because the weekday names
 * also have to match the rows the owners fill in under Openingstijden, and a
 * runtime-formatted name would drift the moment a Node version changed its
 * casing.
 */

/** Month names, January first, for writing a date out in full. */
export const monthsNl = [
  "januari",
  "februari",
  "maart",
  "april",
  "mei",
  "juni",
  "juli",
  "augustus",
  "september",
  "oktober",
  "november",
  "december",
];

export type MonthsDict = typeof monthsNl;

export const monthsEn: MonthsDict = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Weekday names, Monday first, used to match the CMS opening hours rows. */
export const weekdaysNl = [
  "Maandag",
  "Dinsdag",
  "Woensdag",
  "Donderdag",
  "Vrijdag",
  "Zaterdag",
  "Zondag",
];

export type WeekdaysDict = typeof weekdaysNl;

export const weekdaysEn: WeekdaysDict = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
