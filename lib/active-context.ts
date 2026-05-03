import { adminClient } from "@/lib/supabase/admin";
import { redis } from "@/lib/redis";

const ACTIVE_CONTEXT_KEY = "sys:active_context";

export interface ActiveContext {
  sy_id: number | null;
  quarter_id: number | null;
}

const CACHE_TTL_SECONDS = 3600; // 1h backstop — primary invalidation is via API routes + pg_net

/**
 * Returns the active school year and active quarter IDs.
 * Cached in Redis indefinitely in practice; the 1h TTL is a last-resort
 * self-healing backstop in case all invalidation paths miss.
 */
export async function getActiveContext(): Promise<ActiveContext> {
  const cached = await redis.get<ActiveContext>(ACTIVE_CONTEXT_KEY);
  if (cached) return cached;

  const { data: sy } = await adminClient
    .from("school_years")
    .select("sy_id")
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (!sy) {
    const context: ActiveContext = { sy_id: null, quarter_id: null };
    await redis.set(ACTIVE_CONTEXT_KEY, context, { ex: CACHE_TTL_SECONDS });
    return context;
  }

  const { data: quarter } = await adminClient
    .from("quarters")
    .select("quarter_id")
    .eq("sy_id", sy.sy_id)
    .eq("is_active", true)
    .maybeSingle();

  const context: ActiveContext = {
    sy_id: sy.sy_id,
    quarter_id: quarter?.quarter_id ?? null,
  };
  await redis.set(ACTIVE_CONTEXT_KEY, context, { ex: CACHE_TTL_SECONDS });
  return context;
}

export async function invalidateActiveContext(): Promise<void> {
  await redis.del(ACTIVE_CONTEXT_KEY);
}
