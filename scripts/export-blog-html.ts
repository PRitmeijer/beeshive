/**
 * The five articles as HTML, for a CMS this machine cannot reach.
 *
 * Run with: npx tsx scripts/export-blog-html.ts [outputDir]
 *
 * `publish-blog-posts.ts` writes straight into Payload over the Local API,
 * which is the right tool when the database is on the same machine and the
 * wrong one when it is not. This writes files instead: open `index.html`,
 * read the article, press Kopieer, paste into the rich text box in the admin
 * panel. What lands on the clipboard is rich text rather than source, so the
 * editor rebuilds the headings, the quote, the bullets and the links as
 * Lexical nodes instead of pasting angle brackets as words.
 *
 * The same page carries everything around the body that the collection asks
 * for — slug, summary, category, tags, date — because a beautiful article
 * pasted into a post with no slug is not published, it is a draft nobody can
 * reach. The photographs are copied out alongside, with their alt text, since
 * they are not in the repository either.
 *
 * Both languages, in both directions: Payload stores one row per locale, so
 * each article is pasted twice, once with the NL tab open and once with EN.
 * Get that the wrong way round and the English blog serves Dutch — see
 * scripts/README.md for why that is hard to undo.
 */
import { mkdirSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import { ARTICLES, type Article } from "./blog-articles";

const OUT = path.resolve(process.argv[2] || "blog-export");

/** Where the photographs are, preferring the copies the publish script renamed. */
const MEDIA_DIR = path.resolve("media");
const PHOTO_DIR =
  process.env.BLOG_PHOTO_DIR ||
  path.join(process.env.HOME || "", "download/DBH/img/gallery");

const log = (line: string) => console.log(`[blog-html] ${line}`);

// ---------------------------------------------------------------------------
// Markdown to HTML
//
// The same subset scripts/publish-blog-posts.ts turns into Lexical nodes, so
// that what somebody pastes into production is the same document the local
// database already holds. If one side ever learns a new block type, the other
// has to learn it in the same commit.
// ---------------------------------------------------------------------------

const INLINE = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*/g;

/** Text into a place where HTML is expected. Ampersand first, or it doubles. */
function escape(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineHtml(source: string): string {
  let html = "";
  let cursor = 0;
  for (const match of source.matchAll(INLINE)) {
    const at = match.index ?? 0;
    if (at > cursor) html += escape(source.slice(cursor, at));
    if (match[1] !== undefined) {
      // Relative hrefs are written out against the live domain. A paste is
      // read by an editor, not by a router: "/reserveren" in the admin panel
      // resolves against the admin panel, and the reader following it later
      // from an email or a preview would land nowhere.
      const url = /^[a-z][a-z0-9+.-]*:/i.test(match[2])
        ? match[2]
        : `https://debeeshive.nl${match[2]}`;
      html += `<a href="${escape(url)}">${escape(match[1])}</a>`;
    } else {
      html += `<strong>${escape(match[3])}</strong>`;
    }
    cursor = at + match[0].length;
  }
  if (cursor < source.length) html += escape(source.slice(cursor));
  return html;
}

function toHtml(markdown: string): string {
  return markdown
    .trim()
    .split(/\n\s*\n/)
    .map((raw) => {
      const lines = raw.trim().split("\n");

      const heading = /^(#{2,4})\s+(.*)$/.exec(lines[0]);
      if (heading) {
        const tag = `h${heading[1].length}`;
        return `<${tag}>${inlineHtml(heading[2])}</${tag}>`;
      }

      if (lines.every((line) => line.startsWith("> "))) {
        return `<blockquote>${inlineHtml(lines.map((l) => l.slice(2)).join(" "))}</blockquote>`;
      }

      if (lines.every((line) => line.startsWith("- "))) {
        const items = lines.map((line) => `  <li>${inlineHtml(line.slice(2))}</li>`);
        return `<ul>\n${items.join("\n")}\n</ul>`;
      }

      return `<p>${inlineHtml(lines.join(" "))}</p>`;
    })
    .join("\n");
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<Article["category"], string> = {
  news: "📰 Nieuws",
  recipes: "🍳 Recepten",
  events: "🎉 Evenementen",
  stories: "📖 Verhalen",
  tips: "💡 Tips",
};

const FIELD_LABELS = {
  nl: { title: "Titel", excerpt: "Samenvatting", body: "Inhoud" },
  en: { title: "Titel (EN)", excerpt: "Samenvatting (EN)", body: "Inhoud (EN)" },
};

/** One copyable field: what to put in it, and a button that copies it. */
function field(label: string, value: string, id: string, rich = false): string {
  return `
      <div class="field">
        <div class="field-head">
          <span class="field-label">${escape(label)}</span>
          <button class="copy" data-target="${id}"${rich ? ' data-rich="1"' : ""}>Kopieer</button>
        </div>
        <div class="field-value${rich ? " prose" : ""}" id="${id}">${rich ? value : escape(value)}</div>
      </div>`;
}

function articleSection(article: Article, locale: "nl" | "en"): string {
  const copy = article[locale];
  const labels = FIELD_LABELS[locale];
  const key = `${article.slug}-${locale}`;
  const body = toHtml(copy.body);

  return `
    <section class="article" id="${key}">
      <header>
        <span class="flag">${locale === "nl" ? "🇳🇱 Nederlands" : "🇬🇧 English"}</span>
        <h2>${escape(copy.title)}</h2>
      </header>

      <div class="sidebar-fields">
        <p><b>URL-slug</b><span><code>${escape(article.slug)}</code>${
          locale === "en" ? " <em>— niet vertaald, staat al goed</em>" : ""
        }</span></p>
        <p><b>Categorie</b><span>${escape(CATEGORY_LABELS[article.category])}</span></p>
        <p><b>Tags</b><span>${article.tags.map((t) => `<code>${escape(t)}</code>`).join(" ")}</span></p>
        <p><b>Publicatiedatum</b><span>${escape(article.publishedDate)}</span></p>
        <p><b>Status</b><span>✅ Gepubliceerd</span></p>${
          article.photo
            ? `
        <p><b>Uitgelichte afbeelding</b><span><code>${escape(article.photo.filename)}</code> — meegeleverd in de map <code>fotos/</code></span></p>
        <p><b>Alt-tekst</b><span>${escape(article.photo.alt[locale])}</span></p>`
            : ""
        }
      </div>

      ${field(labels.title, copy.title, `${key}-title`)}
      ${field(labels.excerpt, copy.excerpt, `${key}-excerpt`)}
      ${field(labels.body, body, `${key}-body`, true)}

      <details>
        <summary>Ruwe HTML van de inhoud</summary>
        <pre>${escape(body)}</pre>
      </details>
    </section>`;
}

const STYLE = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 0 1.5rem 6rem;
    background: #f2ede1; color: #4d2c13;
    font: 16px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  main { max-width: 46rem; margin: 0 auto; }
  h1 { font-size: 2rem; margin: 3rem 0 0.5rem; }
  .lede { color: #7a5a3c; margin: 0 0 2rem; }
  .howto { background: #e6dcc4; border-left: 3px solid #c8a24a; padding: 1rem 1.25rem; border-radius: 2px; }
  .howto ol { margin: 0.5rem 0 0; padding-left: 1.2rem; }
  .howto li { margin: 0.35rem 0; }
  nav { margin: 2.5rem 0; padding: 0; }
  nav ol { margin: 0; padding-left: 1.2rem; }
  nav a { color: #8a5a1e; }
  .article { border-top: 1px solid #d8ccb0; margin-top: 3.5rem; padding-top: 2rem; }
  .article > header { margin-bottom: 1rem; }
  .article h2 { font-size: 1.5rem; margin: 0.35rem 0 0; }
  .flag { font-size: 0.8rem; letter-spacing: 0.08em; text-transform: uppercase; color: #8a6a45; }
  .sidebar-fields {
    background: #eae2cd; border-radius: 3px; padding: 0.85rem 1.1rem; margin: 0 0 1.5rem;
    font-size: 0.9rem;
  }
  /* Flex rather than an inline-block label: an alt text long enough to wrap
     otherwise starts its second line under the label instead of under itself.
     The value is wrapped in one span on purpose — a flex container drops the
     whitespace between two element children, which would run the tag chips
     together. */
  .sidebar-fields p { margin: 0.3rem 0; display: flex; gap: 0.6rem; align-items: baseline; }
  .sidebar-fields b { flex: 0 0 10.5rem; color: #7a5a3c; font-weight: 600; }
  .sidebar-fields span { min-width: 0; }
  code { background: #ded3b8; padding: 0.1rem 0.35rem; border-radius: 2px; font-size: 0.85em; }
  .field { margin: 1.25rem 0; }
  .field-head { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.35rem; }
  .field-label { font-size: 0.78rem; letter-spacing: 0.08em; text-transform: uppercase; color: #8a6a45; }
  .copy {
    font: inherit; font-size: 0.78rem; padding: 0.2rem 0.7rem; cursor: pointer;
    background: #4d2c13; color: #f2ede1; border: 0; border-radius: 2px;
  }
  .copy:hover { background: #8a5a1e; }
  .copy.done { background: #4a7a3a; }
  .field-value { background: #fbf8f0; border: 1px solid #ddd2b8; border-radius: 3px; padding: 0.75rem 1rem; }
  .prose h2 { font-size: 1.25rem; margin: 1.75rem 0 0; }
  .prose h3 { font-size: 1.05rem; margin: 1.5rem 0 0; }
  .prose p { margin: 0.85rem 0; }
  .prose blockquote {
    margin: 1.5rem 0; padding-left: 1rem; border-left: 3px solid #c8a24a;
    font-style: italic; color: #6b4523;
  }
  .prose ul { margin: 0.85rem 0; padding-left: 1.3rem; }
  .prose a { color: #8a5a1e; }
  details { margin-top: 1rem; }
  summary { cursor: pointer; font-size: 0.85rem; color: #8a6a45; }
  pre {
    background: #fbf8f0; border: 1px solid #ddd2b8; border-radius: 3px;
    padding: 0.85rem 1rem; overflow-x: auto; font-size: 0.8rem; line-height: 1.5;
    white-space: pre-wrap; word-break: break-word;
  }
`;

/**
 * Copying rich text, not source.
 *
 * The Clipboard API is tried first, and a selection over the rendered element
 * with execCommand is the fallback. The old way is the one that survives a
 * page opened from the filesystem with no permission prompt, which is exactly
 * how this page is meant to be opened, so it is a fallback rather than a
 * relic. Both put text/html on the clipboard; that is the whole point, because
 * a Lexical editor reads text/html and rebuilds the nodes from it, and reads
 * text/plain as a wall of angle brackets.
 */
const SCRIPT = `
  function flash(button) {
    var was = button.textContent;
    button.textContent = "Gekopieerd";
    button.classList.add("done");
    setTimeout(function () { button.textContent = was; button.classList.remove("done"); }, 1400);
  }

  function selectAndCopy(element) {
    var range = document.createRange();
    range.selectNodeContents(element);
    var selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    var ok = document.execCommand("copy");
    selection.removeAllRanges();
    return ok;
  }

  document.addEventListener("click", function (event) {
    var button = event.target.closest(".copy");
    if (!button) return;
    var element = document.getElementById(button.dataset.target);
    if (!element) return;

    if (!button.dataset.rich) {
      navigator.clipboard.writeText(element.textContent).then(function () { flash(button); });
      return;
    }

    if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
      var item = new ClipboardItem({
        "text/html": new Blob([element.innerHTML], { type: "text/html" }),
        "text/plain": new Blob([element.innerText], { type: "text/plain" }),
      });
      navigator.clipboard.write([item]).then(
        function () { flash(button); },
        function () { if (selectAndCopy(element)) flash(button); }
      );
      return;
    }

    if (selectAndCopy(element)) flash(button);
  });
`;

function page(): string {
  const toc = ARTICLES.map(
    (article) =>
      `      <li>${escape(article.nl.title)} — <a href="#${article.slug}-nl">NL</a> · <a href="#${article.slug}-en">EN</a></li>`,
  ).join("\n");

  const sections = ARTICLES.map(
    (article) => articleSection(article, "nl") + articleSection(article, "en"),
  ).join("\n");

  return `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Blogposts voor De Bee's Hive</title>
<style>${STYLE}</style>
</head>
<body>
<main>
  <h1>Vijf blogposts, klaar om te plakken</h1>
  <p class="lede">Elk artikel staat er twee keer: een Nederlandse en een Engelse versie. Payload bewaart die apart, dus je voert ze allebei in.</p>

  <div class="howto">
    <b>Per artikel:</b>
    <ol>
      <li>Beheerpaneel → <b>Blog</b> → <b>Create new</b>.</li>
      <li>Zet de taalkiezer rechtsboven op <b>Nederlands</b>.</li>
      <li>Vul Titel, Samenvatting, URL-slug, Categorie, Tags en Publicatiedatum in met wat hieronder staat. Zet Status op Gepubliceerd.</li>
      <li>Klik bij <b>Inhoud</b> op Kopieer, en plak in het tekstvak. Koppen, citaat, opsomming en links komen mee.</li>
      <li>Upload de foto uit de map <code>fotos/</code> bij Uitgelichte afbeelding, met de alt-tekst die erbij staat.</li>
      <li>Opslaan. Zet de taalkiezer daarna op <b>English</b> en plak de Engelse Titel, Samenvatting en Inhoud. Opslaan.</li>
    </ol>
    De slug, categorie, tags en datum gelden voor beide talen — die vul je maar één keer in.
  </div>

  <nav>
    <ol>
${toc}
    </ol>
  </nav>
${sections}
</main>
<script>${SCRIPT}</script>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------

function main() {
  mkdirSync(path.join(OUT, "fotos"), { recursive: true });

  writeFileSync(path.join(OUT, "index.html"), page(), "utf8");
  log("index.html");

  for (const article of ARTICLES) {
    for (const locale of ["nl", "en"] as const) {
      const name = `${article.slug}.${locale}.html`;
      writeFileSync(path.join(OUT, name), `${toHtml(article[locale].body)}\n`, "utf8");
      log(name);
    }

    if (!article.photo) continue;
    // The renamed copy in ./media is the same file the local site is using,
    // so production gets exactly what staging has rather than a second pick.
    const staged = path.join(MEDIA_DIR, article.photo.filename);
    const original = path.join(PHOTO_DIR, article.photo.source);
    const source = existsSync(staged) ? staged : original;
    if (!existsSync(source)) {
      log(`foto ontbreekt, overgeslagen: ${article.photo.source}`);
      continue;
    }
    copyFileSync(source, path.join(OUT, "fotos", article.photo.filename));
    log(`fotos/${article.photo.filename}`);
  }

  log(`klaar → ${OUT}`);
}

main();
