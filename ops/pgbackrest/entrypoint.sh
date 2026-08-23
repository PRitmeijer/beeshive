#!/bin/sh
#
# Create the stanza if this is a fresh repository, then take backups on a
# schedule until the container is stopped.
#
# There is no cron daemon in here on purpose. busybox crond wants to be root so
# it can drop privileges per job, and this container deliberately runs as the
# postgres user; a loop that looks at the clock once a minute needs no
# privilege at all, writes straight to the container log where
# `docker compose logs pgbackrest` will find it, and can be read by anyone
# without knowing crontab syntax.
#
# Two things are backed up from here, and they are backed up differently
# because they are different kinds of thing. The database gets pgBackRest: a
# full copy, a differential most nights, and every write-ahead-log segment in
# between, which is what lets a restore land on any minute rather than only on
# a backup. The photographs get restic snapshots, and there is no equivalent of
# that minute for them — not because nobody built it, but because it cannot
# exist. Point-in-time recovery works for PostgreSQL because PostgreSQL writes
# an ordered log of every change it makes. A directory of files writes no such
# log, so what it can honestly offer is last night, the night before, and the
# Sunday before that.
#
# That turns out to be enough, and the reason is worth knowing before somebody
# goes looking for the missing feature. An uploaded file never changes. Payload
# names the stored object after the file, so a re-upload is a new name rather
# than a new version of an old one, and nothing in the admin edits a photograph
# in place. Deletion is the only thing that can happen to a file that already
# exists, and a nightly snapshot catches deletions. There are no edits to miss.
#
# restic rather than a sync or a nightly tar, for that same reason. `rclone
# sync` would carry the deletion up to the bucket the same night, so it insures
# against the disk dying and not against somebody removing a photograph in the
# admin — and the second is much the likelier accident. A tar would upload a
# complete copy every night of a directory that gains a few files a month.
# restic gives content-addressed deduplication, so the unchanged photographs
# are stored once however many snapshots point at them; encryption before
# anything leaves this machine; a real history to go back through; and an
# expiry policy that can be stated in a sentence the owners would recognise.
set -eu

STANZA="${PGBACKREST_STANZA:-beeshive}"
# busybox's date has no %-H and the comparisons below would read "08" as an
# invalid octal number, so leading zeros are trimmed by hand here and in the
# loop. The second trim puts the zero back when the value *was* "0": stripping
# it leaves an empty string, and an empty string in a numeric comparison ends
# the scheduler rather than the backup.
BACKUP_HOUR="${BACKUP_HOUR:-3}"; BACKUP_HOUR=${BACKUP_HOUR#0}; BACKUP_HOUR=${BACKUP_HOUR:-0}
BACKUP_MINUTE="${BACKUP_MINUTE:-15}"; BACKUP_MINUTE=${BACKUP_MINUTE#0}; BACKUP_MINUTE=${BACKUP_MINUTE:-0}
FULL_BACKUP_DOW="${FULL_BACKUP_DOW:-0}"   # 0 = Sunday, as `date +%w` counts

# The photographs, mounted read-only from the media-uploads volume. An hour
# after the database on purpose: the two would otherwise be reading the same
# disk and filling the same uplink at the same moment, and the Sunday full
# backup is the one night when the database's share of that is not small.
MEDIA_PATH="${MEDIA_BACKUP_PATH:-/uploads}"
MEDIA_BACKUP_HOUR="${MEDIA_BACKUP_HOUR:-4}"; MEDIA_BACKUP_HOUR=${MEDIA_BACKUP_HOUR#0}; MEDIA_BACKUP_HOUR=${MEDIA_BACKUP_HOUR:-0}
MEDIA_BACKUP_MINUTE="${MEDIA_BACKUP_MINUTE:-30}"; MEDIA_BACKUP_MINUTE=${MEDIA_BACKUP_MINUTE#0}; MEDIA_BACKUP_MINUTE=${MEDIA_BACKUP_MINUTE:-0}

# How much history to keep, and why these three numbers rather than any others.
#
# Fourteen nightly snapshots is the window in which somebody notices that a
# photograph has gone. One removed by accident is usually missed the next time
# the page it was on is looked at, and a fortnight covers "we only spotted it
# when we went through the gallery on Sunday" twice over.
#
# Eight weekly snapshots is for the holiday. The restaurant closes for a couple
# of weeks and nobody opens the admin at all; two months of weeklies means
# coming back from that with the mistake still undoable.
#
# Twelve monthly snapshots is a year, and it is very nearly free. restic stores
# each photograph once and a snapshot is a list of what was there at the time,
# so keeping last October costs the pictures that have been deleted since last
# October and nothing else. It is the only thing that would still be holding a
# photograph nobody missed until the season came round again.
#
# And a week in which nothing at all is thrown away, which is there to close a
# trap the other three would otherwise leave open. --keep-daily keeps the LAST
# snapshot of each day, so a snapshot taken by hand from ops/backup-media.sh in
# the afternoon replaces that morning's automatic one — including when the
# reason it was taken by hand is that something had just gone wrong. Keeping
# everything from the last seven days means a hand-taken snapshot can never
# expire the one beside it, which is the week when that matters most.
MEDIA_KEEP_WITHIN="${MEDIA_KEEP_WITHIN:-7d}"
MEDIA_KEEP_DAILY="${MEDIA_KEEP_DAILY:-14}"
MEDIA_KEEP_WEEKLY="${MEDIA_KEEP_WEEKLY:-8}"
MEDIA_KEEP_MONTHLY="${MEDIA_KEEP_MONTHLY:-12}"

log() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') pgbackrest-scheduler: $*"
}

# Fail early and clearly rather than at three in the morning. Every one of
# these is fatal to a backup, and an unset cipher passphrase in particular
# would otherwise produce a repository nobody can read back.
for var in PGBACKREST_REPO1_S3_BUCKET PGBACKREST_REPO1_S3_ENDPOINT \
           PGBACKREST_REPO1_S3_KEY PGBACKREST_REPO1_S3_KEY_SECRET \
           PGBACKREST_REPO1_CIPHER_PASS; do
  eval "value=\${$var:-}"
  if [ -z "$value" ]; then
    log "$var is not set. Refusing to start. No backups are being taken."
    exit 1
  fi
done

# The media half is checked separately and, unlike the five above, is not fatal.
# That is a deliberate asymmetry: a misconfigured photograph backup must not
# stop the database backup as well, because two things that stopped is a far
# worse night than one, and the database is the half that cannot be re-uploaded
# by hand. So this says loudly what is missing, turns the media schedule off,
# and lets the rest of the container do its job.
media_enabled=yes
for var in RESTIC_REPOSITORY RESTIC_PASSWORD; do
  eval "value=\${$var:-}"
  if [ -z "$value" ]; then
    log "$var is not set: the PHOTOGRAPHS are not being backed up. The database still is."
    media_enabled=no
  fi
done
if [ "$media_enabled" = yes ] && [ ! -d "$MEDIA_PATH" ]; then
  log "$MEDIA_PATH is not mounted: the PHOTOGRAPHS are not being backed up. The database still is."
  media_enabled=no
fi

# Run on every start rather than only on the first, because it is idempotent by
# design: a repository that already holds this stanza is verified and the
# command exits 0. It fails — loudly, and it should — when the repository holds
# a *different* cluster under the same name, which is the one situation where
# carrying on would overwrite somebody else's backups. `pgbackrest info` is not
# a usable test for this: it exits 0 and prints "No stanzas exist in the repo".
log "ensuring stanza $STANZA exists"
pgbackrest --stanza="$STANZA" stanza-create

# Verifies that the database, the archive and the repository agree with one
# another, and pushes a WAL segment through end to end. If this fails on start,
# nothing after it would have worked either.
if pgbackrest --stanza="$STANZA" check; then
  log "check passed"
else
  log "check FAILED: see /var/log/pgbackrest, backups will still be attempted"
fi

# The same idea for the photographs, with one difference worth spelling out.
# `restic cat config` is the read-only way to ask whether the repository is
# there and whether the passphrase opens it, and it cannot tell those two
# questions apart: a missing repository and a wrong passphrase both come back
# as a failure. So init is allowed to run and fail rather than being skipped.
# On a repository that already exists it stops with "config file already
# exists", and that message is how a wrong passphrase announces itself.
# Skipping the attempt would turn a wrong passphrase into silence, which is the
# one outcome worth designing against here.
media_repo_ready() {
  if restic cat config >/dev/null 2>&1; then
    return 0
  fi
  log "media repository not readable, trying to create it"
  if restic init; then
    log "media repository created"
    return 0
  fi
  log "media repository unavailable: either it cannot be reached, or it exists"
  log "and RESTIC_PASSWORD is not the passphrase it was made with"
  return 1
}

# Why this looks at the directory instead of at the configuration.
#
# With R2 configured for the uploads, Payload writes no files here at all
# (disableLocalStorage in src/collections/Media.ts), so the volume is empty by
# design and a nightly snapshot of nothing would be a line in the log every
# night forever. But a host that had photographs here *before* the bucket was
# switched on still has them, because turning R2 on moves nothing, and those
# are worth keeping. The files on the disk answer both questions at once, so
# they are what gets asked; R2_BUCKET is only read to explain an empty
# directory in the right words.
media_has_files() {
  [ -n "$(find "$MEDIA_PATH" -type f -print -quit 2>/dev/null)" ]
}

# Said once, not once a night. media_skip_reason holds what was last announced,
# so the explanation appears when the situation starts and again if it changes,
# and the log stays quiet in between.
media_skip_reason=""
media_due() {
  if media_has_files; then
    media_skip_reason=""
    return 0
  fi
  if [ -n "${R2_BUCKET:-}" ]; then
    reason="bucket"
  else
    reason="empty"
  fi
  if [ "$media_skip_reason" != "$reason" ]; then
    media_skip_reason="$reason"
    if [ "$reason" = "bucket" ]; then
      log "$MEDIA_PATH is empty and R2_BUCKET is set, so Payload is keeping the"
      log "photographs in the bucket and there is nothing here to snapshot."
      log "Cloudflare holds those; docs/backups.md has what that does and does"
      log "not cover. Nothing more will be said about this until a file appears."
    else
      log "$MEDIA_PATH is empty, so there is nothing to snapshot yet. This starts"
      log "on its own the first time somebody uploads a photograph."
    fi
  fi
  return 1
}

media_snapshot() {
  media_repo_ready || return 1

  log "starting media snapshot"
  if restic backup "$MEDIA_PATH"; then
    log "media snapshot finished"
  else
    log "media snapshot FAILED"
    return 1
  fi

  # forget removes the record of a snapshot; --prune is what then reclaims the
  # space, and it only has real work to do on the nights something actually
  # expired. Grouped by path rather than by restic's default of host-and-path,
  # so that the policy is counted over every snapshot of this directory
  # whichever container took it. docker-compose.yml pins this container's
  # hostname for the same reason, and this is the belt to that pair of braces:
  # if the name ever does change, retention still means what it says here
  # instead of quietly starting a second group with fourteen dailies of its
  # own.
  if restic forget --group-by paths \
       --keep-within "$MEDIA_KEEP_WITHIN" \
       --keep-daily "$MEDIA_KEEP_DAILY" \
       --keep-weekly "$MEDIA_KEEP_WEEKLY" \
       --keep-monthly "$MEDIA_KEEP_MONTHLY" \
       --prune; then
    log "media retention applied"
  else
    # Not fatal to the snapshot that was just taken, which is safely in the
    # repository whatever happens here. The cost of a failed prune is disk
    # space in the bucket, not history.
    log "media forget/prune FAILED (tonight's snapshot is still there)"
  fi
}

# Unconditionally, even on a host where the volume is empty and will stay
# empty, because it doubles as the check that `pgbackrest check` is for the
# database: the bucket is reachable, the credentials work and the passphrase
# opens the repository. Finding that out now is the whole point of doing it at
# start-up rather than at half past four on the first morning something needed
# backing up.
if [ "$media_enabled" = yes ]; then
  media_repo_ready || true
  media_due || true
  log "media snapshots scheduled for ${MEDIA_BACKUP_HOUR}:${MEDIA_BACKUP_MINUTE} daily, keeping everything for ${MEDIA_KEEP_WITHIN} then ${MEDIA_KEEP_DAILY} daily / ${MEDIA_KEEP_WEEKLY} weekly / ${MEDIA_KEEP_MONTHLY} monthly"
fi

log "scheduled for ${BACKUP_HOUR}:${BACKUP_MINUTE} daily, full backup on day ${FULL_BACKUP_DOW}"

last_run=""
last_media_run=""
last_check=""

while true; do
  now_hour=$(date +%H); now_hour=${now_hour#0}; now_hour=${now_hour:-0}
  now_minute=$(date +%M); now_minute=${now_minute#0}; now_minute=${now_minute:-0}
  today=$(date +%Y-%m-%d)
  dow=$(date +%w)
  this_hour=$(date +%Y-%m-%dT%H)

  if [ "$now_hour" -eq "$BACKUP_HOUR" ] && [ "$now_minute" -eq "$BACKUP_MINUTE" ] \
     && [ "$last_run" != "$today" ]; then
    last_run="$today"
    if [ "$dow" -eq "$FULL_BACKUP_DOW" ]; then
      type=full
    else
      type=diff
    fi
    log "starting $type backup"
    # Not fatal: a failed backup must not take the scheduler down with it, or
    # one bad night silently ends all backups. It is logged and the next one is
    # attempted as usual.
    if pgbackrest --stanza="$STANZA" --type="$type" backup; then
      log "$type backup finished"
    else
      log "$type backup FAILED"
    fi
  fi

  # The photographs, on the same terms: whatever goes wrong is written down and
  # the loop carries on to tomorrow.
  if [ "$media_enabled" = yes ] \
     && [ "$now_hour" -eq "$MEDIA_BACKUP_HOUR" ] && [ "$now_minute" -eq "$MEDIA_BACKUP_MINUTE" ] \
     && [ "$last_media_run" != "$today" ]; then
    last_media_run="$today"
    if media_due; then
      media_snapshot || true
    fi
  fi

  # Hourly, so a repository that has quietly become unreachable is noticed the
  # same day rather than the next time somebody needs it.
  if [ "$last_check" != "$this_hour" ]; then
    last_check="$this_hour"
    pgbackrest --stanza="$STANZA" check >/dev/null 2>&1 || log "hourly check FAILED"
  fi

  sleep 30
done
