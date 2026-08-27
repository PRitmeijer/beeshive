"use client";

import { useEffect, useRef, useState } from "react";
import { EVENTS, track } from "@/lib/umami";

/**
 * The two ways a guest pass link travels: onto the clipboard, or straight into
 * WhatsApp.
 *
 * It exists as its own component because there are now two moments that need
 * exactly this pair, and they are the same link. The guest pass offers it to
 * whoever opens the page, and the reservation form offers it to the person who
 * has just booked and is the only one who can start it moving at all. Two
 * copies of a copy button would be harmless; two copies of the fallback below
 * would not, because the day it stops working is a day nobody notices — the
 * button still changes its word, and the clipboard is simply empty.
 *
 * That fallback is the whole reason there is any code here. navigator.clipboard
 * needs a secure context and a permission that the in-app browsers this link
 * lives in do not always grant: WhatsApp's own WebView, Instagram's, and any
 * phone reading the site over a LAN address during testing. The old
 * select-and-execCommand trick is deprecated and still the only thing those
 * accept, so it stays as the second attempt rather than the guest being told
 * that copying failed. If even that is refused there is nothing further to try,
 * and the word still changes: the link is on screen beside the button, and
 * selecting it by hand is what the guest was going to do anyway.
 *
 * The words come in as props rather than out of a dictionary, because the two
 * callers are at genuinely different moments — one is passing a link on, the
 * other has just been given it — and each has its own lines in its own
 * namespace. Nothing here is visitor-facing copy of its own.
 *
 * Both ways out report the same thing, `guest_pass_step { step: "shared" }`,
 * because the guest pass exists so that a link is forwarded and companions add
 * what they cannot eat — and whether that ever happens was, until now,
 * unmeasurable. The feature could have been entirely inert and the figures
 * would have looked identical to it working perfectly. Which of the two
 * buttons was used is not the interesting half and is not recorded; that the
 * link started moving is.
 */

interface ShareActionsProps {
  /** The address itself, absolute: it is going into somebody else's phone. */
  url: string;
  /**
   * The whole WhatsApp message, `url` included, already written by the caller.
   * Encoded here, so no caller has to remember to.
   */
  message: string;
  copyLabel: string;
  copiedLabel: string;
  whatsAppLabel: string;
  /**
   * Which of the two screens this row is standing on: the guest pass itself, or
   * the confirmation the person who booked is looking at. Required rather than
   * optional, because a third mount that forgot it would quietly merge into
   * whichever value happened to be the default — and the two are not the same
   * question. The person on the confirmation screen is the only one who knows
   * who else is coming and the only one who can start the link moving at all;
   * everyone on the guest pass is already holding it.
   */
  context: "guest_pass" | "confirmation";
  /** Spacing from whatever sits above. The row itself is not positioned. */
  className?: string;
}

/** How long the button says "copied" before going back to asking. */
const COPIED_MS = 2500;

export function ShareActions({
  url,
  message,
  copyLabel,
  copiedLabel,
  whatsAppLabel,
  context,
  className = "",
}: ShareActionsProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const shared = () =>
    track(EVENTS.guestPassStep, { step: "shared", context });

  const copy = async () => {
    shared();
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const field = document.createElement("textarea");
      field.value = url;
      field.setAttribute("readonly", "");
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      try {
        document.execCommand("copy");
      } catch {
        // Nothing left to try. The link is on screen and selectable.
      }
      document.body.removeChild(field);
    }
    setCopied(true);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), COPIED_MS);
  };

  return (
    <div className={`flex flex-wrap items-center gap-3 ${className}`}>
      <button
        type="button"
        onClick={copy}
        className="btn-secondary"
        // The change of word is the whole feedback, so it has to be announced
        // rather than only seen.
        aria-live="polite"
      >
        {copied ? copiedLabel : copyLabel}
      </button>
      <a
        // wa.me rather than whatsapp://, because this same link has to work
        // when the page is opened on a laptop with WhatsApp Web.
        href={`https://wa.me/?text=${encodeURIComponent(message)}`}
        onClick={shared}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-secondary"
      >
        {whatsAppLabel}
      </a>
    </div>
  );
}
