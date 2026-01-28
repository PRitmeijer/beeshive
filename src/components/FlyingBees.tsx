"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";

interface FlyingBeesProps {
  count?: number;
}

interface BeeConfig {
  id: number;
  startX: number;
  startY: number;
  size: number;
  duration: number;
  delay: number;
  pathVariant: number;
}

function Bee({ config }: { config: BeeConfig }) {
  const { startX, startY, size, duration, delay, pathVariant } = config;

  // Different gentle flight paths
  const xKeyframes =
    pathVariant === 0
      ? [startX, startX + 12, startX + 25, startX + 18, startX + 30]
      : pathVariant === 1
        ? [startX, startX - 10, startX - 5, startX - 18, startX - 25]
        : [startX, startX + 8, startX - 4, startX + 10, startX + 20];

  const yKeyframes =
    pathVariant === 0
      ? [startY, startY - 8, startY - 3, startY - 12, startY - 6]
      : pathVariant === 1
        ? [startY, startY + 5, startY - 4, startY + 2, startY - 8]
        : [startY, startY - 6, startY + 3, startY - 10, startY - 2];

  return (
    <motion.div
      className="absolute pointer-events-none select-none"
      style={{ left: `${startX}%`, top: `${startY}%`, fontSize: size }}
      initial={{ opacity: 0 }}
      animate={{
        x: xKeyframes.map((v) => `${v - startX}vw`),
        y: yKeyframes.map((v) => `${v - startY}vh`),
        opacity: [0, 0.45, 0.5, 0.45, 0],
        rotate: [0, -8, 5, -5, 0],
      }}
      transition={{
        duration,
        delay,
        repeat: Infinity,
        ease: "easeInOut",
      }}
      aria-hidden="true"
    >
      🐝
    </motion.div>
  );
}

export function FlyingBees({ count = 4 }: FlyingBeesProps) {
  const bees = useMemo<BeeConfig[]>(() => {
    // Deterministic "random" based on index to avoid hydration mismatch
    return Array.from({ length: count }, (_, i) => {
      const seed = (i + 1) * 37;
      return {
        id: i,
        startX: (seed * 13) % 80 + 5,
        startY: (seed * 7) % 60 + 15,
        size: 14 + (i % 3) * 4,
        duration: 18 + (i % 4) * 6,
        delay: i * 4,
        pathVariant: i % 3,
      };
    });
  }, [count]);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-[1]">
      {bees.map((bee) => (
        <Bee key={bee.id} config={bee} />
      ))}
    </div>
  );
}
