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
 * sits in the critical path and never blocks first paint. The admin is covered
 * by where this is mounted rather than by a check in here — the component
 * belongs in the frontend layout at src/app/(frontend)/[locale]/layout.tsx, and
 * Payload's admin renders under src/app/(payload) with a root layout of its
 * own, so /admin never reaches this code. Do not move it to a shared root
 * layout: that would start measuring the owners' own back-office clicks as
 * website traffic.
 *
 * `data-domains` is deliberately not set. It is an allow-list of hostnames, and
 * with the site living on debeeshive.nl in production and on some other host in
 * staging, a wrong entry means silence with no error anywhere. Umami's own
 * per-website settings are the right place for that.
 *
 * Telling the two languages apart is left to the URL and to the `locale`
 * property that src/lib/umami.ts puts on every custom event; no tag attribute
 * is emitted here, because whether the owners' Umami build honours one is not
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
    <Script
      id="umami"
      src={src}
      strategy="afterInteractive"
      data-website-id={id}
      // Present or absent, never `data-do-not-track="false"`: Umami reads the
      // attribute's existence, so the string "false" would switch the very
      // thing off that it looks like it is switching on.
      {...(doNotTrack ? { "data-do-not-track": "true" } : {})}
    />
  );
}
