# Where the photographs are served from

The uploads live in a Cloudflare R2 bucket. That part is settled and it is worth
having on its own: the container stops keeping files on a disk that a rebuild
wipes, and the photographs are somewhere that can be backed up and moved.

What is still a choice is the **address a visitor's browser fetches them from**,
and that choice is `R2_PUBLIC_URL`. There are three answers and the right one
depends on where the domain's DNS lives.

## The short version

| | address | cached at the edge | rate limited | needs DNS at Cloudflare |
|---|---|---|---|---|
| **A** custom domain | `https://media.debeeshive.nl/...` | yes | no | yes |
| **B** the bucket's own subdomain | `https://pub-<hash>.r2.dev/...` | **no** | **yes** | no |
| **C** leave it unset | `https://debeeshive.nl/api/media/file/...` | n/a, same origin | no | no |

All three work with the code as it stands. **A** is what the site is written
for and **C** is what it does with no configuration.

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

## C: no public address, served through the app

Leave `R2_PUBLIC_URL` unset.

Payload keeps the URLs on `/api/media/file/...`, fetches the object from R2 and
streams it to the visitor. Same origin, no third-party hostname, no rate limit,
nothing to configure. It costs one Node request per photograph on a server that
has other things to do, and it gives up the reason for putting the images on a
CDN at all.

This is the recommendation until the nameservers move.

It sounds like the compromise and it is close to being the best of the three.
The bucket still does the thing that actually mattered: the photographs stop
living on a Docker volume that a rebuild can wipe and that no backup covers,
which is durability rather than speed. What is given up is a CDN in front of the
images, and option B does not really provide one either.

The cost is one Node request per photograph on a cache miss, on a server that
serves a few dozen images to a few hundred people a day. That is not the
bottleneck this site had. The mobile score went from 50 to 95 by fixing
render-blocking fonts, `no-store` on every page, and a hero image gated behind
hydration. None of that was image hosting.

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

1. **Create the bucket and set the four R2 variables, leave `R2_PUBLIC_URL`
   empty.** The photographs move off the container's disk and become something
   that can be backed up. Nothing about the site's speed changes, and nothing
   can break.
2. **If and when the domain's nameservers move to Cloudflare**, add the custom
   domain to the bucket and set `R2_PUBLIC_URL` to it. One variable, one
   rebuild, and the images are on a real CDN.
3. **Reach for r2.dev only to try something out**, which is what Cloudflare
   built it for.

Nothing is broken today either. With the R2 variables unset the site writes
uploads to the `media-uploads` volume exactly as it always has, which is what a
laptop wants.

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
