import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";
import { redis } from "@/lib/redis";

const CACHE_KEY = "roles:all";
const CACHE_TTL = 3600;

const _GET = async function () {
  const cached = await redis.get(CACHE_KEY);
  if (cached) return Response.json({ data: cached });

  const { data, error } = await adminClient
    .from("roles")
    .select("role_id, name, is_faculty, is_protected")
    .eq("is_self_registerable", true)
    .order("name");

  if (error) {
    return Response.json({ error: "Failed to load roles." }, { status: 500 });
  }

  const result = data ?? [];
  await redis.set(CACHE_KEY, result, { ex: CACHE_TTL });
  return Response.json({ data: result });
};

export const GET = withErrorHandler(_GET);
