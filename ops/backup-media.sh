#!/usr/bin/env bash
#
# Take a snapshot of the uploaded photographs right now, out of turn.
#
#   ops/backup-media.sh
#
# The scheduler in the pgbackrest container already does this every night; this
# is for the minute before you delete something in the admin that you are not
# completely sure about. It is not destructive and can be run while the site is
# up: the backup container sees the uploads through a read-only mount, so the
# worst this can do is take a while.
#
# It deliberately does not expire anything. The nightly run applies the
# retention policy; a snapshot taken by hand should be able to add to the
# history without quietly removing an older part of it.
#
# This is the photographs only. The database is a separate backup with its own
# command (ops/backup.sh), and the two are not taken at the same instant, which
# matters when they are put back — see ops/restore-media.sh.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
media_path="${MEDIA_BACKUP_PATH:-/uploads}"

cd "$root"

echo "Taking a snapshot of the uploaded photographs."
docker compose exec -T pgbackrest restic backup "$media_path"

echo
echo "Repository now holds:"
docker compose exec -T pgbackrest restic snapshots
