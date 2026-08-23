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
set -eu

STANZA="${PGBACKREST_STANZA:-beeshive}"
BACKUP_HOUR="${BACKUP_HOUR:-3}"; BACKUP_HOUR=${BACKUP_HOUR#0}
BACKUP_MINUTE="${BACKUP_MINUTE:-15}"; BACKUP_MINUTE=${BACKUP_MINUTE#0}
FULL_BACKUP_DOW="${FULL_BACKUP_DOW:-0}"   # 0 = Sunday, as `date +%w` counts

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
    log "$var is not set — refusing to start. No backups are being taken."
    exit 1
  fi
done

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
  log "check FAILED — see /var/log/pgbackrest, backups will still be attempted"
fi

log "scheduled for ${BACKUP_HOUR}:${BACKUP_MINUTE} daily, full backup on day ${FULL_BACKUP_DOW}"

last_run=""
last_check=""

while true; do
  # busybox's date has no %-H, and "08" would be read as an invalid octal
  # number by the comparisons below, so the leading zero is trimmed by hand.
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

  # Hourly, so a repository that has quietly become unreachable is noticed the
  # same day rather than the next time somebody needs it.
  if [ "$last_check" != "$this_hour" ]; then
    last_check="$this_hour"
    pgbackrest --stanza="$STANZA" check >/dev/null 2>&1 || log "hourly check FAILED"
  fi

  sleep 30
done
