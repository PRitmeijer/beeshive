"use client";

import type { ReactNode } from "react";
import { EVENTS, track } from "@/lib/umami";

/**
 * The clicks a server component cannot hear.
 *
 * Three places on this site put a link a visitor might leave by inside markup
 * that is rendered on the server and therefore has no `onClick` to hang a
 * measurement on: the guest pass's four calendar links, whose component is a
 * server one on purpose — see <AddToCalendar>, it is what keeps @/lib/ics out
 * of every visitor's bundle — and the two `tel:` links in the footer and on
 * the "this link is no longer valid" sheet, both of which sit in pages that
 * are `async` and read the CMS.
 *
 * So the links stay exactly where they are and this stands around them and
 * listens on the way out. Delegation rather than a handler per link is the
 * whole trick: finished markup cannot be handed a prop, but its clicks still
 * travel up through here, and a link activated from the keyboard fires the
 * same click as one tapped with a thumb. It replaces a wrapper the markup
 * already had rather than adding one, so what a guest gets is unchanged.
 *
 * Nothing about the reservation is measured, only which way out was taken. The
 * guest pass has a token in its URL, and a token is the one thing that must
 * never become an analytics property. A telephone number is not sent either:
 * the number is a settings field, the same on every page, and what is worth
 * counting is that somebody rang.
 */

/** Where the link was standing. One vocabulary with the handwritten sites. */
type Surface = "footer" | "guest_pass" | "contact" | "reserveren" | "event";

/**
 * The delegation itself. Used directly by the footer, which carries the site's
 * most-tapped telephone number on every single page and was the one `tel:` link
 * nobody was counting — so the figure the owners had for "how many people rang
 * us" was a minority sample dressed up as a total.
 */
export function OutboundLinkTracker({
  surface,
  className,
  children,
}: {
  surface: Surface;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={className}
      onClick={(event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const link = target.closest("a");
        if (!link) return;
        const calendar = link.getAttribute("data-calendar-target");
        if (calendar !== null) {
          track(EVENTS.outboundClicked, {
            kind: "calendar",
            target: calendar,
            surface,
          });
          return;
        }
        // `getAttribute` rather than `.href`, which the browser resolves to an
        // absolute URL and which would therefore carry the number itself into
        // a comparison. The scheme is all this needs to know.
        if ((link.getAttribute("href") ?? "").startsWith("tel:")) {
          track(EVENTS.outboundClicked, { kind: "phone", surface });
        }
      }}
    >
      {children}
    </div>
  );
}

/**
 * The guest pass's calendar block, kept under its own name because that is what
 * <AddToCalendar> renders and <AddToCalendar> is not ours to edit this round.
 * `source` is the older spelling of the same fact — hyphens where the event
 * vocabulary now uses underscores — so it is normalised here rather than at the
 * one call site that still writes it the old way.
 */
export function AddToCalendarTracker({
  source,
  className,
  children,
}: {
  /** Which page offered the calendar. Only the guest pass uses this today. */
  source: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <OutboundLinkTracker
      surface={(source.replace(/-/g, "_") || "guest_pass") as Surface}
      className={className}
    >
      {children}
    </OutboundLinkTracker>
  );
}
