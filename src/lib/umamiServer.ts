import { getSiteSettings } from "@/lib/payload";

/**
 * Reading the figures back out of Umami, for the panel in the Payload admin.
 *
 * There are two entirely separate connections in play and they are easy to
 * confuse. The script in src/components/Analytics.tsx runs in the visitor's
 * browser and pushes visits *to* Umami. This module pulls them *back*, from a
 * Node process, using an API key. Either half can be working while the other is
 * not, and the reasons they fail are different, which is why every refusal in
 * here carries a sentence saying which half is missing.
 *
 * Those sentences are in Dutch on purpose. The only thing that renders them is
 * the dashboard in the admin, and the admin is written for two restaurant
 * owners who do not read English error messages and should not have to.
 *
 * Nothing in here ever throws. The caller is a panel that polls every minute in
 * a page the owners keep open all day; an unreachable Umami, an expired key or
 * a field nobody filled in must all come back as "here is why there is no
 * graph", never as a stack trace and never as a red box. `configured: false`
 * plus a reason is the whole error protocol.
 *
 * On authentication: Umami Cloud wants an `x-umami-api-key` header, while a
 * self-hosted instance has no API keys at all and instead expects a bearer
 * token obtained from `POST {host}/api/auth/login` with the admin username and
 * password. We are not going to put a login on this path — storing the owners'
 * Umami password so a server can re-authenticate itself is a worse trade than
 * the API key already is — so a self-hosted setup works by fetching that token
 * once, by hand, and pasting it in as the key. Both shapes are supported by
 * looking at the value: a JWT (three dot-separated segments) is sent as a
 * bearer token, anything else as a cloud API key. docs/analytics.md walks a
 * developer through it.
 */

const TIMEOUT_MS = 8_000;

/**
 * The admin polls, so the same minute of the same range must not become one
 * upstream request per poll per open tab. Sixty seconds is about the finest
 * granularity the figures are meaningful at anyway.
 */
const CACHE_TTL_MS = 60_000;

/** The only date windows a caller may ask for. */
export const RANGES = ["today", "7d", "30d", "year"] as const;
export type UmamiRange = (typeof RANGES)[number];

/**
 * The only reports a caller may ask for. This is the other half of not being a
 * proxy: the endpoint composes URLs from a closed set of names, so no caller
 * can point our credentials at a path of their choosing.
 */
export const REPORTS = ["all", "summary", "series", "pages", "events"] as const;
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
 * One flat shape whatever was asked for. A report the caller did not request
 * comes back as zero or an empty list rather than as a missing key, so the
 * dashboard can render the same component tree for every range.
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

/**
 * A JWT has three base64url segments separated by dots and nothing else. That
 * is a good enough tell to route a self-hosted login token to the Authorization
 * header and a cloud key to Umami's own header, without asking the owners to
 * answer a question they would have to look up.
 */
function authHeaders(key: string): Record<string, string> {
  return /^[\w-]+\.[\w-]+\.[\w-]+$/.test(key)
    ? { Authorization: `Bearer ${key}` }
    : { "x-umami-api-key": key };
}

async function getJson(url: string, key: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Accept: "application/json", ...authHeaders(key) },
    // These figures are a minute stale by design; Next's own cache would make
    // that indefinite and the module cache below already covers the polling.
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
  let host = "";
  let websiteId = "";
  let key = "";

  try {
    const settings = await getSiteSettings();
    host = (settings.umamiHostUrl || "").trim();
    websiteId = (settings.umamiWebsiteId || "").trim();
    // The environment wins over the database, always. Keeping the key in the
    // CMS is a compromise the owners asked for — they wanted to be able to
    // paste it themselves without a developer — but a secret in a table that
    // gets dumped, restored and copied to a laptop is still a secret in the
    // wrong place. Anyone running this properly sets UMAMI_API_KEY, and that
    // setting must not be silently overridable from a text field in the admin.
    key = (process.env.UMAMI_API_KEY || settings.umamiApiKey || "").trim();
  } catch {
    return {
      configured: false,
      reason: "De instellingen konden niet worden gelezen. Probeer het later opnieuw.",
    };
  }

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
  if (!key) {
    return {
      configured: false,
      reason:
        "Er is nog geen API-sleutel ingesteld. Zonder sleutel mag deze site de "
        + "cijfers niet bij Umami opvragen.",
    };
  }

  return cached(`${host}|${websiteId}|${range}|${report}`, () =>
    load(host, websiteId, key, range, report),
  );
}

async function load(
  host: string,
  websiteId: string,
  key: string,
  range: UmamiRange,
  report: UmamiReport,
): Promise<UmamiResult> {
  const { startAt, endAt, unit } = windowFor(range);
  const base = `${apiBase(host)}/websites/${encodeURIComponent(websiteId)}`;
  const period = `startAt=${startAt}&endAt=${endAt}`;

  const wants = (name: UmamiReport) => report === "all" || report === name;

  try {
    // The totals come along with every report: they are one cheap request and
    // the panel puts them above whichever graph is on screen.
    const [stats, series, pages, events] = await Promise.all([
      getJson(`${base}/stats?${period}`, key),
      wants("series")
        ? getJson(
            `${base}/pageviews?${period}&unit=${unit}&timezone=${encodeURIComponent(TZ)}`,
            key,
          )
        : null,
      wants("pages")
        ? getJson(`${base}/metrics?${period}&type=url&limit=10`, key)
        : null,
      wants("events")
        ? getJson(`${base}/metrics?${period}&type=event&limit=20`, key)
        : null,
    ]);

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
    };
  } catch (error) {
    // The upstream status is the one thing worth separating out, because a 401
    // is a key the owners can fix themselves and everything else is not.
    const message = error instanceof Error ? error.message : "";
    if (message.includes("401") || message.includes("403")) {
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
