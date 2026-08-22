/**
 * A sprig of rosemary, drawn the same way as the bees: contour line, second
 * pass offset a hair. Needles are placed along the stem curve rather than
 * hand-listed, so the spacing stays even and the whole thing is deterministic
 * at module scope (identical markup on server and client).
 */

const P0 = { x: 13, y: 62 };
const P1 = { x: 19, y: 28 };
const P2 = { x: 47, y: 5 };

/** Quadratic Bezier point and tangent at t. */
function at(t: number) {
  const u = 1 - t;
  return {
    x: u * u * P0.x + 2 * u * t * P1.x + t * t * P2.x,
    y: u * u * P0.y + 2 * u * t * P1.y + t * t * P2.y,
    dx: 2 * u * (P1.x - P0.x) + 2 * t * (P2.x - P1.x),
    dy: 2 * u * (P1.y - P0.y) + 2 * t * (P2.y - P1.y),
  };
}

/** Needles in opposed pairs, swept toward the tip and shortening as they go. */
function needles() {
  const out: string[] = [];
  const COUNT = 13;
  for (let i = 0; i < COUNT; i++) {
    const t = 0.06 + (i / (COUNT - 1)) * 0.86;
    const p = at(t);
    const len = Math.hypot(p.dx, p.dy) || 1;
    const tx = p.dx / len;
    const ty = p.dy / len;
    // Length tapers toward the growing tip.
    const L = 11.5 - 6.2 * t;
    // Swept back: mostly perpendicular, part along the stem.
    const sweep = 0.42;
    for (const side of [1, -1]) {
      const nx = -ty * side;
      const ny = tx * side;
      const ex = p.x + (nx * (1 - sweep) + tx * sweep) * L;
      const ey = p.y + (ny * (1 - sweep) + ty * sweep) * L;
      // A slight bow, so no needle is a dead straight ruler line.
      const cx = (p.x + ex) / 2 + nx * 0.9;
      const cy = (p.y + ey) / 2 + ny * 0.9;
      out.push(
        `M${p.x.toFixed(1)} ${p.y.toFixed(1)}Q${cx.toFixed(1)} ${cy.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`,
      );
    }
  }
  return out;
}

const NEEDLES = needles();
const STEM = `M${P0.x} ${P0.y}Q${P1.x} ${P1.y} ${P2.x} ${P2.y}`;

function Contours() {
  return (
    <>
      <path d={STEM} />
      {NEEDLES.map((d) => (
        <path key={d} d={d} />
      ))}
    </>
  );
}

interface RosemarySprigProps {
  size?: number;
  className?: string;
  strokeWidth?: number;
}

export function RosemarySprig({
  size = 96,
  className = "",
  strokeWidth = 1.05,
}: RosemarySprigProps) {
  return (
    <svg
      viewBox="0 0 64 70"
      width={size}
      height={(size * 70) / 64}
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
      <g opacity="0.3" transform="translate(0.5 -0.4) rotate(0.8 32 35)">
        <Contours />
      </g>
      <Contours />
    </svg>
  );
}
