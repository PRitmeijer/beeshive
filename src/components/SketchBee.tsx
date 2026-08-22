/**
 * The bee as it appears on the dessert page of the printed menu: an outline
 * contour drawing in pale olive, not a filled silhouette.
 *
 * Every stroke is drawn twice: once at full weight, once offset a hair and
 * held back to about a third opacity. That is what a pencil or pen doing a
 * second pass over a line actually looks like, and it costs nothing next to
 * running an SVG displacement filter on five moving elements.
 */

interface SketchBeeProps {
  size?: number;
  className?: string;
  /** 0-2. Small differences between repeats, the way hand-drawn ones differ. */
  variant?: 0 | 1 | 2;
  strokeWidth?: number;
}

const VARIANTS = [
  { dx: 0.55, dy: -0.4, rot: 0.9, wing: 0 },
  { dx: -0.5, dy: 0.5, rot: -1.2, wing: 2.5 },
  { dx: 0.35, dy: 0.6, rot: 1.6, wing: -2 },
] as const;

function Contours({ wing }: { wing: number }) {
  return (
    <>
      {/* antennae */}
      <path d="M29.4 11.6C27 7.6 24.2 5.4 21.3 4.9" />
      <path d="M34.6 11.6C37 7.6 39.8 5.4 42.7 4.9" />
      <circle cx="20.9" cy="4.7" r="0.9" />
      <circle cx="43.1" cy="4.7" r="0.9" />

      {/* head + thorax */}
      <ellipse cx="32" cy="15.2" rx="5.1" ry="4.5" />
      <ellipse cx="32" cy="23.1" rx="6.6" ry="5.6" />

      {/* wings: forewings sweep up and out, hindwings tuck beneath */}
      <g transform={`rotate(${wing} 32 22)`}>
        <path d="M27.5 20.5C21 13 11 8.5 7 11.5C3 14.5 7.5 23 15 26.5C20 28.8 25.5 26.5 27.5 20.5Z" />
        <path d="M25.4 21.6C20 19 14.2 15.6 10.2 12.6" />
        <path d="M27 24.6C22 23.6 15.2 24.6 12.7 27.6C10.7 30.1 15 32.5 20.4 31.6C23.9 31 26.4 28.1 27 24.6Z" />
      </g>
      <g transform={`rotate(${-wing} 32 22)`}>
        <path d="M36.5 20.5C43 13 53 8.5 57 11.5C61 14.5 56.5 23 49 26.5C44 28.8 38.5 26.5 36.5 20.5Z" />
        <path d="M38.6 21.6C44 19 49.8 15.6 53.8 12.6" />
        <path d="M37 24.6C42 23.6 48.8 24.6 51.3 27.6C53.3 30.1 49 32.5 43.6 31.6C40.1 31 37.6 28.1 37 24.6Z" />
      </g>

      {/* abdomen + banding */}
      <path d="M32 27C39.5 27 41 32 40.5 38C40 45 36 52.5 32 54.6C28 52.5 24 45 23.5 38C23 32 24.5 27 32 27Z" />
      <path d="M24.6 33.6C28 34.9 36 34.9 39.4 33.6" />
      <path d="M24.2 39.6C28 41.1 36 41.1 39.8 39.6" />
      <path d="M26 45.6C29 46.9 35 46.9 38 45.6" />
    </>
  );
}

export function SketchBee({
  size = 48,
  className = "",
  variant = 0,
  strokeWidth = 1.25,
}: SketchBeeProps) {
  const v = VARIANTS[variant];

  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {/* the second pass of the pen */}
      <g
        opacity="0.34"
        transform={`translate(${v.dx} ${v.dy}) rotate(${v.rot} 32 32)`}
      >
        <Contours wing={v.wing} />
      </g>
      <g>
        <Contours wing={v.wing} />
      </g>
    </svg>
  );
}
