#!/bin/sh
# Give Umami a database of its own inside this cluster.
#
# Everything in /docker-entrypoint-initdb.d is run by the official postgres
# entrypoint exactly once, on a data directory that has no PG_VERSION in it
# yet. It happens between initdb and the first real start of the server, against
# a temporary server that only listens on the Unix socket, so there is no window
# in which a half-created database is reachable from the stack.
#
# Which also means: on a cluster that already has data, this file is never
# looked at again. Production is that case from the moment the site went live,
# so the database has to be created by hand there, once:
#
#     docker compose exec postgres psql -U beeshive -d beeshive -c 'CREATE DATABASE umami'
#
# Umami creates its own tables the first time it starts, so an empty database
# is all it wants. ops/README.md and docs/analytics.md both carry that line
# where somebody looking for it would actually look.
#
# It is written to be safe to run twice even though it cannot be, because the
# copy-and-paste that ends up on a live server is the one that matters.
set -e

db="${UMAMI_DB:-umami}"

# PGHOST is deliberately not set: psql then talks over the same Unix socket
# pg_isready uses in the healthcheck, which is the only thing listening at this
# point in the start-up.
exists="$(psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --no-password --no-psqlrc --tuples-only --no-align \
  -c "SELECT 1 FROM pg_database WHERE datname = '$db'")"

if [ -n "$exists" ]; then
  echo "initdb: database '$db' is already here, leaving it alone"
else
  echo "initdb: creating database '$db' for Umami"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
    --no-password --no-psqlrc \
    -c "CREATE DATABASE \"$db\""
fi
