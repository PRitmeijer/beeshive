"use client";

import { motion } from "framer-motion";

export function HexagonGrid({ count = 12 }: { count?: number }) {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {Array.from({ length: count }).map((_, i) => {
        const size = 60 + Math.random() * 120;
        const x = Math.random() * 100;
        const y = Math.random() * 100;
        const delay = Math.random() * 4;
        const duration = 4 + Math.random() * 4;

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
