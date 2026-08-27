/**
 * Single-stroke drawn marks, used everywhere the site previously showed an
 * emoji. Emoji are somebody else's artwork dropped into ours; these are drawn
 * on the same grid, in the same weight, and take the surrounding ink colour.
 *
 * Accepts either a name ("sprig") or the emoji the CMS currently stores
 * ("🌿"), so editorial content keeps working untouched. Anything unrecognised
 * falls back to a printer's asterisk rather than leaking an emoji back in.
 */

export type CraftIconName =
  | "pan"
  | "palette"
  | "connection"
  | "globe"
  | "sprig"
  | "heart"
  | "wheat"
  | "milk"
  | "bee"
  | "cup"
  | "mark";

const ALIASES: Record<string, CraftIconName> = {
  "🍳": "pan",
  "🍲": "pan",
  "🥘": "pan",
  "🎨": "palette",
  "🖌️": "palette",
  "🖼️": "palette",
  "🤝": "connection",
  "👐": "connection",
  "🫂": "connection",
  "🌍": "globe",
  "🌎": "globe",
  "🌏": "globe",
  "🌿": "sprig",
  "🌱": "sprig",
  "🍃": "sprig",
  "💛": "heart",
  "❤️": "heart",
  "🧡": "heart",
  "♥️": "heart",
  "🌾": "wheat",
  "🥛": "milk",
  "🧀": "milk",
  "🐝": "bee",
  "☕": "cup",
  "🍵": "cup",
};

/**
 * Slight coordinate drift keeps the marks from reading as a vector icon set.
 *
 * Exported because the drawings are no longer stamped into the page at every
 * mark; <PaperDefs> in Sheet.tsx hangs one <symbol> per entry in the document
 * and every <CraftIcon> points at those. The table stays here, with the names
 * and the aliases it belongs to.
 */
export const MARKS: Record<CraftIconName, React.ReactNode> = {
  pan: (
    <>
      <path d="M5.8 15.4 C5.8 20.6 9.1 24.2 13.2 24.2 C17.4 24.2 20.6 20.6 20.5 15.4 Z" />
      <path d="M20.5 15.4 L28.2 13.2" />
      <path d="M10.4 11.2 C12.1 9.7 8.9 7.9 10.6 6.3" />
      <path d="M15.2 10.9 C16.9 9.4 13.7 7.6 15.4 6" />
    </>
  ),
  palette: (
    <>
      <path d="M16.1 5.4 C23.6 5.6 28.1 10.1 28 15.7 C27.9 19.5 25.1 20.9 22.5 21 C20.5 21.1 19.3 22 19.4 23.4 C19.4 24.9 20.4 25.5 20.4 26.1 C20.4 26.7 19 27 16.5 26.8 C9.5 26.2 4.5 21.4 4.6 15.8 C4.7 9.8 9.5 5.3 16.1 5.4 Z" />
      <circle cx="10.6" cy="13.5" r="1.25" />
      <circle cx="14.9" cy="10.3" r="1.25" />
      <circle cx="20.3" cy="11.7" r="1.25" />
      <circle cx="23.3" cy="15.6" r="1.25" />
    </>
  ),
  connection: (
    <>
      <circle cx="12.4" cy="16.1" r="7.3" />
      <circle cx="19.7" cy="15.9" r="7.3" />
    </>
  ),
  globe: (
    <>
      <circle cx="16" cy="16" r="10.6" />
      <path d="M16 5.4 C12.1 9.5 12.2 22.7 16 26.6" />
      <path d="M16 5.4 C19.9 9.5 19.8 22.7 16 26.6" />
      <path d="M5.6 16.2 L26.4 15.8" />
    </>
  ),
  sprig: (
    <>
      <path d="M16.3 28.2 C15.4 22.1 15.9 15.6 17.4 9.4" />
      <path d="M16.1 21.4 C11.9 21.2 9.5 18.7 9.4 14.6 C13.7 14.5 16.1 17.1 16.1 21.4 Z" />
      <path d="M17.2 15.6 C17.5 11.4 20.1 8.9 24.2 8.7 C24.3 12.9 21.7 15.4 17.2 15.6 Z" />
    </>
  ),
  heart: (
    <path d="M16 26.6 C16 26.6 5.1 19.9 5.2 12.8 C5.3 9.3 8 6.8 11.1 6.9 C13.4 7 15.2 8.3 16 10 C16.9 8.3 18.7 7 21 6.9 C24.1 6.8 26.8 9.3 26.8 12.8 C26.9 19.9 16 26.6 16 26.6 Z" />
  ),
  wheat: (
    <>
      <path d="M16 28.4 C15.8 22.2 15.9 15.6 16.2 9.2" />
      <path d="M16.1 9.6 C13.6 10.9 12.7 13.2 13.6 15.2 C15.7 14.7 16.7 12.9 16.1 9.6 Z" />
      <path d="M16.2 9.6 C18.7 10.9 19.6 13.2 18.7 15.2 C16.6 14.7 15.6 12.9 16.2 9.6 Z" />
      <path d="M16 15.9 C13.5 17.2 12.6 19.5 13.5 21.5 C15.6 21 16.6 19.2 16 15.9 Z" />
      <path d="M16.1 15.9 C18.6 17.2 19.5 19.5 18.6 21.5 C16.5 21 15.5 19.2 16.1 15.9 Z" />
      <path d="M16.2 4.2 C14.4 5.9 14 8.2 15.2 9.9 C17 8.9 17.5 6.9 16.2 4.2 Z" />
    </>
  ),
  milk: (
    <>
      <path d="M11.2 8.9 L20.9 9 L20 26.1 C19.9 27 19.2 27.5 18.4 27.5 L13.6 27.4 C12.8 27.4 12.1 26.9 12.1 26 Z" />
      <path d="M11.6 18.1 C14.1 17.2 18 17.3 20.4 18.2" />
    </>
  ),
  bee: (
    <>
      <path d="M13 20.6 C12.9 17.1 15 15.2 17.6 15.3 C20.3 15.3 22.2 17.2 22.2 20.6 C22.2 24.1 20.2 25.9 17.6 25.8 C15 25.8 13 24 13 20.6 Z" />
      <path d="M13.6 18.7 L21.5 18.8" />
      <path d="M13.2 21.7 L22 21.7" />
      <path d="M16.4 15.1 C13.5 10.6 9.4 9 7.4 10.7 C5.7 12.3 8.1 15.5 12.6 16.3" />
      <path d="M18.7 15.1 C21 10.4 25.5 8.6 27.2 10.4 C28.8 12.1 26.2 15.5 21.8 16.3" />
    </>
  ),
  cup: (
    <>
      <path d="M6.6 11.6 L21.3 11.7 L20.6 21.4 C20.4 24.6 18.2 26.6 14.4 26.6 C10.5 26.5 8 24.4 7.5 21.2 Z" />
      <path d="M21.2 14.4 C24.9 13.6 27.1 14.8 27 17.4 C26.9 20 24.7 21.3 20.9 20.7" />
      <path d="M11.6 7.9 C13.3 6.4 10.1 4.6 11.8 3" />
    </>
  ),
  mark: (
    <>
      <path d="M16 5.8 L16 26.2" />
      <path d="M7.2 10.9 L24.8 21.1" />
      <path d="M7.2 21.1 L24.8 10.9" />
    </>
  ),
};

export function resolveIcon(input?: string | null): CraftIconName {
  if (!input) return "mark";
  const key = input.trim();
  if (key in MARKS) return key as CraftIconName;
  return ALIASES[key] ?? ALIASES[key.replace(/️/g, "")] ?? "mark";
}

interface CraftIconProps {
  /** Icon name, or the emoji the CMS stores for this entry. */
  name?: string | null;
  size?: number;
  className?: string;
  /** Stroke weight: lighter for large marks, heavier for small ones. */
  weight?: number;
}

/**
 * One mark, pointed at the drawing rather than carrying it.
 *
 * It used to inline its path data, which is fine for the two or three marks
 * most pages show and ruinous on the menu card: sixty dishes with two dietary
 * tags each meant a hundred and twenty separate SVG documents to parse and
 * some four hundred <path> nodes, forty-odd kilobytes of markup that was the
 * same eleven drawings over and over. A third of the card's DOM was this
 * component repeating itself.
 *
 * The drawings now hang once in <PaperDefs> and each mark is a <use> pointing
 * at one. Nothing about the rendering changes: the constants that never vary
 * per instance — the fill, the stroke colour, the linecaps — sit on the
 * <symbol>, and the two that do vary come down the tree as they always did.
 * `size` is still the viewport, `weight` is still stroke-width in the symbol's
 * own 32-unit space and so still scales with the mark, and `currentColor`
 * resolves against the ink of whatever the icon is sitting in, because a use
 * shadow tree inherits through the element that referenced it.
 *
 * The one thing this now depends on is <PaperDefs> being in the document. It
 * is mounted at the top of the frontend layout, above everything that draws a
 * mark.
 */
export function CraftIcon({
  name,
  size = 40,
  className = "",
  weight = 1.15,
}: CraftIconProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      strokeWidth={weight}
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <use href={`#craft-${resolveIcon(name)}`} />
    </svg>
  );
}
