# Rate limiting and who the visitor is

This note is for whoever maintains the site. Nothing here is visible in the
admin: the owners only ever notice it as "iemand kreeg de melding dat het niet
lukte", which is the last section.

## What is limited

Five endpoints are publicly writable or publicly expensive, and all of them go
through `rateLimit()` in `src/lib/apiGuard.ts`:

| Endpoint | What it is |
|---|---|
| `/api/reserve` | the reservation form |
| `/api/contact` | the contact form |
| `/api/subscribe` | the newsletter |
| `/api/availability` | the calendar the reservation form asks for free tables |
| `/api/guest-pass` | the guest's own page, on its own two buckets |

The limit is per bucket per visitor, held in the process's own memory. It
resets on every deploy and does not span containers, which is fine for one
container and is not a reason to build something with Redis in it. A limit on
the proxy would be better than this one, because the proxy sees the connection
rather than a header describing it — that is an improvement to make in Nginx
Proxy Manager, not here.

## Who the visitor is

This is the part that goes wrong, so it is worth reading once even if you never
touch the setting.

The container never sees the visitor's connection. It sees a request that NPM
made on the visitor's behalf, and the only trace of who asked is the
`x-forwarded-for` header. That header is a **list**, and the obvious reading of
it — first entry is the client, the rest are proxies — is wrong in a way that
removes the limit entirely. A visitor may send the header themselves, and
theirs arrives at the front:

```
# what the visitor sent
X-Forwarded-For: 198.51.100.4
# what the container receives, NPM having appended the address it saw
X-Forwarded-For: 198.51.100.4, 203.0.113.99
```

NPM forwards with `$proxy_add_x_forwarded_for`, which appends. So the left of
the list is fiction and the right is ours. Take the first entry and a visitor
who changes one header on every request is a new person every time, and every
limit on the site is off. Count from the right and the entry cannot be forged,
because it was written after the request left the visitor's hands.

`TRUSTED_PROXY_HOPS` says how far in from the right, one entry per proxy of
ours that appends:

| Deployment | Value |
|---|---|
| NPM in front of the container — this one | `1`, the default |
| Cloudflare in front of NPM | `2` |
| Node itself on the public port, no proxy | `0` |

Zero is a real answer rather than "off": with no proxy, nothing in the header
is ours, none of it can be believed, and a Route Handler has no socket address
to fall back on since Next 15 removed `request.ip`. So every request shares one
bucket and the throttle applies to the site as a whole. That protects the
mailbox at the cost of one abuser being able to spend everyone's allowance,
which is the honest trade for a deployment with nothing in front of it.

**Getting it wrong points one of two ways, and they are not symmetrical.** Too
low and the address you count is a proxy's, identical for everybody, so all
visitors share a bucket and the fifth reservation of the morning is refused for
the whole neighbourhood — wrong, but loud, and the owners will tell you within
the day. Too high and you are counting an entry the visitor wrote, the limits
are gone, and nothing anywhere says so. When in doubt, count low.

## Checking it on the real host

Ask the site what it thinks it sees, from outside, through the proxy:

```bash
curl -s -o /dev/null -X POST https://debeeshive.nl/api/subscribe \
  -H 'Content-Type: application/json' \
  -H 'X-Forwarded-For: 198.51.100.1' -d '{}' -w '%{http_code}\n'
```

Repeat it eight times with `198.51.100.$i` counting up, and then eight times
with the address held still. **Both runs must start refusing at the same point**
— five 400s and then 429s. If the counting-up run never reaches 429,
`TRUSTED_PROXY_HOPS` is too high for this deployment: the header you are making
up is being believed. Lower it by one and try again.

Run that against the container's own port instead of through the proxy and the
counting-up run will bypass the limit at `TRUSTED_PROXY_HOPS=1`. That is not a
bug, it is the setting being told the truth about a request that arrived a
different way — and a reminder that the published port belongs on the
`reverse-proxy` network only, never on a public interface.

## When a real visitor is refused

Somebody who genuinely filled the form in five times in ten minutes waits it
out; the window is ten minutes and there is nothing to clear by hand. If
several unrelated people are refused at once, that is the too-low symptom
above: check `TRUSTED_PROXY_HOPS` against the number of proxies actually in
front of the container before assuming an attack. Restarting the container also
empties the map, which is a blunt way to unstick a mistake and loses nothing.
