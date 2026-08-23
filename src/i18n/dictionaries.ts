import type { Locale } from "@/i18n/config";

import { aboutEn, aboutNl } from "@/i18n/dict/about";
import { blogEn, blogNl } from "@/i18n/dict/blog";
import {
  monthsEn,
  monthsNl,
  weekdaysEn,
  weekdaysNl,
} from "@/i18n/dict/calendar";
import { contactEn, contactNl } from "@/i18n/dict/contact";
import { dietaryEn, dietaryNl } from "@/i18n/dict/dietary";
import { eventsEn, eventsNl } from "@/i18n/dict/events";
import { footerEn, footerNl } from "@/i18n/dict/footer";
import { galleryEn, galleryNl } from "@/i18n/dict/gallery";
import { guestPassEn, guestPassNl } from "@/i18n/dict/guestPass";
import { homeEn, homeNl } from "@/i18n/dict/home";
import { hoursEn, hoursNl } from "@/i18n/dict/hours";
import { menuPageEn, menuPageNl } from "@/i18n/dict/menuPage";
import { navEn, navNl } from "@/i18n/dict/nav";
import { newsletterEn, newsletterNl } from "@/i18n/dict/newsletter";
import { notificationsEn, notificationsNl } from "@/i18n/dict/notifications";
import {
  reservationFormEn,
  reservationFormNl,
} from "@/i18n/dict/reservationForm";
import { reserveEn, reserveNl } from "@/i18n/dict/reserve";

/**
 * Every visible string that is written in the code rather than typed into the
 * CMS lives here, once per language.
 *
 * The words themselves are no longer in this file. Each namespace is a module
 * of its own under src/i18n/dict/, holding both languages side by side; this
 * file only stitches them into the two objects the site reads. That split is
 * the whole point: several people can write copy for different corners of the
 * site at once without ever meeting in the same diff.
 *
 * The Dutch object is still the source of truth. Each namespace derives its own
 * type from its Dutch half and annotates the English half with it, so English
 * cannot drift within a namespace; `Dict` is derived from the assembled Dutch
 * object, so a namespace cannot go missing from either language here. Anything
 * an editor can change (page copy, menu items, blog posts) belongs in Payload
 * instead, where it is stored per locale; see src/lib/payload.ts.
 *
 * Adding a namespace is two steps: write src/i18n/dict/<name>.ts in the shape
 * the neighbouring modules use (<name>Nl, <name>Dict, <name>En), then add two
 * lines below, one in `nl` and one in `en`. Nothing else needs to know.
 *
 * Two conventions worth keeping:
 *  - keys are grouped by the page or component that reads them;
 *  - a value that needs a runtime number or name is a function, so the word
 *    order stays inside the language rather than being spliced in the JSX.
 *
 * Because some values are functions, a Dict can never be handed to a client
 * component as a prop: functions are not serialisable across that boundary.
 * Pass the `locale` string instead and let the client component call getDict()
 * itself. This module has no server-only imports, so it bundles either side.
 */
const nl = {
  nav: navNl,
  footer: footerNl,
  hours: hoursNl,
  months: monthsNl,
  weekdays: weekdaysNl,
  home: homeNl,
  about: aboutNl,
  menuPage: menuPageNl,
  dietary: dietaryNl,
  gallery: galleryNl,
  blog: blogNl,
  events: eventsNl,
  contact: contactNl,
  reserve: reserveNl,
  reservationForm: reservationFormNl,
  guestPass: guestPassNl,
  newsletter: newsletterNl,
  notifications: notificationsNl,
} satisfies Record<string, unknown>;

export type Dict = typeof nl;

const en: Dict = {
  nav: navEn,
  footer: footerEn,
  hours: hoursEn,
  months: monthsEn,
  weekdays: weekdaysEn,
  home: homeEn,
  about: aboutEn,
  menuPage: menuPageEn,
  dietary: dietaryEn,
  gallery: galleryEn,
  blog: blogEn,
  events: eventsEn,
  contact: contactEn,
  reserve: reserveEn,
  reservationForm: reservationFormEn,
  guestPass: guestPassEn,
  newsletter: newsletterEn,
  notifications: notificationsEn,
};

const dictionaries: Record<Locale, Dict> = { nl, en };

export function getDict(locale: Locale): Dict {
  return dictionaries[locale];
}
