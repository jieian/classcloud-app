import { Ratelimit } from "@upstash/ratelimit";
import { redis } from "@/lib/redis";

/**
 * Sliding-window rate limiter backed by Upstash Redis.
 *
 * Primary:  Upstash Redis — shared across all serverless instances, so limits
 *           are enforced correctly even under horizontal scaling.
 * Fallback: In-process Map — used automatically when Redis is unavailable
 *           (network error, cold-start before Redis is reachable, etc.).
 *           Per-instance only, but still provides meaningful protection.
 *
 * Usage:
 *   const limiter = createRateLimiter({ maxRequests: 5, windowMs: 60_000 })
 *   const result = await limiter.check(ip)
 *   if (!result.allowed) {
 *     return Response.json({ error: "Too many requests." }, { status: 429 })
 *   }
 */

interface RateLimiterOptions {
  /** Maximum requests allowed within the window. */
  maxRequests: number;
  /** Sliding window size in milliseconds. */
  windowMs: number;
}

interface RateLimitResult {
  allowed: boolean;
  /** Remaining requests in the current window. */
  remaining: number;
  /** Epoch ms when the oldest request in the window expires. */
  resetAt: number;
}

interface WindowEntry {
  timestamps: number[];
}

export function createRateLimiter(options: RateLimiterOptions) {
  const { maxRequests, windowMs } = options;
  const windowSeconds = Math.ceil(windowMs / 1000);

  // ── Primary: Redis-backed (shared across instances) ────────────────────────
  const upstashLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(maxRequests, `${windowSeconds} s`),
  });

  // ── Fallback: In-process sliding window ────────────────────────────────────
  const store = new Map<string, WindowEntry>();

  // Periodically purge stale keys to prevent unbounded memory growth.
  const cleanup = setInterval(
    () => {
      const cutoff = Date.now() - windowMs;
      for (const [key, entry] of store.entries()) {
        if (entry.timestamps.every((t) => t < cutoff)) {
          store.delete(key);
        }
      }
    },
    Math.max(windowMs, 60_000),
  );
  // Prevent the interval from keeping a Node.js process alive in tests.
  if (cleanup.unref) cleanup.unref();

  function inProcessCheck(identifier: string): RateLimitResult {
    const now = Date.now();
    const cutoff = now - windowMs;

    const entry = store.get(identifier) ?? { timestamps: [] };
    entry.timestamps = entry.timestamps.filter((t) => t >= cutoff);
    entry.timestamps.push(now);
    store.set(identifier, entry);

    const count = entry.timestamps.length;
    const allowed = count <= maxRequests;
    const remaining = Math.max(0, maxRequests - count);
    const resetAt = entry.timestamps[0] + windowMs;

    return { allowed, remaining, resetAt };
  }

  // ── check — try Redis, fall back to in-process ─────────────────────────────
  async function check(identifier: string): Promise<RateLimitResult> {
    try {
      const { success, remaining, reset } = await upstashLimiter.limit(identifier);
      return { allowed: success, remaining, resetAt: reset };
    } catch {
      // Redis unavailable — degrade gracefully to per-instance in-process check.
      return inProcessCheck(identifier);
    }
  }

  return { check };
}

/**
 * Extracts the best available client IP from a Next.js request.
 * Falls back to "unknown" when no IP header is present (e.g. local dev).
 */
export function getClientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}
