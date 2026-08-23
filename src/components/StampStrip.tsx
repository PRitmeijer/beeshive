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

/**
 * How wide a slug wants to be before anything stretches it.
 *
 * Estimated from the character count rather than measured, because the strip's
 * geometry is worked out at module scope so that the server and the browser
 * emit identical SVG; measuring text needs a laid-out document and would mean
 * a first paint with the wrong number in it.
 *
 * The constants are for Jost 600 in caps: a little under two thirds of the font
 * size per character, plus the tracking a printed slug wants anyway. Being a
 * few points out does not matter, because the only thing this feeds is a
 * ceiling.
 */
const CAP_ADVANCE = 0.62;
const CAP_TRACKING = 1.2;

/**
 * How far past its natural width a caption may be stretched to fill the plate.
 *
 * Sideways, the slug used to be set to the plate's width exactly. That reads
 * beautifully when every caption is about the same length and falls apart the
 * moment one is short: "DE BEE'S" spread across the same run as
 * "VAN HET SEIZOEN" came out as D E   B E E ' S, which is a different thing
 * from letter-fitting.
 *
 * The number is not a guess at what looks acceptable on its own; it is what
 * the neighbouring slugs end up at. "UIT DE KEUKEN" opens to about 1.26 times
 * its natural width to reach the plate and "VAN HET SEIZOEN" to about 1.09, so
 * a short caption allowed the same treatment sits in the same setting as the
 * two beside it rather than announcing that it is shorter. Three slugs in a
 * row want to look like one piece of printing.
 *
 * A caption longer than the plate is still squeezed down to fit, which is what
 * the exact-width rule was for in the first place: three cells across a phone
 * leave about a hundred points each, and the longest of these would otherwise
 * run off the end and be cut clean off by the scalloped mask.
 */
const MAX_STRETCH = 1.3;

function naturalSlugWidth(slug: string, size: number): number {
  if (slug.length === 0) return 0;
  return slug.length * size * CAP_ADVANCE + (slug.length - 1) * CAP_TRACKING;
}

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

export type FocalPoint = "center" | "top" | "bottom" | "left" | "right";

export interface StampPanel {
  src: string;
  /** Describe the photograph for anyone who cannot see it. */
  alt: string;
  /** One short line. Two lines turn to mush at this size. */
  caption: string;
  /**
   * The photograph's own width divided by its own height. Without it there is
   * no way to work out how much of the picture a plate is currently showing,
   * and the zoom below degrades to the old behaviour — see `place()`.
   */
  aspect?: number;
  /** 100 fills the plate, as it always did. Below that, less of it is used. */
  zoom?: number;
  /** Which part of the photograph to keep when the plate has to crop it. */
  focalPoint?: FocalPoint;
}

/**
 * Where the photograph actually lands inside its plate.
 *
 * The owners' word for what they wanted was "zoomed out a little" — the family
 * portrait was arriving cropped so tight that the family was half off the
 * edges. The obvious implementation, shrinking the drawn box, does not do it:
 * a cover crop of a small box and a cover crop of a large box show the same
 * part of the picture, only at different sizes. The photograph has to be
 * allowed to become smaller than the frame it is clipped to, with the sheet
 * showing behind it, and that is only calculable if we know the shape of the
 * original.
 *
 * So: work out the scale at which the picture would exactly cover the plate,
 * multiply it by the zoom, and lay the result out inside the plate at the
 * chosen focal point. Above 100 the picture spills over the edges and is
 * clipped — a real zoom in. Below it the picture pulls its edges inside the
 * plate and the paper stands in the gap, which is what "shows more of the
 * photograph" means in practice.
 */
function place(
  frameX: number,
  frameY: number,
  frameW: number,
  frameH: number,
  aspect: number,
  zoom: number,
  focal: FocalPoint,
) {
  // Measure the original as `aspect` wide by 1 tall; only the ratio matters.
  const cover = Math.max(frameW / aspect, frameH) * (zoom / 100);
  const w = cover * aspect;
  const h = cover;
  const x =
    focal === "left"
      ? frameX
      : focal === "right"
        ? frameX + frameW - w
        : frameX + (frameW - w) / 2;
  const y =
    focal === "top"
      ? frameY
      : focal === "bottom"
        ? frameY + frameH - h
        : frameY + (frameH - h) / 2;
  return { x, y, width: w, height: h };
}

/** The owners' slider stops here; anything wider is a different photograph. */
function clampZoom(zoom: number | undefined) {
  return Math.min(200, Math.max(60, zoom ?? 100));
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
              // Two rows in the CMS can point at the same photograph; the
              // index is what keeps them apart.
              <g key={`${panel.src}-${i}`}>
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

                {/* Two ways of drawing the same thing. With the original's
                    shape known, the box is computed outright and matches the
                    picture exactly, so `slice` has nothing left to crop and
                    the clip path is what holds it inside the plate. Without
                    it — a CMS image saved before Payload recorded its
                    dimensions — there is nothing to compute from, so the plate
                    falls back to the cover crop it has always used and the
                    zoom only scales the box it is drawn in.

                    `href` is served exactly as given. An SVG <image> has no
                    equivalent of <picture>: it cannot offer a browser two
                    formats and let it pick, so whoever supplies the panel
                    supplies the file that is to go over the wire — the WebP
                    in HomeClient's fallbacks, whatever Payload hands back for
                    a CMS image. */}
                <image
                  href={panel.src}
                  {...(panel.aspect
                    ? place(
                        left + margin,
                        top + margin,
                        photoW,
                        photoH,
                        panel.aspect,
                        clampZoom(panel.zoom),
                        panel.focalPoint || "center",
                      )
                    : {
                        x: left + margin,
                        y: top + margin,
                        width: photoW,
                        height: photoH,
                      })}
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

                {/* One line under the plate, like a printed slug. Sideways
                    there is no room for an index numeral beside it, so the
                    slug has the width to itself and is opened up towards it,
                    up to MAX_STRETCH and no further, then centred on the run
                    it did not fill. A long caption is still squeezed down to
                    the plate's width, which is the case this rule was written
                    for. */}
                <text
                  x={
                    across
                      ? left + margin + 2 + (photoW - 4) / 2
                      : left + margin + 2
                  }
                  y={top + margin + photoH + (across ? 40 : 36)}
                  fill="#422810"
                  fontSize={caption}
                  fontFamily="Jost, system-ui, sans-serif"
                  fontWeight="600"
                  {...(across
                    ? {
                        textAnchor: "middle" as const,
                        textLength: Math.min(
                          photoW - 4,
                          naturalSlugWidth(
                            panel.caption.toUpperCase(),
                            caption,
                          ) * MAX_STRETCH,
                        ),
                        lengthAdjust: "spacing" as const,
                      }
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
