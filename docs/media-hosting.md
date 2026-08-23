# Where the photographs are served from

The uploads live in a Cloudflare R2 bucket. That part is settled and it is worth
having on its own: the container stops keeping files on a disk that a rebuild
wipes, and the photographs are somewhere that can be backed up and moved.

What is still a choice is the **address a visitor's browser fetches them from**,
and that choice is `R2_PUBLIC_URL`. There are three answers and the right one
depends on where the domain's DNS lives.

## The short version

| | address | who serves the bytes | needs DNS at Cloudflare |
|---|---|---|---|
| **A** custom domain | `https://media.debeeshive.nl/...` | Cloudflare's edge | yes |
| **B** the bucket's own subdomain | `https://pub-<hash>.r2.dev/...` | Cloudflare's edge | no |
| **C** leave it unset | `https://debeeshive.nl/api/media/file/...` | this server, streaming from R2 | no |

All three work with the code as it stands. **A** is what the site is written
for, **C** is what it does with no configuration, and **B** is the middle road
for exactly the situation we are in: the bucket is at Cloudflare, the domain is
not.

## A: a custom domain on the bucket

`R2_PUBLIC_URL=https://media.debeeshive.nl`.

Cloudflare will only attach a custom domain to an R2 bucket when it is
authoritative for that zone, which means moving the domain's nameservers to
Cloudflare. It is free and it is the best outcome: the bytes come off
Cloudflare's edge, the address is ours, the cache headers are ours, and there is
no rate limit to think about.

If the nameservers ever do move, this is the setting to switch to, and switching
it is one variable and a restart. Nothing else in the code changes.

## B: the bucket's r2.dev subdomain

`R2_PUBLIC_URL=https://pub-<hash>.r2.dev`, from **R2 → your bucket → Settings →
Public Development URL → Allow Access**.

This needs no DNS anywhere. Visitors fetch the photographs from Cloudflare
rather than from this server, which is the speed the bucket was wanted for in
the first place.

The catch, and it is Cloudflare's own wording rather than a worry of ours: the
r2.dev address is **rate limited and not meant to carry production traffic**.
There is no published number. For a restaurant with a few dozen photographs and
a few hundred visitors a day this is very unlikely to be reached; the failure
mode if it ever is, is that images start returning 429 and the pages look
broken while the text keeps working.

Two things make that risk smaller than it sounds here. The pages are cached for
sixty seconds, so a burst of visitors does not become a burst of image requests
in proportion. And every generated size is WebP, so each photograph is a third
of what a JPEG would have been.

If you take this option, put the hostname in `R2_PUBLIC_URL` and rebuild: it is
baked into `next.config.mjs`'s `images.remotePatterns` at build time, so a
runtime-only change would leave the optimiser refusing the host.

## C: no public address, served through the app

Leave `R2_PUBLIC_URL` unset.

Payload keeps the URLs on `/api/media/file/...`, fetches the object from R2 and
streams it to the visitor. Same origin, no third-party hostname, no rate limit,
nothing to configure. It costs one Node request per photograph on a server that
has other things to do, and it gives up the reason for putting the images on a
CDN at all.

This is the safe default and a perfectly reasonable place to sit while
something more important is being done. It is not the fast option.

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

So choose on speed and on operational risk, not on search. Between **B** and
**C** the honest summary is: B is faster and has a rate limit nobody can quote
you a number for; C is slower and cannot surprise you.

## What to do about the current setup

Nothing is broken today. With the R2 variables unset the site writes uploads to
the `media-uploads` volume exactly as it always has, which is what a laptop
wants. The decision only arrives when the bucket is created.
