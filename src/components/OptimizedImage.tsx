import type { CSSProperties } from "react";

/**
 * A photograph, offered in the formats a browser would rather have.
 *
 * The three photographs the repository ships are 285 KiB of JPEG between
 * them, and the same three pictures are 118 KiB of AVIF. That is most of a
 * second on the connection a phone actually has outside, spent on a format
 * that has been beaten for a decade. `scripts/optimise-photos.mjs` writes the
 * derivatives; this picks whichever one the reader's browser admits to
 * understanding, and falls back to the JPEG that has always been there.
 *
 * It takes the same `src` the plain <img> took, so adopting it is a rename:
 * the AVIF and WebP paths are derived from the JPEG's, not passed in. A `src`
 * that is not a local photograph — anything out of the CMS, anything on the
 * bucket — is handed straight to <img> untouched, because Payload and
 * Cloudflare have already done this job and guessing at derivative filenames
 * on someone else's origin only produces 404s.
 *
 * `width` and `height` are required rather than optional. They are what stops
 * the page from reflowing when the picture finally lands, and the site's
 * layout shift is currently zero — a number that is only ever lost, never won.
 */

/** Formats we generate derivatives for; anything else passes through. */
const DERIVABLE = /^(\/[^?#]*)\.(jpe?g|png)$/i;

interface OptimizedImageProps {
  src: string;
  alt: string;
  /** Intrinsic width in pixels, so the box is reserved before the bytes land. */
  width: number;
  /** Intrinsic height in pixels. */
  height: number;
  className?: string;
  style?: CSSProperties;
  /**
   * Set on the one picture that is on screen when the page opens. It is
   * fetched eagerly and at high priority; everything else waits until it is
   * nearly in view, which is what `loading="lazy"` has meant since 2019.
   */
  priority?: boolean;
  /** Passed to <img> when the picture is laid out responsively. */
  sizes?: string;
}

export function OptimizedImage({
  src,
  alt,
  width,
  height,
  className = "",
  style,
  priority = false,
  sizes,
}: OptimizedImageProps) {
  const base = DERIVABLE.exec(src)?.[1];

  const img = (
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      sizes={sizes}
      className={className}
      style={style}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      decoding={priority ? "sync" : "async"}
    />
  );

  if (!base) return img;

  return (
    <picture>
      <source srcSet={`${base}.avif`} type="image/avif" sizes={sizes} />
      <source srcSet={`${base}.webp`} type="image/webp" sizes={sizes} />
      {img}
    </picture>
  );
}
