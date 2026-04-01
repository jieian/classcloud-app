/**
 * In-process sliding-window rate limiter.
 *
 * Trade-offs:
 *   + Zero external dependencies, works on any runtime.
 *   - State is per-serverless-instance (not shared across Vercel instances).
 *     For this school app's traffic level this is sufficient protection; if
 *     you scale to multiple instances, swap the Map for an Upstash Redis
 *     counter (upstash/ratelimit) without changing the call-site API.
 *
 * Usage:
 *   const limiter = createRateLimiter({ maxRequests: 5, windowMs: 60_000 })
 *   const result = limiter.check(ip)
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
  const store = new Map<string, WindowEntry>();

  // Periodically purge stale keys to prevent unbounded memory growth.
  // setInterval is fine here; Node.js will GC the closure once the module
  // is unloaded (serverless cold-start lifecycle).
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

  function check(identifier: string): RateLimitResult {
    const now = Date.now();
    const cutoff = now - windowMs;

    const entry = store.get(identifier) ?? { timestamps: [] };
    // Drop timestamps outside the window (sliding window)
    entry.timestamps = entry.timestamps.filter((t) => t >= cutoff);
    entry.timestamps.push(now);
    store.set(identifier, entry);

    const count = entry.timestamps.length;
    const allowed = count <= maxRequests;
    const remaining = Math.max(0, maxRequests - count);
    const resetAt = entry.timestamps[0] + windowMs;

    return { allowed, remaining, resetAt };
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
