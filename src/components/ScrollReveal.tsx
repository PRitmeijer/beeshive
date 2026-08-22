"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

interface ScrollRevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  direction?: "up" | "down" | "left" | "right";
}

// Short travel, long settle. Things arriving on the page should look like they
// were placed there, not like they flew in.
const directionMap = {
  up: { y: 18 },
  down: { y: -18 },
  left: { x: 18 },
  right: { x: -18 },
};

export function ScrollReveal({
  children,
  className = "",
  delay = 0,
  direction = "up",
}: ScrollRevealProps) {
  // useReducedMotion() is null during SSR, so it must never change the element
  // tree or the initial style: only the timing. Anything else hydrates dirty.
  const reduce = useReducedMotion();

  return (
    <motion.div
      initial={{ opacity: 0, ...directionMap[direction] }}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={{ once: true, margin: "-90px" }}
      transition={
        reduce
          ? { duration: 0, delay: 0 }
          : { duration: 1.05, delay, ease: [0.16, 0.84, 0.28, 1] }
      }
      className={className}
    >
      {children}
    </motion.div>
  );
}
