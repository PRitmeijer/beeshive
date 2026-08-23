# Taking the site from SQLite to PostgreSQL: the whole playbook

This is not a normal redeploy. Every release before this one was: push, hit
redeploy, done. This one moves the site off the SQLite file in the `db-data`
volume and onto PostgreSQL, and nothing in the new stack reads that file. The
content has to be carried across by hand, in the order below. It also brings up
Umami, the visitor statistics, which did not exist the last time this document
was written.

Allow **two hours**, with the restaurant closed. Most of it is the first image
build and the import, and neither of those is a thing to hurry.

Read the whole document once before you type anything in it. It is written for
somebody doing this once, at night, and the ordering is the part that matters:
**export before deploy, backup before opening the doors.**

---

## Contents

**Before the evening**

1. [What is already on the box, and what is not](#1-what-is-already-on-the-box-and-what-is-not)
2. [Pre-flight checklist](#2-pre-flight-checklist)
3. [The environment variables](#3-the-environment-variables)

**On the box**

4. [Getting on the box (SSH)](#4-getting-on-the-box-ssh)
5. [Checking the host tooling](#5-checking-the-host-tooling)
6. [Checking the host has room to do this](#6-checking-the-host-has-room-to-do-this)

**The cutover**

7. [Record the rollback target (Portainer)](#7-record-the-rollback-target-portainer)
8. [Take the site out of service (Nginx Proxy Manager)](#8-take-the-site-out-of-service-nginx-proxy-manager)
9. [Export the content and copy the photographs out (shell)](#9-export-the-content-and-copy-the-photographs-out-shell)
10. [Point the stack at `main` and set the environment (Portainer)](#10-point-the-stack-at-main-and-set-the-environment-portainer)
11. [Redeploy, and watch the build (Portainer, then shell)](#11-redeploy-and-watch-the-build-portainer-then-shell)
12. [Give Umami its database (shell)](#12-give-umami-its-database-shell)
13. [Umami first sign-in, over a tunnel (browser)](#13-umami-first-sign-in-over-a-tunnel-browser)
14. [Put the Umami credentials into the stack (Portainer)](#14-put-the-umami-credentials-into-the-stack-portainer)
15. [Publish `stats.debeeshive.nl` (Nginx Proxy Manager)](#15-publish-statsdebeeshivenl-nginx-proxy-manager)
16. [Import the content (shell)](#16-import-the-content-shell)
17. [Verify the import (shell)](#17-verify-the-import-shell)
18. [Put the photographs into the media volume (shell)](#18-put-the-photographs-into-the-media-volume-shell)
19. [Clear the dev-push marker, then restart and warm up (shell)](#19-clear-the-dev-push-marker-then-restart-and-warm-up-shell)
20. [Fill in Site Instellingen, Statistieken included (browser)](#20-fill-in-site-instellingen-statistieken-included-browser)
21. [Reset the owners' passwords (browser)](#21-reset-the-owners-passwords-browser)
22. [Take both first backups, before anyone is let in (shell)](#22-take-both-first-backups-before-anyone-is-let-in-shell)
23. [Let people in (Nginx Proxy Manager)](#23-let-people-in-nginx-proxy-manager)

**Afterwards**

24. [The verification pass](#24-the-verification-pass)
25. [Rollback](#25-rollback)
26. [The traps](#26-the-traps)
27. [The longer reasoning](#27-the-longer-reasoning)

Three reference documents carry detail this one only summarises:
`ops/README.md` (the containers, the buckets, the environment),
`scripts/README.md` (what the export, import and verify do to ids, to files and
to passwords) and `docs/backups.md` (what is backed up, and how to put it back).
`docs/analytics.md` is the same for Umami.

---

## 1. What is already on the box, and what is not

Read this before the checklist, because it decides what you do and do not have
to install.

**Already there, and nothing in this document installs them again.**

- Docker and the compose plugin.
- Portainer.
- **The stack itself.** It is already a Portainer stack deployed from Git. This
  release does not create a stack. It points the existing stack's Git reference
  at `main`, updates its environment variables, and redeploys it.
- Nginx Proxy Manager, and the external `reverse-proxy` network it owns.

**Possibly not there, and step 5 checks for them.**

- `git`, Node 20 or newer, and `npm`. Docker being installed says nothing about
  these. The export, the import and the verify all run **on the host**, not in a
  container, so all three are needed on the machine itself.
- `openssl`, for generating two secrets.

**Two things about Portainer worth knowing before you start.**

1. **Portainer CE has no volume browser and no file transfer.** Nothing in the
   web interface can get the old SQLite database out of the `db-data` volume or
   the export back into PostgreSQL. Portainer does the stack; the shell does the
   data. After this release, redeploys go back to being redeploys.
2. **The stack must be deployed from the Git repository**, not pasted into
   Portainer's web editor. [The traps](#26-the-traps) says what breaks if it is.

**And one about `docker compose`.** Under Portainer the compose project name is
the **stack name**, not the directory you happen to be standing in. A
`docker compose exec ...` run from a checkout on the host therefore addresses
nothing, or worse, addresses a second empty copy of the stack. Every command in
this playbook uses plain `docker` against the container names, which are fixed
in `docker-compose.yml` and are the same whatever Portainer calls the project:

| Container | What it is |
|---|---|
| `beeshive` | the website |
| `beeshive-postgres` | the database |
| `beeshive-pgbackrest` | the backups, both halves |
| `beeshive-umami` | the visitor statistics |

Published ports: the app on `HOST_PORT`, default **3100**; Umami on
`UMAMI_PORT`, default **3101**. PostgreSQL has no published port and that is
deliberate.

---

## 2. Pre-flight checklist

Tick every line before you touch anything. None of it takes long; all of it is
expensive to discover halfway through.

- [ ] **The rollback commit is written down.** It is **`3bb5a3a`**, the commit
      production is on today. Portainer also shows it on the stack page under
      the Git settings. Confirm the two agree, and write it somewhere that is
      not this server.
- [ ] **The existing stack is identified by name**, and its current Git
      reference is noted. Portainer → **Stacks** → the stack → the Git settings
      panel. You need the name because the name is what keeps the photographs
      (see the trap on volumes), and the reference because the rollback is
      changing it back.
- [ ] **The `reverse-proxy` network exists.** Portainer → **Networks**, or on
      the host: `docker network inspect reverse-proxy >/dev/null && echo ok`.
      It is external to this stack and the deploy fails without it.
- [ ] **DNS for `stats.debeeshive.nl` is in place and resolving.** An `A` record
      for `stats` in the `debeeshive.nl` zone pointing at the same address as
      `www`, plus `AAAA` if the host has IPv6. Check it before the evening, not
      during it, because propagation is not something you can hurry:

      ```bash
      dig +short stats.debeeshive.nl
      dig +short www.debeeshive.nl
      ```

      The two must print the same address.
- [ ] **The R2 bucket and its API token are in hand.** One private bucket holds
      both halves of the backup: pgBackRest under `/beeshive`, the photographs
      under `/media`. The token needs **Object Read & Write**. You are shown the
      key id and the secret exactly once. `ops/README.md` section 1 is the
      walk-through.
- [ ] **`PGBACKREST_CIPHER_PASS` is generated and stored off the server.**

      ```bash
      openssl rand -base64 48
      ```

      It is the one value here that cannot be reissued. It encrypts both backup
      repositories before anything leaves the machine, and **losing it makes
      every backup in the bucket permanently unreadable**. Keep a copy somewhere
      that is neither this server nor this repository. If this server already had
      backups, use the same passphrase: a new one does not re-encrypt anything,
      it only stops the old repository opening.
- [ ] **`UMAMI_APP_SECRET` is generated.**

      ```bash
      openssl rand -hex 32
      ```

- [ ] **`PAYLOAD_SECRET` is the value production already has.** A new one
      invalidates every logged-in session.
- [ ] **Every environment variable in [section 3](#3-the-environment-variables)
      is ready to paste.** Portainer does not read `.env` from the repository,
      and `.env` is gitignored anyway, so nothing you have locally comes across.
- [ ] **The restaurant is closed** and somebody knows the site is going down.

---

## 3. The environment variables

They go in the stack's own **Environment variables** panel in Portainer.

> **A `$` in any value is eaten by Compose interpolation**, so `abc$def` arrives
> as `abc`. Double it: `abc$$def`. This applies to `POSTGRES_PASSWORD`, the R2
> keys, `SMTP_PASS` and `UMAMI_PASSWORD` alike.

### Required. The stack does not work without these.

| | |
|---|---|
| `PAYLOAD_SECRET` | Sessions are signed with it. Use the value production already has, or every logged-in session is invalidated. No default on purpose: unset, the container starts, logs `Ready`, and returns 500 for every request. |
| `NEXT_PUBLIC_SITE_URL` | `https://debeeshive.nl`. Baked into the build, so changing it later means rebuilding. |
| `HOST_PORT` | `3100`, and it has to match the Forward Port on the Nginx Proxy Manager entry. |
| `POSTGRES_PASSWORD` | Set it now. `initdb` uses it on the very first start, and editing this variable afterwards does not change the cluster. |
| `PGBACKREST_S3_BUCKET`, `PGBACKREST_S3_ENDPOINT`, `PGBACKREST_S3_KEY`, `PGBACKREST_S3_KEY_SECRET`, `PGBACKREST_CIPHER_PASS` | All five, or the backup container refuses to start and says so. A stack that silently takes no backups is worse than one that complains. The endpoint here is **without** the scheme, unlike `R2_ENDPOINT`. |

### Umami. New since this document was last written.

| | |
|---|---|
| `UMAMI_APP_SECRET` | `openssl rand -hex 32`. Signs Umami's session cookies. Left unset Umami still starts, deriving the key from `DATABASE_URL` instead, which means the thing signing the dashboard's logins is a hash of a connection string written down in this file and in three containers' environments. Set it. |
| `UMAMI_USERNAME` | `admin`. The sign-in the Payload admin panel reads the figures back with. |
| `UMAMI_PASSWORD` | **Not known yet.** Umami ships with `admin` / `umami`, published and identical on every installation in the world. You change it at [step 13](#13-umami-first-sign-in-over-a-tunnel-browser) and fill this in at [step 14](#14-put-the-umami-credentials-into-the-stack-portainer). |
| `UMAMI_PORT` | `3101`, and only the host side of the mapping. Inside the container Umami always listens on 3000, which is a property of the published image. |
| `UMAMI_DB` | `umami`, and there is no reason to change it. It names the database in two places at once: the initdb script that would create it on a fresh cluster, and the `DATABASE_URL` the Umami container connects with. Set it on one side only and you get an empty database next to an Umami that cannot find it. |

Nothing above is needed to *count* visitors. Counting is the tracking script and
the Website-ID, which go in **Site Instellingen → Statistieken** at
[step 20](#20-fill-in-site-instellingen-statistieken-included-browser) and are
not secrets. These five are the container's own settings plus reading the
figures back.

### Worth setting

- `TRUSTED_PROXY_HOPS=1`, correct behind one Nginx Proxy Manager.
  `docs/rate-limiting.md` says why the number matters.
- `POSTGRES_USER` and `POSTGRES_DB`, both defaulting to `beeshive`.
- The `SMTP_*` values and `EMAIL_FROM` when the credentials arrive. Leave
  `SMTP_HOST` blank and Payload writes mail to the container log instead of
  sending it, which means the site takes bookings nobody is told about.

### Leave empty

Every `R2_*` variable. Uploads stay on the `media-uploads` volume and are
snapshotted off it nightly. `docs/media-hosting.md` is why, and the trap about
not being able to swap afterwards is at the end of this document.

### Optional, all with sensible defaults

`BACKUP_HOUR`, `BACKUP_MINUTE`, `FULL_BACKUP_DOW`, `MEDIA_BACKUP_HOUR`,
`MEDIA_BACKUP_MINUTE`, the four `MEDIA_KEEP_*` numbers, `PGBACKREST_STANZA`,
`UMAMI_API_KEY`, `RESTIC_REPOSITORY`, `PREFLIGHT`, `WARMUP`,
`BUILD_DATABASE_URI`.

**Leave `PGBACKREST_STANZA` alone.** It is listed as optional because it has a
default, but `ops/postgres/postgresql.conf` hardcodes the stanza in its
`archive_command`:

```
archive_command = 'pgbackrest --stanza=beeshive archive-push %p'
```

Set the variable to anything other than `beeshive` and the scheduler creates one
stanza while PostgreSQL archives into another, which fails quietly in exactly
the way the rest of this document is trying to prevent.

`UMAMI_API_KEY` stays empty on this install. Self-hosted Umami issues no API
keys at all, only a bearer token in exchange for a username and password, which
is what `UMAMI_USERNAME` and `UMAMI_PASSWORD` are for.

---

## 4. Getting on the box (SSH)

### Connect

```bash
ssh <you>@<the server>
```

If you normally reach Portainer through a browser and have never used the shell
on this machine, that is the one thing to sort out before the evening rather
than during it.

### Become a user that can talk to Docker

Every `docker` command below assumes your user is in the `docker` group. Check:

```bash
id -nG | tr ' ' '\n' | grep -x docker
```

If it prints `docker`, you are set. If it prints nothing, either add yourself
once and start a **new** session (group membership is read at login):

```bash
sudo usermod -aG docker "$USER"
exit
```

and SSH back in, or prefix every `docker` command in this document with `sudo`.
Pick one and stay with it. Half-and-half is how you end up with a checkout owned
by root that `npm ci` then cannot write to.

### Where to work

One directory, used by everything below:

```bash
sudo mkdir -p /srv/beeshive-cutover
sudo chown "$USER":"$USER" /srv/beeshive-cutover
cd /srv/beeshive-cutover
```

`chown` matters: two `npm ci` runs happen in here as your own user, and a
root-owned directory turns that into a permissions argument at the worst
possible moment.

**Every shell command in this playbook assumes you are in
`/srv/beeshive-cutover`** unless it says otherwise. When a step has you go
deeper (`cd export-checkout`), the next step brings you back explicitly.

This directory is scratch. It ends up holding the old SQLite database, a copy of
the photographs, a JSON dump of every document on the site, and two full
checkouts with `node_modules` in them. The dump contains **guest data**:
reservations, contact messages, newsletter addresses. Treat the whole directory
the way you would treat a database backup, and clean it up a week or two after
the cutover rather than the same night.

---

## 5. Checking the host tooling

Docker, the compose plugin and Portainer are already installed. This is a
checklist, not an installation. Run all six lines, then read down the fixes.

```bash
git --version
node --version
npm --version
docker --version
docker compose version
openssl version
```

| Line | What you want | If it is missing or too old |
|---|---|---|
| `git --version` | any version | Debian or Ubuntu: `sudo apt-get update && sudo apt-get install -y git` |
| `node --version` | **`v20.` or higher** | See below. This is the one that usually needs work. |
| `npm --version` | any version | Comes with Node. Install Node and this follows. |
| `docker --version` | any version | Already installed. If this fails, stop: something is wrong with the host that is not this deploy's business. |
| `docker compose version` | any version | Already installed. Same as above. Note the space: `docker compose`, not `docker-compose`. |
| `openssl version` | any version | `sudo apt-get install -y openssl` |

### Node 20 or newer, specifically

The image builds on `node:20-alpine`, and the export, the import and the verify
run `tsx` against the same Payload 3 and Next 15 packages. Node 18 gets partway
and fails in ways that look like something else.

**A distribution's own `nodejs` package is usually too old.** Debian 12 ships
Node 18; Ubuntu 22.04 ships 12; Ubuntu 24.04 ships 18. `apt-get install nodejs`
on any of them leaves you below the line. On Debian or Ubuntu, use NodeSource:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version
npm --version
```

`node --version` must now print `v20.` or higher.

On any other distribution, use that distribution's own equivalent: NodeSource
publishes RPM repositories for RHEL, Rocky and Fedora; Alpine has Node 20 in
`community` on recent releases; `nvm` works everywhere and is fine here, with
the caveat that it installs per-user and a `sudo npm` would then miss it.

Do not run `npm ci` under `sudo`. It writes into the checkout you own, and root
ownership there is the fault you meet three commands later.

---

## 6. Checking the host has room to do this

**A build that gets OOM-killed halfway is the most likely way this evening goes
wrong.** It deserves five minutes now.

```bash
df -h /var/lib/docker
free -h
```

### Disk

**Want: at least 10 GB free** on the filesystem holding `/var/lib/docker`. 5 GB
is tight and 3 GB will fail.

Where it goes, measured on a host that has built this stack:

| | |
|---|---|
| The three final images | about 0.9 GB (app 231 MB, postgres 316 MB, pgbackrest 364 MB) |
| The builder stage, which is thrown away but exists while it runs | roughly 1.5 GB: `node_modules` is about 1.0 GB and `.next` about 0.5 GB |
| Docker's build cache | a few GB, and it is kept |
| Two host checkouts, each with its own `node_modules` | about 1 GB each |
| The `pg-data` volume, the photographs, the JSON dump | small tonight, growing later |

If you are short, this is safe to run first and reclaims anything not in use by
a running container:

```bash
docker system df
docker image prune -f
docker builder prune -f
```

Do **not** run `docker system prune -a --volumes`. It takes volumes with it, and
one of those volumes is `db-data`, which is the only copy of the old site there
is until this is over.

### Memory

**Want: at least 2 GB of `available` memory at build time**, and 4 GB total on
the box is comfortable. `next build` is the memory-hungriest thing that will
happen on this machine all year.

Read the `available` column of `free -h`, not `free`. A box with 1 GB or 2 GB of
RAM and no swap will get the build killed.

**On a small box, add swap.** This is the fix, and it is undramatic:

```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
free -h
```

`free -h` should now show 4 GB of swap. To keep it across a reboot:

```bash
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

A swap-backed build is slower and it finishes, which is the only comparison that
matters at eleven at night.

**Or build the image somewhere else.** Harder, and here as the fallback. Compose
names the image after the stack: on a stack called `beeshive` the app image is
`beeshive-beeshive:latest`. So on a machine with room, from a checkout of the
same commit:

```bash
docker build -t beeshive-beeshive:latest --build-arg NEXT_PUBLIC_SITE_URL=https://debeeshive.nl .
docker save beeshive-beeshive:latest | gzip > beeshive-app.tar.gz
```

copy it over, and on the server:

```bash
gunzip -c beeshive-app.tar.gz | docker load
```

The caveat, and it is the reason this is the fallback: Portainer's Git redeploy
builds from the repository, so it will rebuild over the image you just loaded
unless the stack's redeploy is configured not to. Check that before relying on
it. Swap is the simpler answer.

### If it does get killed anyway

Portainer shows the deploy as failed. From the shell:

```bash
docker logs beeshive 2>&1 | tail -30
sudo journalctl -k | grep -i "out of memory" | tail -5
```

`Killed` in the build output, or an `exit code 137`, or a kernel line naming
`node`, all mean the same thing: add swap and redeploy. Nothing is lost. The
site is still on the maintenance page and the old data is still in `db-data`.

---

# The cutover

**Export before deploy.** If the stack goes first, the app comes up against an
empty PostgreSQL and starts taking bookings into a database with no menu in it,
while the real data sits in `db-data` where nothing reads it any more.

## 7. Record the rollback target (Portainer)

Portainer → **Stacks** → the stack → the Git settings panel. Write down the
commit it is deployed from. It should be **`3bb5a3a`**. Write down the Git
reference too, because the rollback is putting that reference back.

Ten seconds to record, a bad evening to reconstruct.

Then Portainer → **Networks**, and confirm `reverse-proxy` is there. Or:

```bash
docker network inspect reverse-proxy >/dev/null && echo ok
```

`ok` is the whole answer. Anything else and the deploy in step 11 fails.

## 8. Take the site out of service (Nginx Proxy Manager)

Point the `debeeshive.nl` Proxy Host at a maintenance page for the duration.

Do it at the proxy rather than by stopping the container: a dead upstream gives
a 502 that some phones cache with more enthusiasm than you would like.

**Anything written to the old site after step 9 is lost.** From here on, a
booking that arrives is a booking that disappears, which is exactly why the
restaurant is closed.

## 9. Export the content and copy the photographs out (shell)

```bash
cd /srv/beeshive-cutover
mkdir -p old-db old-media
docker cp beeshive:/app/data/. ./old-db/
docker cp beeshive:/app/media/. ./old-media/
ls -la old-db old-media | head
```

**Work from the copy, never from the volume.** At `c2ece7b` the config still
has `push: !isProduction && !isBuild` with no guard on it, and the export runs
with `NODE_ENV` unset, so Payload pushes the schema into whatever SQLite file it
opens and leaves a `dev` row in it. Against `./old-db/database.db` that is
harmless: the original in the `db-data` volume is untouched and stays the
rollback.

`old-db` must contain `database.db`. `old-media` must contain the photographs,
and it is worth a rough count now rather than discovering a short copy after the
import:

```bash
find old-media -type f | wc -l
du -sh old-media
```

Now the export, which runs from a checkout of its own:

```bash
cd /srv/beeshive-cutover
git clone git@github.com:PRitmeijer/beeshive.git export-checkout
cd export-checkout
git checkout c2ece7b
npm ci
```

If this host has no SSH key for GitHub, clone over HTTPS instead and give a
personal access token when git asks:

```bash
git clone https://github.com/PRitmeijer/beeshive.git export-checkout
```

Portainer has its own credentials for the stack and does not share them with
your shell.

Then:

```bash
DATABASE_URI=file:/srv/beeshive-cutover/old-db/database.db \
  npx tsx scripts/export-content.ts /srv/beeshive-cutover/content-export.json
```

**`c2ece7b` is the only commit carrying both the SQLite adapter and the export
script**, which is why this runs from a checkout of its own. Every later commit,
`main` included, is PostgreSQL only and cannot open that file at all.

The export prints a document count per collection. **Read them**, and stop if
something you know has content reports `0 docs`.

```bash
cd /srv/beeshive-cutover
ls -la content-export.json
```

`content-export.json` holds reservations, contact messages and newsletter
addresses. Move it the way you would move a database backup, and do not commit
it: `/content-export*.json` is in `.gitignore` and must stay there.

## 10. Point the stack at `main` and set the environment (Portainer)

The stack already exists. **Do not create a second one.** Portainer prefixes
volumes with the stack name, so a new stack gets new, empty volumes and the site
loses every uploaded photograph. Keeping the same stack is exactly what carries
`media-uploads` across.

Portainer → **Stacks** → the stack:

1. In the Git settings, set the reference to **`main`**. The branch is being
   merged to `main` for this release, so `main` is what the stack tracks from
   now on. Compose path stays `docker-compose.yml`.
2. In **Environment variables**, fill in everything from
   [section 3](#3-the-environment-variables). Leave `UMAMI_PASSWORD` out for
   now; it does not exist yet and you come back for it at step 14.

Do not save-and-deploy yet if Portainer offers you the choice. Step 11 is the
deploy, and it wants you watching a log while it runs.

## 11. Redeploy, and watch the build (Portainer, then shell)

Hit redeploy, with **pull from the repository** on. Then, on the host:

```bash
docker logs -f beeshive
```

This first deploy builds three images. Expect **twenty to forty minutes** on a
small VPS, most of it `next build`. See
[section 6](#6-checking-the-host-has-room-to-do-this) if it is killed.

What you want to see, in order:

```
preflight: payload_migrations bestaat nog niet; verse database, niets te melden.
```

then Payload applying **three** migrations, then:

```
warm-up: server answering after Ns
warm-up: pass 2 (verifying): 17 requested, 0 did not answer 2xx/3xx, 0 still stale
warm-up: every page rendered against the live database. Nothing left stale.
```

Check the other three containers are up:

```bash
docker ps --format '{{.Names}}\t{{.Status}}' | grep beeshive
```

`beeshive`, `beeshive-postgres` and `beeshive-pgbackrest` should all be up, and
`beeshive-postgres` healthy.

**`beeshive-umami` may be stuck restarting, and that is expected.** It needs a
database that does not exist yet on a cluster that was not created by this
deploy. Step 12 is that database, and it settles there. Do not chase it here.

```bash
docker logs beeshive-pgbackrest | grep pgbackrest-scheduler
```

Two lines, in this order:

```
pgbackrest-scheduler: ensuring stanza beeshive exists
pgbackrest-scheduler: check passed
```

`check FAILED` instead of `check passed` is not fatal (backups are still
attempted) but it is a thing to chase before step 22. If the container refuses
to start at all it names the missing variable, which is the point of it
refusing.

The site is serving an empty database at this point. That is why the maintenance
page is still up.

## 12. Give Umami its database (shell)

Umami keeps its tables in a database called `umami` inside the cluster the
website already uses. That is deliberate: one cluster is one thing to run and
one thing to back up, and pgBackRest copies the whole cluster rather than a
database at a time, so the visitor figures ride along in backups that already
exist.

**The database has to exist before the container can start**, and Umami will not
create it. Ask whether it is there:

```bash
docker exec beeshive-postgres psql -U beeshive -d beeshive -tAc \
  "SELECT 1 FROM pg_database WHERE datname = 'umami';"
```

- **It prints `1`.** The cluster was initialised by this deploy, the initdb
  script in `ops/postgres/initdb/` ran, and there is nothing to do. Skip to the
  restart at the end of this step.
- **It prints nothing.** The cluster already existed, so the initdb scripts were
  never looked at. **Initdb scripts do not run on an existing cluster**, ever
  again, however many times you redeploy. Create it by hand, once:

  ```bash
  docker exec beeshive-postgres psql -U beeshive -d beeshive -c 'CREATE DATABASE umami'
  ```

Either way, then:

```bash
docker restart beeshive-umami
docker logs --tail 20 beeshive-umami
docker ps --format '{{.Names}}\t{{.Status}}' | grep beeshive-umami
```

The status should settle to `Up`. `database "umami" does not exist` in the log
means the `CREATE DATABASE` did not happen; it is at least an honest failure.
Umami creates its own tables on first connect, so an empty database is the whole
requirement.

## 13. Umami first sign-in, over a tunnel (browser)

Umami ships with **`admin` / `umami`**, published, identical on every
installation in the world. Change it before it is reachable from the internet.

`stats.debeeshive.nl` has no Proxy Host yet, which is on purpose, so reach it
through an SSH tunnel from your own machine. **In a second terminal, on your
laptop, not on the server:**

```bash
ssh -L 3101:127.0.0.1:3101 <you>@<the server>
```

Leave that terminal open and go to **http://localhost:3101** in a browser.

1. Sign in as `admin` / `umami`.
2. Top right, the user icon → **Profile** → **Change password**. Use something
   long. Write it down; step 14 needs it.
3. **Settings → Websites → Add website.** Name it `De Bee's Hive`, domain
   `debeeshive.nl`. Save.
4. Open the website you just made and copy the **Website ID**, the long string
   with dashes. Step 20 needs it.

Then close the tunnel terminal.

The Website-ID is **not a secret**. It sits in the page source of every page on
the site, which is how measuring works. The password you just set is the part
worth guarding, because whoever has it can delete the history.

## 14. Put the Umami credentials into the stack (Portainer)

Portainer → **Stacks** → the stack → **Environment variables**:

| | |
|---|---|
| `UMAMI_USERNAME` | `admin` |
| `UMAMI_PASSWORD` | the password you just set. **Double any `$` in it.** |

Redeploy. Nothing else in the environment changes, the images are already built,
and this is a container recreate rather than a build: seconds, not minutes.

It has to be a Portainer redeploy. `docker exec` cannot change a container's
environment, and editing anything by hand on the host is overwritten by the next
deploy.

Doing this now rather than at the end is on purpose: the database is still empty,
so a recreate cannot cost anything. Check what actually arrived:

```bash
docker exec beeshive printenv UMAMI_USERNAME
docker exec beeshive sh -c 'printf "%s" "$UMAMI_PASSWORD" | wc -c'
```

The second prints a character count rather than the password. If it is shorter
than what you typed, a `$` was eaten and needs doubling.

## 15. Publish `stats.debeeshive.nl` (Nginx Proxy Manager)

Nginx Proxy Manager → **Proxy Hosts** → **Add Proxy Host**:

| | |
|---|---|
| Domain Names | `stats.debeeshive.nl` |
| Scheme | `http` |
| Forward Hostname | `beeshive-umami` |
| Forward Port | `3000` |
| Websockets Support | **on** |
| Block Common Exploits | on |

Then the **SSL** tab: *Request a new SSL Certificate* with Let's Encrypt, *Force
SSL* on, *HTTP/2* on.

Forwarding to `beeshive-umami:3000` works because Nginx Proxy Manager and this
container are both on the `reverse-proxy` network. **If your Nginx Proxy Manager
is not on that network**, forward to the host instead: hostname `beeshive` (the
machine, not the container) and port `3101`, which is `UMAMI_PORT` and is
published for exactly this. Use one route or the other, never both.

**Websockets on is not decoration.** The dashboard is a Next.js application and
its live updates go over a websocket. With the setting off, the pages load and
then quietly stop refreshing, which reads to everybody as "the statistics are
broken".

Confirm:

```bash
curl -sI https://stats.debeeshive.nl | head -1
```

You want a `2xx` or a `3xx`: Umami sends an anonymous caller to its own
`/login`, so a redirect here is a correct answer and not a fault. What you are
ruling out is `502` or `504`, which is Nginx Proxy Manager saying the Forward
Hostname or Forward Port is wrong. Then open it in a browser and confirm you get
Umami's sign-in page rather than the proxy's error page.

## 16. Import the content (shell)

The database has no published port on purpose: it is only on the stack's
internal network. Reach it by its address on that network.

```bash
cd /srv/beeshive-cutover
git clone git@github.com:PRitmeijer/beeshive.git import-checkout
cd import-checkout
git checkout main
npm ci
```

```bash
PG_IP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' beeshive-postgres)
echo "$PG_IP"
PGPW='<POSTGRES_PASSWORD>'
export DATABASE_URI="postgresql://beeshive:${PGPW}@${PG_IP}:5432/beeshive"
export PAYLOAD_SECRET='<the same one the stack has>'

npm run migrate:status
```

`echo "$PG_IP"` must print an address. Empty means the container name is wrong
or the stack is not up.

**The `$` rule is the other way round here.** In Portainer a `$` is doubled
because Compose interpolates. This is a shell, so the single quotes around
`PGPW` are what stop it expanding, and the password goes in exactly as it is,
undoubled. If it also contains `@`, `/`, `:`, `?` or `#`, percent-encode those
in the URL (`@` is `%40`, `/` is `%2F`, `:` is `%3A`, `?` is `%3F`, `#` is
`%23`) or the connection string parses into something else entirely.

**`migrate:status` must list the three migrations with `Ran: Yes`.** That proves
the address works and the container has already built the schema, and it is
where a broken migration shows up rather than in the middle of the import.

Then:

```bash
MEDIA_IMPORT_DIR=/srv/beeshive-cutover/old-media \
  npm run db:import -- /srv/beeshive-cutover/content-export.json
```

A few minutes, most of it re-uploading photographs. It ends with two lists that
need reading:

- **media that could not be re-uploaded.** A non-empty list means the copy in
  step 9 was incomplete. Fix the copy and import again **from an empty
  database**, not on top of this one.
- **every user account whose password did not survive**, under
  `Password hashes cannot be imported.` **This is a list of email addresses and
  nothing else. The random password itself is generated, used and thrown away,
  and is never printed anywhere.** Step 21 is how anybody gets back in, and it
  is worth reading before you need it.

**Do not run the import twice against the same database.** Ids are remapped on
the way in, so nothing identifies a document again and a second run gives you
two of everything.

## 17. Verify the import (shell)

```bash
cd /srv/beeshive-cutover/import-checkout
npm run db:verify -- /srv/beeshive-cutover/content-export.json
```

It re-exports the database and compares it against the dump per document, per
locale, per field, and exits non-zero if anything did not survive. A clean run
ends with:

```
Everything in the dump came back out of the database unchanged.
```

Two kinds of output are expected rather than alarming: values that belong to no
field in the current config (a dump older than the schema), and media that could
not be re-uploaded, which the import already warned about.

This step exists because the failure it catches is invisible. A missing English
half is served as Dutch by Payload's locale fallback, and the first anyone hears
of it is an owner editing something months later and seeing nothing change.

## 18. Put the photographs into the media volume (shell)

The import ran on the host, so Payload wrote the files into this checkout's own
`media/` directory rather than into the container's volume.

```bash
docker cp /srv/beeshive-cutover/import-checkout/media/. beeshive:/app/media/
docker exec -u root beeshive chown -R nextjs:nodejs /app/media
docker exec beeshive sh -c 'ls /app/media | wc -l'
```

The `chown` is not decoration. `docker cp` carries the host's ownership in with
the files, and the server inside the container runs as `nextjs`. The files stay
readable either way, so the gallery looks perfect; what fails is the day
somebody replaces one of these images from the admin, and it fails as
*"There was a problem while uploading the file."* with nothing in the log.

Compare that count against the `find old-media -type f | wc -l` from step 9. It
will be larger, because Payload generates additional sizes for each original.
Much smaller is the problem.

## 19. Clear the dev-push marker, then restart and warm up (shell)

Look first:

```bash
docker exec beeshive-postgres psql -U beeshive -d beeshive -c \
  "SELECT id, name, batch FROM payload_migrations ORDER BY id;"
```

If there is a row with batch `-1`, usually named `dev`, remove it:

```bash
docker exec beeshive-postgres psql -U beeshive -d beeshive -c \
  "DELETE FROM payload_migrations WHERE batch = -1;"
```

Then, whether or not there was one:

```bash
docker restart beeshive
docker exec beeshive /app/ops/warm-up.sh
```

A row with batch `-1` stops the container dead. *[When the container comes up
healthy and serves nothing new](#when-the-container-comes-up-healthy-and-serves-nothing-new)*,
in the traps, says why, and why deleting it is safe **here** and is not safe on
a database whose schema you cannot account for.

The warm-up has to run again whether or not there was a row, because the content
arrived after the pages were rendered. It ends with:

```
warm-up: every page rendered against the live database. Nothing left stale.
```

## 20. Fill in Site Instellingen, Statistieken included (browser)

**You do not have a password yet.** The import at step 16 gave every account,
including yours, a random one it did not print.
[Step 21](#21-reset-the-owners-passwords-browser) is the only way in and it does
not depend on anything in this step, so if the login screen refuses you, go and
do that first and come back here. This is the one place in the playbook where
the numbers are not the order.

Log in at `https://debeeshive.nl/admin` (through the maintenance page, or over
the tunnel from step 13 pointed at 3100 if the proxy is still holding). Open
**Site Instellingen**.

Check the tabs the owners care about, in particular that **Contact** holds the
real opening hours rather than the fallbacks compiled into
`src/lib/payload.ts`. If it shows stock hours, the import did not land and step
17 should have said so.

Then the **Statistieken** tab, which is new:

| Field | Value |
|---|---|
| Bezoekcijfers bijhouden | on |
| Script-adres | `https://stats.debeeshive.nl/script.js` |
| Website-ID | the Website ID copied at step 13 |
| Adres van Umami | `https://stats.debeeshive.nl` |
| API-sleutel | **leave empty** |

Save.

If the panel later says it cannot reach Umami while the dashboard itself is
fine, **Adres van Umami** is the field to change: `https://stats.debeeshive.nl`
sends the request out of the container, round the public internet and back in
through Nginx Proxy Manager, which some hosts will not route back to themselves.
`http://umami:3000` is the same Umami over the stack's internal network, it is
what the field's own help text recommends, and it never leaves the machine. Both
are correct; only one of them depends on your host's NAT.

The API-sleutel field stays empty deliberately. Self-hosted Umami issues no API
keys, and `UMAMI_USERNAME` with `UMAMI_PASSWORD` in the environment is what gets
used. A secret typed into the admin is a secret in every backup, every restore
and every developer's copy of the database.

Reload the page. The panel should now show figures rather than a Dutch sentence
saying it cannot reach Umami. It may show zeroes; nobody has visited yet.

## 21. Reset the owners' passwords (browser)

Password hashes cannot cross over. Every account, **your own included**, was
created at step 16 with a random password that the import generated, used and
threw away. What it printed is the list of **email addresses**, not passwords.
There is nothing to hand out and nothing to look up, so this step is how
everybody gets back in, you first.

**The ordinary way is the login screen's Wachtwoord vergeten** (*Forgot
password*, if the admin has come up in English), once per person. It needs SMTP
to be working.

**If mail is not working yet you are not locked out.** Payload writes the reset
token into the database whether or not it manages to send it, and with
`SMTP_HOST` unset it does not log the message either, so fetch the token
yourself:

1. On `https://debeeshive.nl/admin/login`, click **Wachtwoord vergeten** and
   give your email address. It will say it has sent something. It has not.
2. Read the token out of the database:

   ```bash
   docker exec beeshive-postgres psql -U beeshive -d beeshive -c \
     "SELECT email, reset_password_token, reset_password_expiration FROM users ORDER BY reset_password_expiration DESC NULLS LAST LIMIT 5;"
   ```

3. Open `https://debeeshive.nl/admin/reset/<reset_password_token>` in a browser,
   pasting the token from your own row, and set a password.

**The token expires an hour after you asked for it**, which is what
`reset_password_expiration` says. Past that, ask again and read the new one.

Then the owners, one of the two ways: **Wachtwoord vergeten** once each if mail
is working by then, or the same three steps above run for their address. Never
send a password by email.

Log in yourself first and open `/galerij`. A missing photograph is obvious there
and nowhere else.

## 22. Take both first backups, before anyone is let in (shell)

Not after. A cutover is the most likely moment for the database to end up in a
state somebody wants undone, and until there is one full backup in the bucket
there is nothing to go back to.

**Both halves.** The database and the photographs are two tools writing two
repositories, and taking one is not taking the other.

### The database half

```bash
docker exec beeshive-pgbackrest pgbackrest --stanza=beeshive --type=full backup
docker exec beeshive-pgbackrest pgbackrest --stanza=beeshive info
```

`info` must show a **`full backup`** entry with a recent timestamp, a WAL
start/stop range and a non-zero size. An empty list means the backups are
failing silently, which is the thing this step exists to catch.

The scheduler creates the stanza itself on first start. If it did not, or after
changing the repository:

```bash
docker exec beeshive-pgbackrest pgbackrest --stanza=beeshive stanza-create
docker exec beeshive-pgbackrest pgbackrest --stanza=beeshive check
```

### The media half

```bash
docker exec beeshive-pgbackrest restic backup /uploads
docker exec beeshive-pgbackrest restic snapshots
```

`snapshots` must list **one** snapshot, taken by host `beeshive-pgbackrest`, with
a file count matching what step 16 imported.

`ops/backup-media.sh` does the same thing and is the command to reach for on an
ordinary day. It drives the container through `docker compose exec` from the
repository root, which needs a shell whose compose project actually is this
stack, so on this host, tonight, use the `docker exec` line above.

### And the other half of the database backup

WAL archiving fails independently of the backups:

```bash
docker exec beeshive-postgres psql -U beeshive -c \
  "SELECT archived_count, failed_count, last_failed_time FROM pg_stat_archiver;"
```

`archived_count` should be climbing. `failed_count` is non-zero from the minutes
before the stanza existed, and that is fine; what matters is that
`last_failed_time` is in the past and stays there.

## 23. Let people in (Nginx Proxy Manager)

Put the `debeeshive.nl` Proxy Host back:

| | |
|---|---|
| Forward Hostname | `beeshive` (the host machine) |
| Forward Port | `3100` |

or, if Nginx Proxy Manager is on the `reverse-proxy` network, hostname
`beeshive` and port `3100` reaches the container by name over that network. The
port is 3100 either way, which is the point of `HOST_PORT` setting the app's own
`PORT` as well as the published one.

Take the maintenance page down. Then go straight to
[the verification pass](#24-the-verification-pass).

**Leave `db-data` where it is for a week or two.** It still holds the SQLite
database and it is the only copy of the old site there is. Nothing in the new
stack references it; it costs disk and buys the whole rollback.

---

## 24. The verification pass

Every line has a command and an answer. Run them in order. Anything that does
not match is a thing to fix tonight, not tomorrow.

### The container's own account of itself

```bash
docker logs beeshive | grep -E 'preflight|warm-up' | tail -6
```

Expect, exactly:

```
preflight: geen dev-push-markering in payload_migrations. Doorstarten.
...
warm-up: every page rendered against the live database. Nothing left stale.
```

A page still stale after pass two means the regeneration is not completing. An
`ALARM` line means the CMS never answered at all, which is the fault described
in the traps seen from outside.

### The public pages

```bash
for p in / /over-ons /kaart /galerij /evenementen /blog /contact /reserveren \
         /en /en/over-ons /en/kaart /en/galerij /en/evenementen /en/blog \
         /en/contact /en/reserveren /sitemap.xml; do
  printf '%-22s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:3100$p")"
done
```

**Expect `200` on every one of the seventeen.** Nothing 4xx, nothing 5xx.

That is straight from the container, bypassing the proxy. Then the same through
the proxy, which is what a customer gets:

```bash
curl -sI https://debeeshive.nl/ | head -1
curl -sI https://debeeshive.nl/kaart | head -1
```

Expect `HTTP/2 200` from both.

And in a browser, because a status code does not tell you a photograph loaded:
**`https://debeeshive.nl/galerij`, every photograph.** This is the check that
catches an incomplete media copy, and it catches it nowhere else.

### The admin

```bash
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' http://localhost:3100/admin
```

Expect:

```
307 http://localhost:3100/admin/login
```

A redirect to the login screen is right. A `200` on `/admin` for an
unauthenticated request would not be.

Then log in in a browser and confirm the sidebar has **Agenda**, **Backups** and
**Site Instellingen** on it.

### The guest pass refuses an unknown token

The page, which deliberately does **not** 404 (a 404 here reads as "we lost your
table" to somebody whose link a chat app mangled):

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3100/reservering/nietbestaand
curl -s http://localhost:3100/reservering/nietbestaand | grep -o 'Deze link werkt niet meer'
```

Expect `200`, then the line `Deze link werkt niet meer`. If the second command
prints nothing, the page is not refusing the token, which is the failure that
matters.

The endpoint behind it, which does 404:

```bash
curl -s -o /dev/null -w '%{http_code}\n' 'http://localhost:3100/api/guest-pass?token=nietbestaand'
curl -s 'http://localhost:3100/api/guest-pass?token=nietbestaand'
```

Expect:

```
404
{"error":"notFound"}
```

### The admin API refuses an unauthenticated request

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3100/api/admin/backups
curl -s http://localhost:3100/api/admin/backups
```

Expect:

```
401
{"error":"Niet ingelogd"}
```

And the statistics endpoint, which answers 401 to an anonymous caller:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3100/api/umami/stats
```

Expect `401`.

### The CMS is actually talking to the database

Every page above can answer 200 from HTML baked into the image without Payload
having reached the database at all. This route reads a collection on every
request and cannot:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3100/api/active-notifications
```

Expect `200`. A hang, or a `000`, is the dev-push fault.

### Mail, on a real test reservation

Make one booking through `https://debeeshive.nl/reserveren`, with your own name
and your own email address, then:

```bash
docker exec beeshive-postgres psql -U beeshive -d beeshive -c \
  "SELECT id, email_status, email_error, email_sent_at FROM reservations ORDER BY id DESC LIMIT 1;"
```

| `email_status` | What it means |
|---|---|
| `sent` | **What you want.** `email_sent_at` carries the time. |
| `pending` | Still queued. Wait a few seconds and run it again. |
| `failed` | `email_error` holds the reason. `535 Authentication failed` on a password you can see is correct is almost always a `$` that needed doubling. |
| `skipped` | An imported historical row, not your test. Check you are looking at the newest id. |

Check the mail actually arrived at the address in Site Instellingen → Contact.

Then delete the test reservation in the admin. Deleting it does not un-send the
mail, so tell whoever got it.

If `email_status` is `failed` on SMTP credentials, confirm what reached the
container:

```bash
docker exec beeshive printenv SMTP_HOST SMTP_PORT SMTP_USER
docker exec beeshive sh -c 'printf "%s" "$SMTP_PASS" | wc -c'
```

### Umami is counting a real hit

Visit `https://debeeshive.nl/` in a browser with no ad blocker on. Then:

```bash
docker exec beeshive-postgres psql -U beeshive -d umami -c "\dt"
docker exec beeshive-postgres psql -U beeshive -d umami -tAc "SELECT count(*) FROM website_event;"
```

The first lists Umami's tables, which proves the database exists and Umami built
its schema in it. The second must print a number **greater than 0**. `website_event`
is the table name in Umami 2; if that has moved in a later image, the `\dt`
listing above names what is actually there.

A zero means the site is not sending anything: check that **Bezoekcijfers
bijhouden** is on and the Website-ID is pasted, then view the page source of
`https://debeeshive.nl/` and confirm a `script` tag pointing at
`https://stats.debeeshive.nl/script.js`.

Then the dashboard: `https://stats.debeeshive.nl`, sign in with the password
from step 13, and the website entry should show your visit.

### The panel shows figures

`https://debeeshive.nl/admin` → **Site Instellingen → Statistieken**.

The panel must show numbers, not the Dutch sentence saying Umami is unreachable.
Zeroes are a fine answer on the first evening; the sentence is not.

If it says it cannot reach Umami, the environment is where to look, not the
settings:

```bash
docker exec beeshive printenv UMAMI_USERNAME
docker exec beeshive sh -c 'printf "%s" "$UMAMI_PASSWORD" | wc -c'
```

Note that only the totals can fail the whole panel. The graph, the top pages and
the events are three separate requests and are allowed to come back empty on
their own, so a blank section beside a working visitor count means Umami refused
that one request and nothing else. `docs/analytics.md` has the history of that
happening.

### The backups exist

Already run at step 22 and worth repeating once the site is live:

```bash
docker exec beeshive-pgbackrest pgbackrest --stanza=beeshive info
docker exec beeshive-pgbackrest restic snapshots
docker exec beeshive-postgres psql -U beeshive -c \
  "SELECT archived_count, failed_count, last_failed_time FROM pg_stat_archiver;"
```

One full backup with a WAL range and a non-zero size, one restic snapshot, and
`archived_count` climbing.

---

## 25. Rollback

**Nothing is one-way until step 23.**

Portainer redeploys whatever the stack's Git reference points at, so the
rollback is to make that reference point at **`3bb5a3a`** again: move the branch,
or tag the commit and change the reference to the tag. Then pull and redeploy,
and put the Proxy Host back at the same time.

`db-data` still holds the SQLite database and `media-uploads` is the same volume
it always was, so the old site comes back as it left.

**Do not run `docker compose down -v` and do not delete `pg-data`.** That is the
entire new database. If the site is up and the data is wrong, that is what step
22 was for, and `docs/backups.md` has the restore in the order you will meet it.

If Umami is the only thing wrong, it is separable: stop `beeshive-umami`, take
the `stats.debeeshive.nl` Proxy Host down, and turn **Bezoekcijfers bijhouden**
off in Site Instellingen. Nothing on the public site depends on it.

---

## 26. The traps

### When the container comes up healthy and serves nothing new

Payload writes a row named `dev` with batch `-1` into `payload_migrations`
whenever it pushes the schema straight from the collections instead of running
a migration, which is what it does whenever `NODE_ENV` is not `production`. The
`npm run db:*` scripts all qualify. On the next connect Payload sees the row and
stops on an interactive prompt asking whether to migrate anyway, and nothing in
a container answers it. Next has already bound the port, so every prerendered
page goes on answering 200 with the HTML built into the image and `docker ps`
says healthy, while reservations, the contact form, the notification bar and
the admin all hang. The site looks up and takes no bookings.

`ops/preflight.mjs` runs before the server and refuses to start it while that
row is there, so the fault is now a container that visibly will not start.
Deleting the row is safe when the schema came from the migrations and the
migration rows are still above it, which is the case in step 19. It is not safe
on a database whose schema you cannot account for: work out what pushed it
first. `ops/warm-up.sh` is the second belt, and its `ALARM` line is this fault
seen from outside.

### A stack pasted into the web editor

The compose file builds two images out of the repository (`./ops/postgres`,
`./ops/pgbackrest`) and bind-mounts three paths from it
(`ops/postgres/postgresql.conf`, `ops/pgbackrest/pgbackrest.conf`,
`ops/postgres/initdb`). A stack pasted into Portainer's editor is written to a
directory holding the compose file and nothing else, so those paths resolve to
nothing: the builds fail, or Docker creates empty directories where the config
files should be and PostgreSQL starts without WAL archiving. Deploy from
**Repository**.

### `docker compose` from a checkout on the host addresses nothing

Under Portainer the compose project name is the **stack name**, not the
directory. So `docker compose exec beeshive ...` run from `/srv/beeshive-cutover/import-checkout`
finds no such service, and `docker compose up -d` from there would start a
**second**, empty copy of the stack next to the real one. Use plain `docker`
against the container names, which is what this playbook does throughout.

This is also why `ops/backup.sh`, `ops/backup-media.sh`, `ops/restore.sh` and
`ops/restore-media.sh` need a shell whose compose project genuinely is this
stack. Their contents are the reference for what to run by hand.

### `PAYLOAD_SECRET` unset

The container starts, logs `Ready`, and returns 500 for every request, because
the config throws on first use rather than at boot. It looks like a healthy
container in front of a broken site.

### The media volume is only reused if the stack name is unchanged

Portainer prefixes volumes with the stack name, so `media-uploads` is really
`<stack>_media-uploads`. The photographs are in that volume and the new stack
uses the same name, so they carry across as long as you **redeploy the existing
stack**.

**A new stack with a new name gets new, empty volumes and the site loses every
uploaded image.** That is the reason step 10 is a redeploy and not a create. It
is not a procedure with a recovery; it is a warning.

### Umami's database is not created on a cluster that already exists

`ops/postgres/initdb/10-umami-database.sh` is run by the PostgreSQL entrypoint
exactly once, on a data directory with no `PG_VERSION` in it. On a cluster that
already has data it is never looked at again, however many times the stack is
redeployed. `beeshive-umami` then restart-loops with `database "umami" does not
exist`. Step 12 is the `CREATE DATABASE umami` that fixes it and the query that
tells you whether you need it.

The mirror image of that is in `ops/README.md` and is worth knowing: **do not**
run `CREATE DATABASE umami` on a host you are about to restore onto. The restore
replaces the whole data directory, and a database you created first is thrown
away with it, along with the visitor figures that were in the backup all along.

### The export only runs from `c2ece7b`

`main` cannot read SQLite: `src/payload.config.ts` names only `postgresAdapter`
and `@payloadcms/db-sqlite` has been removed from `package.json`. `c2ece7b` is
the one commit carrying both the SQLite adapter and `scripts/export-content.ts`.

### The volume and R2 cannot be swapped afterwards

With the four `R2_*` variables unset, which is what this deployment does, the
import wrote every photograph to the `media-uploads` volume. Setting them later
does not move what is already there, and the result is a gallery that half
loads. `docs/media-hosting.md` has the argument and the fix.

### A `$` in any environment value

Compose interpolates the stack's environment, so `abc$def` arrives as `abc`.
Double it: `abc$$def`. It bites `POSTGRES_PASSWORD`, the R2 keys, `SMTP_PASS`
and `UMAMI_PASSWORD`, and the symptom is always an authentication failure on a
value you can see is correct.

### What Portainer cannot do here, honestly

- **It cannot move files.** No volume browser, no upload, no download in CE.
  Steps 9, 16 and 18 are shell steps for that reason and no other.
- **It cannot run the export, the import or the verify.** Those need Node on the
  host and a database URL, which is why section 5 exists.
- **It cannot change a running container's environment.** Every environment
  change is a redeploy, which is why step 14 is a redeploy.
- **It cannot see inside the database.** `payload_migrations`, `pg_stat_archiver`
  and the Umami tables are all `docker exec` and `psql`.
- **Its console will not save you either.** Portainer's container console is a
  shell in a container, so it can reach the database, but it cannot get a file
  from your machine into it. Use SSH.

---

## 27. The longer reasoning

None of this changes what you type, which is why it is down here.

**Why the warm-up exists.** Every frontend page carries
`export const revalidate`, so `next build` prerenders all of them and reads the
CMS while it does, and every one of those reads falls back to the defaults in
`src/lib/payload.ts`. A build with no database in reach therefore does not fail:
it succeeds and bakes stock content into the image, and the first visitor to
each URL after a deploy gets that HTML while Next regenerates the page behind
them. `ops/warm-up.sh` makes the container be that first visitor, asking for all
seventeen public URLs twice. The alternative belt is `BUILD_DATABASE_URI`, which
lets the build prerender the real thing; it is empty here because the production
cluster is deliberately unreachable from the build network, and opening it up is
not worth a second of first-render latency. `README.md` has the fuller version.

**Why step 16 uses a container address.** The database is only on the stack's
`internal` network. A side effect worth knowing: because that address is not
local, `src/payload.config.ts` refuses the dev schema push and prints a warning
saying so. The warning is expected, and it is why step 19 usually finds no
marker to delete.

**Why Umami is a guest in the website's cluster.** One cluster is one thing to
run and one thing to back up. pgBackRest copies the whole cluster rather than a
database at a time, so the visitor figures are inside every backup that exists
from tonight, with no second repository, no second schedule and no second
passphrase to lose. A separate PostgreSQL would have bought isolation this site
has no use for and a second thing to forget to restore.

**Why Umami is on a subdomain and not `debeeshive.nl/stats`.** Umami's
`BASE_PATH` is read while the image is **built**, not when the container starts,
so serving it under a path would mean building it from source here and again on
every upgrade. Without `BASE_PATH` the dashboard asks for root-absolute
`/_next/` and `/api/` URLs, which are precisely the two prefixes this site
already answers on, and under one hostname the proxy would have to guess which
application a request belonged to. One DNS record is cheaper than a fork of
somebody else's project.

**Why one passphrase and not two.** Both repositories, the database's and the
photographs', are encrypted with `PGBACKREST_CIPHER_PASS`. Two passphrases means
the one nobody wrote down is the one you need at two in the morning.

**Do a dry run of the restore on a spare machine before you need it.** A backup
that has never been restored is a hypothesis. `docs/backups.md` is the document
that would most like you to have read this sentence.
