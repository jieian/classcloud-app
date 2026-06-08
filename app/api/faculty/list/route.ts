import { getServerUser } from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";
import { redis } from "@/lib/redis";

const CACHE_KEY = "faculty:list";
const CACHE_TTL = 600;

const _GET = async function () {
  const [user, cached] = await Promise.all([
    getServerUser(),
    redis.get<{ uid: string }[]>(CACHE_KEY),
  ]);

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (cached) return Response.json({ data: cached });

  const rpcResult = await adminClient.rpc("get_faculty_list");

  if (rpcResult.error) {
    console.error("get_faculty_list error:", rpcResult.error.message);
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }

  const raw = (rpcResult.data ?? []) as { uid: string }[];
  const seen = new Set<string>();
  const data = raw.filter((m) => {
    if (seen.has(m.uid)) return false;
    seen.add(m.uid);
    return true;
  });

  await redis.set(CACHE_KEY, data, { ex: CACHE_TTL });
  return Response.json({ data });
};

export const GET = withErrorHandler(_GET);
