import type { SiteSettingsData } from "@/lib/payload";

/**
 * The social marks, in one place.
 *
 * The footer and the contact page both list the same handful of accounts, and
 * they used to do it two different ways: brand glyphs down in the footer, and
 * an "@debeeshive" plus the bare word "Facebook" on the contact page, which
 * read as two unrelated links rather than one row of places to find them.
 */

const PATHS: Record<string, string> = {
  instagram:
    "M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z",
  facebook:
    "M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z",
  google:
    "M12.24 10.285V14.4h6.806c-.275 1.765-2.056 5.174-6.806 5.174-4.095 0-7.439-3.389-7.439-7.574s3.344-7.574 7.439-7.574c2.33 0 3.891.989 4.785 1.849l3.254-3.138C18.189 1.186 15.479 0 12.24 0c-6.635 0-12 5.365-12 12s5.365 12 12 12c6.926 0 11.52-4.869 11.52-11.726 0-.788-.085-1.39-.189-1.989H12.24z",
  tripadvisor:
    "M12.006 4.295c-2.67 0-5.338.784-7.645 2.353H0l1.963 2.135a5.997 5.997 0 004.04 10.43 5.976 5.976 0 004.075-1.6L12 19.525l1.922-1.912a5.976 5.976 0 004.075 1.6 5.997 5.997 0 004.04-10.43L24 6.648h-4.35a13.573 13.573 0 00-7.644-2.353zM6.003 17.212a3.997 3.997 0 110-7.994 3.997 3.997 0 010 7.994zm11.994 0a3.997 3.997 0 110-7.994 3.997 3.997 0 010 7.994zM6.003 11.218a2 2 0 100 4 2 2 0 000-4zm11.994 0a2 2 0 100 4 2 2 0 000-4z",
};

export interface SocialLink {
  name: string;
  url: string;
  path: string;
}

/**
 * The accounts you can actually follow, in a fixed order, with the empty ones
 * dropped. Google is deliberately not among them: a Maps listing is somewhere
 * you read reviews, not somewhere you follow anyone, and filing it under
 * "Volg ons" told a small lie.
 */
export function followLinks(s: SiteSettingsData): SocialLink[] {
  return (
    [
      { name: "Instagram", url: s.socialMedia.instagram, path: PATHS.instagram },
      { name: "Facebook", url: s.socialMedia.facebook, path: PATHS.facebook },
      {
        name: "TripAdvisor",
        url: s.socialMedia.tripadvisor,
        path: PATHS.tripadvisor,
      },
    ] as SocialLink[]
  ).filter((l) => l.url);
}

/** Their Google listing, which is where the reviews live. */
export function reviewLink(s: SiteSettingsData): SocialLink | null {
  return s.googleReviewUrl
    ? { name: "Google", url: s.googleReviewUrl, path: PATHS.google }
    : null;
}

/** Everything at once, for the footer's single row of marks. */
export function socialLinks(s: SiteSettingsData): SocialLink[] {
  const review = reviewLink(s);
  return [...followLinks(s), ...(review ? [review] : [])];
}

/**
 * A row of marks. `className` styles each link, so a caller can set the ink
 * for the ground it is printing on.
 */
export function SocialRow({
  links,
  className = "",
  size = 20,
  gap = "gap-5",
}: {
  links: SocialLink[];
  className?: string;
  size?: number;
  /** Tailwind gap utility; boxed marks want less air than bare ones. */
  gap?: string;
}) {
  if (links.length === 0) return null;
  return (
    <ul className={`flex items-center ${gap}`}>
      {links.map((link) => (
        <li key={link.name}>
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={link.name}
            title={link.name}
            className={className}
          >
            <svg
              width={size}
              height={size}
              fill="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <path d={link.path} />
            </svg>
          </a>
        </li>
      ))}
    </ul>
  );
}
