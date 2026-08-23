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

RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
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
# No DATABASE_URI default. It used to point at a SQLite file inside the image,
# which was harmless because the file was the database; a wrong PostgreSQL URL
# baked into the image is not — it would send a container whose environment is
# incomplete at some other cluster instead of failing. docker-compose sets it.

CMD ["node", "server.js"]
