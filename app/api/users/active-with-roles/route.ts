import { createServerSupabaseClient } from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";
import { redis } from "@/lib/redis";

const CACHE_KEY = "users:active";
const CACHE_TTL = 300;

const _GET = async function () {
  const supabase = await createServerSupabaseClient();

  const [{ data: { user } }, cached] = await Promise.all([
    supabase.auth.getUser(),
    redis.get(CACHE_KEY),
  ]);

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (cached) return Response.json({ data: cached });

  const { data, error } = await adminClient.rpc("get_active_users_with_roles");
  if (error) {
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }

  await redis.set(CACHE_KEY, data, { ex: CACHE_TTL });
  return Response.json({ data });
};

export const GET = withErrorHandler(_GET);
