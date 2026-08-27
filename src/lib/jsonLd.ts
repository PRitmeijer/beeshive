/**
 * Serialise a JSON-LD object for embedding in a `<script>` tag.
 *
 * The three pages that emit structured data all did this:
 *
 *     dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
 *
 * which is a cross-site scripting hole, and the reason is a detail of
 * JSON.stringify that is easy to miss: it escapes what JSON requires — quotes,
 * backslashes, control characters — and nothing else. `<` and `/` are ordinary
 * characters in a JSON string, so they come through untouched.
 *
 * That matters because the browser does not parse a `<script>` block as JSON.
 * It scans for the closing tag first, and it stops at the first literal
 * `</script` it finds, wherever that appears — inside a string is still inside
 * the element as far as the tokeniser is concerned. So typing
 *
 *     </script><script>alert(1)</script>
 *
 * into any Site Settings field that reaches the structured data — the
 * description, the site name, the street — ends the JSON-LD element early and
 * opens a real one after it. Whatever follows runs on every page that renders
 * that field, with the site's own origin, which means it can read cookies, call
 * the API as the visitor, and rewrite the page. It needs no login beyond the
 * CMS access the owners already have, and it survives every deploy, because the
 * payload lives in the database rather than in the image.
 *
 * The fix is to escape the characters that mean something to an HTML parser
 * into their `\uXXXX` forms. Those are valid JSON escapes and parse back to the
 * identical string, so consumers — Google's rich-results crawler included —
 * read exactly what they read before. Only the bytes on the wire change.
 *
 * `<` alone would close the hole. The rest are here because they cost nothing
 * and each removes a different trick: `>` blocks `-->` from ending a comment
 * that some wrapper introduced, `&` blocks entity-decoding games in contexts
 * that resolve them, and U+2028/U+2029 are the awkward pair — legal inside a
 * JSON string but line terminators to a JavaScript parser, so they can break a
 * script block in ways that look like nothing at all in a text editor.
 */
const ESCAPES: Record<string, string> = {
  "<": "\\u003c",
  ">": "\\u003e",
  "&": "\\u0026",
  "\u2028": "\\u2028",
  "\u2029": "\\u2029",
};

/**
 * The JSON for `__html`, safe to place inside a `<script>` element.
 *
 * Returns `"null"` rather than throwing when handed something JSON.stringify
 * cannot represent (undefined, a bare function). A page that loses its
 * structured data still renders; a page that throws in a server component does
 * not, and a missing rich-results card is a smaller problem than a missing
 * homepage.
 */
export function jsonLdHtml(data: unknown): string {
  const json = JSON.stringify(data) ?? "null";
  return json.replace(/[<>&\u2028\u2029]/g, (char) => ESCAPES[char] ?? char);
}
