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
