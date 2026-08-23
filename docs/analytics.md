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

## Cloud or self-hosted

Both work. The difference is only what goes in the settings fields.

**Umami Cloud** (cloud.umami.is) is the quicker route. The script comes from
`https://cloud.umami.is/script.js`, and the API — a different host, which is the
usual trip-up — lives at `https://api.umami.is/v1`. Create a key under **Settings
→ API keys** and authenticate with the `x-umami-api-key` header.

**Self-hosted** is a Docker container plus a Postgres or MySQL database, run
wherever the site runs. Script and API share one origin: the script is at
`https://umami.example.com/script.js` and the API at
`https://umami.example.com/api`.

Self-hosted Umami has no API keys. It authenticates with a bearer token, which
you obtain once by hand:

```sh
curl -X POST https://umami.example.com/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"…"}'
```

The `token` in the response goes in as the API key. `src/lib/umamiServer.ts`
recognises a JWT by its three dot-separated segments and sends it as
`Authorization: Bearer …` instead of as a cloud key, so the same field serves
both. Deliberately, there is no automated login: keeping the owners' Umami
password on the web server so it can re-authenticate itself is a worse trade
than the stored key already is. If the token expires, fetch a new one.

## Settings to fill in

**Instellingen → Statistieken**, all of it optional and inert until filled.

| Field | What it is |
| --- | --- |
| Bezoekcijfers bijhouden | Renders the measuring script. Off means nothing is measured at all. |
| Script-adres | `https://cloud.umami.is/script.js`, or `https://<your-host>/script.js` when self-hosted. |
| Website-ID | The UUID Umami shows under **Settings → Websites**. Without it nothing is measured, whatever the switch says. |
| Adres van Umami | Only needed for reading figures back: `https://cloud.umami.is` (which is mapped to `api.umami.is/v1` automatically) or your own host. |
| API-sleutel | Cloud API key or self-hosted bearer token. See below. |
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
