/**
 * Re-encodes the photographs in /public into the formats a browser from the
 * last five years would rather have.
 *
 * These three are the only photographs the repository ships — everything else
 * on the site comes out of the CMS, where Payload and Cloudflare already do
 * this. They are served by <picture> through src/components/OptimizedImage,
 * which asks for AVIF, then WebP, then falls back to the JPEG that has always
 * been there. The JPEGs are left exactly as they are: they are the originals,
 * and they are what an old browser and every social preview scraper will take.
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
 * Quality settings chosen by looking at the results, not by reputation.
 * These are food photographs on a cream ground: large areas of smooth
 * out-of-focus background where banding shows, and one sharp subject. AVIF
 * at 52 and WebP at 78 both come out indistinguishable from the JPEG at
 * 100% zoom, which is a good deal more zoom than a 270-point plate gets.
 */
const AVIF = { quality: 52, effort: 6, chromaSubsampling: "4:2:0" };
const WEBP = { quality: 78, effort: 6 };

const kib = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;

async function main() {
  let sourceTotal = 0;
  let avifTotal = 0;
  let webpTotal = 0;

  for (const name of SOURCES) {
    const from = path.join(PUBLIC_DIR, name);
    const base = name.replace(/\.[^.]+$/, "");
    const input = await readFile(from);
    const { width, height } = await sharp(input).metadata();

    // `rotate()` with no argument applies the EXIF orientation and then drops
    // the tag, so the derivative cannot end up on its side in a decoder that
    // reads the tag differently from the one that wrote it.
    const pipeline = () => sharp(input).rotate();

    const avif = await pipeline().avif(AVIF).toBuffer();
    const webp = await pipeline().webp(WEBP).toBuffer();

    await writeFile(path.join(PUBLIC_DIR, `${base}.avif`), avif);
    await writeFile(path.join(PUBLIC_DIR, `${base}.webp`), webp);

    const original = (await stat(from)).size;
    sourceTotal += original;
    avifTotal += avif.length;
    webpTotal += webp.length;

    console.log(
      `${name}  ${width}x${height}  jpeg ${kib(original)}  ->  ` +
        `webp ${kib(webp.length)}  avif ${kib(avif.length)}`,
    );
  }

  console.log(
    `\ntotal  jpeg ${kib(sourceTotal)}  ->  webp ${kib(webpTotal)} ` +
      `(-${kib(sourceTotal - webpTotal)})  avif ${kib(avifTotal)} ` +
      `(-${kib(sourceTotal - avifTotal)})`,
  );
}

await main();
