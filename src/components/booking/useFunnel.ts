"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { stripLocale } from "@/i18n/config";
import { EVENTS, STEPS, track, type ReservationStep } from "@/lib/umami";

/**
 * The booking funnel, once, for both screens.
 *
 * It used to be twenty lines inside the one component that could reach every
 * stage. The flow is two screens now — and on the /reserveren surface they are
 * two routes, so the availability half is genuinely unmounted while the
 * identity half is being filled in — which means the counting has to be handed
 * from one to the other. Two copies of this would be two copies of the
 * once-per-stage guard, the furthest-reached comparison and the abandonment
 * beacon, and they would drift apart on the first change to any of them.
 *
 * Every fact that has to outlive a render is a ref and deliberately so:
 * nothing on screen depends on any of them, and a re-render for a measurement
 * is a real cost paid for a beacon. `track()` swallows everything, so no tap
 * and no submit can be lost to anything in here.
 */

/**
 * How long a click that stays inside the flow keeps the abandonment beacon
 * quiet. Long enough for a router to tear a screen down — that is a couple of
 * frames, not a couple of seconds — and short enough that a click which never
 * led anywhere cannot hide a real departure a moment later.
 */
const MOVED_WITHIN_MS = 1500;

export interface Funnel {
  /**
   * Report a stage, at most once per journey.
   *
   * `extra` is for the one property that qualifies a stage rather than
   * describing the journey — `via` on the date, which says whether the calendar
   * was needed. It rides on the step event instead of becoming an event of its
   * own, so the funnel stays one series and one row in the dashboard.
   */
  step: (name: ReservationStep, extra?: Record<string, string>) => void;
  /** A booking was accepted: never also count this person as having left. */
  finish: () => void;
  /**
   * This screen is being unmounted because the guest is going forward, not
   * away. Without it, navigating from the accordion to the details route would
   * report an abandonment at the very moment somebody progressed — the single
   * most misleading number the funnel could produce.
   */
  handOff: () => void;
  /**
   * Somebody starting a second booking on the same mounted screen. The new
   * journey opens immediately, exactly as the first one did on mount — a second
   * booking that never reported a first rung would be a conversion with no
   * denominator under it.
   */
  reset: () => void;
  /** The furthest stage reached, for whoever needs to send it along. */
  furthest: () => ReservationStep;
  /** `surface` and `entry`, built once so no call site can send half of it. */
  props: { surface: string; entry: string };
}

export function useFunnel({
  surface,
  entry,
  from = STEPS.opened,
}: {
  surface: "sheet" | "page";
  entry: string;
  /**
   * The stage this screen begins at, and the one it reports the moment it is
   * mounted. The accordion opens the journey at `1_opened`; the details route
   * is arrived at, so it starts where the accordion left off and an
   * abandonment from it reads as an abandonment at the details screen rather
   * than at the time picker.
   */
  from?: ReservationStep;
}): Funnel {
  /**
   * What every event out of this flow says about where it happened: which of
   * the two surfaces, and which of our own buttons opened it. Built once so no
   * call site can send half of it, which is the failure mode that makes a
   * funnel unreadable — a stage missing `surface` is a stage that silently
   * drops out of the phone column and inflates the desktop one.
   */
  const props = useMemo(() => ({ surface, entry }), [surface, entry]);

  const lastStep = useRef<ReservationStep>(from);
  const finished = useRef(false);
  const handedOff = useRef(false);
  const reached = useRef(new Set<ReservationStep>());

  const step = useCallback(
    (name: ReservationStep, extra?: Record<string, string>) => {
      // Once per stage per journey. A funnel is a count of people at each
      // stage, and somebody who changes their mind about the date three times
      // has not been through the date picker three times — unguarded, a fussy
      // guest can make a later stage out-count an earlier one and the whole
      // chart stops meaning anything.
      if (reached.current.has(name)) return;
      reached.current.add(name);
      // The furthest they got, not the most recent thing they did: going back
      // to the date after choosing a time is not losing the time. The numeric
      // prefixes are what make this a string comparison — which is the same
      // property that has Umami list the values in funnel order for free.
      if (name > lastStep.current) lastStep.current = name;
      track(EVENTS.reservationStep, { step: name, ...extra, ...props });
    },
    [props],
  );

  const finish = useCallback(() => {
    finished.current = true;
  }, []);
  const handOff = useCallback(() => {
    handedOff.current = true;
  }, []);
  const reset = useCallback(() => {
    reached.current.clear();
    finished.current = false;
    handedOff.current = false;
    lastStep.current = from;
    step(from);
  }, [from, step]);
  const furthest = useCallback(() => lastStep.current, []);

  /**
   * The rung this screen begins on, reported the moment it is in front of
   * somebody.
   *
   * It was not reported at all, and that is worth spelling out because of how
   * quietly it broke everything downstream. `1_opened` existed in the
   * vocabulary, it was the default `from`, it was the value the abandonment
   * beacon carried for anybody who left before touching anything, and it was
   * the label at the top of the chart in the admin — and no call site anywhere
   * sent it. So the funnel had five rungs and no first one, the panel divided
   * every stage by a denominator of zero, and the one figure the whole redesign
   * exists to move, the share of people who open the flow and end up with a
   * table, could not be computed at all.
   *
   * Here rather than in the components for two reasons. The rung is "the flow
   * is on screen", which is precisely the moment this hook is first run, so
   * anywhere else is a second place that has to remember. And the guard in
   * `step` is what makes it once per journey rather than once per render or
   * once per child: a mount effect on the accordion would fire again every time
   * the details screen was backed out of on the phone surface, where this
   * component stays mounted across both screens and only its children come and
   * go.
   *
   * On the details route `from` is `4_details_shown` rather than `1_opened`,
   * and that is right: the journey was opened by the accordion on the page
   * before it, which sent its own `1_opened` and handed over. The rung that
   * screen re-sends here is one `step` will find already reached when
   * GuestDetails reports it a moment later, and drop.
   */
  useEffect(() => {
    step(from);
  }, [step, from]);

  /**
   * A guest moving about inside the flow, told apart from a guest leaving it.
   *
   * The abandonment beacon fires from the unmount cleanup below, and an unmount
   * is not the same thing as a departure. On /reserveren the two screens are
   * two routes, so "Wijzigen" on the details screen — the one control whose
   * entire purpose is to go back a screen and change the day — is a real link,
   * and following it unmounted this hook and reported
   * `reservation_abandoned { last_step: "4_details_shown" }`. The guest who
   * then booked was counted once as having given up and once as having
   * converted, which makes the drop-off worst at exactly the boundary the
   * redesign was built to prove itself on.
   *
   * How this knows the difference: it watches, in the capture phase so nothing
   * can stop it first, for the click that is about to cause the unmount, and
   * asks where that click is going. A plain left click on an ordinary link to a
   * path that is still part of the booking flow is a move inside it; anything
   * else — another page, another origin, a middle click or a ⌘-click that opens
   * a tab and leaves this one standing — is not, and is left to be reported as
   * it always was. The stamp is a time rather than a flag because a click need
   * not be followed by an unmount at all: a link the router declines to follow
   * would otherwise leave the beacon disarmed for the rest of the visit, so it
   * re-arms itself a moment later on its own.
   */
  const movedWithin = useRef(0);
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey) return;
      if (event.shiftKey || event.altKey || event.defaultPrevented) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest("a[href]");
      if (!link) return;
      const href = link.getAttribute("href");
      if (!href) return;
      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      // Both screens of the flow live under /reserveren, in either language,
      // and nothing else does. The locale prefix is stripped rather than
      // matched, so /en/reserveren/gegevens counts exactly as its Dutch twin.
      // The exact segment, not a prefix of the string: a future /reserveringen
      // would otherwise silently start swallowing abandonments.
      // (`stripLocale` normalises the trailing slash away on its own.)
      const path = stripLocale(url.pathname);
      if (path !== "/reserveren" && !path.startsWith("/reserveren/")) return;
      movedWithin.current = Date.now();
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  /**
   * The one event that turns silence into data.
   *
   * Everybody who does not book leaves, and leaving used to leave no trace of
   * any kind: on a phone, tapping the backdrop is the single most common
   * outcome of tapping the booking mark, and it emitted nothing.
   *
   * `pagehide` rather than `beforeunload`, which mobile Safari does not
   * reliably fire and which is the platform this exists for. The cleanup covers
   * the other way out — the component being unmounted, which on the phone sheet
   * is the sheet being closed and on /reserveren is a navigation away.
   *
   * `sent` guards against reporting both: a page hidden after the sheet has
   * already been dismantled, or a browser that fires `pagehide` and then tears
   * the tree down, would otherwise count one leaving twice. Nothing here can
   * hold up a page teardown — `track()` hands the event to Umami's own beacon
   * and returns.
   *
   * Deliberately no field contents, not even whether a field had contents. The
   * abandonment is ours to know about; what was typed before it is not.
   */
  const sent = useRef(false);
  useEffect(() => {
    // Armed again whenever this effect is registered again, rather than once
    // for the lifetime of the component. React runs an effect and its cleanup
    // straight through on mount in development, and a guard that only ever
    // latched would be spent on that dry run — so the real leaving, minutes
    // later, would be the one occasion nothing was reported.
    sent.current = false;
    const leave = (exit: "sheet_closed" | "navigated_away" | "page_hidden") => {
      if (finished.current || handedOff.current || sent.current) return;
      // A step backwards inside the flow is not a departure. See `movedWithin`
      // above for how that click is recognised and why the window is a short
      // one rather than a latch.
      if (Date.now() - movedWithin.current < MOVED_WITHIN_MS) return;
      sent.current = true;
      track(EVENTS.reservationAbandoned, {
        last_step: lastStep.current,
        exit,
        ...props,
      });
    };
    const onHide = () => leave("page_hidden");
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      leave(surface === "sheet" ? "sheet_closed" : "navigated_away");
    };
  }, [props, surface]);

  /**
   * One object, held across renders. It is passed down as a prop and read in a
   * mount effect on the details screen, and a fresh object each render would
   * make that effect fire on every keystroke — which would put the caret back
   * on the heading every time somebody typed a letter of their name.
   */
  return useMemo(
    () => ({ step, finish, handOff, reset, furthest, props }),
    [step, finish, handOff, reset, furthest, props],
  );
}
