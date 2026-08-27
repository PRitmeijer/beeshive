import Script from "next/script";
import type { JSX } from "react";

/**
 * The measuring script, or nothing at all.
 *
 * Umami was picked over Google Analytics because it sets no cookies and keeps
 * no personal data, which is why the site has no consent banner — see
 * src/globals/settings/analytics.ts, where that reasoning is written out for
 * the owners in their own words. That choice only holds as long as this stays
 * the one and only third-party script on the page.
 *
 * Everything here is decided on the server from Site Instellingen and handed
 * down as plain props, so this stays a server component: no hook, no client
 * bundle, no hydration to get wrong. It renders literally nothing until someone
 * has both switched measuring on and pasted a website id, because a script that
 * reports to nobody is only a slower page.
 *
 * Lighthouse is the reason for `strategy="afterInteractive"` rather than
 * `beforeInteractive`: the tag is injected once the page is usable, so it never
 * sits in the critical path and never blocks first paint.
 *
 * That injection happens after hydration, which means `window.umami` does not
 * exist yet at the moment a mount effect runs — and for a long time every event
 * fired from one was simply dropped, worst on a slow phone, silently. The fix is
 * a short-lived queue in src/lib/umami.ts rather than an earlier strategy here:
 * a counter is not worth a slower first paint, and the queue costs nothing when
 * the script arrives on time. Anyone tempted to move this to
 * `beforeInteractive` because "events are missing" should read that file first;
 * the missing events have already been paid for.
 *
 * The admin is covered by where this is mounted rather than by a check in here —
 * the component belongs in the frontend layout at
 * src/app/(frontend)/[locale]/layout.tsx, and Payload's admin renders under
 * src/app/(payload) with a root layout of its own, so /admin never reaches this
 * code. Do not move it to a shared root layout: that would start measuring the
 * owners' own back-office clicks as website traffic.
 *
 * `data-domains` is deliberately not set. It is an allow-list of hostnames, and
 * with the site living on debeeshive.nl in production and on some other host in
 * staging, a wrong entry means silence with no error anywhere. Umami's own
 * per-website settings are the right place for that.
 *
 * Telling the two languages apart is left to the URL and to the `locale`
 * property that src/lib/umami.ts puts on every custom event — along with a
 * `device` class, for the same reason and by the same route: Umami records one
 * per session but will not segment a custom event by it. No tag attribute is
 * emitted here, because whether the owners' Umami build honours one is not
 * something this code can know. src/lib/umami.ts explains that at length.
 */

interface AnalyticsProps {
  /** The `umamiEnabled` switch from Site Instellingen. */
  enabled: boolean;
  /** Where the script lives; Umami Cloud's default is filled in for them. */
  scriptUrl: string;
  /** Umami's id for this website. Nothing is measured without it. */
  websiteId: string;
  /**
   * Whether the script should honour the visitor's own "do not track" browser
   * setting and stay quiet for them.
   *
   * Worth being exact about what this is not. The admin field it comes from is
   * worded as "eigen bezoeken niet meetellen", and this attribute does not do
   * that on its own — it obeys a signal the visitor sets, which happens to be
   * the switch the owners can flip in their own browsers to keep themselves out
   * of their own figures. Excluding the back office is handled by not rendering
   * this component there at all.
   */
  doNotTrack: boolean;
}

/** Umami Cloud, for when the field has been emptied rather than changed. */
const FALLBACK_SCRIPT_URL = "https://cloud.umami.is/script.js";

/**
 * The name of the global Umami calls before it sends anything.
 *
 * On `window`, because that is the only shape the tracker accepts: it reads the
 * `data-before-send` attribute as a NAME and looks it up on the window object.
 * Namespaced rather than something like `beforeSend`, since this shares a global
 * object with every script on the page.
 */
const BEFORE_SEND = "__beeshiveRedact";

/**
 * Keeping the guest pass token out of the analytics.
 *
 * A reservation's shareable page lives at `/reservering/<token>`, and Umami's
 * tracker sends `url` built from the full href of whatever page it is on. So
 * every guest who opened their own booking used to hand that address, token and
 * all, to the analytics database.
 *
 * That is worse than it first sounds, and the difference is worth stating. The
 * token is not an identifier, it is a CREDENTIAL: `/api/guest-pass` looks a
 * reservation up by it and the page renders on the strength of it alone, which
 * is exactly what makes the link forwardable to the rest of the party. A token
 * sitting in a list of page URLs is therefore not "we can tell who this was" —
 * anybody who can read that list can open the booking, see the first name, the
 * date, the size of the party and everything the companions have written, and
 * add a line of their own. Whether that list is a self-hosted Umami on this
 * same stack or Umami Cloud is decided by a field in the admin, and the shipped
 * default in this very file points at Cloud.
 *
 * There is a second door, and it is the one that gets missed: the payload also
 * carries `referrer`, which Umami stores as a bare path for same-origin
 * navigation. A guest who opens their pass and then taps through to the menu
 * would leak the token a second time, as the referrer of the NEXT pageview,
 * long after leaving the page that had it in the address bar.
 *
 * Both are shut here, in one place, rather than by switching measuring off for
 * that page. Losing the page entirely would be its own loss: whether the party
 * ever opens the link is the one number that says if the guest pass was worth
 * building. The token is replaced with a fixed word, so every visit still
 * counts and they all fold together into one row.
 *
 * Deliberately a plain inline <script> and not next/script. This has to be
 * defined before the tracker runs, and `beforeInteractive` is only honoured in
 * the root layout — while a plain script tag in the body executes as the parser
 * reaches it, which is before the deferred tracker has loaded. It is four lines
 * and no request.
 *
 * The regex is written against the routes as they exist: Dutch lives at the
 * bare path and English under /en, so the optional two-letter segment covers
 * both without naming the locales. Anything after the token — a query, a hash —
 * is left alone, since nothing in this codebase puts a secret there.
 *
 * If a second secret ever ends up in a URL, it belongs in this function beside
 * the first one, and the answer is never "remember not to look at that page".
 */
const REDACT_SCRIPT = `window.${BEFORE_SEND}=function(t,p){try{if(!p)return p;
var r=function(v){return typeof v==="string"?v.replace(/(\\/(?:[a-z]{2}\\/)?reservering\\/)[^/?#]+/gi,"$1afgeschermd"):v};
p.url=r(p.url);p.referrer=r(p.referrer);}catch(e){}return p;};`;

export function Analytics({
  enabled,
  scriptUrl,
  websiteId,
  doNotTrack,
}: AnalyticsProps): JSX.Element | null {
  const id = (websiteId || "").trim();
  if (!enabled || !id) return null;

  const src = (scriptUrl || "").trim() || FALLBACK_SCRIPT_URL;

  return (
    <>
      {/* Defined before the tracker can run; see REDACT_SCRIPT above for why
          this is a bare script tag rather than next/script. */}
      <script dangerouslySetInnerHTML={{ __html: REDACT_SCRIPT }} />
      <Script
        /**
         * Anything but `umami`, and this is not a style choice.
         *
         * next/script puts this string on the injected tag as its `id`, and an
         * element with an id becomes a property of that name on `window` —
         * named access on the Window object, which is as old as the web and
         * still on by default. So `id="umami"` made `window.umami` the SCRIPT
         * ELEMENT, and the element is appended to the document a moment before
         * the code inside it runs.
         *
         * Umami's last line is `window.umami || (window.umami = { track… })`:
         * a guard, so a second copy of the tag cannot replace a live API. It
         * found the element already sitting there, decided somebody had got
         * there first, and never installed anything. Pageviews carried on
         * regardless — the tracker counts those by calling its own function
         * directly and never goes through the global — so the figures looked
         * healthy while `window.umami.track` did not exist, and every custom
         * event this site fires was dropped by src/lib/umami.ts, correctly and
         * silently, for want of a function to call.
         *
         * That is the whole of why the funnel was empty from the day it was
         * built: not one custom event was ever recorded. The cost of the name
         * was a year of the booking flow measuring nothing.
         */
        id="umami-tracker"
        src={src}
        strategy="afterInteractive"
        data-website-id={id}
        // The guest pass token never reaches Umami. The tracker calls this
        // global with every payload before sending it, and it is the only hook
        // that can reach a pageview — `track()` in src/lib/umami.ts sees custom
        // events only, and by then the URL has already been read.
        data-before-send={BEFORE_SEND}
        // Present or absent, never `data-do-not-track="false"`: Umami reads the
        // attribute's existence, so the string "false" would switch the very
        // thing off that it looks like it is switching on.
        {...(doNotTrack ? { "data-do-not-track": "true" } : {})}
      />
    </>
  );
}
