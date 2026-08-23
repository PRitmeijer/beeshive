import Link from "next/link";

/**
 * The 404 boundary for everything under a language segment.
 *
 * It has to exist. Without it `notFound()` — thrown by any page whose record
 * is missing, a blog slug that no longer resolves being the ordinary case —
 * falls back to Next's built-in not-found, which renders against the *root*
 * layout. That layout returns its children bare: `<html>` and `<body>` are
 * rendered by the locale layout below it, because only that one knows the
 * language to put in `lang`. Next cannot assemble a document out of that, so
 * it serves `<html id="__next_error__">` instead and the browser throws
 * "Application error: a client-side exception has occurred" over a blank
 * page. A missing article took the whole site down with it.
 *
 * Sitting inside `[locale]`, this renders within that layout instead, so it
 * arrives as a real page with the navigation and the footer around it.
 *
 * Next does not pass params to a not-found boundary, so there is no locale to
 * read here. Both languages are printed rather than guessed at — a visitor
 * who has landed on a dead link is the last person to serve a language they
 * may not read.
 */
export default function LocaleNotFound() {
  return (
    <section className="relative flex min-h-[60vh] items-center overflow-hidden bg-paper">
      <div className="relative z-10 mx-auto w-full max-w-3xl px-6 py-24 md:px-12 md:py-32">
        <p className="label text-hive-300">404</p>

        <h1 className="heading-xl mt-6 text-hive-800">
          Deze pagina bestaat niet
        </h1>
        <p className="mt-6 max-w-[34rem] text-lg leading-[1.75] text-hive-500">
          De pagina die je zocht is verplaatst of verwijderd. Ga terug naar de
          homepage of bekijk het blog.
        </p>

        <p className="mt-10 max-w-[34rem] text-lg leading-[1.75] text-hive-400">
          <span lang="en">
            This page does not exist. It may have moved or been removed.
          </span>
        </p>

        <div className="mt-12 flex flex-wrap gap-4">
          <Link
            href="/"
            className="btn-primary"
          >
            Naar de homepage
          </Link>
          <Link
            href="/blog"
            className="btn-secondary"
          >
            Naar het blog
          </Link>
        </div>
      </div>
    </section>
  );
}
