import { getServerUser } from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";
import { redis } from "@/lib/redis";

const CACHE_KEY = "coordinator:groups";
const CACHE_TTL = 600;

const _GET = async function () {
  const [user, cached] = await Promise.all([
    getServerUser(),
    redis.get(CACHE_KEY),
  ]);

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (cached) return Response.json({ data: cached });

  const { data, error } = await adminClient.rpc("get_subject_coordinator_groups");

  if (error) {
    console.error("get_subject_coordinator_groups error:", error.message);
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }

  const result = data ?? [];
  await redis.set(CACHE_KEY, result, { ex: CACHE_TTL });
  return Response.json({ data: result });
};

export const GET = withErrorHandler(_GET);
