import { Redis } from "@upstash/redis";

/**
 * Upstash Redis client — singleton per serverless instance.
 * Used for permissions version tracking and rate limiting.
 *
 * Required env vars:
 *   UPSTASH_REDIS_REST_URL
 *   UPSTASH_REDIS_REST_TOKEN
 */
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

/**
 * Read-through Redis cache helper. Checks the cache first; on a miss, calls
 * `fetcher`, writes the result back with the given TTL in seconds, then returns it.
 *
 * @example
 * const data = await withRedisCache("my-key", 600, () => db.query());
 */
export async function withRedisCache<T>(
  key: string,
  ttl: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const cached = await redis.get<T>(key);
  if (cached !== null) return cached;
  const data = await fetcher();
  await redis.set(key, data, { ex: ttl });
  return data;
}
