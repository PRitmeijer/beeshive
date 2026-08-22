/**
 * A strip of stamps torn from a sheet.
 *
 * Three separate stamps at three sizes and three tilts read as scattered
 * stickers. A strip is one object: shared format, one angle, perforations
 * punched clean through the paper between the panels, so it composes instead
 * of cluttering.
 *
 * It runs in two directions. Beside a wide hero the strip hangs vertically,
 * the way a sheet of stamps sits in a margin. Once the layout can no longer
 * give it a side column there is no margin to hang in, and a tall column of
 * three under the text leaves a long empty gutter next to it; there the same
 * strip is torn off the roll sideways instead, three panels shoulder to
 * shoulder across the full measure.
 *
 * The outer edge is a scalloped clip (semicircular bites out of the boundary);
 * the rows of holes between panels are real punched circles, subtracted from a
 * mask. Both are computed from constants at module scope, so the markup is
 * identical on the server and the client.
 */

const HOLE = 5.6;

/**
 * One cell's geometry per direction. The sideways cell is narrower and its
 * caption is set larger in user units, because three cells across a phone
 * screen shrink each one to roughly a third of the width a vertical strip
 * gets; without that the slug would render at about seven pixels.
 */
const SHAPE = {
  vertical: { cellW: 300, cellH: 250, photoH: 176, margin: 14, caption: 13 },
  horizontal: { cellW: 196, cellH: 258, photoH: 176, margin: 11, caption: 15 },
} as const;

export type StripOrientation = keyof typeof SHAPE;

/** Evenly spaced hole centres along an edge of the given length. */
function centres(length: number, target = 19) {
  const n = Math.max(3, Math.round(length / target));
  return Array.from({ length: n }, (_, i) => ((i + 0.5) * length) / n);
}

/**
 * Traversed clockwise, sweep-flag 0 curves against the outer boundary, which
 * is exactly the inward bite a perforation leaves.
 */
function scallop(totalW: number, totalH: number) {
  const xs = centres(totalW);
  const ys = centres(totalH);
  const arc = (x: number, y: number) => `A${HOLE},${HOLE} 0 0 0 ${x},${y}`;
  const f = (v: number) => +v.toFixed(2);
  let d = "M0,0";
  for (const cx of xs) d += ` L${f(cx - HOLE)},0 ${arc(f(cx + HOLE), 0)}`;
  d += ` L${totalW},0`;
  for (const cy of ys) d += ` L${totalW},${f(cy - HOLE)} ${arc(totalW, f(cy + HOLE))}`;
  d += ` L${totalW},${totalH}`;
  for (const cx of [...xs].reverse())
    d += ` L${f(cx + HOLE)},${totalH} ${arc(f(cx - HOLE), totalH)}`;
  d += ` L0,${totalH}`;
  for (const cy of [...ys].reverse()) d += ` L0,${f(cy + HOLE)} ${arc(0, f(cy - HOLE))}`;
  return d + " Z";
}

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
  /** Which way the strip was torn off the sheet. */
  orientation?: StripOrientation;
}

export function StampStrip({
  panels,
  className = "",
  tilt = -2.4,
  orientation = "vertical",
}: StampStripProps) {
  const { cellW, cellH, photoH, margin, caption } = SHAPE[orientation];
  const across = orientation === "horizontal";
  const totalW = across ? cellW * panels.length : cellW;
  const totalH = across ? cellH : cellH * panels.length;
  // The two directions can both be in the document at once, one of them hidden
  // by a media query, so the mask ids have to differ or the second strip
  // would be clipped by the first one's mask.
  const uid = `strip-${orientation}-${panels.length}`;
  const photoW = cellW - margin * 2;

  // Holes are punched along the seam between one panel and the next: a row of
  // them across the sheet when the strip hangs, a column down it when it runs
  // sideways.
  const seamCentres = centres(across ? cellH : cellW);

  return (
    <figure
      className={`relative ${className}`}
      style={{ transform: `rotate(${tilt}deg)` }}
    >
      <svg
        viewBox={`0 0 ${totalW} ${totalH}`}
        className="w-full drop-shadow-[0_12px_20px_rgba(66,40,16,0.24)]"
        role="group"
      >
        <defs>
          <mask id={`mask-${uid}`}>
            <path d={scallop(totalW, totalH)} fill="#fff" />
            {/* Punched clean through, between one panel and the next. */}
            {panels.slice(1).map((_, i) =>
              seamCentres.map((c) => (
                <circle
                  key={`${i}-${c}`}
                  cx={across ? cellW * (i + 1) : c}
                  cy={across ? c : cellH * (i + 1)}
                  r={HOLE}
                  fill="#000"
                />
              )),
            )}
          </mask>
        </defs>

        <g mask={`url(#mask-${uid})`}>
          <rect width={totalW} height={totalH} fill="#F1ECE1" />

          {panels.map((panel, i) => {
            const left = across ? cellW * i : 0;
            const top = across ? 0 : cellH * i;
            const clipId = `photo-${uid}-${i}`;
            return (
              <g key={panel.src}>
                <defs>
                  <clipPath id={clipId}>
                    <rect
                      x={left + margin}
                      y={top + margin}
                      width={photoW}
                      height={photoH}
                    />
                  </clipPath>
                </defs>

                <image
                  href={panel.src}
                  x={left + margin}
                  y={top + margin}
                  width={photoW}
                  height={photoH}
                  preserveAspectRatio="xMidYMid slice"
                  clipPath={`url(#${clipId})`}
                >
                  <title>{panel.alt}</title>
                </image>
                <rect
                  x={left + margin}
                  y={top + margin}
                  width={photoW}
                  height={photoH}
                  fill="none"
                  stroke="rgba(66,40,16,0.2)"
                  strokeWidth="1"
                />

                {/* One line, ranged left under the plate, like a printed slug.
                    Sideways there is no room for an index numeral beside it,
                    so the slug takes the width on its own — and is set to that
                    width exactly, letter-spaced to fit. Three cells across a
                    phone leave about a hundred pixels each, and the longest of
                    these captions would otherwise run off the end of the sheet
                    and be cut clean off by the scalloped mask. */}
                <text
                  x={left + margin + 2}
                  y={top + margin + photoH + (across ? 40 : 36)}
                  fill="#422810"
                  fontSize={caption}
                  fontFamily="Jost, system-ui, sans-serif"
                  fontWeight="600"
                  {...(across
                    ? { textLength: photoW - 4, lengthAdjust: "spacing" as const }
                    : { letterSpacing: 2.6 })}
                >
                  {panel.caption.toUpperCase()}
                </text>
                {!across && (
                  <text
                    x={left + cellW - margin - 2}
                    y={top + margin + photoH + 36}
                    fill="#6E5525"
                    fontSize={caption}
                    fontFamily="Jost, system-ui, sans-serif"
                    fontWeight="500"
                    textAnchor="end"
                  >
                    {String(i + 1).padStart(2, "0")}
                  </text>
                )}
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
