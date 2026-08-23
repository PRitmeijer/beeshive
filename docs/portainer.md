# Rolling this out from Portainer

Read `DEPLOY.md` first. It is the runbook for the cutover itself and it is not
repeated here. This page is only about the two things Portainer changes: how the
stack gets deployed, and which steps Portainer cannot do for you.

## This is not a redeploy

Every release before this one was: push, hit redeploy, done. This one moves the
site from SQLite to PostgreSQL. The database the site has been running on is a
file in the `db-data` volume, and nothing in the new stack reads it.

So if you redeploy the stack first and think about the data afterwards, the app
comes up against an empty PostgreSQL, prerenders and serves an empty site, and
starts accepting bookings into a database that does not contain your menu. The
old data is still there in the old volume, but merging two live databases after
the fact is a much worse afternoon than doing this in order.

**Export first. Deploy second.** Everything else follows from that.

## Two things Portainer cannot do

**Reading the old database.** The export script talks to SQLite, and the branch
you are deploying cannot: the SQLite adapter was removed from the config when
PostgreSQL went in. The one commit that has both the adapter and the script is
`c2ece7b`. You check that commit out, run the export, and then move on. That is
a shell on the host, `git` and `npm`, not a container console.

**Getting a file out of a volume.** Portainer CE has no volume browser and no
file transfer, so there is no way through the interface to pull `database.db`
out of `db-data` or to put `content-export.json` where the import can reach it.

So: **you need SSH to the host once.** Portainer does the stack; the shell does
the data. After this release, redeploys go back to being redeploys.

## Deploy the stack from the Git repository, not the web editor

This matters and it will fail confusingly if you get it wrong.

The compose file builds two images from the repository (`./ops/postgres` and
`./ops/pgbackrest`) and bind-mounts two config files out of it
(`ops/postgres/postgresql.conf`, `ops/pgbackrest/pgbackrest.conf`). A stack
pasted into Portainer's web editor is written to a directory containing the
compose file and nothing else, so those five paths resolve to nothing: the
builds fail, or worse, Docker helpfully creates empty directories where the
config files should be and PostgreSQL starts without WAL archiving.

In Portainer: **Stacks → Add stack → Repository**, pointed at the repository and
the branch, with the compose path `docker-compose.yml`. Portainer clones the
repository beside the compose file and everything resolves.

The application image is built from the repository root too, but it needs
nothing at runtime: `ops/preflight.mjs` and `ops/warm-up.sh` are copied into the
image rather than mounted.

## Keep the stack name

Portainer prefixes volumes with the stack name, so `media-uploads` is really
`beeshive_media-uploads`. **The photographs are in that volume**, and the new
stack uses the same name, so they carry across untouched as long as you redeploy
the existing stack rather than creating a second one beside it. A new stack with
a new name gets new, empty volumes and the site loses every uploaded image.

`db-data` is not referenced by the new stack at all. Leave it alone. It holds
the SQLite database, and until you are certain the migration went well it is the
only copy of the old site that exists. Deleting it is the last step of this
process, not part of it.

## The variables

Portainer does not read the `.env` file from the repository, and `.env` is
gitignored anyway, so nothing you have locally comes across. Every variable goes
in the stack's own **Environment variables** panel.

Required. The stack will not work without these:

| | |
|---|---|
| `PAYLOAD_SECRET` | Sessions are signed with it. Unset, the container starts, logs `Ready`, and returns 500 for every request, because the config throws lazily on first use rather than at boot. Use the value production already has, or every logged-in session is invalidated. |
| `NEXT_PUBLIC_SITE_URL` | `https://debeeshive.nl`. Baked into the build, so changing it later means rebuilding. |
| `HOST_PORT` | `3100`, and it has to match the Forward Port on the Nginx Proxy Manager entry. |
| `POSTGRES_PASSWORD` | Set it now. It is used by initdb on the very first start and cannot be changed afterwards by editing this variable. |
| `PGBACKREST_S3_BUCKET`, `PGBACKREST_S3_ENDPOINT`, `PGBACKREST_S3_KEY`, `PGBACKREST_S3_KEY_SECRET`, `PGBACKREST_CIPHER_PASS` | All five, or the backup container refuses to start and says so. That is deliberate: a stack that silently takes no backups is worse than one that complains. |

Worth setting:

| | |
|---|---|
| `TRUSTED_PROXY_HOPS` | `1` is correct behind one Nginx Proxy Manager. See `docs/rate-limiting.md`; wrong in either direction and the rate limits stop meaning anything. |
| `POSTGRES_USER`, `POSTGRES_DB` | Both default to `beeshive`. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` | When the credentials arrive. Until then mail is written to the container log and every message is still stored in the CMS. |

Leave empty for now: every `R2_*` variable. Those are for keeping uploads in the
bucket instead of on the volume, which is not what this deployment does. See
`docs/media-hosting.md` for why.

Optional, all with sensible defaults: `BACKUP_HOUR`, `BACKUP_MINUTE`,
`FULL_BACKUP_DOW`, `MEDIA_BACKUP_HOUR`, `MEDIA_BACKUP_MINUTE`, the four
`MEDIA_KEEP_*` retention numbers, `PGBACKREST_STANZA`, `UMAMI_API_KEY`,
`PREFLIGHT`, `WARMUP`, `BUILD_DATABASE_URI`.

## The order

Numbers in brackets are the sections of `DEPLOY.md` that carry the detail.

1. **Write down the commit you are on**, from the Portainer stack or
   `git -C <stack path> rev-parse HEAD`. Today that is `3bb5a3a`. This is the
   rollback target and it takes ten seconds to record and a bad evening to
   reconstruct.
2. **Shell.** Take the export while the old site is still the live one, from the
   one commit that can read SQLite. (2)
3. **Shell.** Copy the media directory somewhere outside the volume, as a second
   copy of something that is about to be carried across. (3)
4. **Portainer.** Confirm the `reverse-proxy` network exists under Networks. It
   is external to this stack and the deploy fails without it.
5. **Portainer.** Update the stack's environment variables from the table above,
   then redeploy from the repository. The first deploy builds three images; on a
   small VPS a Next build is the memory-hungriest thing that will happen all
   year, so if it is killed, that is why. The build no longer needs a database,
   so it will not stall trying to reach one.
6. **Watch the app container's log.** It should say, in this order: the preflight
   finding nothing to complain about, PostgreSQL applying three migrations, then
   the warm-up reporting `0 still stale`. (4, 5, 12)
7. **Shell.** Import the export, then verify it. `db:verify` re-exports from the
   new database and diffs the round trip; it should report every collection
   clean. (6, 7)
8. **Portainer.** Run the warm-up again from the app container's console, because
   the content arrived after the pages were rendered:
   `/app/ops/warm-up.sh`. (12)
9. **Shell or console.** Reset the admin passwords. Password hashes cannot be
   carried across; the import prints exactly whose. (9)
10. **Create the stanza and take a full backup before you let anyone in.** A
    migration with no backup behind it is a migration you cannot undo. (10)
11. **Check the site**, then take the first media snapshot by hand so there is
    one from before rather than one from tomorrow morning:
    `docker compose exec pgbackrest restic snapshots` should list it. (`ops/backup-media.sh`)
12. Leave `db-data` where it is for a week or two.

## If it goes wrong

The old stack is one redeploy away: point the stack back at the commit from step
1 and deploy. `db-data` still holds the SQLite database and `media-uploads` is
the same volume it always was, so the old site comes back exactly as it left.

What you lose is anything entered into the new site between cutover and
rollback, which is the strongest argument for doing this while the restaurant is
closed rather than over a lunch service.

`DEPLOY.md` has the longer version of this, including what to do about a
container that comes up healthy and serves nothing.
