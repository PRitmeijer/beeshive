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

export default withPayload(nextConfig);
