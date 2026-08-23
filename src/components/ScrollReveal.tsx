"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Content arriving on the page as it is scrolled to.
 *
 * This used to be a framer-motion element, which meant that every page that
 * wanted one fade pulled in the whole animation library: 114 KiB of it, 37 on
 * the wire, and 400ms of parse and execute on a mid-range phone, for two
 * animated properties. The fade now lives in `.reveal` in globals.css and the
 * only JavaScript left is the observer that says when — one for the whole
 * document, shared by every instance, rather than one apiece.
 *
 * The props are exactly the ones the motion version took, so no caller had to
 * be touched, and the timing and travel are the same numbers it used.
 */

interface ScrollRevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  direction?: "up" | "down" | "left" | "right";
}

// Short travel, long settle. Things arriving on the page should look like they
// were placed there, not like they flew in.
const travel = {
  up: { x: "0px", y: "18px" },
  down: { x: "0px", y: "-18px" },
  left: { x: "18px", y: "0px" },
  right: { x: "-18px", y: "0px" },
};

/**
 * One observer for the document.
 *
 * The margin shrinks the viewport by 90px on every side, so a section is not
 * called arrived until it is properly on screen rather than a hairline into
 * it. Built on first use rather than at module scope, because this file is
 * imported by server-rendered pages too and there is no such constructor
 * there.
 */
let watcher: IntersectionObserver | null = null;

function observer(): IntersectionObserver {
  if (!watcher) {
    watcher = new IntersectionObserver(
      (entries, watch) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          // Once arrived, always arrived: the fade is a way of entering, not
          // a state the section keeps having to be in.
          entry.target.setAttribute("data-revealed", "");
          watch.unobserve(entry.target);
        }
      },
      { rootMargin: "-90px" },
    );
  }
  return watcher;
}

export function ScrollReveal({
  children,
  className = "",
  delay = 0,
  direction = "up",
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // The markup ships hidden, so anything that cannot run the observer has
    // to be handed the content outright rather than left staring at an empty
    // page. Reduced motion is not that case — it is handled in CSS, where the
    // element is visible from the start and this simply confirms it.
    if (typeof IntersectionObserver === "undefined") {
      el.setAttribute("data-revealed", "");
      return;
    }

    const io = observer();
    io.observe(el);
    return () => io.unobserve(el);
  }, []);

  return (
    <div
      ref={ref}
      className={`reveal ${className}`}
      style={
        {
          "--reveal-x": travel[direction].x,
          "--reveal-y": travel[direction].y,
          "--reveal-delay": `${delay}s`,
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}
