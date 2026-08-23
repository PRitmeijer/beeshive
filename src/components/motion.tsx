"use client";

import {
  AnimatePresence,
  LazyMotion,
  domAnimation,
  m,
  useReducedMotion,
  useScroll,
  useTransform,
} from "framer-motion";
import type { ReactNode } from "react";

/**
 * The site's one door into framer-motion.
 *
 * `m.div` and `motion.div` render the same thing, and that is the whole trap.
 * `motion` is the renderer with every feature the library owns already bolted
 * on at the import — gestures, layout projection, drag, scroll, the lot — so
 * one `motion.span` anywhere in a tree drops 114 KiB of library, 37 on the
 * wire, into the first load of every page that can reach it. That is what the
 * header alone was costing us on pages with no animation in them at all.
 *
 * `m` is the same renderer with none of it attached. The features arrive
 * separately, from the <LazyMotion> above it, and it is handed only the
 * `domAnimation` set: animation, AnimatePresence, and the hover/tap/focus
 * gestures. That is everything the site actually asks of the library, for
 * about half the weight.
 *
 * `strict` is what stops this quietly coming undone. With it on, a `motion.*`
 * left anywhere below the provider throws in development rather than working
 * — which it otherwise would, by pulling the full bundle back in, and nobody
 * would find out until the next time somebody thought to measure.
 *
 * So: import `m` from here, never `motion` from "framer-motion".
 *
 * What `domAnimation` leaves out is `layout`, `layoutId` and `drag`. One
 * place on the site wants the first of those and brings a heavier feature set
 * of its own; see src/components/motion-layout.tsx.
 */

export { AnimatePresence, m, useReducedMotion, useScroll, useTransform };

/**
 * Mounted once, in the frontend layout, so that every `m` element on every
 * page has its features. It renders no element of its own — it is a context
 * provider and nothing else — so it can sit straight inside <body> without
 * getting between the flex column and the rows it lays out.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      {children}
    </LazyMotion>
  );
}
