/**
 * Shared guards for the two publicly writable endpoints.
 *
 * Route Handlers in the App Router have no default body size limit, and
 * `await request.json()` buffers the whole body before any of our checks run,
 * so a handful of large requests is enough to exhaust memory. Payload 3.88
 * also dropped its own rateLimit option, so both of these have to live here.
 */

const MAX_BODY_BYTES = 32 * 1024;

type JsonResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; status: 400 | 413; error: string };

/** Reads a JSON body, refusing anything oversized before it reaches memory. */
export async function readJsonBody(request: Request): Promise<JsonResult> {
  const declared = request.headers.get("content-length");
  if (declared && Number(declared) > MAX_BODY_BYTES) {
    return { ok: false, status: 413, error: "Verzoek te groot" };
  }

  const reader = request.body?.getReader();
  if (!reader) return { ok: false, status: 400, error: "Lege aanvraag" };

  const chunks: Uint8Array[] = [];
  let total = 0;
  // The header can be absent or a lie, so cap the actual stream as well.
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      return { ok: false, status: 413, error: "Verzoek te groot" };
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }

  try {
    const parsed = JSON.parse(new TextDecoder().decode(merged));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, status: 400, error: "Ongeldige aanvraag" };
    }
    return { ok: true, data: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, status: 400, error: "Ongeldige aanvraag" };
  }
}

/**
 * How many proxies of our own stand between the visitor and this process.
 *
 * Everything below hangs on getting this right, so it is worth spelling out
 * what `x-forwarded-for` actually is. It is a list, and the obvious reading —
 * the first entry is the client, the rest are proxies — is the one nearly
 * everybody writes and it is wrong, because the header a request arrives with
 * already contains whatever the sender put in it. `curl -H 'X-Forwarded-For:
 * 203.0.113.7'` puts 203.0.113.7 at the front before our infrastructure has
 * seen the request at all. Nginx Proxy Manager, which is what this site sits
 * behind (see docker-compose.yml and the `reverse-proxy` network), forwards
 * with `$proxy_add_x_forwarded_for`, and that APPENDS the address it saw the
 * connection come from to whatever was already there. So the left-hand end of
 * the list is the visitor's fiction and the right-hand end is our own
 * bookkeeping: the trustworthy entry is counted from the right, and taking the
 * first entry means throttling a number the visitor chose, which is no
 * throttle at all.
 *
 * How far in from the right is a property of the deployment rather than of
 * this code — one entry per proxy of ours that appends. This one has exactly
 * one, hence the default: the last entry is the address NPM saw. Put
 * Cloudflare in front of NPM and it becomes 2.
 *
 * Both ways of getting it wrong are worth knowing. Too high and the index
 * walks off our own entries into the part of the list the visitor wrote, and
 * rotating a header defeats the limit again — silently, because everything
 * looks normal. Too low and the index lands on one of our proxies, whose
 * address is the same for everybody, so all visitors share one bucket and the
 * fifth reservation of the morning is refused for the whole neighbourhood —
 * wrong, but loudly and harmlessly wrong. When unsure, count low.
 *
 * Zero means Node is the thing listening on the public port. Then no part of
 * the header was written by us, none of it can be believed, and there is no
 * socket address to fall back on either: a Route Handler is handed a `Request`
 * and Next 15 took `request.ip` away. Everything therefore shares one bucket,
 * which throttles the whole site instead of the abuser. That is the safe half
 * of a bad trade, and a reason to put a proxy in front of it.
 *
 * `x-real-ip` used to serve as a fallback here and no longer does: it is only
 * ever correct for a one-hop deployment, nothing inside the process can tell a
 * value NPM wrote from one the visitor sent, and the rule above already covers
 * the case it was there for.
 */
function trustedProxyHops(): number {
  const raw = process.env.TRUSTED_PROXY_HOPS?.trim();
  if (!raw) return 1;
  const hops = Number(raw);
  if (!Number.isInteger(hops) || hops < 0) {
    console.warn(
      `TRUSTED_PROXY_HOPS is "${raw}", which is not a whole number of proxies. Using 1.`,
    );
    return 1;
  }
  return hops;
}

const TRUSTED_PROXY_HOPS = trustedProxyHops();

/** Where everything we cannot place is counted, together. */
const UNVERIFIED = "unverified";

/** Who the visitor is, as far as anything inside this process can know. */
function clientKey(request: Request): string {
  if (TRUSTED_PROXY_HOPS === 0) return UNVERIFIED;

  const entries = (request.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  // Fewer entries than there are proxies means the request did not come
  // through them — somebody reached the container's own port, and nothing in
  // the header is ours. Shared bucket, same as the no-proxy case.
  return entries[entries.length - TRUSTED_PROXY_HOPS] ?? UNVERIFIED;
}

/**
 * Per-key throttle, held in process memory. That is deliberately modest: it
 * resets on deploy and does not span instances, but this site runs as a single
 * container and the alternative needs infrastructure the owners do not have.
 * Worth knowing before a second container is ever added: every limit below is
 * per process, so two of them silently allow twice as much. A limit on Nginx
 * Proxy Manager as well would be better than this one, since it sees the
 * connection rather than a header describing it.
 */
const hits = new Map<string, number[]>();

/** How long a hit is remembered, for every bucket that does not say otherwise. */
const WINDOW_MS = 10 * 60 * 1000;

/** One bucket to count a single event against. */
export interface RateLimitBucket {
  /**
   * Already a key rather than something a person typed: lower-cased, trimmed.
   * `clientKey()` produces one for an address; an e-mail wants `.toLowerCase()`
   * first, or Anne@… and anne@… are two guests.
   */
  identity: string;
  /** Which counter this belongs to, so two limits on one identity stay apart. */
  bucket: string;
  limit: number;
}

/**
 * Several buckets at once, spending a hit in each only if every one of them
 * had room — and spending nothing at all otherwise.
 *
 * That all-or-nothing is the whole reason this exists rather than a loop at
 * the call site. /api/reserve counts a stored booking against two identities,
 * the address and the e-mail, and used to ask them one after the other with
 * `||`. Passing the first bucket is what records in it, so a guest sitting at
 * their per-e-mail limit had already spent a slot of the per-address bucket
 * before the e-mail bucket refused them — and again on every further attempt,
 * so ten refusals of one guest also emptied the address bucket for everybody
 * else behind the same carrier NAT. The two questions have to be asked before
 * either one is answered.
 *
 * An address is a poor identity on Dutch mobile in the first place, where
 * carrier NAT puts thousands of subscribers behind one of them and a bucket
 * sized for one household is shared by a town, which is why /api/reserve
 * counts against the submitted e-mail as well: that is the identity that
 * actually books a table, and the one a guest cannot rotate without giving us
 * a different address to confirm on.
 *
 * Nothing here is written down anywhere but the map above, which lives as long
 * as the process does.
 */
export function rateLimitAll(
  buckets: RateLimitBucket[],
  windowMs = WINDOW_MS,
): boolean {
  const now = Date.now();
  // Pruning happens whatever the answer turns out to be: it is only dropping
  // hits that have aged out of the window, which is true of them either way.
  const pruned = buckets.map(({ identity, bucket, limit }) => {
    const key = `${bucket}:${identity}`;
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    return { key, recent, room: recent.length < limit };
  });

  const room = pruned.every((entry) => entry.room);
  for (const entry of pruned) {
    if (room) entry.recent.push(now);
    hits.set(entry.key, entry.recent);
  }

  // Keep the map from growing without bound on a long-running process.
  if (hits.size > 5000) {
    for (const [k, times] of hits) {
      if (times.every((t) => now - t >= windowMs)) hits.delete(k);
    }
  }
  return room;
}

/** The same throttle, on something other than an address. */
// Not exported. `rateLimit` and `rateLimitAll` are the two doors this module
// means to offer, and a third one taking a bare identity string invites a
// caller to invent its own notion of who the client is — which is precisely
// the decision `clientKey` exists to make in one place, with the proxy hops
// accounted for.
function rateLimitKey(
  identity: string,
  bucket: string,
  limit = 5,
  windowMs = WINDOW_MS,
): boolean {
  return rateLimitAll([{ identity, bucket, limit }], windowMs);
}

/** The same, on whoever the visitor is as far as this process can tell. */
export function rateLimit(
  request: Request,
  bucket: string,
  limit = 5,
  windowMs = WINDOW_MS,
): boolean {
  return rateLimitKey(clientKey(request), bucket, limit, windowMs);
}

/**
 * Who the visitor is, for a caller that has to name them in a bucket list of
 * its own rather than throttle a request outright.
 */
export function rateLimitIdentity(request: Request): string {
  return clientKey(request);
}

/** Trimmed string with a hard cap, or null when absent or the wrong type. */
export function str(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
