"use client";

import { motion } from "framer-motion";

// Seeded random number generator for consistent values between server and client
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9999) * 10000;
  return x - Math.floor(x);
}

export function HexagonGrid({ count = 12 }: { count?: number }) {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {Array.from({ length: count }).map((_, i) => {
        // Use index-based seeds for deterministic random values
        const size = 60 + seededRandom(i * 4 + 1) * 120;
        const x = seededRandom(i * 4 + 2) * 100;
        const y = seededRandom(i * 4 + 3) * 100;
        const delay = seededRandom(i * 4 + 4) * 4;
        const duration = 4 + seededRandom(i * 4 + 5) * 4;

        return (
          <motion.div
            key={i}
            className="absolute clip-hexagon bg-honey-400/[0.04]"
            style={{
              width: size,
              height: size * 1.15,
              left: `${x}%`,
              top: `${y}%`,
            }}
            animate={{
              opacity: [0.02, 0.08, 0.02],
              scale: [1, 1.08, 1],
            }}
            transition={{
              duration,
              delay,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        );
      })}
    </div>
  );
}
