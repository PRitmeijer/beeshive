/**
 * Shared guards for the two publicly writable endpoints.
 *
 * Route Handlers in the App Router have no default body size limit, and
 * `await request.json()` buffers the whole body before any of our checks run,
 * so a handful of large requests is enough to exhaust memory. Payload 3.10
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
 * Per-IP throttle, held in process memory. That is deliberately modest: it
 * resets on deploy and does not span instances, but this site runs as a single
 * container and the alternative needs infrastructure the owners do not have.
 * Put a limit on the reverse proxy too if one is ever added.
 */
const hits = new Map<string, number[]>();

export function rateLimit(
  request: Request,
  bucket: string,
  limit = 5,
  windowMs = 10 * 60 * 1000,
): boolean {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);

  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }

  recent.push(now);
  hits.set(key, recent);

  // Keep the map from growing without bound on a long-running process.
  if (hits.size > 5000) {
    for (const [k, times] of hits) {
      if (times.every((t) => now - t >= windowMs)) hits.delete(k);
    }
  }
  return true;
}

/** Trimmed string with a hard cap, or null when absent or the wrong type. */
export function str(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
