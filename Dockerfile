FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# Build the application
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# NEXT_PUBLIC_* is inlined into the client bundle at build time, so setting it
# only at runtime would leave the canonical URLs, hreflang tags and sitemap
# pointing at the fallback. It has to be known here.
ARG NEXT_PUBLIC_SITE_URL=https://debeeshive.nl
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL

# Optional, and the difference between an image that is right from its first
# byte and one that needs warming.
#
# Every frontend page declares `export const revalidate`, so `next build`
# prerenders all of them, reading the CMS as it goes. Every one of those reads
# is wrapped in a try/catch that falls back to the defaults in
# src/lib/payload.ts. A build with no database in reach therefore does not
# fail — it succeeds, quietly, with stock opening hours compiled into
# .next/server/app. Given a URL it can actually connect to, the same build
# prerenders the real thing instead.
#
# Left empty the build behaves exactly as it always has, which is the point:
# `docker compose build` on a laptop, in CI without a service container, or on
# a host where the cluster is not reachable from the build network must all
# still work. See DEPLOY.md for which of the two belts is in play here.
#
# Safe to point at production. During `next build` Payload sets
# NEXT_PHASE=phase-production-build, and src/payload.config.ts turns both the
# dev schema push and prodMigrations off for that phase — the build only ever
# reads.
ARG DATABASE_URI=
ENV DATABASE_URI=$DATABASE_URI

RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# curl, for the warm-up below. About two megabytes, and it earns them twice:
# the warm-up needs to read `x-nextjs-cache` off a response to tell a page that
# was just rendered from one that is still the copy baked into the image, and
# `docker compose exec beeshive curl -I localhost:3100` is the first thing
# anybody does when the site looks down. busybox wget can fetch a URL but
# cannot show you a response header, which is the half that matters here.
RUN apk add --no-cache curl

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
# The warm-up, in the runner rather than carried through the builder: it is
# not part of the build and it changes for reasons the build does not care
# about. `.dockerignore` excludes ops/ wholesale — the database and backup
# images are built from their own contexts — and re-admits this one file.
COPY ops/warm-up.sh ./ops/warm-up.sh
# The executable bit survives a Linux checkout and does not survive every
# other one. Setting it here costs a layer of nothing and removes a failure
# that would only ever show up on somebody else's machine.
RUN chmod 755 ./ops/warm-up.sh
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Uploads for the case where Cloudflare R2 is not configured: with a bucket
# set up nothing is written here, but Payload still resolves MEDIA_DIR at
# startup and the compose file mounts a volume over it either way. The
# directory has to exist and be owned by the user the server runs as, or the
# first upload fails with nothing more useful than "There was a problem while
# uploading the file."
RUN mkdir -p /app/media && chown -R nextjs:nodejs /app/media

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
# No DATABASE_URI default at runtime. It used to point at a SQLite file inside
# the image, which was harmless because the file was the database; a wrong
# PostgreSQL URL baked into the image is not — it would send a container whose
# environment is incomplete at some other cluster instead of failing.
# docker-compose sets it. The builder stage above takes one of its own as a
# build argument; that is a separate stage and none of its environment reaches
# this one.

# The warm-up runs beside the server, not before it.
#
# It has to be after the server is listening, and it must not delay the server
# listening, which normally argues for a supervisor. It does not need one. The
# `&` starts the warm-up in the background, where it polls the port until
# something answers; `exec` then replaces the shell with node, so node is PID 1
# and Docker's SIGTERM reaches it directly on `docker compose stop` rather than
# being swallowed by a wrapper that would have to forward it. Adding tini or
# s6 here would buy nothing except the reaping of one short-lived child that
# outlives nothing.
#
# ops/warm-up.sh always exits 0 and is a background job besides, so it cannot
# fail the container however badly it goes. It is also runnable on its own,
# which is what you want after an import:
#
#     docker compose exec beeshive /app/ops/warm-up.sh
#
# WARMUP=off in the environment skips it.
CMD ["/bin/sh", "-c", "/app/ops/warm-up.sh & exec node server.js"]
