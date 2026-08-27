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
- No names, no email addresses, no telephone numbers, no notes — nothing anybody
  typed into a form, in any event, ever.
- Nothing that identifies a booking. Never *who* booked, never *exactly* how many
  people, and never *which evening*. What does travel is a lead-time band
  (`0-1_days`) and the weekday, from the moment a date is picked, plus a party
  size band (`5-6`) when a booking is refused — because "are we turning large
  parties away, and always at the last minute" is a real question the owners ask
  and could not answer. Be exact about *when*, because this bullet and the Dutch
  in the admin both used to scope all three to refusals and neither was true: the
  lead-time band and the weekday ride on `availability_checked`, which the form
  fires for **every** settled date — bookings that go through, bookings that are
  abandoned at the time picker, and dates somebody clicked and thought better of.
  Only the size band is refusals-only.
  All three are deliberately lossy: dozens of bookings share `3-4` and a
  Saturday, so none of them can be turned back into a table. That is also why the
  lead-time bands begin at `0-1_days` instead of separating today from tomorrow.
  Umami stamps every event with the day it recorded it, so a band that names one
  exact number of days *is* the booked evening, written down in two pieces — a
  lossless reconstruction wearing the clothes of a band, which is precisely what
  the rest of this section promises does not happen. Two days at once is the
  narrowest band that still answers "do people book at the last minute".
  The exact size beside the exact evening would have been very nearly a primary
  key into the reservations table, and both datasets live in the same PostgreSQL
  cluster — see "Where it runs" below — so that is a re-identification path
  rather than a theoretical one. The reasoning is written out at length above
  `partyBucket()` in `src/lib/bookingTelemetry.ts`, which is the only
  place in the codebase allowed to derive any of it.
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

The totals are one request. The graph, the top pages, the event totals and the
twelve property breakdowns are fifteen more. Only the totals can fail the whole
panel; every other request is allowed to come back empty on its own, so a block
that is blank while the visitor count is fine means Umami refused that one
request **or there is genuinely nothing to draw**.

Those two are not the same and this paragraph used to name only the first. It
read as though a blank block were always an API fault, which is a confident
answer that stops somebody looking — and for a year the events block was blank
because there were no events, not because anything was refused. Check the data
before you check the API:

```sh
docker exec -i beeshive-postgres psql -U beeshive -d umami \
  -c "select event_type, event_name, count(*) from website_event group by 1,2;"
```

`event_type` 1 is a pageview and 2 is a custom event. No rows of type 2 at all
is the subject of the next section, and it is not an API problem.

That is not hypothetical. Umami renamed the top-pages report from `type=url` to
`type=path`, and while all four requests were tied together a 400 on that one
made the panel announce that Umami was unreachable while Umami was sitting there
answering everything else perfectly. Their API will move again — and the twelve
new requests are the likeliest place for it to happen next, because they go to
an endpoint Umami does not document at all.

### When there are no events at all

Pageviews arriving while **every** custom event is missing is a specific fault
with a specific cause, and it is worth recognising on sight rather than
rediscovering. It happened here, and it lasted from the day analytics was built
until August 2026.

Umami's tracker installs its API guarded:

```js
window.umami || (window.umami = { track, identify, getSession })
```

The guard is there so a second copy of the tag cannot clobber a live API. It
cannot tell an API from anything else that happens to be sitting on that name —
and **an element with `id="umami"` puts itself there**, by named access on the
Window object, before its own code runs. So the tracker found the name taken and
installed nothing. `window.umami.track` never existed.

Pageviews were unaffected, which is what made it survive: the tracker counts
those by calling its own internal function and never goes through the global.
Every surface check said analytics was healthy.

**To recognise it**, in the browser console on the live site:

```js
typeof window.umami.track   // "function" is healthy; anything else is this bug
```

If it is not a function, look at what else is claiming the name — start with
element ids. `src/components/Analytics.tsx` carries the full note. `umamiGlobal()`
in `src/lib/umami.ts` now warns once in development when it sees an occupied
global, which is the check that would have turned a year into an afternoon.

Note what did *not* catch it. `track()` swallows every error by design, which is
right for a guest mid-booking and is why nobody found out. The hold-queue gives
up silently after ten seconds, which turned a permanent fault into a quiet one.
And `tests/lib/bookingFunnel.test.ts` stubs `window.umami = { track }` directly,
so the suite validated the taxonomy against a global the real page never had —
it mocked the exact seam the bug lived in. Treat an assertion about analytics
made anywhere other than a real browser as unproven.

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
import { EVENTS, STEPS, track } from "@/lib/umami";
track(EVENTS.reservationStep, { step: STEPS.timePicked, surface: "sheet", entry: "mobile_fab" });
```

`track()` never throws, never rejects, and does nothing a caller has to check —
blocked, not configured, or still loading. That matters most on the reservation
form: a guest must never lose a filled-in booking because a counter was
unavailable. Always import `EVENTS`, never the literal string; the names are the
join key with the dashboard and a typo shows up weeks later as a graph that
simply stops. The same goes for `STEPS`, because the funnel is read back by
asking Umami for the values of one property, so a stage renamed in one place and
not the other quietly falls out of the chart rather than failing anywhere.

Two properties are attached centrally, in `track()`, and no call site ever
passes them:

- **`locale`**, read from `<html lang>`.
- **`device`** — `phone`, `tablet` or `desktop` — decided by `window.matchMedia`
  at 1280px and 640px. The viewport rather than the user agent, on purpose: a
  user agent string is a guess that needs a table of exceptions, and the question
  being asked is whether the form behaves differently when it is *narrow*.
  1280px is the same breakpoint `MobileReserveButton` uses for `xl:hidden`, so
  "this is a phone" and "the booking sheet exists" cannot drift apart. Umami does
  record a device class of its own, but only for pageviews — it will not segment
  a custom event by it, which is why this has to ride along.

### The script is not there when the page mounts

`<Analytics>` loads Umami with `strategy="afterInteractive"`, so `window.umami`
appears *after* hydration. `track()` used to look for it, find nothing and return
silently, which meant every event fired from a mount effect raced the script — 
and on a phone on 4G in a café, usually lost. The figures were not merely thinner
on phones, they were biased downward on exactly the device the owners said they
were blind on.

So a miss is now held in a small queue and flushed when the script arrives. It is
capped at 20 events and abandoned after 10 seconds, both deliberately: a visitor
with the script blocked would otherwise accumulate one event per tap for as long
as the tab is open. Past the deadline the held events are dropped and the file
goes back to being silent, which is the right answer for a page where measuring
was never going to work.

The ten seconds are counted **once per page**, from the first event that had to
wait, and not once per batch. That distinction is the whole of it: while the
deadline belonged to the batch, giving up cleared the queue and the timer and
left no trace that it had happened, so the next tap started a fresh ten seconds
of 200ms polling — one new poll per tap, for the life of a tab on which the
script was never going to load. Nothing leaked and nothing showed up in the
figures; what it cost was battery, on the phones the queue exists to stop
under-counting. Once the deadline has passed, `src/lib/umami.ts` holds nothing
again for the rest of the page.

### Event table

| Constant | Name in Umami | Properties beyond `locale`/`device` | Meaning |
| --- | --- | --- | --- |
| `EVENTS.reserveButtonClicked` | `reserve_clicked` | `source`: `mobile_fab` \| `mobile_external` \| `nav` \| `nav_sheet` | One of our Reserveren controls was pressed. The denominator for the whole funnel — it is the only signal that exists before a form is mounted. |
| `EVENTS.reservationStep` | `reservation_step` | `step`, `surface`, `entry`, and `via` on `2_date_picked` | One stage of the booking flow reached. See below. |
| `EVENTS.reservationAbandoned` | `reservation_abandoned` | `last_step`, `exit`, `surface`, `entry` | Somebody left without booking, and how far they had got. |
| `EVENTS.reservationFailed` | `reservation_failed` | `reason`, `step`, `surface`, `entry`, `party_bucket`, `lead_bucket`, `weekday`, `ms_bucket` | `/api/reserve` refused the booking, or never answered. |
| `EVENTS.reservationBlocked` | `reservation_blocked` | `field`, `surface` | The *browser* refused the submit, before our handler ran. |
| `EVENTS.availabilityChecked` | `availability_checked` | `scope`, `outcome`, `ms_bucket`, `surface`, and `weekday`/`lead_bucket` on `scope: "day"` | `/api/availability` answered one of its two questions — or did not. |
| `EVENTS.outboundClicked` | `outbound_clicked` | `kind`, `target`, `surface` | Somebody left us for something useful: ringing, routing, a calendar. |
| `EVENTS.guestPassStep` | `guest_pass_step` | `step`, and `context` on `shared` | The guest pass being opened, forwarded, or filled in by a companion. |
| `EVENTS.contentViewed` | `content_viewed` | `kind`, `ref` | A page of ours was read, or a rank of the menu card was chosen. |
| `EVENTS.contactSubmitted` | `contact_submitted` | `outcome`: `sent` \| `refused` \| `network` | A contact message, and whether it got through. |
| `EVENTS.newsletterSubscribed` | `newsletter_subscribed` | `outcome`, same three | A mailing list sign-up, and whether it got through. |

### The booking funnel

One event name with a `step` property, not six event names. A funnel is a
comparison of counts at ordered stages, and six names would be six series to
fetch, six rows competing for the events window in the panel, and a schema change
in three files every time a stage is inserted. The values are numerically
prefixed so that Umami's own alphabetical list of a property's values comes back
already in funnel order and nothing has to sort it:

| `step` | When |
| --- | --- |
| `1_opened` | The flow mounted. On a phone this is the sheet opening — a React state change that no pageview can see. |
| `2_date_picked` | A day chosen, from one of the three chips or from the calendar behind them. Carries `via`. |
| `3_time_picked` | A sitting chosen. On both surfaces this is also the moment the flow leaves the availability screen. |
| `4_details_shown` | The identity screen in front of somebody: the `/reserveren/gegevens` route on the page, a `pushState` entry in the sheet. |
| `5_submit_attempted` | The button pressed and our handler entered. |
| `6_confirmed` | `/api/reserve` accepted the booking. |

`via` rides on `2_date_picked` and is `chip` or `calendar`. It is one property
on the step it qualifies rather than an event of its own, and it is the single
number that validates or kills the biggest change in the redesign: if four in
five guests take one of the three offered days and never open the calendar, then
hiding a thirty-one square grid behind one tap was right. If a third are opening
it, "Andere dag" needs to be louder or the chips need to look further ahead.

**These six are not the six the old form sent.** The rename, and the key back to
the old series, are under "The funnel was remapped" below. It is worth reading
before comparing anything across the deploy date.

`reservation_abandoned` reuses the identical vocabulary in `last_step`, so the
funnel and its drop-off read as two properties of one comparable pair. Its `exit`
says how they left: `sheet_closed` (the phone dialog, whether by the X, the
backdrop or Escape — all three unmount the form), `navigated_away` (the
/reserveren page), or `page_hidden` (`pagehide`, which is what mobile Safari
fires and `beforeunload` is not). It never fires after a confirmed booking.

It also never fires for somebody moving about **inside** the flow. On the page
surface the two screens are two routes, so "Wijzigen" on the details screen — the
link whose whole purpose is to go back and change the day — unmounts the funnel
exactly as leaving the site would, and it was being counted as an abandonment at
`4_details_shown`. The guest who then booked was counted once as having given up
and once as having converted, which made the drop-off look worst at precisely the
boundary the redesign exists to prove itself on. `useFunnel` now watches, in the
capture phase, for the click that is about to cause the unmount and asks where it
is going: a plain left click on a link to a path still under /reserveren, in
either language, is a move rather than a departure. A middle click, a ⌘-click, a
link to anywhere else and a tab simply closed are all unchanged.

Because `surface`, `entry` and `device` ride on every stage *and* on the
abandonment, "of the people who opened the sheet on a phone, how many reached the
time picker" is one reading rather than a join. That question is the owner's
original complaint, verbatim.

### The funnel was remapped

The booking form was replaced by a two-screen flow and three of the six rungs
changed what they mean. They were renamed rather than quietly redefined, because
a rung called `2_field_touched` that fires when somebody presses a date chip is
a rung that will be read wrongly by whoever opens the dashboard next year.

There was a long section here with a key from the old rung names to the new
ones, a `RENAMED_STEPS` table in `src/lib/umami.ts` that the suite asserted was
complete, Dutch labels for the old values in `StatsView.tsx`, and an instruction
to annotate the deploy date in Umami before reading across it. All of it is
gone, and the reason is the one in "When there are no events at all" above: **no
custom event ever reached Umami before August 2026**, so there is no old series.
The key pointed at nothing, the labels described values that were never
recorded, and the deploy date has nothing on either side of it.

The six rungs in `STEPS` are therefore the only ones that have ever existed in
the data, whatever the names suggest about a history. `extraSteps` in
`StatsView.tsx` still catches any value Umami returns that the panel does not
know, so anything unexpected lands at the foot of the funnel rather than
disappearing.

### The property values, in full

This is the authoritative list, and it is here rather than only in the browser
code because both halves of the wiring are written from it: the values are what
`src/lib/umamiServer.ts` asks Umami for and what the panel's Dutch label table is
keyed on. A value the browser sends and the panel has never heard of is printed
verbatim rather than dropped — see the two rules at the end of "The panel in the
admin" — so a mismatch is visible rather than silent, but it is still a mismatch.
Change a value here and in `src/lib/umami.ts` or the booking flow under
`src/components/booking/` and in `src/components/admin/StatsView.tsx`, in one
go.

| Property | On | Values |
| --- | --- | --- |
| `scope` | `availability_checked` | `window`, `day` |
| `outcome` | `availability_checked`, `scope: "day"` | `slots_free`, `some_full`, `day_full`, `day_closed`, `refused`, `network` |
| `outcome` | `availability_checked`, `scope: "window"` | `days_free`, `all_closed`, `refused`, `network` |
| `via` | `reservation_step`, `2_date_picked` | `chip`, `calendar` |
| `ms_bucket` | `availability_checked`, `reservation_failed` | `lt500`, `500_1500`, `1500_4000`, `gt4000` |
| `party_bucket` | `reservation_failed` | `1-2`, `3-4`, `5-6`, `7-10`, `11+` |
| `lead_bucket` | `availability_checked` (day scope), `reservation_failed` | `0-1_days`, `2-6_days`, `1-2_weeks`, `2_weeks_plus` |
| `weekday` | `availability_checked` (day scope), `reservation_failed` | `sun`, `mon`, `tue`, `wed`, `thu`, `fri`, `sat` |
| `outcome` | `contact_submitted`, `newsletter_subscribed` | `sent`, `refused`, `network` |

`scope` exists because the flow asks `/api/availability` two genuinely different
questions and merging their answers makes both unreadable. `window` is "which
days at all", asked for a fortnight to draw the three date chips and again for
whichever month the calendar is showing; `day` is "which sittings on this one
day", asked the moment a day is settled. `day_closed` at day scope is one guest
who picked a shut Tuesday; `all_closed` at window scope is a fortnight with
nothing in it for that party, which is a far more serious thing to see. Only the
day question carries `weekday` and `lead_bucket`, because only it is about a
particular date. `scope: "window"` deliberately carries neither: the window is a
span rather than a booking, and a band naming one end of it would be describing
a date nobody has chosen.

`outcome` at day scope is the same **five** values it always was, and never
`slow`, which the original plan listed as a sixth. It cannot be one: the five are what
`/api/availability` answered, and how long it took to answer is a different
question with a different property — `ms_bucket` rides along on the same event,
so "the day was full" and "it took four seconds to say so" are read together
rather than one of them displacing the other. A guest who gives up before the
answer arrives produces no `availability_checked` at all, because the request is
aborted by the effect's own cleanup and the abort path deliberately reports
nothing; that person is counted by `reservation_abandoned` instead.

`lead_bucket` starts at `0-1_days` rather than splitting today from tomorrow, and
that is a privacy rule rather than a rounding choice — the argument is under
"What is *not* collected" and again under "What may ride along, and what may not".
Both `party_bucket` and `lead_bucket` are left off the event entirely when they
cannot be derived, rather than sent as an empty string, so a gap in the data is a
gap and not a value.

### Where each event is fired

| File | Where | Call |
| --- | --- | --- |
| `src/components/booking/useFunnel.ts` | a mount effect, and again from `reset()` | `reservation_step { step: from }` — `1_opened` for the accordion on either surface, `4_details_shown` for the details route, which was opened by the accordion before it. Fired from the hook rather than from the button that opened the flow, which is what lets the phone sheet carry no measuring code of its own, and guarded once per journey so backing out of the details screen on the phone does not re-open the funnel |
| `src/components/booking/BookingFlow.tsx` | `onDate()` and `onTime()` | `2_date_picked` (with `via`) and `3_time_picked` |
| `src/components/booking/BookingFlow.tsx` | the two `/api/availability` effects: each `.then` and `.catch` | `availability_checked { scope, outcome, … }`, and nothing at all when `ac.signal.aborted` |
| `src/components/booking/GuestDetails.tsx` | a mount effect, `handleSubmit`, the `res.ok` branch | `4_details_shown`, `5_submit_attempted`, `6_confirmed` |
| `src/components/booking/GuestDetails.tsx` | `onInvalidCapture` on the `<form>` | `reservation_blocked { field }` |
| `src/components/booking/GuestDetails.tsx` | the refusal branch and the `catch` of `handleSubmit` | `reservation_failed { reason, … }` |
| `src/components/booking/useFunnel.ts` | an effect holding a `pagehide` listener and an unmount cleanup | `reservation_abandoned { last_step, exit }` — suppressed when the unmount is the hand-off from the accordion to the details route (forward), and when it follows a plain click on a link that stays under /reserveren (backward). Both are somebody moving inside the flow rather than leaving it |
| `src/components/booking/Confirmation.tsx` | the calendar link | `outbound_clicked { kind: "calendar", target: "ics", surface: "confirmation" }` |
| `src/components/MobileReserveButton.tsx` | the mark that opens the sheet; the external-booking `<a>` | `reserve_clicked { source: "mobile_fab" }`; `{ source: "mobile_external" }` |
| `src/components/Navigation.tsx` | the `btn-primary` reserve link, both branches; the mobile sheet's last row | `reserve_clicked { source: "nav" }`; `{ source: "nav_sheet" }` |
| `src/components/ShareActions.tsx` | the copy button and the wa.me link, in both of its mounts | `guest_pass_step { step: "shared", context }` |
| `src/components/AddToCalendarTracker.tsx` | one delegated `onClick` around server-rendered links | `outbound_clicked`, `kind` read off the link |
| `src/components/Footer.tsx` | the contact block, through that delegate | `outbound_clicked { kind: "phone", surface: "footer" }` |
| `src/components/MailingListForm.tsx` | all three endings of `handleSubmit` | `newsletter_subscribed { outcome }` |
| `…/contact/ContactClient.tsx` | all three endings of `handleSubmit`; the `tel:` link; the Google listing link | `contact_submitted { outcome }`; `outbound_clicked { kind: "phone" \| "google_listing", surface: "contact" }` |
| `…/kaart/KaartClient.tsx` | a mount effect, and `chooseCategory()` | `content_viewed { kind: "menu", ref }` |
| `…/blog/[slug]/BlogPostClient.tsx` | a mount effect | `content_viewed { kind: "blog", ref: slug }` |
| `…/evenementen/[slug]/EventClient.tsx` | a mount effect; each link in the calendar `<details>` | `content_viewed { kind: "event", ref: slug }`; `outbound_clicked { kind: "calendar", target, surface: "event" }` |
| `…/reservering/[token]/GuestPassClient.tsx` | a mount effect; the companion form's three endings; the two route links and the `tel:` link; the review link, which is only drawn on a confirmed booking whose evening has already been | `guest_pass_step { step: "opened" \| "companion_joined" \| "companion_failed" }`; `outbound_clicked { kind: "directions" \| "phone" \| "google_listing", surface: "guest_pass" }` |
| `…/reservering/[token]/page.tsx` | the `tel:` link on the "link no longer valid" sheet, through the delegate | `outbound_clicked { kind: "phone", surface: "guest_pass" }` |
| `…/reserveren/ReserverenClient.tsx` | the `tel:` link in the rail | `outbound_clicked { kind: "phone", surface: "reserveren" }` |

`kind` on `outbound_clicked` is `phone`, `directions`, `calendar` or
`google_listing`, and `target` qualifies it: `google` or `apple` for directions,
and `apple`/`google`/`outlook`/`ics`/`series` for a calendar. On the guest pass
`apple` and `ics` are the same file under two names — see the note in
`AddToCalendar.tsx` — so "how many used a calendar at all" adds them up rather
than choosing between them. `surface` is which page the link sat on: `contact`,
`footer`, `guest_pass`, `reserveren`, `confirmation` or `event`.

The contact page has no dedicated route link — only an embedded map iframe,
whose clicks are inside a cross-origin frame and cannot be observed — so the
nearest true signal there is the Google listing, which is where the reviews and
the route button both live. It therefore has a `kind` of its own rather than
pretending to be a route request.

Three of these events are fired from markup rendered on the **server**, which
looks impossible at first glance: `src/components/AddToCalendar.tsx` is a server
component so that `@/lib/ics` stays out of the visitor bundle, and the footer and
the guest pass's "link no longer valid" sheet are `async` and read the CMS. None
of the three can carry an `onClick`. So they do not:
`src/components/AddToCalendarTracker.tsx` is a client component of some sixty
lines that stands around the links, hears the clicks bubble past, and reads the
`data-calendar-target` attribute or the `href` scheme off whatever was clicked.
Nothing else moves to the client, and each wrapper replaces a `<div>` the markup
already had, so what a guest gets is unchanged. The alternative on the table for
the calendar — reporting from the `/api/guest-pass?ics=1` handler — was left
alone: it would see the two `.ics` routes and never Google or Outlook, and it
would put a measurement in a request path a calendar app makes on its own
schedule.

### What may ride along, and what may not

A fact about **us** may be a property: a stage name, one of our own two form
surfaces, which of our own buttons was pressed, an error code, a slug of our own
published content, a width class. A fact about **the guest** may not.

The two rulings that are not obvious, both made in
`src/lib/bookingTelemetry.ts` above `partyBucket()` and repeated here so this
file can be read on its own:

- **Party size**: the exact integer is refused, the band is allowed. Umami stores
  an event beside a timestamp and a same-day visitor hash, and an exact size plus
  an exact evening is very nearly a primary key into the reservations table. The
  band answers the owner question and destroys the join.
- **The booked date**: refused outright, in both directions, and replaced by
  `lead_bucket` and `weekday`. Umami already records the day the *event* happened,
  which is what a trend line is drawn from; the evening being booked adds nothing
  and is the other half of that key. "In both directions" is the part that needs
  guarding, because the first version of the bands broke it while looking like it
  did not: `same_day` and `1_day` each named one exact offset, and one exact
  offset from a date Umami has already written down is the booked evening. They
  are now the single band `0-1_days`, which is genuinely two evenings and still
  answers the question the pair was added for.

Name, e-mail, telephone number and the notes field are refused absolutely and are
not derived from at any point — not bucketed, not hashed, not counted. Neither is
the number of companions on a guest pass: one companion on one evening is close
enough to identifying.

### The cutover

Umami keys its history on the event name string, so a renamed event does not
carry its past with it: old rows stay where they are and the chart of the old
name simply stops on the day of the deploy. Nothing is lost, but it has to be
expected. Thirteen names became eleven:

| Was | Is now |
| --- | --- |
| `reservation_started` | `reservation_step { step: "2_date_picked" }` — see the remap below |
| `menu_viewed` | `content_viewed { kind: "menu" }` |
| `blog_post_read` | `content_viewed { kind: "blog" }` |
| `event_viewed` | `content_viewed { kind: "event" }` |
| `phone_clicked` | `outbound_clicked { kind: "phone" }` |
| `directions_clicked` | `outbound_clicked { kind: "directions" \| "google_listing" }` |
| `add_to_calendar` | `outbound_clicked { kind: "calendar" }` |
| `guest_pass_opened` | `guest_pass_step { step: "opened" }` |
| `reservation_submitted` | `reservation_step { step: "6_confirmed" }` |

That last row carried an exception for a while: `reservation_submitted` was
fired alongside `6_confirmed` and kept until March 2027, so that bookings per
week — the one figure the owners already read — would not fall off a cliff on
the day the measuring got better. It has been deleted, because that cliff could
not happen: the figure never existed. See "When there are no events at all".
None of the old names in this table were ever recorded either, so the whole
table is a record of intent rather than a migration to plan around.

Note also that `phone_clicked` was a *biased* sample rather than a small one:
the footer's telephone number, which is on every page of the site, was never
counted, so the total over-represented whoever happened to be on the contact
page. `outbound_clicked` will therefore read higher than `phone_clicked` did by
more than the change of name accounts for.

## Reading the properties back

`metrics?type=event` answers with event names and totals and nothing else. Every
property in the table above — the refusal `reason`, the funnel `step`, `device`,
`locale`, all of it — is invisible to it. That is not a small gap: it means a
`step` property nobody can read back is not a funnel, and it is why the read-back
path grew a second kind of request.

The endpoint is

```
GET {base}/websites/{id}/event-data/values?startAt=…&endAt=…&eventName=…&propertyName=…
```

answering `[{ "value": "slotFull", "total": 40 }]` — note `value`/`total`, where
the rest of Umami's API says `x`/`y`, and note that `total` is a Postgres
`count(*)` which may arrive as a JSON number or as a string depending on the
serialiser in the running version. `src/lib/umamiServer.ts` reads both.

**This endpoint is not in Umami's published API documentation.** The docs list
`stats`, `pageviews`, `metrics`, `events/series` and stop there; the parameter
names and the response shape above were read out of Umami's source. Treat it as
something that can move without notice, which is exactly how it is treated in
the code: every one of the twelve requests goes through the same `optional()`
guard the `type=url` → `type=path` incident produced, so a breakdown Umami
refuses costs one block of the panel and nothing else.

### The telephone split, and why it is Umami's idea of a telephone

`event-data/values` breaks down **one** property at a time and cannot cross two,
so "the funnel, on phones" cannot be asked for through the `device` property the
browser attaches — that would be a cross-tabulation. What the endpoint does
accept is Umami's own session filters, and `device` is one of them, read off the
user agent.

**On Umami 2.x this split does not merely fail, it lies.** `device` on
`event-data/values` is a **v3** feature. Umami 2.17 through 2.20 — checked
against their source, not inferred from behaviour — assemble the filter object
for this endpoint by hand and never look at `device` at all, and their request
parsing is not strict, so an unknown parameter is silently dropped rather than
refused. The request answers **200**, with data, correct in every respect except
that it is the unfiltered total. The Telefoon column would then equal the overall
column exactly, and the panel would read as though every visitor to the site was
on a phone — a wrong number wearing the appearance of a right one, which is worse
than the empty block `optional()` was built to produce. From v3 onward the filter
is real and the split is true. The Umami service in `docker-compose.yml` must
therefore not be pinned below v3; it tracks the moving `postgresql-latest` tag
today, and anyone pinning it to a fixed version needs to know that pinning to a
2.x is not "staying on a known-good version", it is switching one column of this
panel from measurement to fiction.

Umami's vocabulary there is the trap. Anything with a desktop user agent and a
screen of 1920 pixels or less is a `laptop`; `desktop` is reserved for the
genuinely large monitors. So `device=desktop` would return a fraction of the real
number and read on the page as a collapse in desktop bookings. The panel asks
only for `mobile` and `tablet` and arrives at "computer" by subtracting them from
the total, which is one request fewer and puts any device class a later Umami
invents into the remainder instead of losing it.

Consequence worth knowing before anyone reconciles two numbers: the Telefoon
column is Umami's user-agent classification, while the `device` property on each
event is the browser's own viewport measurement (`phone` under 640px, `tablet`
under 1280px). They will not agree exactly. The panel deliberately shows only
one of the two, so nothing on screen contradicts anything else on screen.

## The panel in the admin

**/admin/statistieken**, in the sidebar under Backups.
`src/components/admin/StatsView.tsx`.

It is worth recording why this took so long to exist, because the shape of the
mistake is repeatable. `src/lib/umamiServer.ts` was written first and written
well — token refresh, per-report isolation, a distinct Dutch sentence for each
distinct thing that can be wrong. `/api/umami/stats` guarded it. The Statistieken tab told
the owners "daarmee haalt dit paneel de cijfers weer op". This file described "a
panel the owners keep open". Nothing rendered any of it: `grep -rn "api/umami"
src/` returned only the route itself, and `payload.config.ts` registered no such
view. Every one of those Dutch sentences had been written for a reader who did
not exist. Measurement that cannot be looked at is not measurement.

The page renders on the **server** and ships no browser code. Changing the period
is a link (`?periode=today|7d|30d|year`), the way the agenda changes its week.
That is a departure from the polling panel the older comments imagined, and it is
the better trade: the figures are a minute stale by design, so live updating
would be a spinner in front of a cache, and the failure sentences belong in the
first paint rather than behind a second authenticated round trip.

What it shows, in order, and why that order:

1. **The plain numbers** — visitors, pageviews, visits, average stay, bounce.
   This is what "how are we doing" means and it is the only part the owners
   already know how to read.
2. **The booking funnel**, six stages with a Telefoon / Tablet / Computer split
   and a "Hier gestopt" column drawn from `reservation_abandoned`. This is the
   only thing on the page that answers a question the owners asked out loud.
   Those three device columns are not a fixture: the panel holds the two
   device-filtered breakdowns up against the unfiltered one, and when all three
   come back identical it treats the filter as having been thrown away — the
   2.x behaviour under "The telephone split" above — and leaves the columns out
   entirely, with a Dutch sentence where they were. So a running panel with no
   Telefoon column is not a half-built page; it is that check having fired, and
   the Umami it is talking to is the thing to look at.
3. **Why bookings failed** — `reason`, with the share and the phone count beside
   it, then the same failures re-cut by party size and lead time. A refusal is
   the one figure here that turns into a decision: `slotFull` clustered in
   `5-6` + `0-1_days` is a capacity setting to change on Monday.
4. Everything else — where the form stalled, what the availability check
   answered, which button they came in by, how they left, the top pages, and the
   raw event totals for completeness.

Two rules the page keeps and any change to it must keep. A property value with no
Dutch label is printed **verbatim** rather than skipped, because the browser half
is edited on other days by other people and a new refusal code must show up as an
unfamiliar word somebody can ask about, never as a row that quietly is not there.
And when Umami cannot be reached, the sentence `umamiServer.ts` wrote is printed
word for word, followed by a short list of the settings fields to check — never a
blank page, never a red box, never an HTTP status.

## Reading the figures back

`GET /api/umami/stats?range=7d&report=all`

- Requires a logged-in Payload user (`payload.auth`). Anonymous callers get 401.
- `range` is one of `today`, `7d`, `30d`, `year`; `report` is one of `all`,
  `summary`, `series`, `pages`, `events`, `funnel`. Anything else falls back to
  `7d` / `all`, and the answer echoes what it used.
- It is not a proxy. Nothing from the query string ever reaches an upstream URL,
  so a logged-in editor account cannot aim the API key at a host of their
  choosing.
- Days are Amsterdam days, so "vandaag" ends at local midnight.
- The upstream call is cached for a minute in module scope, because one load of
  the panel is sixteen upstream requests and reloading it is one keystroke.
  Failures are not cached.
- **Nothing in the admin calls this.** The panel renders on the server and calls
  `getUmamiStats()` directly. The route is what you reach for from a terminal
  when the panel is empty and you want to see the refusal in its own words.

Success:

```json
{
  "configured": true,
  "range": "7d",
  "visitors": 412, "pageviews": 1183, "visits": 508,
  "bounceRate": 46, "avgSeconds": 94,
  "series":   [{ "date": "2026-08-17", "visitors": 61, "pageviews": 174 }],
  "topPages": [{ "url": "/kaart", "count": 212 }],
  "events":   [{ "name": "reserve_clicked", "count": 96 }],
  "breakdowns": {
    "funnelSteps": [{ "value": "1_opened", "count": 412 }],
    "funnelStepsPhone": [{ "value": "1_opened", "count": 301 }],
    "funnelStepsTablet": [],
    "abandonedAtStep": [{ "value": "3_time_picked", "count": 105 }],
    "abandonedHow": [{ "value": "sheet_closed", "count": 190 }],
    "failureReasons": [{ "value": "slotFull", "count": 40 }],
    "failureReasonsPhone": [{ "value": "slotFull", "count": 34 }],
    "failurePartySize": [{ "value": "5-6", "count": 21 }],
    "failureLeadTime": [{ "value": "0-1_days", "count": 31 }],
    "blockedFields": [{ "value": "time", "count": 58 }],
    "availabilityOutcome": null,
    "reserveButtonSource": [{ "value": "mobile_fab", "count": 288 }]
  }
}
```

`null` and `[]` are different answers in `breakdowns` and nothing may flatten
one into the other. `[]` is Umami saying nothing of the kind has happened yet,
which is the ordinary state of a measurement on the day it ships. `null` is
Umami declining to answer at all, and is a thing for a developer rather than
something to wait out. The panel prints a different Dutch sentence for each.
There is a third case that looks like the first and is not: a caller who asked
for any `report` other than `funnel` gets `[]` for all twelve breakdowns and
never a `null`, because none of those requests were made and a request that was
never sent cannot have been refused.

Anything wrong — no website id, no key, Umami unreachable, key rejected —
answers **200** with:

```json
{ "configured": false, "reason": "Umami is nu niet bereikbaar. …" }
```

The reason is a finished Dutch sentence, meant to be printed as-is where the
graph would have been. A dashboard that has to interpret an HTTP status to
explain a missing graph is a dashboard that will show a red box to two people
who cannot act on it.
