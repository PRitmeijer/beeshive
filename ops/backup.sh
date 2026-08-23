#!/usr/bin/env bash
#
# Take a backup right now, out of turn.
#
#   ops/backup.sh full      complete copy of the cluster
#   ops/backup.sh diff      only what changed since the last full (the default)
#
# The scheduler in the pgbackrest container already does this nightly; this is
# for the moment before you change something you are not sure about. It is not
# destructive and can be run while the site is up — pgBackRest takes an online
# backup, so nobody is locked out and no reservation is refused while it runs.
set -euo pipefail

type="${1:-diff}"
case "$type" in
  full|diff|incr) ;;
  *)
    echo "usage: ops/backup.sh [full|diff|incr]" >&2
    exit 1
    ;;
esac

root="$(cd "$(dirname "$0")/.." && pwd)"
stanza="${PGBACKREST_STANZA:-beeshive}"

cd "$root"

echo "Taking a $type backup of stanza '$stanza'."
docker compose exec -T pgbackrest pgbackrest --stanza="$stanza" --type="$type" backup

echo
echo "Repository now holds:"
docker compose exec -T pgbackrest pgbackrest --stanza="$stanza" info
