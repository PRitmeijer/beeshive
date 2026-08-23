# The database image, which is the stock one plus a single package.
#
# Postgres runs `archive_command` itself, as a child of the server process, so
# the pgbackrest binary has to exist inside this container — not only inside
# the backup container. Without it every WAL segment fails to archive, Postgres
# retries forever, and pg_wal grows until the volume is full and the server
# refuses to start. That is the whole reason this file exists.
#
# pgbackrest comes from Alpine's community repository, which is enabled in the
# official image. If a future base drops it, switch both this and
# ops/pgbackrest/Dockerfile to `postgres:16` (Debian) and `apt-get install -y
# pgbackrest`; the versions on both sides only have to agree with each other,
# and building both from the same base is how that is kept true.
FROM postgres:16-alpine

RUN apk add --no-cache pgbackrest

# Created here rather than left to Docker, because a named volume mounted over
# a path that does not exist in the image is created owned by root, and the
# server runs as postgres. Pre-creating them with the right owner is what makes
# the volume inherit it.
RUN mkdir -p /var/log/pgbackrest /var/spool/pgbackrest /etc/pgbackrest \
    && chown -R postgres:postgres /var/log/pgbackrest /var/spool/pgbackrest
