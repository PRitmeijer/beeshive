#!/usr/bin/env bash
#
# Put the uploaded photographs back from the restic repository in R2.
#
#   ops/restore-media.sh                                    lists the snapshots, changes nothing
#   ops/restore-media.sh --yes-really                       newest snapshot, missing files put back
#   ops/restore-media.sh --snapshot 4a1b2c3d --yes-really   one particular snapshot
#   ops/restore-media.sh --exact --yes-really               make the volume match the snapshot exactly
#
# By default this only ever ADDS. Every file in the snapshot is written into the
# volume and anything already there that the snapshot does not know about is
# left alone, which is what the likeliest accident actually wants: a photograph
# deleted in the admin comes back, and everything uploaded since stays. --exact
# is for the other case, a volume that was wiped or is no longer trusted, and it
# deletes whatever the snapshot does not contain.
#
# Without --yes-really it lists the snapshots, shows exactly which files it
# would write, and stops. That is deliberate: the only wrong way to run this
# script is quickly.
set -euo pipefail

# There is no point in time to restore to here, only the nights that were
# snapshotted, and that is a property of files rather than a missing feature.
# PostgreSQL can be put back to any minute because it writes an ordered log of
# every change; a directory writes no such log. It costs less than it sounds,
# because an uploaded file never changes after it is written: a re-upload is a
# new name, so deletion is the only thing a snapshot can miss, and a nightly
# snapshot does not miss it for long. The long version is at the top of
# ops/pgbackrest/entrypoint.sh.
#
# THIS DOES NOT TOUCH THE DATABASE, and ops/restore.sh does not touch the
# photographs. The two halves are backed up by different tools at different
# times, so they have to be put back at moments that make sense together. One
# minute of thought before --yes-really:
#
#   - Photographs only is the safe direction. Every row in the database still
#     names a file, and the files those rows name come back.
#   - Database only, back past a night, is the direction that bites. A
#     photograph uploaded after the point you restored to has lost its row; one
#     deleted after it has a row again and no file, which is a broken image on
#     the website.
#   - Doing both: restore the database first, then restore the media from the
#     first snapshot taken AFTER the database's target time. A file with no row
#     is invisible and costs a few kilobytes; a row with no file is visible to
#     every customer. Aim for the harmless one.
#
# The website is stopped while this runs, and that is a decision rather than
# caution by habit. Payload serves these files and writes into the same
# directory whenever somebody uploads, so restoring underneath a running
# container means visitors being shown a gallery that is half back, and restic
# deciding what belongs in a directory that the CMS is writing to. The site is
# down for the minute that a few dozen photographs take.
#
# The restore also runs as root, which the backup container itself never does.
# restic records the owner of every file it snapshots, and these belong to the
# application's user rather than to postgres. Only root can hand them back to
# it; as anyone else the content is restored correctly and left owned by
# whoever ran the restore, and the CMS is then able to display a photograph it
# can no longer delete.

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

snapshot="latest"
delete_mode="no"
confirmed="no"

while [ $# -gt 0 ]; do
  case "$1" in
    --snapshot)    snapshot="${2:-}"; shift 2 ;;
    --exact)       delete_mode="yes"; shift ;;
    --yes-really)  confirmed="yes"; shift ;;
    -h|--help)
      sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

# The volume is mounted at /restore/uploads and restic is aimed at /restore,
# because a snapshot records absolute paths and these were taken from /uploads.
# The backup container's own mount of the volume is read-only and stays that
# way: an extra --volume cannot loosen a read-only mount already in the service
# definition, so the writable one is given a path of its own. The preview below
# mounts it read-only as well, so that the thing which prints the plan is
# incapable of carrying it out.
media_ro() {
  docker compose run --rm --no-deps -T \
    -v media-uploads:/restore/uploads:ro \
    --entrypoint restic pgbackrest "$@"
}

media_rw() {
  docker compose run --rm --no-deps -T --user root \
    -v media-uploads:/restore/uploads \
    --entrypoint restic pgbackrest "$@"
}

# What is actually in the repository, printed before anything is decided. If
# this list is empty or ends earlier than you expect, stop here.
echo "Snapshots in the repository:"
media_ro snapshots
echo

restore_args=(restore "$snapshot" --target /restore)
if [ "$delete_mode" = "yes" ]; then
  restore_args+=(--delete)
fi

# The plan is produced by the same command that will do the work, with
# --dry-run added, so it cannot describe something other than what happens.
echo "What this would do to the 'media-uploads' volume:"
media_ro "${restore_args[@]}" --dry-run --verbose=2
echo

echo "About to write into:"
echo "  - the 'media-uploads' Docker volume, mounted by the website at"
echo "    /app/media: the uploaded originals and every generated size"
if [ "$delete_mode" = "yes" ]; then
  echo "  - and to DELETE anything in that volume which is not in the snapshot"
  echo "    (--exact). Photographs uploaded since the snapshot will be lost."
else
  echo "  - files already there that the snapshot does not know about are left"
  echo "    alone. Add --exact to delete those instead."
fi
echo "  - the website will be stopped for the duration and started again after"
echo
echo "NOT touched:"
echo "  - the database (menu, blog, reservations, the media rows themselves)"
echo "  - the backup repository itself"
echo "  - Cloudflare R2 as upload storage, if the site is configured to use it;"
echo "    in that case the volume is empty by design and this has nothing to do"
echo

if [ "$confirmed" != "yes" ]; then
  echo "Nothing has been changed. Add --yes-really to actually do this."
  exit 1
fi

# Only put the website back if it was up to begin with. Restoring the media
# onto a half-built host, before the database has been restored into it, is a
# real order of events (docs/backups.md), and starting the site in the middle
# of it would have Payload run its migrations against an empty cluster.
website_was_running="no"
if docker compose ps --status running --services 2>/dev/null | grep -qx beeshive; then
  website_was_running="yes"
  echo "==> stopping the website"
  docker compose stop beeshive
fi

# --verify re-reads every file it has just written and checks it against the
# hash in the snapshot. It doubles the reading and it is the difference between
# believing the photographs are back and knowing it.
echo "==> restoring"
media_rw "${restore_args[@]}" --verify

if [ "$website_was_running" = "yes" ]; then
  echo "==> starting the website"
  docker compose up -d beeshive
else
  echo
  echo "The website was not running, so it has been left alone."
fi

echo
echo "Done. Open /galerij and look at it: a photograph that is still missing is"
echo "obvious there and nowhere else. Then take a fresh snapshot, so the next"
echo "restore starts from the volume as it is now:"
echo "    ops/backup-media.sh"
