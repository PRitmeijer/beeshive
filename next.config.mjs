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
};

export default withPayload(nextConfig);
