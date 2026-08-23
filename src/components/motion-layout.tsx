"use client";

import { LazyMotion, domMax } from "framer-motion";
import type { ReactNode } from "react";

/**
 * The heavier feature set, for the one subtree that has earned it.
 *
 * `domAnimation`, which src/components/motion.tsx hands the rest of the site,
 * cannot do layout animations — the trick where an element keeps its identity
 * while the grid around it re-flows, so the gallery plates slide to their new
 * places when a category is picked instead of blinking out and back in
 * somewhere else. That needs `layout`, and `layout` needs projection, and
 * projection is most of the library again.
 *
 * It sits in a module of its own rather than beside MotionProvider because an
 * import is a promise about a bundle: anything the shared module names is in
 * the first load of every page, which is the thing being fixed. Named only
 * here, `domMax` is in the gallery's chunk and nowhere else.
 *
 * A nested <LazyMotion> replaces the features for its own subtree and leaves
 * everything outside it on the layout's provider, so this is a local upgrade
 * rather than a way back to where we started.
 */
export function LayoutMotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domMax} strict>
      {children}
    </LazyMotion>
  );
}
