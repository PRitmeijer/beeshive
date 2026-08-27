import { withPayload } from "@payloadcms/next/withPayload";

/**
 * The one host next/image is allowed to fetch from.
 *
 * `hostname: "**"` was here from before there was a bucket, when it was not
 * obvious where the photographs would end up living. It is now: R2_PUBLIC_URL,
 * the custom domain or r2.dev address in front of the Cloudflare bucket. Left
 * open, the optimiser is an open proxy — anyone can point /_next/image at any
 * host on the internet and have this server fetch it, resize it and cache it
 * under our own origin.
 *
 * Without a bucket configured Payload keeps the files on disk and serves them
 * from /api/media/file/..., which is a same-origin path and needs no pattern
 * at all — so an empty list is the correct answer for that deployment, not a
 * broken one. localhost is here for `next dev` against a local uploads folder
 * addressed absolutely.
 */
function mediaPatterns() {
  const patterns = [
    { protocol: "http", hostname: "localhost" },
    { protocol: "http", hostname: "127.0.0.1" },
  ];

  const publicUrl = process.env.R2_PUBLIC_URL;
  if (publicUrl) {
    try {
      const { protocol, hostname } = new URL(publicUrl);
      patterns.push({ protocol: protocol.replace(":", ""), hostname });
    } catch {
      // A malformed R2_PUBLIC_URL is the operator's problem to fix, but it
      // must not take the build with it: the site still renders, images from
      // the bucket simply do not pass the optimiser.
      console.warn(`next.config: R2_PUBLIC_URL is not a URL: ${publicUrl}`);
    }
  }

  return patterns;
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The Dockerfile copies .next/standalone; without this Next never writes it
  // and the image build fails at the COPY step.
  output: "standalone",
  images: {
    remotePatterns: mediaPatterns(),
  },
  /**
   * The guest pass, kept out of every index.
   *
   * The page already sets `robots: { index: false }` in its metadata, but a
   * meta tag only helps a crawler that fetched and parsed the HTML — and the
   * URL carries the token, so by then the token is already in somebody's logs.
   * The header says the same thing in the response itself, which is also what
   * a crawler following a link out of a chat app preview sees first.
   *
   * The locale segment is optional in the pattern because Dutch is served on
   * the bare path and English under /en, and `:token*` rather than `:token`
   * so a mangled link with a trailing segment is covered too.
   *
   * The `Referrer-Policy` beside it is belt and braces, and worth being honest
   * about: every browser in current use already defaults to
   * `strict-origin-when-cross-origin`, which truncates an outgoing referrer to
   * `https://debeeshive.nl` and leaves the token behind. So this header fixes
   * nothing known to be broken. What it does is stop the one URL on this site
   * that is a secret rather than an address from depending on a default that
   * is not universal and that the site does not control — an in-app browser in
   * a chat client, an older build, a policy somebody relaxes upstream. The
   * links out of the page carry `rel="noreferrer"` of their own; this covers
   * the request nobody remembered to put it on. One line, one route.
   *
   * The fonts and the paper tiles are the other entry here. They are
   * content-addressed by hand rather than by a build hash — /fonts/jost-latin
   * .woff2 is that file for as long as the site uses Jost — so they can be
   * cached for a year and never asked for again. Next already does this for
   * everything under /_next/static; nothing does it for /public.
   */
  async headers() {
    return [
      {
        source: "/:locale(en)?/reservering/:token*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
      {
        source: "/fonts/:file*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

/**
 * Keep Payload's colour-scheme client hint off the public site.
 *
 * `withPayload` appends a headers rule of its own on `/:path*` carrying
 * `Accept-CH`, `Vary` and `Critical-CH` for `Sec-CH-Prefers-Color-Scheme`. The
 * admin wants it: it renders in the editor's light or dark theme, and knowing
 * which one on the very first request saves a flash of the wrong one.
 *
 * `Critical-CH`, though, is not a hint to the browser — it is an instruction to
 * throw the response away and ask again with the header attached. A visitor
 * arriving at debeeshive.nl for the first time therefore pays a whole extra
 * round trip before a single byte of the page is usable. Lighthouse reports it
 * as "Avoid multiple page redirects", which is why it took a while to find:
 * the chain it prints is the same URL twice, and `curl -IL` shows no redirect
 * at all, because curl does not implement client hints.
 *
 * Measured here at ~610 ms of the mobile Largest Contentful Paint, on a page
 * that has no light and dark theme to choose between. So the rule is narrowed
 * to the admin, where it earns its cost, and the site is left alone.
 *
 * This has to be done by rewriting what `withPayload` produced rather than by
 * setting something in `nextConfig`, because it appends its rule after ours
 * and Next applies every matching rule.
 */
const CLIENT_HINT_KEYS = new Set(["accept-ch", "critical-ch"]);
const payloadConfig = withPayload(nextConfig);

export default {
  ...payloadConfig,
  headers: async () => {
    const rules = await payloadConfig.headers();

    return rules.flatMap((rule) => {
      if (rule.source !== "/:path*") return [rule];

      const hints = rule.headers.filter(
        (h) =>
          CLIENT_HINT_KEYS.has(h.key.toLowerCase()) ||
          // The Vary that goes with them: without the hint being requested it
          // only splits caches on a header nobody sends.
          (h.key.toLowerCase() === "vary" &&
            h.value === "Sec-CH-Prefers-Color-Scheme"),
      );
      const rest = rule.headers.filter((h) => !hints.includes(h));

      return [
        { ...rule, headers: rest },
        ...(hints.length ? [{ source: "/admin/:path*", headers: hints }] : []),
      ];
    });
  },
};
