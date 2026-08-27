import { getSiteSettings, type SiteSettingsData } from "@/lib/payload";

/**
 * Reading the figures back out of Umami, for the panel in the Payload admin.
 *
 * There are two entirely separate connections in play and they are easy to
 * confuse. The script in src/components/Analytics.tsx runs in the visitor's
 * browser and pushes visits *to* Umami. This module pulls them *back*, from a
 * Node process, with a credential of its own. Either half can be working while
 * the other is not, and the reasons they fail are different, which is why every
 * refusal in here carries a sentence saying which half is missing.
 *
 * Those sentences are in Dutch on purpose. The only thing that renders them is
 * the dashboard in the admin, and the admin is written for two restaurant
 * owners who do not read English error messages and should not have to.
 *
 * Nothing in here ever throws. The caller is /admin/statistieken, which
 * renders on the server and has one job on the morning something is wrong: to
 * say what. An unreachable Umami, an expired key or a field nobody filled in
 * must all come back as "here is why there is no graph", never as a stack
 * trace and never as a red box. `configured: false` plus a reason is the whole
 * error protocol, and src/components/admin/StatsView.tsx prints the reason
 * word for word where the figures would have gone.
 *
 * On authentication, and it differs by flavour. Umami Cloud issues API keys
 * (Settings, then API keys, then Create key) and wants them as
 * `Authorization: Bearer`. A self-hosted instance has no API keys at all: it
 * expects a token from `POST {host}/api/auth/login` with the admin username
 * and password, sent the same way.
 *
 * This module used to refuse to perform that login, and at the time the
 * refusal was right. Umami was going to be somebody else's cloud service, so
 * the password would have been the owners' own account at a third party, and
 * parking that on the web server so it could re-authenticate itself was a
 * worse trade than a read-only key already was. Self-hosting flipped the
 * trade. Umami is a container on this same stack now, its admin account exists
 * for nothing but this site, and its password sits in the environment beside
 * the database password and the mail password, which are secrets this process
 * already holds. Refusing to log in protects nothing any more; it only
 * guaranteed that the panel would go dark every time a hand-pasted token aged
 * out, in a way the owners could not fix for themselves.
 *
 * So the login lives here now, in `tokenFor` below. The password is read from
 * the environment, goes into a request body and nowhere else: no failure path
 * in here puts it in a message, and the messages this module produces are the
 * only thing that ever leaves it.
 *
 * Three credentials, tried in this order:
 *
 *   1. UMAMI_API_KEY, used exactly as given. A cloud API key, or a token
 *      somebody fetched by hand. It needs no login, so it goes first.
 *   2. UMAMI_USERNAME with UMAMI_PASSWORD, which sign in for themselves. These
 *      beat the field below because they renew themselves and it cannot.
 *   3. The API-sleutel field in Instellingen, Statistieken: the escape hatch
 *      for an owner who has been handed a key and has no developer to hand.
 *      Last, because it is the only one of the three an editor can open.
 *
 * None of this is needed to COUNT visitors, which is the part that matters.
 * Counting is the script in the page and the website id, and neither is a
 * secret. The credential exists only so the numbers can also be read back
 * inside this admin. docs/analytics.md walks a developer through it.
 */

const TIMEOUT_MS = 8_000;

/**
 * One load of the panel is sixteen upstream requests now that the event
 * properties are read back, and the panel is a page the owners reload,
 * flip between periods on, and leave open in a second tab. Without this, a
 * bored afternoon of clicking Vandaag and 7 dagen back and forth would put a
 * few hundred queries a minute through Umami for figures that had not moved.
 * Sixty seconds is about the finest granularity they are meaningful at anyway.
 */
const CACHE_TTL_MS = 60_000;

/** The only date windows a caller may ask for. */
export const RANGES = ["today", "7d", "30d", "year"] as const;
export type UmamiRange = (typeof RANGES)[number];

/**
 * The only reports a caller may ask for. This is the other half of not being a
 * proxy: the endpoint composes URLs from a closed set of names, so no caller
 * can point our credentials at a path of their choosing.
 *
 * "funnel" is the odd one out and is worth the extra name rather than being
 * folded into "events". It is twelve upstream requests where the others are
 * one, so anything that only wants a visitor count should be able to say so
 * and not pay for it.
 */
export const REPORTS = [
  "all",
  "summary",
  "series",
  "pages",
  "events",
  "funnel",
] as const;
export type UmamiReport = (typeof REPORTS)[number];

export function isRange(value: unknown): value is UmamiRange {
  return typeof value === "string" && (RANGES as readonly string[]).includes(value);
}

export function isReport(value: unknown): value is UmamiReport {
  return typeof value === "string" && (REPORTS as readonly string[]).includes(value);
}

export interface UmamiSeriesPoint {
  /** ISO day, or ISO hour for the single-day range. */
  date: string;
  visitors: number;
  pageviews: number;
}

export interface UmamiCount {
  url: string;
  count: number;
}

export interface UmamiEventCount {
  name: string;
  count: number;
}

/**
 * One value of one property on one event, and how often it was seen.
 *
 * `metrics?type=event` answers with names and totals and nothing else, which
 * is why every property the browser so carefully attaches — the refusal code,
 * the button that was pressed, the language, the funnel step — was collected
 * for a year and could not be looked at from this side once. A `step` property
 * nothing can read back is not a funnel; it is a column in a database.
 *
 * Umami does answer for them, and in a different shape from everything else:
 * `[{ value, total }]` where the rest of its API says `[{ x, y }]`.
 */
export interface UmamiPropertyValue {
  value: string;
  count: number;
}

/** One request to /event-data/values. */
interface BreakdownSpec {
  event: string;
  property: string;
  /**
   * Umami's own session classification. Only Umami 3 honours it; the note
   * below covers both its vocabulary and that version dependency, and both
   * have already cost this panel a wrong answer.
   */
  device?: "mobile" | "tablet";
}

/**
 * Which event properties get read back, and how the telephone split is made.
 *
 * The endpoint is `GET {base}/event-data/values`, taking `eventName` and
 * `propertyName` alongside the usual window. It is **not** in Umami's
 * published API documentation, which lists `stats`, `pageviews`, `metrics`
 * and the rest and stops there; the parameter names and the response shape
 * were read out of their source rather than out of a manual. That makes it
 * precisely the kind of thing that moves without anyone announcing it —
 * `type=url` quietly becoming `type=path` already cost this panel its
 * top-pages list once, and took three unrelated sections down with it. So
 * every request below goes through the same `optional()` guard as the three
 * that incident produced: a breakdown Umami will not answer for leaves one
 * block of the page empty and takes nothing else with it.
 *
 * On the telephone-versus-computer split, which is the whole reason the owners
 * asked for any of this. The browser attaches a `device` property to every
 * event, but this endpoint breaks down one property at a time and cannot
 * cross two of them, so "the funnel, on phones" cannot be asked for that way.
 * What it *will* take is Umami's own session filters, and `device` is one of
 * them — read off the user agent, which is a sounder answer than a screen
 * width in any case, because a phone held sideways is still a phone.
 *
 * Its vocabulary is the trap. Umami calls anything with a desktop user agent
 * and a screen of 1920 pixels or less a `laptop`, and keeps `desktop` for the
 * genuinely large monitors — so asking for `device=desktop` and printing the
 * answer under "computer" would report perhaps a tenth of the real number and
 * look like a collapse in desktop bookings. Only the two narrow classes are
 * asked for here, `mobile` and `tablet`, and the panel arrives at "computer"
 * by taking them off the total. That is one request fewer, and a device class
 * some later Umami invents lands in the remainder instead of disappearing.
 *
 * All of which is true of Umami 3 and of nothing before it. Read the route in
 * 2.17.0, 2.18.1, 2.19.0 or 2.20.0 and it assembles its filter by hand as
 * { startDate, endDate, eventName, propertyName }; it never imports the filter
 * params at all, and the schema it parses the request with is not strict, so
 * `device` is dropped on the floor and the answer comes back 200 with every
 * session in it. That is the worst shape a bug can take: not an error anybody
 * would notice, but a telephone column and a computer column that are quietly
 * the same total, drawn as though they were a split. Nothing on this side can
 * tell the two Umamis apart from one answer, so the noticing happens in
 * src/components/admin/StatsView.tsx, which holds the two device breakdowns up
 * against their unfiltered sibling and leaves the columns out rather than draw
 * a lie. On an Umami 3 that check simply never fires.
 *
 * The names on the left of each line are ours. The event names and property
 * keys on the right belong to src/lib/umami.ts and the two halves have to
 * agree letter for letter: a property key that does not exist upstream is not
 * an error, it is an empty list, which reads on the page as "nobody ever did
 * that". docs/analytics.md carries the one table both sides are written from.
 */
const BREAKDOWN_SPECS = {
  funnelSteps: { event: "reservation_step", property: "step" },
  funnelStepsPhone: { event: "reservation_step", property: "step", device: "mobile" },
  funnelStepsTablet: { event: "reservation_step", property: "step", device: "tablet" },
  abandonedAtStep: { event: "reservation_abandoned", property: "last_step" },
  abandonedHow: { event: "reservation_abandoned", property: "exit" },
  failureReasons: { event: "reservation_failed", property: "reason" },
  failureReasonsPhone: {
    event: "reservation_failed",
    property: "reason",
    device: "mobile",
  },
  failurePartySize: { event: "reservation_failed", property: "party_bucket" },
  failureLeadTime: { event: "reservation_failed", property: "lead_bucket" },
  blockedFields: { event: "reservation_blocked", property: "field" },
  availabilityOutcome: { event: "availability_checked", property: "outcome" },
  reserveButtonSource: { event: "reserve_clicked", property: "source" },
} as const satisfies Record<string, BreakdownSpec>;

export type UmamiBreakdown = keyof typeof BREAKDOWN_SPECS;

/** Fixed order, because the answers are put back onto the names by position. */
const BREAKDOWN_NAMES = Object.keys(BREAKDOWN_SPECS) as UmamiBreakdown[];

export type UmamiBreakdowns = Record<UmamiBreakdown, UmamiPropertyValue[] | null>;

/**
 * One flat shape whatever was asked for. A report the caller did not request
 * comes back as zero or as an empty list rather than as a missing key, so the
 * dashboard can render the same component tree for every range. Null is no
 * part of that; it is spoken for, and `breakdowns` below says by what.
 */
export interface UmamiStats {
  configured: true;
  range: UmamiRange;
  visitors: number;
  pageviews: number;
  visits: number;
  /** 0–100, rounded. Share of visits that ended on the page they began. */
  bounceRate: number;
  /** Mean visit length in seconds, rounded. */
  avgSeconds: number;
  series: UmamiSeriesPoint[];
  topPages: UmamiCount[];
  events: UmamiEventCount[];
  /**
   * The event properties, commonest value first, as Umami sorted them.
   *
   * `null` and `[]` mean different things here and the panel prints a
   * different Dutch sentence for each, so nothing may flatten one into the
   * other on the way out. `[]` is Umami answering that nothing of the kind has
   * happened yet, which is the ordinary state of a report on the day it ships.
   * `null` is Umami declining to answer at all — an install too old to have
   * /event-data, or an endpoint that has moved again — and that is a thing for
   * a developer to go and look at rather than a thing to wait out.
   *
   * That is the whole of what null means, which is why a caller who asked for
   * `summary` and not for `funnel` gets `[]` for all twelve rather than null.
   * It read nothing, so nothing refused it, and a null there would hang the
   * developer's sentence on a page that never wanted the breakdowns in the
   * first place. The construction at the bottom of load() keeps that line.
   */
  breakdowns: UmamiBreakdowns;
}

export interface UmamiUnavailable {
  configured: false;
  reason: string;
}

export type UmamiResult = UmamiStats | UmamiUnavailable;

/* ------------------------------------------------------------------ time -- */

const TZ = "Europe/Amsterdam";

const PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/**
 * How far Amsterdam is ahead of UTC at a given instant. Needed because the
 * owners think in local days — "vandaag" ends at midnight here, not at 01:00 or
 * 02:00 — while Umami's API takes epoch milliseconds.
 */
function offsetMsAt(instant: number): number {
  const parts = PARTS.formatToParts(new Date(instant));
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asIfUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asIfUtc - instant;
}

/**
 * The instant an Amsterdam calendar day begins. The offset is sampled at the
 * UTC midnight of that date rather than at the answer itself, which is off by
 * an hour for the two nights a year the clocks change *at* midnight — they
 * change at 02:00 and 03:00 local, so it never actually happens.
 */
function startOfDay(isoDate: string): number {
  const guess = Date.parse(`${isoDate}T00:00:00Z`);
  return guess - offsetMsAt(guess);
}

/** Today's date in Amsterdam as YYYY-MM-DD, shifted by `days`. */
function amsterdamDate(days = 0): string {
  const parts = PARTS.formatToParts(new Date(Date.now() + days * 86_400_000));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * The window for a range, plus the bucket size its graph should use. The
 * end is always "now": a range that ran to the end of today would draw a week
 * with a flat, empty tail on it every afternoon.
 */
function windowFor(range: UmamiRange): {
  startAt: number;
  endAt: number;
  unit: "hour" | "day" | "month";
} {
  const endAt = Date.now();
  switch (range) {
    case "today":
      return { startAt: startOfDay(amsterdamDate()), endAt, unit: "hour" };
    case "7d":
      return { startAt: startOfDay(amsterdamDate(-6)), endAt, unit: "day" };
    case "30d":
      return { startAt: startOfDay(amsterdamDate(-29)), endAt, unit: "day" };
    case "year":
      return {
        startAt: startOfDay(`${amsterdamDate().slice(0, 4)}-01-01`),
        endAt,
        unit: "month",
      };
  }
}

/* --------------------------------------------------------------- upstream -- */

/**
 * Where the API actually lives, given whatever the owners typed in the "Adres
 * van Umami" field.
 *
 * This exists because of one specific trap. Umami Cloud tells you to load the
 * script from cloud.umami.is, so that is the address the owners have in front
 * of them and the one they will paste — but the cloud *API* is a different host
 * and a different prefix, api.umami.is/v1. A self-hosted instance serves both
 * from the same origin under /api. Getting this wrong produces a 404 with no
 * hint as to why, so it is worth the six lines.
 */
function apiBase(host: string): string {
  const clean = host.trim().replace(/\/+$/, "");
  // Someone who already knows the answer has typed the full base; leave it be.
  if (/\/(api|v1)$/i.test(clean)) return clean;

  let hostname = "";
  try {
    hostname = new URL(clean).hostname;
  } catch {
    return `${clean}/api`;
  }
  if (/(^|\.)umami\.is$/i.test(hostname)) return "https://api.umami.is/v1";
  return `${clean}/api`;
}

/* ------------------------------------------------------------ credentials -- */

/**
 * What this module proves itself with. A key is handed over as it stands; a
 * login has to be exchanged for a token first, and that token expires, which
 * is the whole reason the rest of this section exists.
 */
type Credential =
  | { kind: "key"; value: string }
  | { kind: "login"; username: string; password: string };

/**
 * The marker on the one failure that is about signing in rather than about a
 * request. It carries no status code and no response body on purpose: the
 * request that failed had the password in it, and error strings end up in
 * logs.
 */
const LOGIN_REFUSED = "umami-login-refused";

/**
 * The other side of that coin: Umami accepted the login and then turned down
 * the request anyway, which is an account that may not read this website
 * rather than a password that is wrong. Different sentence, different fix.
 */
const LOGIN_UNWELCOME = "umami-login-unwelcome";

/**
 * Which of the three credentials is doing the work, given whatever is in the
 * CMS field.
 *
 * The environment wins over the database, always, and for the same reason it
 * always did: the field is a compromise the owners asked for, because they
 * wanted to be able to paste a key without calling anyone, but a secret in a
 * table is a secret in every backup, every restore and every copy on a
 * developer's laptop. What is new is the middle rung. A username and password
 * in the environment can log in again whenever the token they got last time
 * stops being accepted, so they are worth more than a pasted key that cannot,
 * and they come ahead of it. An explicit UMAMI_API_KEY still beats both: it is
 * what Umami Cloud requires, it costs no round trip, and somebody who set it
 * meant it.
 */
function credentialFrom(fieldValue: string | null | undefined): Credential | null {
  const envKey = (process.env.UMAMI_API_KEY || "").trim();
  if (envKey) return { kind: "key", value: envKey };

  const username = (process.env.UMAMI_USERNAME || "").trim();
  // The password is taken exactly as set. Trimming it would quietly turn a
  // password that legitimately ends in a space into one that does not, and the
  // resulting failure would look like a wrong password rather than our doing.
  const password = process.env.UMAMI_PASSWORD || "";
  if (username && password) return { kind: "login", username, password };

  const stored = (fieldValue || "").trim();
  if (stored) return { kind: "key", value: stored };

  return null;
}

/**
 * The token from the last successful login, for as long as this process lives.
 * No expiry is stored alongside it on purpose: Umami does not say how long it
 * is good for, and a guess would mean either logging in more often than needed
 * or trusting a token past its end. A rejected request is the only honest
 * signal, and `load` below knows how to read one.
 */
let session: { key: string; token: string } | null = null;

/**
 * A login already on its way. One load of the panel is sixteen requests and
 * the owners leave tabs open, so a token that expired overnight is noticed by
 * a dozen of them within the same second. Whoever arrives while a login is in
 * flight waits for its answer instead of starting another one.
 */
let pendingLogin: { key: string; promise: Promise<string> } | null = null;

/** Which instance and which account a stored token belongs to. */
function sessionKey(api: string, username: string): string {
  return `${api}\n${username}`;
}

/**
 * A usable token, from the cache whenever there is one. `refresh` is for the
 * single case where the cache is known to be wrong: Umami has just turned down
 * the token we were holding, so dropping it and asking for another is the only
 * way forward.
 */
async function tokenFor(
  api: string,
  username: string,
  password: string,
  refresh = false,
): Promise<string> {
  const key = sessionKey(api, username);
  if (session?.key === key) {
    if (!refresh) return session.token;
    session = null;
  }
  // A login already running was started no earlier than ours would have been,
  // so its token is as fresh as anything we could ask for, refresh or not.
  if (pendingLogin?.key === key) return pendingLogin.promise;

  const promise = (async () => {
    const res = await fetch(`${api}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ username, password }),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(LOGIN_REFUSED);
    const body = (await res.json().catch(() => null)) as { token?: unknown } | null;
    const token = typeof body?.token === "string" ? body.token.trim() : "";
    // An answer with no token in it is something other than an Umami login,
    // but from here it is indistinguishable from being turned away, and the
    // sentence the owners get is the same either way.
    if (!token) throw new Error(LOGIN_REFUSED);
    session = { key, token };
    return token;
  })();

  pendingLogin = { key, promise };
  // Cleared on either outcome, and only while this is still the login in
  // flight, so one failed attempt does not pin every later caller to it.
  const settle = () => {
    if (pendingLogin?.promise === promise) pendingLogin = null;
  };
  promise.then(settle, settle);

  return promise;
}

/** A token or key Umami has turned down, as opposed to any other failure. */
function isUnauthorized(error: unknown): boolean {
  const message = error instanceof Error ? error.message : "";
  return message.includes("401") || message.includes("403");
}

/**
 * Both headers, every time, because the answer has moved.
 *
 * This used to guess: a JWT (three base64url segments) went to `Authorization`
 * as a self-hosted login token, and anything else to `x-umami-api-key` as a
 * cloud key. The first half is still right. The second is not: Umami Cloud now
 * documents its own API keys as `Authorization: Bearer <api-key>` too, so the
 * guess sent a valid key in a header nothing reads and the panel reported that
 * the figures were unavailable, which is the least helpful way to be wrong.
 *
 * Sending both costs one header and removes the guess. An API that does not
 * recognise `x-umami-api-key` ignores it; older cloud instances that want it
 * get it. Nothing here has to know which flavour it is talking to.
 */
function authHeaders(key: string): Record<string, string> {
  return { Authorization: `Bearer ${key}`, "x-umami-api-key": key };
}

async function getJson(url: string, key: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Accept: "application/json", ...authHeaders(key) },
    // These figures are a minute stale by design; Next's own cache would make
    // that indefinite, and the module cache below is what keeps a reload from
    // costing sixteen upstream requests.
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`umami ${res.status}`);
  return res.json();
}

/** Umami answers with `{ value, prev }` objects; only the value interests us. */
function value(source: unknown, key: string): number {
  const field = (source as Record<string, unknown> | null)?.[key];
  const raw =
    field && typeof field === "object"
      ? (field as { value?: unknown }).value
      : field;
  return typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
}

/** The `[{ x, y }]` lists the metrics and pageviews endpoints hand back. */
function points(source: unknown): { x: string; y: number }[] {
  if (!Array.isArray(source)) return [];
  return source
    .filter((row): row is { x: unknown; y: unknown } => !!row && typeof row === "object")
    .map((row) => ({
      x: typeof row.x === "string" ? row.x : "",
      y: typeof row.y === "number" && Number.isFinite(row.y) ? row.y : 0,
    }))
    .filter((row) => row.x !== "");
}

/**
 * The `[{ value, total }]` lists /event-data/values hands back.
 *
 * `total` is a `count(*)` out of Postgres, which is a bigint, and whether that
 * survives the trip as a JSON number or as a JSON string is a property of
 * whichever serialiser the running Umami happens to use. Both are read here
 * rather than picking one and finding out in production which it was.
 *
 * A value of "" is dropped for the same reason the sibling above drops an
 * empty label: it is a row nothing can be said about, and printing a blank
 * line beside a count invites the owners to wonder what they did.
 */
function propertyValues(source: unknown): UmamiPropertyValue[] {
  if (!Array.isArray(source)) return [];
  return source
    .filter(
      (row): row is { value: unknown; total: unknown } =>
        !!row && typeof row === "object",
    )
    .map((row) => {
      const count = Number(row.total);
      return {
        value: typeof row.value === "string" ? row.value : String(row.value ?? ""),
        count: Number.isFinite(count) ? count : 0,
      };
    })
    .filter((row) => row.value !== "");
}

/* ------------------------------------------------------------------ cache -- */

const cache = new Map<string, { at: number; promise: Promise<UmamiResult> }>();

function cached(key: string, load: () => Promise<UmamiResult>): Promise<UmamiResult> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.promise;

  const promise = load()
    .then((result) => {
      // A refusal is usually transient — Umami restarting, a network blip — and
      // holding onto it would leave the panel apologising for a full minute
      // after the problem is gone. Successes are what the cache is for.
      if (!result.configured) cache.delete(key);
      return result;
    })
    .catch((error: unknown) => {
      cache.delete(key);
      throw error;
    });

  cache.set(key, { at: Date.now(), promise });

  // The key set is small and bounded by the range/report matrix, but a settings
  // change mints new keys, so drop whatever has gone stale while we are here.
  if (cache.size > 40) {
    const now = Date.now();
    for (const [k, entry] of cache) {
      if (now - entry.at >= CACHE_TTL_MS) cache.delete(k);
    }
  }

  return promise;
}

/* ----------------------------------------------------------------- public -- */

/**
 * Everything the dashboard needs for one range, or a Dutch sentence explaining
 * why there is nothing to show.
 */
export async function getUmamiStats(
  range: UmamiRange,
  report: UmamiReport = "all",
): Promise<UmamiResult> {
  let settings: SiteSettingsData;
  try {
    settings = await getSiteSettings();
  } catch {
    return {
      configured: false,
      reason: "De instellingen konden niet worden gelezen. Probeer het later opnieuw.",
    };
  }

  const host = (settings.umamiHostUrl || "").trim();
  const websiteId = (settings.umamiWebsiteId || "").trim();
  const credential = credentialFrom(settings.umamiApiKey);

  if (!websiteId) {
    return {
      configured: false,
      reason:
        "Er is nog geen Website-ID ingevuld bij Instellingen → Statistieken, "
        + "dus er zijn nog geen cijfers om te tonen.",
    };
  }
  if (!host) {
    return {
      configured: false,
      reason:
        "Vul bij Instellingen → Statistieken het adres van Umami in "
        + "(bijvoorbeeld https://cloud.umami.is) om de cijfers hier te tonen.",
    };
  }
  if (!credential) {
    return {
      configured: false,
      reason:
        "Er zijn nog geen inloggegevens voor Umami ingesteld. Zonder die "
        + "gegevens mag deze site de cijfers niet bij Umami opvragen.",
    };
  }

  return cached(`${host}|${websiteId}|${range}|${report}`, () =>
    load(host, websiteId, credential, range, report),
  );
}

async function load(
  host: string,
  websiteId: string,
  credential: Credential,
  range: UmamiRange,
  report: UmamiReport,
): Promise<UmamiResult> {
  const { startAt, endAt, unit } = windowFor(range);
  const api = apiBase(host);
  const base = `${api}/websites/${encodeURIComponent(websiteId)}`;
  const period = `startAt=${startAt}&endAt=${endAt}`;

  const wants = (name: UmamiReport) => report === "all" || report === name;

  /**
   * The totals are the report. Everything else is a garnish on it.
   *
   * The four this started as used to be one `Promise.all`, which made them
   * all-or-nothing: any one of them failing threw, and the panel said Umami was
   * unreachable while Umami sat there perfectly reachable. That is exactly what
   * happened. `type=url` on the metrics endpoint became `type=path` in a later
   * Umami, so a request for the top pages started answering 400 and took the
   * visitor count, the graph and the events down with it, none of which had
   * anything wrong with them.
   *
   * So only `stats` is allowed to fail the batch, because without it there is
   * genuinely nothing to show. Every other request in here — the graph, the top
   * pages, the event totals and the twelve property breakdowns below — resolves
   * to null on its own account and the panel simply leaves that block empty.
   * Umami's API has moved once and will move again, and when it does it should
   * cost one block rather than the page.
   *
   * The one thing that must NOT be swallowed here is a 401, or the retry
   * below never fires and an expired token quietly becomes a page of empty
   * blocks. `optional` re-throws those and eats everything else.
   */
  const optional = (promise: Promise<unknown>) =>
    promise.catch((error) => {
      if (isUnauthorized(error)) throw error;
      return null;
    });

  /**
   * Twelve more requests, in the fixed order of BREAKDOWN_NAMES so the answers
   * can be put back onto their names by position further down. They are only
   * composed when they are wanted: a caller asking for `summary` is asking for
   * one number and should not pay for a dozen property queries to get it.
   */
  const breakdownUrls = wants("funnel")
    ? BREAKDOWN_NAMES.map((name) => {
        const spec: BreakdownSpec = BREAKDOWN_SPECS[name];
        return (
          `${base}/event-data/values?${period}`
          + `&eventName=${encodeURIComponent(spec.event)}`
          + `&propertyName=${encodeURIComponent(spec.property)}`
          + (spec.device ? `&device=${spec.device}` : "")
        );
      })
    : [];

  const batch = (key: string) =>
    Promise.all([
      getJson(`${base}/stats?${period}`, key),
      wants("series")
        ? optional(
            getJson(
              `${base}/pageviews?${period}&unit=${unit}&timezone=${encodeURIComponent(TZ)}`,
              key,
            ),
          )
        : null,
      // `type=path`, not `type=url`. Verified against a running Umami: url is
      // refused with a 400 and path returns the same `[{ x, y }]` shape the
      // parser below already reads.
      wants("pages")
        ? optional(getJson(`${base}/metrics?${period}&type=path&limit=10`, key))
        : null,
      wants("events")
        ? optional(getJson(`${base}/metrics?${period}&type=event&limit=40`, key))
        : null,
      ...breakdownUrls.map((url) => optional(getJson(url, key))),
    ]);

  try {
    const [stats, series, pages, events, ...breakdownAnswers] = await (async () => {
      if (credential.kind === "key") return batch(credential.value);

      const { username, password } = credential;
      try {
        return await batch(await tokenFor(api, username, password));
      } catch (error) {
        // The cached token has aged out. One more go with a fresh one, and if
        // that is refused too the credentials themselves are the problem and
        // trying again would only be a slower way to say so.
        if (!isUnauthorized(error)) throw error;
        try {
          return await batch(await tokenFor(api, username, password, true));
        } catch (again) {
          // Signed in with a token minted seconds ago and still refused, so
          // the credentials are not the thing to look at; the account is.
          if (isUnauthorized(again)) throw new Error(LOGIN_UNWELCOME);
          throw again;
        }
      }
    })();

    const visits = value(stats, "visits");
    const bounces = value(stats, "bounces");
    const totalTime = value(stats, "totaltime");

    // Sessions and pageviews arrive as two separate lists over the same
    // buckets. They are zipped by position rather than merged by date because
    // Umami emits both from the same query and they are already aligned;
    // matching on the label would only invent a way for them to disagree.
    const seriesPageviews = points((series as { pageviews?: unknown } | null)?.pageviews);
    const seriesSessions = points((series as { sessions?: unknown } | null)?.sessions);

    return {
      configured: true,
      range,
      visitors: value(stats, "visitors"),
      pageviews: value(stats, "pageviews"),
      visits,
      bounceRate: visits > 0 ? Math.round((bounces / visits) * 100) : 0,
      avgSeconds: visits > 0 ? Math.round(totalTime / visits) : 0,
      series: wants("series")
        ? seriesPageviews.map((point, i) => ({
            date: point.x,
            pageviews: point.y,
            visitors: seriesSessions[i]?.y ?? 0,
          }))
        : [],
      topPages: wants("pages")
        ? points(pages).map((point) => ({ url: point.x, count: point.y }))
        : [],
      events: wants("events")
        ? points(events).map((point) => ({ name: point.x, count: point.y }))
        : [],
      // A caller who did not ask for the funnel gets empty lists, never nulls.
      // Null is reserved for Umami turning a request down, as the interface
      // above promises, and there were no requests here to turn down.
      breakdowns: Object.fromEntries(
        BREAKDOWN_NAMES.map((name, i) => {
          if (!wants("funnel")) return [name, []];
          const answer = breakdownAnswers[i];
          return [name, answer == null ? null : propertyValues(answer)];
        }),
      ) as UmamiBreakdowns,
    };
  } catch (error) {
    // Which of these the owners get is the whole point of the exercise. Every
    // one of them is a different thing to go and do, and a panel that said
    // only "geen cijfers" would leave them with no idea which.
    const message = error instanceof Error ? error.message : "";
    if (message.includes(LOGIN_REFUSED)) {
      return {
        configured: false,
        reason:
          "Umami laat deze site niet binnen: de gebruikersnaam of het "
          + "wachtwoord waarmee de site zich aanmeldt, klopt niet meer. Dat "
          + "staat op de server ingesteld, dus vraag dit even na.",
      };
    }
    if (message.includes(LOGIN_UNWELCOME)) {
      return {
        configured: false,
        reason:
          "Umami laat deze site wel binnen, maar geeft geen toegang tot deze "
          + "website. Controleer in Umami of het account waarmee de site zich "
          + "aanmeldt bij deze website mag.",
      };
    }
    if (isUnauthorized(error)) {
      return {
        configured: false,
        reason:
          "Umami weigert de API-sleutel. Maak in Umami een nieuwe sleutel aan "
          + "en vul die opnieuw in.",
      };
    }
    if (message.includes("404")) {
      return {
        configured: false,
        reason:
          "Umami kent deze Website-ID niet. Controleer het adres en het ID bij "
          + "Instellingen → Statistieken.",
      };
    }
    return {
      configured: false,
      reason:
        "Umami is nu niet bereikbaar. De cijfers zelf gaan niet verloren; "
        + "probeer het over een paar minuten opnieuw.",
    };
  }
}
