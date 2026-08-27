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
 * The same is true of the values in STEPS: the funnel is read back by asking
 * Umami for one property's values, so a stage renamed here and not there is a
 * stage that silently drops out of the chart.
 *
 * Every event carries the language it happened in. Umami's script tag has no
 * attribute we can be sure of across versions for this — `data-tag` exists in
 * recent builds but the owners may well be pointed at an older self-hosted
 * instance, and an attribute that silently does nothing is worse than none — so
 * the locale rides along as a property on each event instead. Pageviews need no
 * such help: English lives under /en and Dutch keeps the bare paths, so the URL
 * Umami already records tells the two apart on its own.
 *
 * Every event now also carries which size of screen it happened on, for the
 * same reason and by the same mechanism. Umami does record a device class per
 * session, but only for pageviews — it will not segment a custom event by it,
 * and the owners' question is precisely "does the booking form behave
 * differently on a phone". A property each call site had to remember would be
 * the property missing from the one call site that mattered, so it is attached
 * here beside the locale and no caller ever passes it.
 *
 * ## Why this file waits
 *
 * The script is injected with `strategy="afterInteractive"` (see
 * src/components/Analytics.tsx, which explains why, and why that is worth
 * keeping). That means it arrives *after* hydration, and `track()` used to
 * check for the global, find nothing and return — no error, no queue, no trace.
 * Every event fired from a mount effect therefore raced the script and, on a
 * phone on 4G in a café, usually lost. The result was not merely thinner
 * figures on phones: it was figures biased downward on exactly the device the
 * owners said they were blind on, silently, by design.
 *
 * So a miss is now held rather than dropped. The queue is small and it is
 * time-limited, and both of those are the point: a beacon that retries for ever
 * is a beacon that has stopped being free, and a visitor with the script
 * blocked would otherwise accumulate an event for every tap for as long as the
 * tab is open. Twenty events and ten seconds is far more than the mount-effect
 * race needs and far less than an ad blocker can turn into a leak. Past the
 * deadline the held events are thrown away and this file goes back to being
 * silent, which is the correct answer for a page where measuring was never
 * going to work in the first place.
 *
 * "Past the deadline" means past it for the rest of the page's life, and the
 * first version of this got that wrong in a way worth writing down, because the
 * sentence above read as true while the code did the opposite. The deadline
 * belonged to the batch: it was started by the first held event, and when it
 * fired the queue was emptied and the timer cleared — leaving nothing to say it
 * had ever fired. The next tap found an empty queue, failed to send, and armed
 * a fresh ten seconds of 200ms polling. On a page with the script blocked, or
 * simply never configured, that is a new poll per tap for as long as the tab is
 * open. Memory was bounded and the file looked quiet, but the thing being burnt
 * was battery, on precisely the phones this queue was built to stop
 * under-counting. So giving up is now a property of the page: once the ten
 * seconds are up nothing is held again, ever, and there is no timer left to
 * re-arm.
 */

/**
 * The complete vocabulary. Adding one here is half the job; the other half is
 * the wiring table in docs/analytics.md, which says where each is fired from.
 */
export const EVENTS = {
  /** Every stage of the booking form, told apart by the `step` property. */
  reservationStep: "reservation_step",
  /** Somebody who reached a stage and then stopped. The funnel's complement. */
  reservationAbandoned: "reservation_abandoned",
  reservationFailed: "reservation_failed",
  /** The browser refused the submit before our own handler was ever entered. */
  reservationBlocked: "reservation_blocked",
  availabilityChecked: "availability_checked",
  reserveButtonClicked: "reserve_clicked",
  /** Ringing us, routing to us, or taking an evening away in a calendar. */
  outboundClicked: "outbound_clicked",
  guestPassStep: "guest_pass_step",
  contentViewed: "content_viewed",
  contactSubmitted: "contact_submitted",
  newsletterSubscribed: "newsletter_subscribed",
  /**
   * Kept alongside `reservation_step { step: "6_confirmed" }` for one season,
   * and then to be deleted — after 1 March 2027, at which point the overlap has
   * covered a full winter and the owners have the new reading in front of them.
   *
   * Umami keys its history on the name string, so the day this name stops being
   * sent is the day the owners' one existing number — bookings per week, the
   * single figure they already read — falls off a cliff. Everything else in
   * this taxonomy is an improvement they have to be shown; that one is a
   * regression they would see for themselves, and it would be the first thing
   * they said about the work.
   */
  reservationSubmitted: "reservation_submitted",
} as const;

export type UmamiEvent = (typeof EVENTS)[keyof typeof EVENTS];

/**
 * The stages of a booking, in order.
 *
 * Numerically prefixed so Umami's own alphabetical list of a property's values
 * comes out already in funnel order — the panel that reads these back then has
 * nothing to sort and no ordering of its own to keep in step with this file.
 * One event with a `step` rather than six event names: six names would be six
 * rows competing for the events window in the dashboard, six series to fetch,
 * and a change in three files every time a stage is inserted.
 *
 * ## Why these six are not the six they were
 *
 * The form these were written for asked everything at once, so the second thing
 * that happened to anybody was a keystroke in a field — hence `2_field_touched`
 * — and pressing the button came straight after choosing a time. Neither is
 * true of the flow that replaced it. The party size arrives already answered at
 * two, so the second thing that happens is a date being chosen; and there is
 * now a screen between the time and the button, which is precisely the boundary
 * the owners' question is about, so it has to be a rung rather than a gap.
 *
 * The alternative was to keep the old names and quietly redefine them, which
 * keeps Umami's series continuous at the cost of the words meaning what they
 * say. A rung called `2_field_touched` that fires when somebody presses a date
 * chip is a rung that will be read wrongly by whoever opens the dashboard next
 * year, and by then there will be nobody left who remembers. So they are
 * renamed, the old series is left where it is, and `RENAMED_STEPS` below is the
 * key — written down here rather than in a commit message, because the person
 * who needs it will be looking at a chart and not at a git log.
 */
export const STEPS = {
  opened: "1_opened",
  datePicked: "2_date_picked",
  timePicked: "3_time_picked",
  /** The identity screen in front of somebody: a route, or a sheet push. */
  detailsShown: "4_details_shown",
  submitAttempted: "5_submit_attempted",
  confirmed: "6_confirmed",
} as const;

export type ReservationStep = (typeof STEPS)[keyof typeof STEPS];

/**
 * What each of the old rungs became, so a chart that stops on the deploy date
 * can be joined to the one that starts there.
 *
 * `2_field_touched` maps to nothing, and that is the honest answer rather than
 * a missing entry: the stage it measured — a keystroke before anything had been
 * chosen — no longer exists anywhere in the flow, because there is no field on
 * screen until an evening has been settled. Pointing it at the new second rung
 * would be claiming a continuity that is not there.
 */
export const RENAMED_STEPS: Record<string, ReservationStep | null> = {
  "1_opened": STEPS.opened,
  "2_field_touched": null,
  "3_date_picked": STEPS.datePicked,
  "4_time_picked": STEPS.timePicked,
  "5_submit_attempted": STEPS.submitAttempted,
  "6_confirmed": STEPS.confirmed,
};

/** The shape Umami's script exposes, described only as far as we use it. */
interface UmamiGlobal {
  track?: (event: string, data?: Record<string, unknown>) => unknown;
}

/** What every event carries once this file has finished with it. */
type Payload = Record<string, string | number | boolean>;

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
 * Phone, tablet or laptop, decided by the width of the window.
 *
 * Deliberately the viewport and not the user agent. A user agent string is a
 * guess dressed as a fact, it needs a table of exceptions that goes stale, and
 * it answers a different question from the one being asked: what the owners
 * want to know is whether the booking form behaves differently when it is
 * narrow, not what silicon it is running on.
 *
 * 1280px is the same breakpoint the floating booking mark uses for `xl:hidden`
 * (src/components/MobileReserveButton.tsx), so "phone or tablet" here and "the
 * sheet exists" there cannot drift apart into two different definitions of a
 * small screen. 640px is Tailwind's `sm`, which is where this site's forms go
 * from one column to two.
 *
 * An empty string on failure, and then the property is left off entirely —
 * the same choice as the locale above, for the same reason: a gap that shows
 * is better than a guess that does not.
 */
function deviceClass(): "" | "phone" | "tablet" | "desktop" {
  try {
    if (window.matchMedia("(min-width: 1280px)").matches) return "desktop";
    if (window.matchMedia("(min-width: 640px)").matches) return "tablet";
    return "phone";
  } catch {
    return "";
  }
}

/**
 * How many events are worth holding, and how long this page holds anything at
 * all — HOLD_MS runs from the first event that had to wait, once, and not from
 * each batch. See the module note: this is the mount-effect race, not a retry
 * policy.
 */
const HOLD_LIMIT = 20;
const HOLD_MS = 10_000;
const POLL_MS = 200;

let held: { event: string; payload: Payload }[] = [];
let poll: number | null = null;

/**
 * When the holding stops, and whether it already has. Both are per page rather
 * than per batch — see the module note; a deadline that starts again with every
 * new batch is a poll that never ends. The clock starts at the first event that
 * has to wait, because that is the moment the race with the script begins.
 */
let holdUntil = 0;
let gaveUp = false;

function umamiGlobal(): UmamiGlobal | null {
  const umami = (window as unknown as { umami?: UmamiGlobal }).umami;
  return umami && typeof umami.track === "function" ? umami : null;
}

/** One event onto the wire, or `false` if the script is not there yet. */
function send(event: string, payload: Payload): boolean {
  const umami = umamiGlobal();
  if (!umami?.track) return false;
  const result = umami.track(event, payload);

  // `track` hands back a fetch promise in current versions and nothing at all
  // in older ones. An unattended rejection from a blocked request would land
  // in the console as an uncaught error and, on some setups, in error
  // reporting — for a beacon whose failure is of no consequence.
  if (result && typeof (result as PromiseLike<unknown>).then === "function") {
    void Promise.resolve(result).catch(() => {});
  }
  return true;
}

function stopPolling(): void {
  if (poll === null) return;
  window.clearInterval(poll);
  poll = null;
}

/**
 * The end of the waiting, for good. Ten seconds in which the script has not
 * appeared is a page where it is not going to, so what is left is thrown away
 * and `gaveUp` makes sure nothing takes its place: no queue, no timer, and no
 * second ten seconds the next tap could start.
 */
function giveUp(): void {
  gaveUp = true;
  held = [];
  stopPolling();
}

/**
 * Keep an event until the script turns up. The properties were resolved by
 * `track()` at the moment the thing happened, not here, so a locale or a
 * screen width that changes while an event is waiting cannot rewrite history.
 *
 * The oldest events are the ones worth keeping when the cap is reached: they
 * are the mount-effect ones this queue exists for, and a visitor generating
 * more than twenty events before the script has loaded is a visitor for whom
 * it is never loading.
 */
function hold(event: string, payload: Payload): void {
  if (gaveUp) return;
  if (holdUntil === 0) holdUntil = Date.now() + HOLD_MS;
  // A tab left in the background can be woken with the deadline long past and
  // the interval never having run — timers in a hidden tab are throttled to
  // whatever the browser feels like. Checking here as well as in the poll means
  // that tap gives up rather than starting the wait over.
  if (Date.now() >= holdUntil) {
    giveUp();
    return;
  }
  if (held.length >= HOLD_LIMIT) return;
  held.push({ event, payload });
  if (poll !== null) return;

  poll = window.setInterval(() => {
    if (umamiGlobal()) {
      const waiting = held;
      held = [];
      stopPolling();
      for (const one of waiting) send(one.event, one.payload);
      return;
    }
    if (Date.now() >= holdUntil) giveUp();
  }, POLL_MS);
}

/**
 * Record one custom event. Safe to call from anywhere at any time, including
 * during a submit handler that is about to navigate, and during a mount effect
 * that has beaten the script to it.
 */
export function track(
  event: string,
  data?: Record<string, string | number | boolean>,
): void {
  if (typeof window === "undefined") return;

  try {
    const locale = currentLocale();
    const device = deviceClass();
    const payload: Payload = {
      ...(locale ? { locale } : {}),
      ...(device ? { device } : {}),
      ...data,
    };
    // Straight out, unless something is already waiting: an event that jumped
    // the queue would arrive ahead of ones that happened before it, and the
    // first thing anybody reads out of this data is an order.
    if (held.length === 0 && send(event, payload)) return;
    hold(event, payload);
  } catch {
    // Nothing to do and nobody to tell. Measuring is not allowed to be an
    // error condition on a page a guest is trying to use.
  }
}
