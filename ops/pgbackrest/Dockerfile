# The scheduler that takes the backups.
#
# Built from the same base as the database (ops/postgres/Dockerfile) rather
# than from a bare alpine, for two reasons that both bite quietly otherwise:
#
#   - pgBackRest reads the cluster's files itself, so it must run as the same
#     uid as the server. postgres:16-alpine already has that user at that uid;
#     an alpine image would need it invented, and getting the number wrong
#     shows up as "unable to open file ... permission denied" halfway through
#     the first backup.
#   - the two pgbackrest versions have to agree with each other. One base, one
#     package, one version.
FROM postgres:16-alpine

# restic is here because the photographs need a backup too, and this is already
# the container that holds the bucket credentials, the encryption passphrase and
# a scheduler. Giving the second half of the job its own container would mean a
# second copy of that passphrase and a second thing that can stop quietly in the
# night without anybody noticing. Alpine's community repository carries restic
# (0.18 on the 3.24 that postgres:16-alpine is built from), so it costs one more
# package and no new machinery at all.
RUN apk add --no-cache pgbackrest restic tzdata

RUN mkdir -p /var/log/pgbackrest /var/spool/pgbackrest /etc/pgbackrest \
    && chown -R postgres:postgres /var/log/pgbackrest /var/spool/pgbackrest

# restic keeps a local copy of the repository's index so a nightly snapshot does
# not have to read it back out of R2 first. It is a cache in the honest sense —
# losing it costs requests and nothing else — which is exactly what a named
# volume is for. The directory is created here rather than left to Docker so the
# volume inherits this ownership and restic, running as postgres below, can
# write to it.
ENV RESTIC_CACHE_DIR=/var/cache/restic
RUN mkdir -p /var/cache/restic && chown postgres:postgres /var/cache/restic

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENV TZ=Europe/Amsterdam

USER postgres

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
