import { withPayload } from "@payloadcms/next/withPayload";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The Dockerfile copies .next/standalone; without this Next never writes it
  // and the image build fails at the COPY step.
  output: "standalone",
  // libsql loads its native binding by a name it computes at runtime
  // (@libsql/linux-x64-musl inside the alpine image, something else on a
  // developer's machine), so Next's file tracing cannot see it and leaves it
  // out of the standalone bundle. The container then starts, serves a 500 on
  // every page, and logs MODULE_NOT_FOUND. Naming the packages here puts the
  // binding that was actually installed at build time into the output.
  outputFileTracingIncludes: {
    "/**": ["./node_modules/libsql/**", "./node_modules/@libsql/**"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
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
   */
  async headers() {
    return [
      {
        source: "/:locale(en)?/reservering/:token*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
    ];
  },
};

export default withPayload(nextConfig);
