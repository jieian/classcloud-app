import { createServerSupabaseClient } from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";
import { redis } from "@/lib/redis";

/**
 * GET /api/auth/permissions-version
 *
 * Returns the current permissions version for the authenticated user.
 * Clients poll this endpoint and call supabase.auth.refreshSession() when
 * the version increases — ensuring their JWT claims stay up to date after
 * an admin changes their roles or permissions.
 *
 * Primary:  Redis (fast, O(1) — set by syncUserPermissions as Date.now())
 * Fallback: Supabase auth.users.updated_at (ms epoch) when Redis is down
 *           or the key is missing (first login / Redis flush).
 *
 * Both sources return a ms-epoch integer so clients compare them uniformly.
 */
const _GET = async function (_request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Primary: Redis (fast path) ─────────────────────────────────────────────
  try {
    const version = await redis.get<number>(`permissions:version:${user.id}`);
    if (version !== null) {
      return Response.json({ version });
    }
    // Key missing (first login or Redis flushed) — fall through to Supabase
  } catch {
    // Redis unavailable — fall through to Supabase fallback
  }

  // ── Fallback: Supabase auth user updated_at ────────────────────────────────
  // adminClient.auth.admin.updateUserById is called by syncUserPermissions, so
  // updated_at advances whenever permissions change — making it a valid version.
  const {
    data: { user: authUser },
    error,
  } = await adminClient.auth.admin.getUserById(user.id);

  if (error || !authUser) {
    return Response.json({ error: "Unable to check version" }, { status: 500 });
  }

  const version = authUser.updated_at
    ? new Date(authUser.updated_at).getTime()
    : 0;

  return Response.json({ version });
};

export const GET = withErrorHandler(_GET);
