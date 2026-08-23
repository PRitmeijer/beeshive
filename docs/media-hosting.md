# Where the photographs are served from

The uploads can live in a Cloudflare R2 bucket, and for a while the plan was
that they would. That is no longer the recommendation, and the reason belongs at
the top rather than three sections down.

What the bucket was going to buy was durability. The photographs were on a
Docker volume that nothing copied, and a volume nobody copies is a volume that
eventually gets wiped. They now have that durability where they are: the backup
container takes an encrypted snapshot of the `media-uploads` volume every night,
into the same bucket the database backups already go to, and a photograph
deleted by accident can be brought back from it. `docs/backups.md` is the
runbook for that.

What is left for the bucket to buy is speed, and whether it buys any at all
depends entirely on where the domain's DNS lives. So the three answers below are
all still real. The one that is right today is the one that needs no bucket.

## The short version

| | files are stored in | address a browser fetches | cached at the edge | rate limited | needs DNS at Cloudflare |
|---|---|---|---|---|---|
| **A** bucket with a custom domain | R2 | `https://media.debeeshive.nl/...` | yes | no | yes |
| **B** bucket on its own subdomain | R2 | `https://pub-<hash>.r2.dev/...` | **no** | **yes** | no |
| **C** no bucket at all | the `media-uploads` volume, snapshotted nightly | `https://debeeshive.nl/api/media/file/...` | n/a, same origin | no | no |

All three work with the code as it stands. **A** is what the site is written
for, **C** is what it does with no configuration, and **C is the
recommendation until the nameservers move.**

**B is not the middle road it looks like**, and that is the single most
important thing on this page. Cloudflare's CDN cache does not apply to the
r2.dev address at all: "To use features like WAF custom rules, caching, access
controls, or Bot Management, you must configure your bucket behind a custom
domain. These capabilities are not available when using the r2.dev development
url." So every request for a photograph goes to the R2 origin, uncached, on an
address Cloudflare rate-limits and describes as being for development. It gives
up most of the reason for putting the images on a CDN while taking on a limit
nobody will quote a number for.

## A: a custom domain on the bucket

`R2_PUBLIC_URL=https://media.debeeshive.nl`.

Cloudflare will only attach a custom domain to an R2 bucket when the domain "has
been added as a zone in the same account as the R2 bucket", which in practice
means moving the domain's nameservers to Cloudflare. That is free, and it is the
only option that gives the bucket a CDN cache, an address of our own, headers we
control, and no rate limit.

The escape hatch that would avoid moving nameservers is a partial (CNAME) setup,
and it is not one: "A CNAME setup (partial) is only available to customers on a
Business or Enterprise plan." Free and Pro cannot do it.

So the price of A is moving all of the domain's DNS, and the part of that worth
being careful about is not the website. It is the mail. `info@debeeshive.nl`
lives on MX records, and SPF, DKIM and DMARC live on TXT records; Cloudflare's
onboarding scans the current zone and imports what it finds, but it is a scan,
not a guarantee. Check the MX and TXT records against the old zone before
changing the nameservers, and again after they propagate. A website that is
briefly wrong is embarrassing; mail that silently stops is worse.

If the nameservers ever do move, switching to A is one variable and a rebuild.
Nothing else in the code changes.

## B: the bucket's r2.dev subdomain

`R2_PUBLIC_URL=https://pub-<hash>.r2.dev`, from **R2 → your bucket → Settings →
Public Development URL → Enable**, then typing `allow` to confirm.

This needs no DNS anywhere, and it is the obvious-looking answer when the domain
is not at Cloudflare. It is worth being clear about what it actually buys,
because it is less than it appears.

Cloudflare's own words, twice over: "Public access through `r2.dev` subdomains
is rate-limited and should only be used for development purposes", and caching
"is not available when using the r2.dev development url". Take the two together
and the picture is a bucket origin, uncached, behind an unpublished rate limit.
Every visitor's browser fetches every photograph from R2 itself. That is not
obviously faster than serving them from our own server, and it comes with a
ceiling that nobody can tell you the height of.

The failure mode, if the limit is ever reached, is that images start returning
429 while the text keeps working, so the page looks half-broken rather than
down. For a restaurant with a few dozen photographs that is unlikely. "Unlikely,
and I cannot find out how unlikely" is still a worse position than not having
the question.

Cloudflare also says: "Avoid creating a CNAME record pointing to the `r2.dev`
subdomain. This is an unsupported access path, and we cannot guarantee
consistent reliability or performance." So dressing it up behind
`media.debeeshive.nl` with a CNAME is explicitly not a way around any of this.

If you do take this option, put the hostname in `R2_PUBLIC_URL` and rebuild: it
is baked into `next.config.mjs`'s `images.remotePatterns` at build time, so a
runtime-only change would leave the optimiser refusing the host.

## C: keep the files where they are, and back them up

Leave all five `R2_*` variables unset.

Payload writes uploads to `MEDIA_DIR`, which in Docker is the `media-uploads`
volume, and serves them from `/api/media/file/...` on our own origin. Same
origin, no third-party hostname, no rate limit, nothing to configure, and the
file is on the same disk as the process reading it. Every night at half past
four the backup container takes an encrypted restic snapshot of that volume into
the backups bucket, which is what makes this a durable answer rather than a
convenient one.

This is the recommendation until the nameservers move, and it is close to being
the best of the three outright.

The objection it used to have was durability, and that objection is answered.
The one it still has is that there is no CDN in front of the images. That is
real, and option B does not answer it either: an uncached bucket origin behind
an unpublished rate limit is not a CDN. Only A is, and A is about where the
nameservers live.

What C costs is one Node request per photograph on a cache miss, on a server
that serves a few dozen images to a few hundred people a day. That is not the
bottleneck this site had. The mobile score went from 50 to 95 by fixing
render-blocking fonts, `no-store` on every page, and a hero image gated behind
hydration. None of that was image hosting.

There is a fourth arrangement, which is a bucket for storage with
`R2_PUBLIC_URL` left unset: Payload keeps the URLs on `/api/media/file/...`,
fetches each object from R2 and streams it to the visitor. It was the
recommendation here before the snapshots existed. It is now the worst of both,
adding a network round trip to R2 in front of every image while giving up the
CDN anyway, and it protects the photographs against less rather than more:
R2's durability covers the server dying, which the nightly snapshot also
covers, and it does not cover somebody deleting a photograph in the admin,
which the snapshot does. If a bucket is going to be turned on, turn it on for A.

## Is any of this bad for SEO?

No, and it is worth being precise about why, because "images on another domain"
sounds like it should matter and does not.

- **Ranking.** Google does not rank a page differently because its images come
  from another hostname. This has been true for as long as CDNs have existed;
  it is what every large site does.
- **Image search.** An image is attributed to the *page it appears on*, not to
  the host it was fetched from. A photograph on `pub-xxx.r2.dev` shown on
  `debeeshive.nl/galerij` is indexed as belonging to that page.
- **Crawlability.** Both the r2.dev address and the app's own `/api/media/...`
  path are publicly fetchable, which is the only requirement. Neither is behind
  a login or a signed URL.

What *does* affect search is the same short list it always was, and none of it
depends on this decision: how fast the largest image on the page paints, whether
every image has a real `alt` (the Media collection requires one), whether the
dimensions are declared so nothing jumps while loading, and whether the pages
are in the sitemap. All four are already handled.

So choose on speed and on operational risk, not on search. And once caching is
in the picture, **B is not even the faster of the two in any way worth having**:
an uncached bucket origin on the far side of a rate limit, against our own
server which at least has a page cache in front of it. The choice that is
actually about speed is A, and A is about where the nameservers live.

## So, in order

1. **Do nothing.** Leave the `R2_*` variables unset. The photographs are written
   to the `media-uploads` volume, served from our own origin, and snapshotted to
   the backups bucket every night. Confirm that last part rather than assuming
   it: `docker compose exec pgbackrest restic snapshots` should show one per
   night.
2. **If and when the domain's nameservers move to Cloudflare**, create the media
   bucket, set the four variables and point `R2_PUBLIC_URL` at a custom domain
   on it, then rebuild. That is option A, and it is the only one that puts the
   images on a real CDN.
3. **Reach for r2.dev only to try something out**, which is what Cloudflare
   built it for.

One trap in step 2, and it is the reason to decide before there are hundreds of
photographs rather than after: **turning R2 on does not move the files that are
already on the volume.** Payload writes new uploads to the bucket from that
moment and goes on expecting the old ones somewhere it no longer looks, and the
result is a gallery that half loads. `DEPLOY.md` has the fix, which is an import
from an empty database with the bucket configured first.

## Where each value comes from

- `R2_BUCKET`: the name you gave the bucket. Use two buckets, one for media
  and one for the database backups: the media bucket is written to by the
  website, and a bucket the website can write to is not a place to keep the
  backups of the website.
- `R2_ENDPOINT`: `https://<account-id>.r2.cloudflarestorage.com`. The account
  id is on the R2 overview page, and the whole endpoint is shown there under the
  S3 API details.
- `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`: **R2 → API → Manage API
  tokens → Create API token**, Object Read & Write, scoped to the media bucket
  alone. The secret is displayed once and never again.
- `R2_PUBLIC_URL`: only if you are on option A or B. For A it is the custom
  domain you attached. For B: **R2 → your bucket → Settings → Public
  Development URL → Enable**, then type `allow` to confirm; the
  `https://pub-….r2.dev` address appears there afterwards. A bucket is private
  until you do this, so an unset-public bucket with a `R2_PUBLIC_URL` filled in
  serves nothing but 404s.
