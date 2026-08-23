"use client";

import type { ReactNode } from "react";
import { EVENTS, track } from "@/lib/umami";

/**
 * The click that <AddToCalendar> cannot hear.
 *
 * That component is a server component on purpose — see its own note; it is
 * what keeps @/lib/ics out of every visitor's bundle — and a server component
 * has no onClick to hang a measurement on. So the four links stay exactly
 * where they are, rendered on the server, and this stands around them and
 * listens on the way out. Delegation rather than a handler per link is the
 * whole trick: finished markup cannot be handed a prop, but its clicks still
 * travel up through here, and a link activated from the keyboard fires the
 * same click as one tapped with a thumb.
 *
 * It replaces the wrapper <div> that <AddToCalendar> drew anyway rather than
 * adding one, so the markup a guest gets is unchanged.
 *
 * Nothing about the reservation is measured, only which of the four ways out
 * was taken. The page this sits on has a token in its URL, and a token is the
 * one thing that must never become an analytics property.
 */
export function AddToCalendarTracker({
  source,
  className,
  children,
}: {
  /** Which page offered the calendar; the event page reports its own title. */
  source: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={className}
      onClick={(event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const link = target.closest("a[data-calendar-target]");
        if (!link) return;
        track(EVENTS.addToCalendar, {
          source,
          target: link.getAttribute("data-calendar-target") ?? "",
        });
      }}
    >
      {children}
    </div>
  );
}
