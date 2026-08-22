/**
 * A torn sheet edge for the boundary between two sections.
 *
 * Sections in the old design met at a ruler-straight colour change, which is
 * the single most "rendered" thing on a page. Here the incoming sheet tears
 * into the outgoing one, with a lighter lip along the tear to suggest the
 * thickness of the stock.
 *
 * The profile is generated from a fixed seed at module scope, so server and
 * client produce byte-identical markup, no hydration drift.
 */

const VIEW_W = 1200;

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Points along the tear, plus the quadratic control point before each. */
function tearProfile(seed: number, height: number) {
  const rand = mulberry32(seed);
  const baseline = height * 0.5;
  // A deckle wanders a couple of millimetres across a sheet, not a centimetre.
  // The fibrous character comes from the displacement filter, not from
  // amplitude: a big zigzag reads as torn card, not handmade paper.
  const amp = height * 0.16;
  const step = 26;

  const pts: { x: number; y: number; cx: number; cy: number }[] = [];
  let prevX = 0;
  let prevY = baseline + (rand() - 0.5) * amp;
  pts.push({ x: 0, y: prevY, cx: 0, cy: prevY });

  for (let x = step; x <= VIEW_W; x += step) {
    const y = baseline + (rand() - 0.5) * amp;
    // Control point overshoots slightly so the tear gets little flicks of
    // fibre rather than a smooth wave.
    const cx = prevX + (x - prevX) * (0.35 + rand() * 0.3);
    const cy = baseline + (rand() - 0.5) * amp * 2.2;
    pts.push({ x, y, cx, cy });
    prevX = x;
    prevY = y;
  }
  return pts;
}

/** The Q-chain alone, without a leading moveto. */
function tearCurves(pts: ReturnType<typeof tearProfile>) {
  let d = "";
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    d += ` Q${p.cx.toFixed(2)},${p.cy.toFixed(2)} ${p.x.toFixed(2)},${p.y.toFixed(2)}`;
  }
  return d;
}

// Two profiles so repeated dividers on one page don't read as a repeat.
const PROFILES = [tearProfile(20260810, 40), tearProfile(776311, 40)] as const;

interface TornEdgeProps {
  /** Fill colour of the sheet doing the tearing. */
  color: string;
  /** `up`: sheet occupies the lower half and tears upward (default).
   *  `down`: sheet occupies the upper half and tears downward. */
  direction?: "up" | "down";
  /** Highlight along the tear, suggesting the cut edge of thick stock. */
  lip?: string;
  /** 0 or 1: picks one of two tear profiles. */
  variant?: 0 | 1;
  className?: string;
}

export function TornEdge({
  color,
  direction = "up",
  lip = "rgba(255,255,255,0.28)",
  variant = 0,
  className = "",
}: TornEdgeProps) {
  const pts = PROFILES[variant];
  const curves = tearCurves(pts);
  const startY = pts[0].y.toFixed(2);
  const edge = `M0,${startY}${curves}`;

  // Both variants walk the tear left-to-right, then close along the outside
  // of the sheet: no path reversal, so the curve stays exactly the same
  // shape as the lip stroked on top of it.
  const body =
    direction === "up"
      ? `${edge} L${VIEW_W},40 L0,40 Z`
      : `M0,0 L0,${startY}${curves} L${VIEW_W},0 Z`;

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} 40`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
      className={`block w-full h-5 md:h-7 ${className}`}
    >
      {/* The deckle filter chews the outline at two frequencies, which is what
          turns a smooth curve into a fibrous edge. Defined in <PaperDefs>. */}
      <g filter="url(#deckle-soft)">
        <path d={body} fill={color} />
      </g>
      <path
        d={edge}
        fill="none"
        stroke={lip}
        strokeWidth="1"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        opacity="0.7"
      />
    </svg>
  );
}
