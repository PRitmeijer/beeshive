/**
 * The one thing every reader of a rich text field needs to know about Lexical.
 *
 * An untouched editor does not serialise to null or to an empty object: it
 * serialises to a root with one empty paragraph inside it. So the moment
 * anybody opens the settings global and presses Save — whatever tab they were
 * actually there for — every rich text field on it starts holding a document
 * that is structurally full and textually empty. Judged by truthiness that
 * reads as "the owners have written their story"; judged by this, it reads as
 * what it is.
 *
 * It lives here, apart from both the CMS helpers and the pages, because the
 * server (src/lib/payload.ts, src/lib/localeCopy.ts) and the browser bundle
 * both have to answer the same question and neither should drag the other in.
 */

/** Depth-first search for a non-blank `text` property anywhere in a node. */
export function lexicalHasText(node: unknown): boolean {
  if (!node || typeof node !== "object") return false;
  const record = node as Record<string, unknown>;
  if (typeof record.text === "string" && record.text.trim() !== "") return true;
  const children = record.children;
  if (Array.isArray(children)) {
    return children.some((child) => lexicalHasText(child));
  }
  return false;
}

/** Whether a whole serialised document holds anything a reader would see. */
export function lexicalIsEmpty(value: unknown): boolean {
  if (!value || typeof value !== "object") return true;
  return !lexicalHasText((value as { root?: unknown }).root);
}

/** Whether a value is a serialised Lexical document rather than some other object. */
export function isLexicalDocument(value: unknown): boolean {
  return (
    !!value && typeof value === "object" && "root" in (value as object)
  );
}
