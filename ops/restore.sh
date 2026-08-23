#!/usr/bin/env bash
#
# Restore the database from the R2 repository.
#
#   ops/restore.sh --yes-really
#   ops/restore.sh --time "2026-08-01 12:00:00" --yes-really
#   ops/restore.sh --set 20260801-031500F --yes-really
#
# THIS THROWS THE CURRENT DATABASE AWAY. Everything written since the point you
# restore to is gone: reservations, contact messages, newsletter signups, any
# edit the owners made in the admin. There is no undo, and the backup you are
# restoring from is not itself replaced, so a second attempt with a different
# --time is possible — but only from the same repository, and only if you do
# not let the site write to the restored cluster in between.
#
# Without --yes-really it prints the plan and stops. That is deliberate: the
# only wrong way to run this script is quickly.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
stanza="${PGBACKREST_STANZA:-beeshive}"
cd "$root"

target_time=""
target_set=""
confirmed="no"

while [ $# -gt 0 ]; do
  case "$1" in
    --time)        target_time="${2:-}"; shift 2 ;;
    --set)         target_set="${2:-}"; shift 2 ;;
    --yes-really)  confirmed="yes"; shift ;;
    -h|--help)
      sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [ -n "$target_time" ] && [ -n "$target_set" ]; then
  echo "Give either --time or --set, not both." >&2
  exit 1
fi

# What is actually in the repository, printed before anything is decided. If
# this list is empty or ends earlier than you expect, stop here — a restore
# from a repository that does not contain what you think it does is how a bad
# afternoon becomes a bad week.
echo "Repository contents:"
docker compose run --rm --no-deps -T --entrypoint pgbackrest pgbackrest \
  --stanza="$stanza" info
echo

echo "About to overwrite:"
echo "  - the entire PostgreSQL data directory in the 'pg-data' volume"
echo "    (every table in the CMS: pages, blog, menu, reservations, users)"
echo "  - the running database container will be stopped and restarted"
echo "  - the website will be offline for the duration"
echo
echo "NOT touched:"
echo "  - uploaded media (Cloudflare R2, or the 'media-uploads' volume)"
echo "  - the backup repository itself"
echo
if [ -n "$target_time" ]; then
  echo "Restoring to the state at: $target_time (local time of the cluster)"
elif [ -n "$target_set" ]; then
  echo "Restoring backup set: $target_set"
else
  echo "Restoring the most recent backup, replaying all archived WAL."
fi
echo

if [ "$confirmed" != "yes" ]; then
  echo "Nothing has been changed. Add --yes-really to actually do this."
  exit 1
fi

# 1. The application first. It holds open connections and would keep writing
#    into a database that is about to be replaced underneath it, and Payload
#    would try to apply migrations against a half-restored cluster.
echo "==> stopping the website"
docker compose stop beeshive

# 2. Then the server itself. pgBackRest refuses to restore over a running
#    cluster, and rightly so: the files it is replacing are open.
echo "==> stopping PostgreSQL"
docker compose stop postgres

# 3. The restore. --delta lets pgBackRest compare what is already in the data
#    directory against the backup and only replace what differs, which is both
#    faster and what makes it safe to re-run after a failure. It still
#    overwrites; "delta" is about speed, not about caution.
#
#    --target-action=promote brings the cluster up as a normal read-write
#    server once it has replayed to the target, rather than leaving it paused
#    in recovery waiting for an instruction nobody is going to give it.
#
#    --no-deps so that starting this one-off container does not start the
#    database we have just carefully shut down.
echo "==> restoring"
args="--stanza=$stanza --delta"
if [ -n "$target_time" ]; then
  args="$args --type=time --target=$target_time --target-action=promote"
elif [ -n "$target_set" ]; then
  args="$args --set=$target_set --type=immediate --target-action=promote"
fi
# shellcheck disable=SC2086
docker compose run --rm --no-deps -T --entrypoint pgbackrest pgbackrest $args restore

# 4. Back up. Postgres replays the archived WAL on start; until it has, it
#    refuses connections, so the healthcheck is the thing to watch.
echo "==> starting PostgreSQL (it will replay WAL first; watch the log)"
docker compose up -d postgres
docker compose logs -f --tail=40 postgres &
logs_pid=$!
until docker compose exec -T postgres pg_isready -q; do sleep 2; done
kill "$logs_pid" 2>/dev/null || true

echo "==> starting the website"
docker compose up -d beeshive

echo
echo "Done. Check the site, then take a fresh full backup so that the next"
echo "restore starts from the cluster as it is now:"
echo "    ops/backup.sh full"
