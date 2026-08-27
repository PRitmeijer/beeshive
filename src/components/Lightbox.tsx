"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Sheet } from "@/components/Sheet";

/**
 * A photograph opened over the page, on its own sheet.
 *
 * Two decisions in here are worth explaining, because both of them look like
 * the wrong choice until you try the obvious one.
 *
 * The first is that this is not a <dialog>. The native element is the right
 * answer almost everywhere — it brings the focus trap, the inertness of the
 * page behind it and Escape for free — but it renders in the top layer, above
 * every stacking context the document has. This site paints a fixed grain over
 * the whole page from `body::after` at z-index 9998 and multiplies it into
 * everything under it, and a top-layer dialog is the one thing on the site
 * that layer cannot reach. The photograph came out clean and plasticky against
 * a page where every other surface has tooth on it, which is precisely the
 * look this design exists to avoid. `::backdrop` has the same problem from the
 * other side: it sits under the dialog but still above the grain. So this is a
 * plain fixed element at z-index 100, the same height the gallery's lightbox
 * flies at, and the grain falls over it like it falls over everything else.
 * Everything <dialog> would have given us is written out below instead.
 *
 * The second is the portal. This is rendered from inside an article body that
 * is wrapped in <ScrollReveal>, and `.reveal` animates `transform` — which
 * makes it a containing block for `position: fixed` for as long as the
 * transform is set. A lightbox opened before that transition finished would
 * have been positioned against the paragraph rather than the viewport. Sending
 * it to <body> means no ancestor of ours can ever decide where "fixed" is.
 *
 * The fade is a CSS transition rather than an animated element, so the article
 * page does not have to carry framer-motion for one cross-fade — the same
 * trade <ScrollReveal> made. Reduced motion is not handled here at all: the
 * `prefers-reduced-motion` block in globals.css collapses every transition on
 * the page to nothing, this one included, and the panel simply appears.
 */

/** Long enough to read as a fade, short enough not to feel like a wait. */
const FADE_MS = 400;

/**
 * What a Tab is allowed to land on inside the panel. Today that is the close
 * button and nothing else, but the query is written out in full so that adding
 * a caption with a link in it does not silently break the trap.
 */
const FOCUSABLE =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** The same drawn cross the gallery closes with. */
function CrossMark() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M3.3 3.5 L12.7 12.6" />
      <path d="M12.7 3.4 L3.2 12.7" />
    </svg>
  );
}

interface LightboxProps {
  open: boolean;
  onClose: () => void;
  /**
   * The photograph to show. Hand this the upload's own `url` rather than one
   * of the generated sizes: every one of those is a centre crop, and being
   * able to see what the crop took is the entire reason a reader opens this.
   */
  src: string;
  alt: string;
  /** What a screen reader calls the dialog. */
  label: string;
  closeLabel: string;
}

export function Lightbox({
  open,
  onClose,
  src,
  alt,
  label,
  closeLabel,
}: LightboxProps) {
  const panel = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  // `mounted` is whether the markup exists, `shown` is whether it has been
  // faded up. They are separate because a fade needs one frame of the element
  // sitting at opacity 0 before the class changes, and because on the way out
  // the markup has to outlive the prop by the length of the transition.
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const frame = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(frame);
    }
    setShown(false);
    const timer = setTimeout(() => setMounted(false), FADE_MS);
    return () => clearTimeout(timer);
  }, [open]);

  /**
   * The page behind must not scroll. Taking the scrollbar away shortens the
   * viewport's client width, and everything centred on the page jumps a dozen
   * pixels sideways at the moment the photograph appears — so the width the
   * bar was occupying is handed straight back as padding.
   */
  useEffect(() => {
    if (!open) return;
    const { body, documentElement } = document;
    const bar = window.innerWidth - documentElement.clientWidth;
    const overflow = body.style.overflow;
    const padding = body.style.paddingRight;
    body.style.overflow = "hidden";
    if (bar > 0) body.style.paddingRight = `${bar}px`;
    return () => {
      body.style.overflow = overflow;
      body.style.paddingRight = padding;
    };
  }, [open]);

  /**
   * Focus goes in when it opens and comes back to whatever opened it when it
   * closes — which on this site is the photograph itself, so a reader who
   * tabbed to the plate and pressed Enter is put back on the plate rather than
   * at the top of the document.
   *
   * `mounted` is in the dependencies and not just for tidiness: the effect
   * that mounts the panel runs in this same pass, so on the first open the
   * close button does not exist yet when `open` flips. Waiting for the mount
   * is what gives this something to focus.
   */
  useEffect(() => {
    if (!open || !mounted) return;
    const returnTo = document.activeElement;
    closeButton.current?.focus();
    return () => {
      if (returnTo instanceof HTMLElement) returnTo.focus();
    };
  }, [open, mounted]);

  /** Escape closes it, and Tab cannot get out of it. */
  useEffect(() => {
    if (!open || !mounted) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const node = panel.current;
      if (!node) return;
      const stops = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE));
      // Nothing to move between: hold focus where it is rather than letting
      // the Tab fall through to the page underneath.
      if (stops.length === 0) {
        event.preventDefault();
        return;
      }

      const first = stops[0];
      const last = stops[stops.length - 1];
      const active = document.activeElement;
      const inside = active instanceof Node && node.contains(active);

      if (event.shiftKey && (!inside || active === first)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (!inside || active === last)) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, mounted, onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      // `pointer-events-none` while faded out is what keeps the dying panel
      // from swallowing the click on whatever is underneath it during the
      // four hundred milliseconds it takes to leave — and, when motion is
      // reduced and the fade is instant, for the whole of that window.
      // 90 and not the 92 the gallery's lightbox asks for. Tailwind's opacity
      // scale runs in fives, a bare modifier off the scale compiles to nothing
      // at all rather than to an error, and `bg-hive-900/[0.92]` is therefore not
      // a dark backdrop — it is no backdrop. It took a screenshot to notice,
      // because the photograph on its sheet looks perfectly deliberate
      // floating over an undimmed page. The gallery still has this.
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-hive-900/90 p-6 transition-opacity duration-500 ease-settle md:p-10 ${
        shown ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
      onClick={onClose}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="relative max-w-5xl"
        // The backdrop closes on click; the sheet is not the backdrop.
        onClick={(event) => event.stopPropagation()}
      >
        <Sheet tone="paper" edge="soft">
          <figure className="p-3 md:p-4">
            <img
              src={src}
              alt={alt}
              // `contain`, and bounded on both axes, so the whole frame is
              // there whatever shape it is — most of the owners' photographs
              // are portrait, and the plate on the page is a wide crop of the
              // middle of them.
              className="mx-auto block max-h-[76vh] w-auto max-w-full object-contain"
            />
          </figure>
        </Sheet>
        <button
          ref={closeButton}
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          className="absolute -right-3 -top-3 z-10 flex h-11 w-11 items-center justify-center rounded-[2px] border border-honey-600/50 bg-paper text-honey-700 transition-colors duration-700 ease-settle hover:bg-honey-400 hover:text-hive-800"
        >
          <CrossMark />
        </button>
      </div>
    </div>,
    document.body,
  );
}
