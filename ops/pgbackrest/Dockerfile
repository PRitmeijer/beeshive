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

RUN apk add --no-cache pgbackrest tzdata

RUN mkdir -p /var/log/pgbackrest /var/spool/pgbackrest /etc/pgbackrest \
    && chown -R postgres:postgres /var/log/pgbackrest /var/spool/pgbackrest

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENV TZ=Europe/Amsterdam

USER postgres

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
