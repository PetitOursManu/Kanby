import { NextRequest, NextResponse } from "next/server";

/**
 * Lightweight in-memory rate limiter keyed by IP.
 *
 * Suitable for a single-instance deployment (the default `docker compose up`
 * setup). For multi-instance, consider an external store (Redis, Upstash).
 *
 * Uses a fixed-window strategy: each window resets after `windowSeconds`,
 * and up to `max` requests are allowed per IP within a window.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// Periodically evict expired buckets to avoid unbounded memory growth.
// Checked lazily on every hit; a full sweep runs every ~5 minutes.
let lastSweep = Date.now();
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

function sweep(now: number) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key);
  }
}

function clientIp(req: NextRequest): string {
  // Trust the first hop from common proxies. In the default Docker setup
  // there is no reverse proxy, so `req.ip` (Next's best guess) is used.
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.ip ?? "unknown";
}

export interface RateLimitResult {
  ok: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

export function rateLimit(
  req: NextRequest,
  namespace: string,
  max: number,
  windowSeconds: number,
): RateLimitResult {
  const now = Date.now();
  sweep(now);
  const key = `${namespace}:${clientIp(req)}`;
  const resetAt = now + windowSeconds * 1000;

  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt });
    return { ok: true, limit: max, remaining: max - 1, resetAt };
  }

  b.count += 1;
  if (b.count > max) {
    return { ok: false, limit: max, remaining: 0, resetAt: b.resetAt };
  }
  return { ok: true, limit: max, remaining: max - b.count, resetAt: b.resetAt };
}

/**
 * Convenience wrapper that returns a 429 response when the limit is exceeded,
 * otherwise null. The caller continues normally on null.
 */
export function rateLimitOr429(
  req: NextRequest,
  namespace: string,
  max: number,
  windowSeconds: number,
): NextResponse | null {
  const r = rateLimit(req, namespace, max, windowSeconds);
  if (r.ok) return null;
  const retryAfter = Math.max(1, Math.ceil((r.resetAt - Date.now()) / 1000));
  return NextResponse.json(
    { error: "Trop de tentatives, réessayez dans quelques minutes" },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfter) },
    },
  );
}