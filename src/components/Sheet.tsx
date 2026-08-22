import type { ReactNode } from "react";

/**
 * A sheet of the mill stock the menu is printed on.
 *
 * The deckle is real geometry, not a decorative border: an SVG turbulence
 * displacement chews the edge of a background layer at two frequencies:
 * a coarse pass for the wandering outline, a fine pass for the fibre fringe.
 * Content sits on a separate, unfiltered layer above it, so type stays crisp.
 */

/** Mounted once, near the top of the tree. */
export function PaperDefs() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="0"
      height="0"
      style={{ position: "absolute" }}
    >
      <defs>
        <filter
          id="deckle-soft"
          x="-12%"
          y="-12%"
          width="124%"
          height="124%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.026"
            numOctaves="4"
            seed="11"
            result="coarse"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="coarse"
            scale="9"
            xChannelSelector="R"
            yChannelSelector="G"
            result="pass1"
          />
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.42"
            numOctaves="2"
            seed="4"
            result="fine"
          />
          <feDisplacementMap
            in="pass1"
            in2="fine"
            scale="3"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>

        <filter
          id="deckle-strong"
          x="-14%"
          y="-14%"
          width="128%"
          height="128%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.019"
            numOctaves="4"
            seed="23"
            result="coarse"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="coarse"
            scale="16"
            xChannelSelector="R"
            yChannelSelector="G"
            result="pass1"
          />
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.38"
            numOctaves="2"
            seed="9"
            result="fine"
          />
          <feDisplacementMap
            in="pass1"
            in2="fine"
            scale="4.5"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>
  );
}

/** The sewn spine on the menu cover: linen thread through punched holes. */
function Stitching() {
  const stitches = Array.from({ length: 9 }, (_, i) => 6 + i * 11);
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 12 100"
      preserveAspectRatio="none"
      className="absolute inset-y-6 left-3 w-3 text-sage-600"
    >
      {stitches.map((y, i) =>
        i % 2 === 0 ? (
          <path
            key={y}
            d={`M3 ${y} L9 ${y + 5.5}`}
            stroke="currentColor"
            strokeOpacity="0.75"
            strokeWidth="1.6"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ) : (
          <path
            key={y}
            d={`M9 ${y} L3 ${y + 5.5}`}
            stroke="currentColor"
            strokeOpacity="0.75"
            strokeWidth="1.6"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ),
      )}
    </svg>
  );
}

const TONE = {
  paper: "stock",
  deep: "stock-deep",
  cover: "stock-cover",
} as const;

interface SheetProps {
  children: ReactNode;
  /** Which stock: the cream inner sheet, a heavier one, or the khaki cover. */
  tone?: keyof typeof TONE;
  /** How far the deckle wanders. `none` gives a clean trimmed edge. */
  edge?: "soft" | "strong" | "none";
  /** Sewn binding down the left, as on the menu cover. */
  stitched?: boolean;
  shadow?: boolean;
  className?: string;
}

export function Sheet({
  children,
  tone = "paper",
  edge = "soft",
  stitched = false,
  shadow = true,
  className = "",
}: SheetProps) {
  // The filtered layer needs slack to displace into, or the deckle gets
  // clipped back into a straight line.
  const slack = edge === "strong" ? "-inset-6" : "-inset-3";
  const inner = edge === "strong" ? "inset-6" : "inset-3";

  return (
    <div className={`relative ${className}`}>
      <div
        aria-hidden="true"
        className={`absolute ${slack} pointer-events-none`}
        style={edge === "none" ? undefined : { filter: `url(#deckle-${edge})` }}
      >
        <div
          className={`absolute ${inner} ${TONE[tone]} ${
            shadow ? "shadow-card" : ""
          }`}
        />
      </div>
      {stitched && <Stitching />}
      <div className="relative">{children}</div>
    </div>
  );
}
