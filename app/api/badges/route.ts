import { getServerUser, getPermissionsFromUser } from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient as admin } from "@/lib/supabase/admin";

// ─── GET /api/badges ──────────────────────────────────────────────────────────
// Combined NavBar badge counts in ONE request (replaces three separate fetches:
// notifications/count, classes/transfer-requests/count, users/signup-notifications/count).
// Counts run in parallel; each is permission-gated and defaults to 0.

const _GET = async function () {
  const user = await getServerUser();
  if (!user) {
    return Response.json({ notifications: 0, transferRequests: 0, signupNotifications: 0 });
  }

  const permissions = getPermissionsFromUser(user);
  const canReviewTransfers = permissions.includes("students.full_access");
  const canManageUsers = permissions.includes("users.full_access");

  const [notifRes, transferRes, signupRes] = await Promise.all([
    admin
      .from("notifications")
      .select("notification_id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("read_at", null),
    canReviewTransfers
      ? admin
          .from("section_transfer_requests")
          .select("request_id", { count: "exact", head: true })
          .eq("status", "PENDING")
      : Promise.resolve({ count: 0 as number | null }),
    canManageUsers
      ? admin
          .from("notifications")
          .select("notification_id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("type", "new_signup")
          .is("read_at", null)
      : Promise.resolve({ count: 0 as number | null }),
  ]);

  return Response.json({
    notifications: notifRes.count ?? 0,
    transferRequests: transferRes.count ?? 0,
    signupNotifications: signupRes.count ?? 0,
  });
};

export const GET = withErrorHandler(_GET);
