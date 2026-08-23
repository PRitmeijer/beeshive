# Analytics

Visitor figures for debeeshive.nl run on [Umami](https://umami.is). This note is
for whoever maintains the site; the owners only ever see the **Instellingen →
Statistieken** tab in the Payload admin, which is written for them in Dutch.

## Why Umami and not Google Analytics

Umami stores no cookies and no personal data. It derives a visitor "id" by
hashing the IP address, the user agent and a daily-rotating salt, keeps the
result for the day, and throws it away — there is no identifier that follows
someone between sessions, between days or between sites.

That is why this site has no cookie banner, and the absence of the banner is
worth more than the extra precision Google Analytics would buy. Anything added
later that does set a cookie brings the banner back with it, so it is a decision
worth defending rather than a detail.

### What is *not* collected

Say this plainly if anyone asks, because it is a selling point rather than a
limitation:

- No cookies of any kind, and nothing written to local storage.
- No IP addresses stored — the address is hashed and discarded.
- No cross-site or cross-day tracking, no advertising identifiers, no profiles.
- No names, no email addresses, no reservation contents. The reservation events
  below record *that* a booking was submitted, never *who* submitted it or for
  how many people.
- No third-party script other than the Umami one; nothing is shared onward.

## Where it runs

Self-hosted, on this stack, at **https://stats.debeeshive.nl**. The container is
`beeshive-umami` in `docker-compose.yml` and its tables live in a database
called `umami` inside the same PostgreSQL cluster the website uses, which is how
the visitor figures end up inside pgBackRest's nightly backup without a second
line of configuration. `ops/README.md` section 6 is the operator's version of
everything below.

Umami Cloud (cloud.umami.is) would also work and nothing in the code cares which
one it is talking to. The difference is only what goes in the settings fields:
the script would come from `https://cloud.umami.is/script.js`, the API from the
*different* host `https://api.umami.is/v1` (which is the usual trip-up), and
authentication would be an API key created under **Settings → API keys**. We do
not use it, and the section below is about the one we do.

### Why a subdomain and not debeeshive.nl/stats

Because Umami's `BASE_PATH` is read while the image is being **built**, not when
the container starts. The published image is compiled for the root of a host and
there is no runtime switch that moves it, so serving Umami under a path would
mean building it from source here and building it again on every upgrade.
Without `BASE_PATH` the dashboard asks for root-absolute `/_next/` and `/api/`
URLs, which are precisely the two prefixes this site already answers on, so
under one hostname the proxy would have to guess which application a request
belonged to. One extra DNS record is cheaper than a fork of somebody else's
project.

### Putting it on the internet

1. **DNS.** An `A` record for `stats` in the `debeeshive.nl` zone, pointing at
   the same address as `www`, plus `AAAA` if the host has IPv6.
2. **Nginx Proxy Manager** → *Proxy Hosts* → *Add Proxy Host*:

   | | |
   |---|---|
   | Domain Names | `stats.debeeshive.nl` |
   | Scheme | `http` |
   | Forward Hostname | `beeshive-umami` |
   | Forward Port | `3000` |
   | Websockets Support | **on** |
   | Block Common Exploits | on |

   On the **SSL** tab: *Request a new SSL Certificate*, Let's Encrypt, with
   *Force SSL* and *HTTP/2* on.

   That forwards over the shared `reverse-proxy` network. If your NPM is not on
   it, forward to the host instead, hostname `beeshive` and port `3101`
   (`UMAMI_PORT`), which is published for exactly this case. One route or the
   other, not both.

   Websockets on matters: the dashboard is a Next.js application whose live
   updates ride a websocket, and with the setting off the pages load and then
   silently stop refreshing, which reads as "the statistics are broken".

3. **First sign-in.** Umami ships with **`admin` / `umami`**, published and
   identical on every installation in the world. Change it immediately: sign in,
   then the user icon at the top right → **Profile** → **Change password**. Put
   the new password in `.env` as `UMAMI_PASSWORD` alongside
   `UMAMI_USERNAME=admin`, then `docker compose up -d beeshive`. Double any `$`
   in it, as everywhere in that file.

   Set `UMAMI_APP_SECRET` too, `openssl rand -hex 32`. Unset, Umami derives its
   cookie signing key from the database URL instead.

4. **The website entry.** **Settings → Websites → Add website**. Name it
   `De Bee's Hive`, domain `debeeshive.nl`. Save, open it, and copy the
   **Website ID**, the long string with dashes.

### What the owners paste in

Two values, in **Instellingen → Statistieken** in the Payload admin:

| Field | Value |
|---|---|
| Bezoekcijfers bijhouden | on |
| Script-adres | `https://stats.debeeshive.nl/script.js` |
| Website-ID | the Website ID copied above |
| Adres van Umami | `https://stats.debeeshive.nl` |

Say plainly, when they ask, that **none of that is a secret**. The tracking
script is fetched by every visitor's browser and the website id is sitting in
the page source of every page on the site; that is how measuring works, and
knowing the id lets nobody read anything. Pasting them into the admin is safe
and undoing it is one checkbox.

The Umami **login** is a different thing entirely, and it is only ever used to
read the figures *back* into that panel. It counts nothing, it makes nothing
work on the public site, and it is the one part worth guarding, because whoever
has it can delete the history.

### Authenticating to read the figures back

Self-hosted Umami has no API keys at all. It hands out a bearer token in
exchange for the admin username and password:

```sh
curl -X POST https://stats.debeeshive.nl/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"…"}'
```

The `token` in the response is what goes on the wire as
`Authorization: Bearer …`. `src/lib/umamiServer.ts` sends every credential that
way, and adds `x-umami-api-key` alongside it, because Umami Cloud used to want
its own header and now documents the bearer one; sending both removes a guess
that was getting the cloud case wrong. Credentials are taken in this order:
`UMAMI_API_KEY` from the environment, then `UMAMI_USERNAME` with
`UMAMI_PASSWORD`, then the API-sleutel field in the CMS, which comes last
because it is the only one an editor can open.

The token **expires**, which is why `UMAMI_USERNAME` and
`UMAMI_PASSWORD` in the deployment environment are the arrangement to prefer: a
token pasted in by hand works until the day it quietly does not, and the first
symptom is a panel saying the figures are unavailable.

### When only part of the panel is empty

The totals are one request and the graph, the top pages and the events are
three more. Only the totals can fail the whole panel; the other three are
allowed to come back empty on their own, so a section that is blank while the
visitor count is fine means Umami refused that one request and nothing else.

That is not hypothetical. Umami renamed the top-pages report from `type=url` to
`type=path`, and while all four requests were tied together a 400 on that one
made the panel announce that Umami was unreachable while Umami was sitting there
answering everything else perfectly. Their API will move again.

## Settings to fill in

**Instellingen → Statistieken**, all of it optional and inert until filled.

| Field | What it is |
| --- | --- |
| Bezoekcijfers bijhouden | Renders the measuring script. Off means nothing is measured at all. |
| Script-adres | `https://stats.debeeshive.nl/script.js` here. `https://cloud.umami.is/script.js` on Umami Cloud. |
| Website-ID | The UUID Umami shows under **Settings → Websites**. Without it nothing is measured, whatever the switch says. |
| Adres van Umami | Only needed for reading figures back: `https://stats.debeeshive.nl` here, or `https://cloud.umami.is` (which is mapped to `api.umami.is/v1` automatically). |
| API-sleutel | A cloud API key, or a self-hosted bearer token. Empty on this install: `UMAMI_USERNAME` and `UMAMI_PASSWORD` in the environment are what gets used. See below. |
| Eigen bezoeken niet meetellen | Emits `data-do-not-track="true"`, so visitors whose browser sends the Do Not Track signal are skipped. The owners can switch that on in their own browsers to stay out of their own figures; the admin at `/admin` is excluded regardless. |

### The API key and the environment

`process.env.UMAMI_API_KEY` **wins** over the value in the CMS. The field exists
because the owners asked to be able to paste a key without calling anyone, but a
secret in a database table is a secret in every backup, every restore and every
developer's laptop copy. Set `UMAMI_API_KEY` in the deployment environment on any
install you care about, and leave the field empty — a value typed into the admin
can never silently override it.

## What is measured

Pageviews are automatic; the script records them without any code on our side.
English pages live under `/en` and Dutch keeps the bare paths, so the recorded
URL already tells the two languages apart and no tag attribute is needed for it.

Custom events are fired by hand from `src/lib/umami.ts`:

```ts
import { EVENTS, track } from "@/lib/umami";
track(EVENTS.reservationSubmitted);
```

`track()` never throws, never rejects, and does nothing at all when the script is
absent — blocked, not configured, or still loading. That matters most on the
reservation form: a guest must never lose a filled-in booking because a counter
was unavailable. Always import `EVENTS`, never the literal string; the names are
the join key with the dashboard and a typo shows up weeks later as a graph that
simply stops.

Every event automatically carries a `locale` property, read from `<html lang>`.

### Event table

| Constant | Name in Umami | Meaning |
| --- | --- | --- |
| `EVENTS.reserveButtonClicked` | `reserve_clicked` | Someone opened the booking form from the navigation or the phone button. |
| `EVENTS.reservationStarted` | `reservation_started` | First field of the booking form touched. |
| `EVENTS.reservationSubmitted` | `reservation_submitted` | Booking accepted by `/api/reserve`. |
| `EVENTS.reservationFailed` | `reservation_failed` | Booking refused; the error code rides along as a property. |
| `EVENTS.contactSubmitted` | `contact_submitted` | Contact message sent. |
| `EVENTS.newsletterSubscribed` | `newsletter_subscribed` | Mailing list sign-up accepted. |
| `EVENTS.menuViewed` | `menu_viewed` | The menu page was read. |
| `EVENTS.blogPostRead` | `blog_post_read` | A single blog post was opened. |
| `EVENTS.eventViewed` | `event_viewed` | A single event page was opened. |
| `EVENTS.addToCalendar` | `add_to_calendar` | An event was saved to a calendar. |
| `EVENTS.guestPassOpened` | `guest_pass_opened` | A guest pass link was opened. |
| `EVENTS.phoneClicked` | `phone_clicked` | A `tel:` link was tapped. |
| `EVENTS.directionsClicked` | `directions_clicked` | A route or map link was followed. |

### Where each event is fired

All of these are wired. Each file imports, once:

```ts
import { EVENTS, track } from "@/lib/umami";
```

| File | Where | Call |
| --- | --- | --- |
| `src/components/ReservationForm.tsx` | `markStarted()`, called from `set()` and `setDate()`, guarded by a `useRef` so it fires once per mounted form | `track(EVENTS.reservationStarted)` |
| `src/components/ReservationForm.tsx` | `handleSubmit`, the `res.ok` branch | `track(EVENTS.reservationSubmitted)` |
| `src/components/ReservationForm.tsx` | `handleSubmit`, the refusal branch and the `catch` | `track(EVENTS.reservationFailed, { reason })` — the server's error code, or `"network"` when the request never arrived |
| `src/components/MobileReserveButton.tsx` | the `onClick` that opens the sheet, and the external-link `<a>` | `track(EVENTS.reserveButtonClicked, { source: "mobile" })` |
| `src/components/Navigation.tsx` | the `btn-primary` reserve link, both branches | `track(EVENTS.reserveButtonClicked, { source: "nav" })` |
| `src/components/Navigation.tsx` | the mobile sheet's last row, recognised by its href | `track(EVENTS.reserveButtonClicked, { source: "nav-sheet" })` |
| `src/components/MailingListForm.tsx` | `handleSubmit`, at `setStatus("success")` | `track(EVENTS.newsletterSubscribed)` |
| `src/app/(frontend)/[locale]/contact/ContactClient.tsx` | `handleSubmit`, at `setStatus("sent")` | `track(EVENTS.contactSubmitted)` |
| `src/app/(frontend)/[locale]/contact/ContactClient.tsx` | the `tel:` link | `track(EVENTS.phoneClicked)` |
| `src/app/(frontend)/[locale]/contact/ContactClient.tsx` | the Google listing link | `track(EVENTS.directionsClicked, { source: "google-listing" })` |
| `src/app/(frontend)/[locale]/kaart/KaartClient.tsx` | mount effect | `track(EVENTS.menuViewed)` |
| `src/app/(frontend)/[locale]/blog/[slug]/BlogPostClient.tsx` | mount effect | `track(EVENTS.blogPostRead, { title })` |
| `src/app/(frontend)/[locale]/evenementen/[slug]/EventClient.tsx` | mount effect | `track(EVENTS.eventViewed, { title })` |
| `src/app/(frontend)/[locale]/evenementen/[slug]/EventClient.tsx` | each link in the calendar `<details>` | `track(EVENTS.addToCalendar, { title, target })` — `target` is `apple`/`google`/`outlook`/`ics`/`series` |
| `src/app/(frontend)/[locale]/reservering/[token]/GuestPassClient.tsx` | mount effect | `track(EVENTS.guestPassOpened)` — no properties at all; the URL carries a token, and a token must never become a property |
| `src/components/AddToCalendarTracker.tsx` | one delegated `onClick` around the guest pass's four calendar links | `track(EVENTS.addToCalendar, { source: "guest-pass", target })` — `target` is `apple`/`google`/`outlook`/`ics`, read off the link's `data-calendar-target` |
| `src/app/(frontend)/[locale]/reservering/[token]/GuestPassClient.tsx` | the two route links and the `tel:` link | `track(EVENTS.directionsClicked, { source: "guest-pass-google" \| "guest-pass-apple" })`, `track(EVENTS.phoneClicked)` |

Two notes on `directions_clicked`. The contact page has no dedicated route
link — only an embedded map iframe, whose clicks are inside a cross-origin
frame and cannot be observed — so the nearest true signal there is the Google
listing link, which is where the reviews and the route button both live. The
event is therefore always sent with a `source`, and any reading of the figures
has to look at it: `google-listing` is "went to our Google page", the two
`guest-pass-*` values are unambiguous route requests.

Both pages that offer a calendar report `add_to_calendar`, and they report it
differently, which any reading of the figures has to know. The event page sends
`{ title, target }`, because which event was saved is the interesting half
there. The guest pass sends `{ source: "guest-pass", target }` and no title:
that page's URL carries a reservation token, and the only fact about it worth
counting is that somebody took the evening away with them.

`target` is one vocabulary across both: `apple`, `google`, `outlook`, `ics`,
and `series` on the event page, which is the only one that offers a whole
recurring run. On the guest pass `apple` and `ics` are the same file under two
names — see the note in `AddToCalendar.tsx` — so a reading of "how many used a
calendar at all" adds them up rather than choosing between them.

How the guest pass manages it is worth a line, because it looks impossible at
first glance. `src/components/AddToCalendar.tsx` is a **server** component, so
that `@/lib/ics` stays out of the visitor bundle, and a server component cannot
carry an `onClick`. So it does not: it renders its four links inside
`src/components/AddToCalendarTracker.tsx`, a client component of some twenty
lines that hears the clicks bubble past and reads the `data-calendar-target`
attribute off the link. Nothing else moves to the client, and the wrapper
replaces the `<div>` that was around those links anyway, so the markup is
unchanged. The alternative on the table — reporting from the
`/api/guest-pass?ics=1` handler — was left alone: it would see the two `.ics`
routes and never Google or Outlook, and it would put a measurement in a request
path a calendar app makes on its own schedule.

Properties must stay non-identifying: a page title or an error code is fine, a
guest's name, email, phone number or party size is not.

## Reading the figures back

`GET /api/umami/stats?range=7d&report=all`

- Requires a logged-in Payload user (`payload.auth`). Anonymous callers get 401.
- `range` is one of `today`, `7d`, `30d`, `year`; `report` is one of `all`,
  `summary`, `series`, `pages`, `events`. Anything else falls back to `7d` /
  `all`, and the answer echoes what it used.
- It is not a proxy. Nothing from the query string ever reaches an upstream URL,
  so a logged-in editor account cannot aim the API key at a host of their
  choosing.
- Days are Amsterdam days, so "vandaag" ends at local midnight.
- The upstream call is cached for a minute in module scope, because the panel
  polls. Failures are not cached.

Success:

```json
{
  "configured": true,
  "range": "7d",
  "visitors": 412, "pageviews": 1183, "visits": 508,
  "bounceRate": 46, "avgSeconds": 94,
  "series":   [{ "date": "2026-08-17", "visitors": 61, "pageviews": 174 }],
  "topPages": [{ "url": "/kaart", "count": 212 }],
  "events":   [{ "name": "reservation_submitted", "count": 9 }]
}
```

Anything wrong — no website id, no key, Umami unreachable, key rejected —
answers **200** with:

```json
{ "configured": false, "reason": "Umami is nu niet bereikbaar. …" }
```

The reason is a finished Dutch sentence, meant to be printed as-is where the
graph would have been. A dashboard that has to interpret an HTTP status to
explain a missing graph is a dashboard that will show a red box to two people
who cannot act on it.
