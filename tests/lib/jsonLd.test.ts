import { describe, expect, it } from "vitest";
import { jsonLdHtml } from "@/lib/jsonLd";

/**
 * The escaping that keeps CMS text from breaking out of a `<script>` tag.
 *
 * Every field in the structured data comes from Site Settings or an event —
 * the description, the site name, the street, the cuisine list — so the owners
 * can put arbitrary text into a `<script>` element on every page of the site
 * without knowing they have done anything unusual. That is the whole risk, and
 * it is why these tests are written against what an HTML tokeniser sees rather
 * than against the escaping rules themselves: the browser stops at the first
 * literal `</script`, so the property worth asserting is that no such sequence
 * survives, whatever produced it.
 *
 * The second half matters just as much and is easier to forget. Escaping that
 * changed the meaning would quietly cost the café its rich-results card in
 * Google, which is a real loss for a restaurant and one nobody would notice for
 * months. So every case checks the JSON still parses back to the identical
 * value.
 */

const parsed = (value: unknown) => JSON.parse(jsonLdHtml(value));

describe("jsonLdHtml", () => {
  it("neuters a closing script tag", () => {
    const html = jsonLdHtml({ description: "</script><script>alert(1)</script>" });
    expect(html).not.toContain("</script");
    expect(html).toContain("\\u003c");
  });

  it("keeps the value identical after escaping", () => {
    const description = "</script><script>alert(1)</script>";
    expect(parsed({ description })).toEqual({ description });
  });

  it("escapes every character an HTML parser reacts to", () => {
    const html = jsonLdHtml({ a: "<", b: ">", c: "&" });
    for (const char of ["<", ">", "&"]) expect(html).not.toContain(char);
    expect(parsed({ a: "<", b: ">", c: "&" })).toEqual({ a: "<", b: ">", c: "&" });
  });

  it("closes the comment-injection route as well", () => {
    const html = jsonLdHtml({ note: "<!--<script>alert(1)</script>-->" });
    expect(html).not.toContain("<!--");
    expect(html).not.toContain("-->");
  });

  /**
   * U+2028 and U+2029 are legal inside a JSON string but are line terminators
   * to a JavaScript parser, so unescaped they can end a statement inside the
   * script block. They are invisible in an editor, which is what makes them
   * worth a test rather than a comment.
   */
  it("escapes the invisible line terminators", () => {
    const text = "regel\u2028twee\u2029drie";
    const html = jsonLdHtml({ text });
    expect(html).not.toContain("\u2028");
    expect(html).not.toContain("\u2029");
    expect(parsed({ text })).toEqual({ text });
  });

  it("leaves ordinary Dutch content untouched", () => {
    const value = { name: "De Bee's Hive", city: "Utrecht", cuisine: "Café" };
    expect(jsonLdHtml(value)).toBe(JSON.stringify(value));
  });

  it("renders a page rather than throwing on unserialisable input", () => {
    expect(jsonLdHtml(undefined)).toBe("null");
    expect(jsonLdHtml(() => {})).toBe("null");
  });
});
