#!/bin/sh
#
# Ask the site for every public page once, from inside its own container,
# as soon as it starts answering.
#
# The reason is that the image can legitimately be built with no database in
# reach. Every frontend page carries `export const revalidate`, so Next
# prerenders all of them during `next build`; every CMS read is wrapped in a
# try/catch that falls back to the defaults in src/lib/payload.ts. Those two
# facts together mean a build without DATABASE_URI does not fail — it succeeds
# and bakes stock content into .next/server/app, and the first visitor to each
# URL after a deploy is served that HTML while Next regenerates the page behind
# them. The second visitor gets the truth. The first one gets a restaurant that
# closes at a time it does not close at.
#
# Somebody has to be that first visitor, and it had better be this script.
# Eighteen requests, a few seconds, once per container start.
#
# It is worth saying that this is a belt even when the build *did* have a
# database, because a prerendered page is a photograph of the moment it was
# built: /reserveren bakes in a four-week schedule counted from the build date,
# so an image deployed a week after it was built opens with a calendar that
# starts in the past until something asks for the page.
#
# Two passes, deliberately. Next's revalidation is stale-while-revalidate: the
# first request to an out-of-date page is answered from the stale copy and
# starts the regeneration in the background, so pass one is a trigger and its
# status codes say nothing about whether the database was reachable. Pass two,
# after a pause, is the one worth reading.
#
# Nothing here is allowed to bring the container down. The script is
# backgrounded by the Dockerfile's CMD and exits 0 whatever happens; a page
# that fails is logged and stepped over, because a warm-up that can stop a
# deploy is worse than a cold cache.
set -u

PORT="${PORT:-3000}"
ORIGIN="http://127.0.0.1:${PORT}"

# How long to wait for the server to start answering at all. Generous: on a
# cold start the app is also waiting on Postgres and applying any outstanding
# migration before it binds.
WAIT_SECONDS="${WARMUP_WAIT_SECONDS:-120}"

# The pause between the two passes, for the background regenerations to land.
SETTLE_SECONDS="${WARMUP_SETTLE_SECONDS:-8}"

# Every public URL, in both languages.
#
# Dutch keeps the bare paths and English lives under /en; src/middleware.ts
# rewrites a bare path onto /nl internally and the render cache is keyed on the
# path as the browser asked for it, so these are exactly the strings a visitor
# would type. Keep the list in step with the routes under
# src/app/(frontend)/[locale]/ and with src/app/sitemap.ts.
#
# /sitemap.xml appears once rather than twice: it is a single route listing
# both languages and it does not live under /[locale] at all, so there is no
# /en/sitemap.xml to warm. Asking for one would log a 404 and teach whoever
# reads this log to ignore 404s.
#
# The two detail routes, /blog/<slug> and /evenementen/<slug>, are absent on
# purpose. Neither declares generateStaticParams, so neither is prerendered at
# build time and neither can be holding stale HTML: the first request for one
# renders it against whatever database is there. There is nothing to displace.
WARM_PATHS="
/
/over-ons
/kaart
/galerij
/evenementen
/blog
/contact
/reserveren
/en
/en/over-ons
/en/kaart
/en/galerij
/en/evenementen
/en/blog
/en/contact
/en/reserveren
/sitemap.xml
"

# The one request that proves Payload is actually talking to the database.
# Every page above can answer 200 from the prerendered copy without the CMS
# having been reached at all; this route reads the notifications collection on
# each request and cannot.
CANARY="/api/active-notifications"

log() {
  echo "warm-up: $*"
}

# One request, reported as "<status> <cache>".
#
# curl is asked for the headers rather than only the status because
# `x-nextjs-cache` is the whole point: a page can answer 200 from HTML that was
# written at build time, and only the header distinguishes that from a page
# that has just been rendered. HIT means the cached copy is current, STALE
# means the copy served was out of date, and a page that is still STALE after
# pass two is a page whose regeneration never finished.
#
# No -f and no -L: a 500 is still an answer worth reporting, and a 308 is the
# correct reply to some of these rather than something to chase.
probe() {
  head=$(curl -sS -o /dev/null -D - --max-time 30 "$1" 2>/dev/null) || head=""
  code=$(printf '%s\n' "$head" | awk '/^HTTP\//{c=$2} END{ if (c=="") c="000"; print c }')
  cache=$(printf '%s\n' "$head" | awk 'tolower($1)=="x-nextjs-cache:"{ gsub(/\r/,"",$2); print $2 }')
  echo "$code ${cache:--}"
}

if [ "${WARMUP:-on}" = "off" ]; then
  log "disabled by WARMUP=off, skipping"
  exit 0
fi

# Wait for the server without holding it up. This script runs beside
# `node server.js`, not before it, so the loop below polls something that is
# starting in parallel. A bare curl succeeds as soon as the port answers,
# whatever the page then says.
waited=0
while [ "$waited" -lt "$WAIT_SECONDS" ]; do
  if curl -s -o /dev/null --max-time 5 "$ORIGIN/" 2>/dev/null; then
    break
  fi
  sleep 1
  waited=$((waited + 1))
done

if [ "$waited" -ge "$WAIT_SECONDS" ]; then
  log "server never answered on ${ORIGIN} within ${WAIT_SECONDS}s; giving up"
  log "nothing has been warmed: the first visitor to each page may be served"
  log "whatever content the image was built with"
  exit 0
fi

log "server answering after ${waited}s"

# The canary first, so that a stuck CMS is named before eighteen reassuring
# 200s scroll past it.
canary_ok=yes
canary_code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 25 "${ORIGIN}${CANARY}" 2>/dev/null) || canary_code="000"
if [ "$canary_code" = "000" ]; then
  canary_ok=no
  log "ALARM: ${CANARY} did not answer within 25s."
  log "The pages below will still say 200 — they are prerendered — but Payload"
  log "is not reaching the database. The usual cause is a 'dev' row in"
  log "payload_migrations left behind by a script run outside production, which"
  log "makes Payload stop on an interactive prompt that nothing can answer."
  log "See DEPLOY.md, 'When the container comes up healthy and serves nothing new'."
elif [ "$canary_code" != "200" ]; then
  log "note: ${CANARY} answered ${canary_code}"
fi

pass() {
  label="$1"
  report_stale="$2"
  count=0
  failed=0
  stale=0
  for p in $WARM_PATHS; do
    count=$((count + 1))
    set -- $(probe "${ORIGIN}${p}")
    code="$1"
    cache="$2"
    case "$code" in
      2*|3*) ;;
      *)
        failed=$((failed + 1))
        log "${label}: ${p} -> ${code}"
        ;;
    esac
    if [ "$cache" = "STALE" ]; then
      stale=$((stale + 1))
      if [ "$report_stale" = "yes" ]; then
        log "${label}: ${p} is still serving the copy built into the image"
      fi
    fi
  done
  log "${label}: ${count} requested, ${failed} did not answer 2xx/3xx, ${stale} still stale"
  STALE_COUNT="$stale"
  return 0
}

STALE_COUNT=0
pass "pass 1 (triggering)" no
sleep "$SETTLE_SECONDS"
pass "pass 2 (verifying)" yes

# The closing line has to account for both checks. A page can be neither
# stale nor honest: if the cache was filled by an earlier, healthier start of
# the same container, every entry is a fresh HIT while Payload is stuck. The
# canary is what separates those two, so it gets the last word.
if [ "$canary_ok" = "no" ]; then
  log "finished, but do not read the counts above as good news: the CMS never"
  log "answered, so anything the pages are serving came from somewhere else."
elif [ "$STALE_COUNT" -gt 0 ]; then
  log "pass 2 left ${STALE_COUNT} page(s) stale, which means the regeneration is"
  log "not completing. The site is answering, and it is answering with content"
  log "from the image rather than from the database. This needs a person."
else
  log "every page rendered against the live database. Nothing left stale."
fi

exit 0
