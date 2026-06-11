import { getServerUser, getPermissionsFromUser } from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient as admin } from "@/lib/supabase/admin";

// ─── GET /api/badges ──────────────────────────────────────────────────────────
// Combined NavBar badge counts in ONE request (replaces three separate fetches:
// notifications/count, classes/transfer-requests/count, users/signup-notifications/count).
// A single get_badge_counts RPC returns all three counts in one DB round-trip;
// the two permission flags gate the privileged counts server-side.

type BadgeCounts = {
  notifications?: number;
  transferRequests?: number;
  signupNotifications?: number;
};

const ZERO_COUNTS = { notifications: 0, transferRequests: 0, signupNotifications: 0 };

const _GET = async function () {
  const user = await getServerUser();
  if (!user) return Response.json(ZERO_COUNTS);

  const permissions = getPermissionsFromUser(user);

  const { data, error } = await admin.rpc("get_badge_counts", {
    p_user_id: user.id,
    p_can_review_transfers: permissions.includes("students.full_access"),
    p_can_manage_users: permissions.includes("users.full_access"),
  });

  if (error) {
    console.error("[api/badges] rpc error:", error.message);
    return Response.json(ZERO_COUNTS);
  }

  const counts = (data ?? {}) as BadgeCounts;
  return Response.json({
    notifications: counts.notifications ?? 0,
    transferRequests: counts.transferRequests ?? 0,
    signupNotifications: counts.signupNotifications ?? 0,
  });
};

export const GET = withErrorHandler(_GET);
