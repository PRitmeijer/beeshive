/**
 * Re-encodes the photographs in /public into a format from this decade.
 *
 * These three are the only photographs the repository ships — everything else
 * on the site comes out of the CMS, where Payload and Cloudflare already do
 * this — and all three are in the hero stamp strip, which is the first thing
 * a phone downloads and the element Chrome times the page by.
 *
 * WebP only, and one file per photograph rather than a set to choose from.
 * The strip draws its pictures as SVG <image>, which takes a single href and
 * has no way to ask the browser which formats it understands; there is no
 * <picture> to fall back through. So the format is not offered, it is
 * decided, and it has to be one every visitor can decode. WebP has been
 * universal since Safari 14 in 2020. AVIF would take another 60 KiB off and
 * would leave a slightly older browser looking at three empty plates, which
 * is not a trade worth making on the front page.
 *
 * The JPEGs are left exactly as they are: they are the originals, and they
 * are what a social preview scraper that sends no Accept header will take.
 *
 * Run by hand — `node scripts/optimise-photos.mjs` — rather than from a build
 * hook. Three files that change once a year do not need a build step, and the
 * derivatives are committed so a build never has to have sharp working.
 */

import { readFile, writeFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const PUBLIC_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "public",
);

const SOURCES = ["food-34.jpg", "family.jpg", "food-03.jpg"];

/**
 * Quality chosen by looking at the results, not by reputation. These are food
 * photographs on a cream ground: large areas of smooth out-of-focus
 * background where banding shows, and one sharp subject. WebP at 78 comes out
 * indistinguishable from the JPEG at 100% zoom, which is a good deal more
 * zoom than a 270-point plate gets.
 */
const WEBP = { quality: 78, effort: 6 };

const kib = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;

async function main() {
  let sourceTotal = 0;
  let webpTotal = 0;

  for (const name of SOURCES) {
    const from = path.join(PUBLIC_DIR, name);
    const base = name.replace(/\.[^.]+$/, "");
    const input = await readFile(from);
    const { width, height } = await sharp(input).metadata();

    // `rotate()` with no argument applies the EXIF orientation and then drops
    // the tag, so the derivative cannot end up on its side in a decoder that
    // reads the tag differently from the one that wrote it.
    const webp = await sharp(input).rotate().webp(WEBP).toBuffer();

    await writeFile(path.join(PUBLIC_DIR, `${base}.webp`), webp);

    const original = (await stat(from)).size;
    sourceTotal += original;
    webpTotal += webp.length;

    console.log(
      `${name}  ${width}x${height}  jpeg ${kib(original)}  ->  ` +
        `webp ${kib(webp.length)}`,
    );
  }

  console.log(
    `\ntotal  jpeg ${kib(sourceTotal)}  ->  webp ${kib(webpTotal)} ` +
      `(-${kib(sourceTotal - webpTotal)})`,
  );
}

await main();
