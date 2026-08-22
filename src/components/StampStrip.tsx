/**
 * A strip of stamps torn from a sheet.
 *
 * Three separate stamps at three sizes and three tilts read as scattered
 * stickers. A strip is one object: shared format, one angle, perforations
 * punched clean through the paper between the panels, so it composes instead
 * of cluttering.
 *
 * The outer edge is a scalloped clip (semicircular bites out of the boundary);
 * the rows of holes between panels are real punched circles, subtracted from a
 * mask. Both are computed from constants at module scope, so the markup is
 * identical on the server and the client.
 */

const W = 300;
const CELL_H = 250;
const HOLE = 5.6;
const MARGIN = 14;
const PHOTO_H = 176;

/** Evenly spaced hole centres along an edge of the given length. */
function centres(length: number, target = 19) {
  const n = Math.max(3, Math.round(length / target));
  return Array.from({ length: n }, (_, i) => ((i + 0.5) * length) / n);
}

/**
 * Traversed clockwise, sweep-flag 0 curves against the outer boundary, which
 * is exactly the inward bite a perforation leaves.
 */
function scallop(totalH: number) {
  const xs = centres(W);
  const ys = centres(totalH);
  const arc = (x: number, y: number) => `A${HOLE},${HOLE} 0 0 0 ${x},${y}`;
  const f = (v: number) => +v.toFixed(2);
  let d = "M0,0";
  for (const cx of xs) d += ` L${f(cx - HOLE)},0 ${arc(f(cx + HOLE), 0)}`;
  d += ` L${W},0`;
  for (const cy of ys) d += ` L${W},${f(cy - HOLE)} ${arc(W, f(cy + HOLE))}`;
  d += ` L${W},${totalH}`;
  for (const cx of [...xs].reverse())
    d += ` L${f(cx + HOLE)},${totalH} ${arc(f(cx - HOLE), totalH)}`;
  d += ` L0,${totalH}`;
  for (const cy of [...ys].reverse()) d += ` L0,${f(cy + HOLE)} ${arc(0, f(cy - HOLE))}`;
  return d + " Z";
}

const HOLE_XS = centres(W);

export interface StampPanel {
  src: string;
  /** Describe the photograph for anyone who cannot see it. */
  alt: string;
  /** One short line. Two lines turn to mush at this size. */
  caption: string;
}

interface StampStripProps {
  panels: StampPanel[];
  className?: string;
  /** Degrees of tilt for the strip as a whole, not per panel. */
  tilt?: number;
}

export function StampStrip({ panels, className = "", tilt = -2.4 }: StampStripProps) {
  const totalH = CELL_H * panels.length;
  const uid = `strip${panels.length}`;

  return (
    <figure
      className={`relative ${className}`}
      style={{ transform: `rotate(${tilt}deg)` }}
    >
      <svg
        viewBox={`0 0 ${W} ${totalH}`}
        className="w-full drop-shadow-[0_12px_20px_rgba(66,40,16,0.24)]"
        role="group"
      >
        <defs>
          <mask id={`mask-${uid}`}>
            <path d={scallop(totalH)} fill="#fff" />
            {/* Punched clean through, between one panel and the next. */}
            {panels.slice(1).map((_, i) =>
              HOLE_XS.map((cx) => (
                <circle
                  key={`${i}-${cx}`}
                  cx={cx}
                  cy={CELL_H * (i + 1)}
                  r={HOLE}
                  fill="#000"
                />
              )),
            )}
          </mask>
        </defs>

        <g mask={`url(#mask-${uid})`}>
          <rect width={W} height={totalH} fill="#F1ECE1" />

          {panels.map((panel, i) => {
            const top = CELL_H * i;
            const clipId = `photo-${uid}-${i}`;
            return (
              <g key={panel.src}>
                <defs>
                  <clipPath id={clipId}>
                    <rect
                      x={MARGIN}
                      y={top + MARGIN}
                      width={W - MARGIN * 2}
                      height={PHOTO_H}
                    />
                  </clipPath>
                </defs>

                <image
                  href={panel.src}
                  x={MARGIN}
                  y={top + MARGIN}
                  width={W - MARGIN * 2}
                  height={PHOTO_H}
                  preserveAspectRatio="xMidYMid slice"
                  clipPath={`url(#${clipId})`}
                >
                  <title>{panel.alt}</title>
                </image>
                <rect
                  x={MARGIN}
                  y={top + MARGIN}
                  width={W - MARGIN * 2}
                  height={PHOTO_H}
                  fill="none"
                  stroke="rgba(66,40,16,0.2)"
                  strokeWidth="1"
                />

                {/* One line, ranged left under the plate, like a printed slug. */}
                <text
                  x={MARGIN + 2}
                  y={top + MARGIN + PHOTO_H + 36}
                  fill="#422810"
                  fontSize="13"
                  fontFamily="Jost, system-ui, sans-serif"
                  fontWeight="600"
                  letterSpacing="2.6"
                >
                  {panel.caption.toUpperCase()}
                </text>
                <text
                  x={W - MARGIN - 2}
                  y={top + MARGIN + PHOTO_H + 36}
                  fill="#6E5525"
                  fontSize="13"
                  fontFamily="Jost, system-ui, sans-serif"
                  fontWeight="500"
                  textAnchor="end"
                >
                  {String(i + 1).padStart(2, "0")}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
      <figcaption className="sr-only">
        {panels.map((p) => p.alt).join(". ")}
      </figcaption>
    </figure>
  );
}
