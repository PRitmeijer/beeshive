import { ImageResponse } from "next/og";
import { readFile } from "fs/promises";
import path from "path";

/**
 * The drawn share card: the picture a chat app shows for a page that has no
 * photograph of its own.
 *
 * src/lib/metadata.ts decides when this is used and hands it the page's title
 * and one line under it; everything else is fixed, because the point of the
 * card is that a link to this site is recognisable before anyone reads the
 * words on it. Cream paper, ink, the ochre rule, and the bee — the same four
 * things the printed menu is made of.
 *
 * Two constraints shape the code more than the design does.
 *
 * `ImageResponse` renders through satori, which is not a browser: it knows no
 * stylesheet, no next/font, no cascade and no `display: block`. Every rule is
 * an inline style, every box that holds more than one child says `flex` out
 * loud, and a typeface has to arrive as bytes. See the note above loadFonts().
 *
 * And a scraper hits this URL again and again — once per platform, per share,
 * and again whenever a cache expires — with a query string it read off a page
 * rather than one we wrote. So the answer is cached for a year (the query
 * string is the cache key; a different title is a different URL), nothing here
 * touches the database, and nothing here can throw: a query string full of
 * rubbish gets the plain card, never a 500. A 500 is a blank preview, and a
 * blank preview is cached for days.
 */

/** Reads two font files off the disk, so it cannot run on the edge. */
export const runtime = "nodejs";

const WIDTH = 1200;
const HEIGHT = 630;

/** The three colours the rest of the site is built from. */
const PAPER = "#F1ECE1";
const INK = "#422810";
const OCHRE = "#C9A55B";

/** Longer than this and the card stops being a card. */
const TITLE_MAX = 70;
const SUBTITLE_MAX = 110;

const SITE_NAME = "De Bee's Hive";

/**
 * The bee, taken from bee.svg by way of <BeeGlyph> — the finalised artwork
 * rather than the looser <SketchBee>, because this is the mark standing in for
 * the whole site.
 *
 * It is a data URI in an <img> rather than inline SVG elements, because satori
 * renders SVG only through an image. Built once at module load; the base64 of
 * four kilobytes is not worth doing per request.
 */
const BEE_PATH =
  "M2630 2385 c-33 -35 -18 -58 42 -65 67 -8 145 -72 210 -174 l32 -49 -29 -21 c-53 -37 -90 -82 -104 -124 -8 -23 -19 -42 -25 -42 -6 0 -53 18 -104 40 -119 51 -234 85 -376 109 -129 22 -373 44 -431 39 l-40 -3 1 -95 c0 -77 6 -114 32 -195 60 -191 163 -302 342 -365 47 -17 85 -30 85 -30 0 0 0 -33 0 -74 0 -88 17 -119 85 -153 90 -46 202 -24 319 61 l46 34 1 -137 c1 -120 4 -146 28 -221 29 -87 75 -187 119 -256 43 -68 107 -144 121 -144 8 0 36 30 64 67 143 196 212 389 212 601 l0 83 45 -31 c82 -56 144 -80 213 -80 124 0 187 61 186 182 l-1 67 75 25 c97 33 159 74 227 149 100 110 156 260 159 422 l1 90 -65 3 c-87 4 -361 -24 -480 -50 -100 -21 -317 -95 -375 -128 l-35 -20 -28 63 c-22 47 -40 70 -75 95 -26 18 -47 38 -47 43 0 22 72 118 117 156 63 53 91 67 133 67 32 1 35 4 38 34 3 34 -19 54 -43 36 -154 -113 -203 -159 -248 -229 -38 -60 -44 -65 -82 -65 -26 0 -34 7 -59 51 -37 67 -79 113 -135 151 -25 17 -64 48 -87 70 l-40 38 -24 -25z m40 -25 c0 -5 -7 -10 -16 -10 -8 0 -12 5 -9 10 3 6 10 10 16 10 5 0 9 -4 9 -10z m654 3 c-5 -5 -12 -12 -16 -18 -4 -6 -8 -2 -8 8 0 9 7 17 17 17 9 0 12 -3 7 -7z m-1058 -333 c267 -45 483 -138 655 -282 25 -21 51 -38 59 -38 8 0 39 20 69 44 236 184 505 274 911 304 188 14 176 19 172 -67 -4 -87 -43 -227 -82 -296 -35 -61 -119 -148 -175 -181 -42 -24 -147 -64 -170 -64 -7 0 -25 19 -40 42 -39 59 -92 107 -145 131 -64 30 -190 30 -245 1 -54 -28 -56 -52 -6 -97 75 -68 157 -99 302 -118 46 -5 90 -15 97 -22 20 -16 10 -101 -15 -135 -67 -92 -217 -79 -349 30 -88 72 -255 293 -240 316 6 10 152 95 221 130 71 35 154 54 236 54 98 -1 157 -25 215 -87 34 -37 44 -43 53 -31 9 11 1 23 -38 58 l-50 45 68 12 c73 13 146 50 201 102 29 28 32 34 17 37 -10 2 -35 -11 -57 -32 -21 -19 -52 -42 -68 -50 -46 -24 -156 -39 -220 -30 -31 4 -63 6 -69 5 -20 -3 -16 7 22 53 19 24 35 48 35 55 0 20 -26 12 -40 -14 -21 -39 -78 -71 -180 -99 -138 -38 -390 -174 -390 -210 0 -7 20 -43 45 -80 25 -38 45 -69 45 -70 0 -1 -56 -1 -125 -1 -69 0 -125 3 -125 6 0 3 20 37 45 75 25 37 45 71 45 74 0 10 -134 93 -225 140 -79 40 -146 63 -247 85 -33 6 -94 58 -103 86 -7 22 -35 26 -35 4 0 -8 16 -33 35 -54 l36 -39 -58 -12 c-118 -25 -248 9 -326 85 -41 40 -47 42 -47 16 0 -48 146 -129 238 -133 23 -1 42 -4 42 -8 0 -3 -20 -26 -45 -50 -40 -39 -57 -70 -39 -70 4 0 32 24 63 53 116 107 264 111 466 13 88 -42 205 -112 205 -122 0 -11 -106 -163 -154 -220 -61 -73 -148 -139 -216 -165 -136 -52 -250 7 -250 129 0 69 4 72 84 72 132 0 250 46 334 131 l43 44 -22 18 c-38 31 -126 50 -198 43 -84 -7 -153 -52 -212 -136 -24 -33 -49 -60 -56 -60 -30 0 -139 43 -187 74 -97 62 -161 151 -206 285 -21 64 -45 222 -37 244 7 17 280 3 433 -23z m782 17 c7 -5 12 -32 12 -64 0 -50 3 -58 35 -90 20 -20 34 -37 33 -38 -33 -30 -142 -115 -147 -115 -4 0 -37 25 -74 56 l-68 55 37 42 c34 40 36 45 30 95 -6 52 -6 53 26 67 34 15 92 11 116 -8z m-172 -69 c-8 -51 -38 -85 -73 -85 -14 0 -21 2 -15 6 5 3 13 17 17 31 9 32 53 90 67 90 7 0 8 -15 4 -42z m247 20 c9 -7 23 -33 32 -57 18 -53 18 -51 0 -51 -26 0 -65 52 -65 87 0 36 7 40 33 21z m61 -123 c-4 -8 -11 -15 -16 -15 -6 0 -5 6 2 15 7 8 14 15 16 15 2 0 1 -7 -2 -15z m361 -65 c3 -6 -1 -7 -9 -4 -18 7 -21 14 -7 14 6 0 13 -4 16 -10z m-861 -214 l28 -18 -33 -28 c-53 -45 -148 -89 -214 -100 -69 -11 -145 -13 -145 -4 0 4 12 26 27 49 28 44 99 99 149 115 47 15 157 7 188 -14z m841 -10 c56 -28 115 -93 115 -128 0 -15 -8 -18 -43 -18 -67 0 -157 19 -212 46 -52 24 -125 79 -125 94 0 5 19 15 43 24 61 23 154 15 222 -18z m-1231 -154 c3 -5 -1 -9 -9 -9 -8 0 -12 4 -9 9 3 4 7 8 9 8 2 0 6 -4 9 -8z m1394 -10 c2 -7 -3 -12 -12 -12 -9 0 -16 7 -16 16 0 17 22 14 28 -4z m-547 -27 c16 -9 43 -34 59 -57 25 -34 30 -51 30 -96 0 -51 -1 -54 -22 -49 -13 3 -71 11 -129 18 -101 11 -243 3 -326 -17 -20 -5 -23 -2 -23 22 0 72 41 153 90 180 37 20 281 19 321 -1z m21 -227 l71 -11 -6 -66 c-11 -128 -29 -147 -104 -116 -45 19 -204 20 -291 1 -35 -7 -64 -10 -66 -7 -5 9 -24 101 -30 142 -4 36 -3 37 37 48 64 16 83 18 205 20 62 0 145 -4 184 -11z m-77 -218 c39 -6 78 -13 88 -16 21 -7 19 -17 -25 -114 l-29 -66 -136 1 -135 2 -36 81 c-19 45 -32 85 -28 89 10 10 132 31 186 32 25 0 77 -4 115 -9z m-32 -226 c20 -4 37 -12 37 -18 -1 -6 -24 -42 -52 -80 l-51 -70 -29 35 c-16 19 -43 53 -59 77 l-30 42 23 9 c27 11 107 13 161 5z";

function beeDataUri(color: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="180.5 107 236 189">` +
    `<g transform="translate(0,348) scale(0.1,-0.1)" fill="${color}">` +
    `<path d="${BEE_PATH}"/></g></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

const BEE = beeDataUri(OCHRE);

/**
 * Jost, the face the whole site is set in, as bytes.
 *
 * satori cannot follow the <link> to Google Fonts that the layout uses, and it
 * has no system fonts to fall back on — only the Noto Sans that @vercel/og
 * bundles. So the two weights the card needs live in public/fonts as .ttf.
 * public/ is the one directory the Dockerfile copies into the runtime image
 * whole, which is what makes reading them at `process.cwd()` safe in the
 * standalone build; a font kept beside this file would depend on Next's file
 * tracing noticing it, and it would not.
 *
 * Read once and held, because a scraper comes back. And wrapped: a missing
 * file gives an undefined font list, satori falls back to its own Noto Sans,
 * and the card is set in the wrong face instead of not existing.
 */
type LoadedFont = { name: string; data: ArrayBuffer; weight: 400 | 600; style: "normal" };

let fontsPromise: Promise<LoadedFont[] | undefined> | null = null;

async function loadFonts(): Promise<LoadedFont[] | undefined> {
  const dir = path.join(process.cwd(), "public", "fonts");
  try {
    const [regular, semibold] = await Promise.all([
      readFile(path.join(dir, "Jost-400.ttf")),
      readFile(path.join(dir, "Jost-600.ttf")),
    ]);
    return [
      { name: "Jost", data: toArrayBuffer(regular), weight: 400, style: "normal" },
      { name: "Jost", data: toArrayBuffer(semibold), weight: 600, style: "normal" },
    ];
  } catch (error) {
    console.error("share card: Jost unavailable, falling back to Noto Sans", error);
    return undefined;
  }
}

/** Node hands back a Buffer over a pooled allocation; satori wants the bytes. */
function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  const copy = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(copy).set(buffer);
  return copy;
}

function fonts(): Promise<LoadedFont[] | undefined> {
  fontsPromise ??= loadFonts();
  return fontsPromise;
}

/**
 * Anything from the query string, reduced to one line of printable text.
 *
 * Control characters and newlines go first — satori will happily lay out a
 * vertical tab and the result looks like a rendering bug — then runs of
 * whitespace collapse, then the length is capped. The cap is the real defence:
 * without it a kilobyte of text in `?title=` is a kilobyte of glyphs to shape
 * on every request, from a URL anyone can construct.
 */
function oneLine(raw: string | null, max: number): string {
  if (!raw) return "";
  return raw
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/**
 * Long titles get smaller type rather than a second line that falls off the
 * bottom. The three steps are eyeballed against the width above, not computed:
 * satori has no way to measure text before it lays it out.
 */
function titleSize(title: string): number {
  if (title.length > 46) return 54;
  if (title.length > 28) return 68;
  return 84;
}

/**
 * How a line is allowed to break.
 *
 * Normally: only at spaces, which is what makes "Zuid-Afrikaanse smaken in
 * Utrecht" fall into three tidy lines. But a word with no space in it does not
 * wrap at all, and satori does not clip what overflows — seventy characters of
 * "a" in `?title=` walked straight across the bee. So a single run longer than
 * any real Dutch compound switches the whole line to breaking anywhere, which
 * is ugly and is meant to be: it is the answer to a URL somebody made up, not
 * to a page.
 */
const LONGEST_REAL_WORD = 22;

function breakStyle(text: string): "normal" | "break-all" {
  const longest = text.split(/\s+/).reduce((n, word) => Math.max(n, word.length), 0);
  return longest > LONGEST_REAL_WORD ? "break-all" : "normal";
}

function card(title: string, subtitle: string, fontList: LoadedFont[] | undefined) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: PAPER,
          fontFamily: fontList ? "Jost" : "sans-serif",
          padding: 56,
        }}
      >
        {/* The sheet: a hairline of ink inset from the edge, the way every
            panel on the site sits on the paper rather than bleeding off it. */}
        <div
          style={{
            display: "flex",
            flex: 1,
            border: `2px solid ${INK}1f`,
            padding: "64px 72px",
            position: "relative",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              flex: 1,
              // The bee sits in the right-hand third. `overflow: hidden` is the
              // guard rather than the layout: a title made of one unbroken
              // 70-character word does not wrap, and without this it runs
              // straight through the drawing.
              paddingRight: 300,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                fontSize: 24,
                fontWeight: 600,
                letterSpacing: 5,
                textTransform: "uppercase",
                color: OCHRE,
              }}
            >
              {SITE_NAME}
            </div>
            {/* The same short rule that sits under every eyebrow on the site. */}
            <div style={{ display: "flex", width: 72, height: 3, background: OCHRE, margin: "28px 0 32px" }} />
            <div
              style={{
                fontSize: titleSize(title),
                fontWeight: 600,
                lineHeight: 1.08,
                color: INK,
                wordBreak: breakStyle(title),
              }}
            >
              {title}
            </div>
            {subtitle ? (
              <div
                style={{
                  marginTop: 28,
                  fontSize: 30,
                  fontWeight: 400,
                  lineHeight: 1.35,
                  color: `${INK}b8`,
                  wordBreak: breakStyle(subtitle),
                }}
              >
                {subtitle}
              </div>
            ) : null}
          </div>

          <img
            src={BEE}
            alt=""
            width={300}
            height={240}
            style={{ position: "absolute", right: 64, bottom: 72 }}
          />
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      ...(fontList ? { fonts: fontList } : {}),
      headers: {
        // A year, immutable. The query string is the whole of the input, so
        // one URL can only ever produce one picture — and the platforms that
        // fetch this hold it for days regardless of what we say.
        "Cache-Control": "public, immutable, no-transform, max-age=31536000",
      },
    },
  );
}

export async function GET(request: Request) {
  let title = SITE_NAME;
  let subtitle = "";

  try {
    const params = new URL(request.url).searchParams;
    title = oneLine(params.get("title"), TITLE_MAX) || SITE_NAME;
    subtitle = oneLine(params.get("subtitle"), SUBTITLE_MAX);
  } catch {
    // A URL the platform mangled on the way here. The plain card is a better
    // answer than an error, and it is the card this site would have shown
    // anyway if the page had asked for nothing.
  }

  try {
    return card(title, subtitle, await fonts());
  } catch (error) {
    console.error("share card: falling back to the plain sheet", error);
    // Last resort, and it is a real one: satori and resvg both run WebAssembly,
    // and a container that cannot instantiate it would otherwise turn every
    // share of this site into a broken image. An SVG of the same paper is not
    // as good — some scrapers will not take it — but it is a picture, and it
    // is the right colour.
    return new Response(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">` +
        `<rect width="${WIDTH}" height="${HEIGHT}" fill="${PAPER}"/>` +
        `<rect x="56" y="56" width="${WIDTH - 112}" height="${HEIGHT - 112}" fill="none" stroke="${INK}" stroke-opacity="0.12" stroke-width="2"/>` +
        `<image x="${WIDTH - 420}" y="${HEIGHT - 340}" width="300" height="240" href="${beeDataUri(OCHRE)}"/>` +
        `<text x="128" y="330" font-family="sans-serif" font-size="76" fill="${INK}">${SITE_NAME}</text>` +
        `</svg>`,
      {
        status: 200,
        headers: {
          "Content-Type": "image/svg+xml; charset=utf-8",
          "Cache-Control": "public, max-age=600",
        },
      },
    );
  }
}
