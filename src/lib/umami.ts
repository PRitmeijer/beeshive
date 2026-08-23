/**
 * The browser side of the visitor counting.
 *
 * Umami's script hangs a single function off the window, `umami.track`, and
 * that function is absent far more often than anyone expects: the owners have
 * not switched measuring on yet, an ad blocker ate the script, the visitor is
 * on a connection where it has not finished loading, or the tab is the admin
 * where the script is never rendered at all. Every one of those is normal.
 *
 * So the whole point of this module is the swallowing. A counter is the least
 * important thing on the page, and the most important thing on the page is the
 * reservation form: a guest who fills in eight fields and then loses the lot to
 * `window.umami is undefined` has been failed by a feature that exists to draw
 * a graph. `track()` therefore never throws, never returns anything worth
 * checking, and never leaves a rejected promise behind — call it and move on,
 * inside or outside a try block, it makes no difference.
 *
 * The event names live in EVENTS rather than in the call sites because they are
 * the join key with the dashboard in the admin. A typo does not break a build
 * and does not show up in review; it shows up six weeks later as a graph that
 * stopped at a date nobody can explain. Import the constant, never the string.
 *
 * Every event carries the language it happened in. Umami's script tag has no
 * attribute we can be sure of across versions for this — `data-tag` exists in
 * recent builds but the owners may well be pointed at an older self-hosted
 * instance, and an attribute that silently does nothing is worse than none — so
 * the locale rides along as a property on each event instead. Pageviews need no
 * such help: English lives under /en and Dutch keeps the bare paths, so the URL
 * Umami already records tells the two apart on its own.
 */

/**
 * The complete vocabulary. Adding one here is half the job; the other half is
 * the wiring table in docs/analytics.md, which says where each is fired from.
 */
export const EVENTS = {
  reservationStarted: "reservation_started",
  reservationSubmitted: "reservation_submitted",
  reservationFailed: "reservation_failed",
  reserveButtonClicked: "reserve_clicked",
  contactSubmitted: "contact_submitted",
  newsletterSubscribed: "newsletter_subscribed",
  blogPostRead: "blog_post_read",
  eventViewed: "event_viewed",
  addToCalendar: "add_to_calendar",
  guestPassOpened: "guest_pass_opened",
  menuViewed: "menu_viewed",
  phoneClicked: "phone_clicked",
  directionsClicked: "directions_clicked",
} as const;

export type UmamiEvent = (typeof EVENTS)[keyof typeof EVENTS];

/** The shape Umami's script exposes, described only as far as we use it. */
interface UmamiGlobal {
  track?: (event: string, data?: Record<string, unknown>) => unknown;
}

/**
 * The page's language, read off <html lang>, which the frontend layout sets
 * from the route. Falling back to an empty string rather than guessing "nl"
 * keeps a missing value visible in the data instead of inflating one language.
 */
function currentLocale(): string {
  try {
    return document.documentElement.lang || "";
  } catch {
    return "";
  }
}

/**
 * Record one custom event. Safe to call from anywhere at any time, including
 * during a submit handler that is about to navigate.
 */
export function track(
  event: string,
  data?: Record<string, string | number | boolean>,
): void {
  if (typeof window === "undefined") return;

  try {
    const umami = (window as unknown as { umami?: UmamiGlobal }).umami;
    if (!umami || typeof umami.track !== "function") return;

    const locale = currentLocale();
    const result = umami.track(event, locale ? { locale, ...data } : { ...data });

    // `track` hands back a fetch promise in current versions and nothing at all
    // in older ones. An unattended rejection from a blocked request would land
    // in the console as an uncaught error and, on some setups, in error
    // reporting — for a beacon whose failure is of no consequence.
    if (result && typeof (result as PromiseLike<unknown>).then === "function") {
      void Promise.resolve(result).catch(() => {});
    }
  } catch {
    // Nothing to do and nobody to tell. Measuring is not allowed to be an
    // error condition on a page a guest is trying to use.
  }
}
