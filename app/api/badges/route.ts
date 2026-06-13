import { getServerUser, getPermissionsFromUser } from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { getNotificationBadge, getPendingTransferBadge } from "@/lib/services/badgeCache";

// ─── GET /api/badges ──────────────────────────────────────────────────────────
// Combined NavBar badge counts, polled per navigation. Served from Redis
// (audit #4): per-user notification counts + a shared global pending-transfer
// count, both short-TTL cached with precise invalidation on the mutating paths.
// Permission flags gate the privileged counts server-side; the per-user notif
// cache is permission-independent (signup count is just zeroed when not allowed).

const ZERO_COUNTS = { notifications: 0, transferRequests: 0, signupNotifications: 0 };

const _GET = async function () {
  const user = await getServerUser();
  if (!user) return Response.json(ZERO_COUNTS);

  const permissions = getPermissionsFromUser(user);
  const canReview = permissions.includes("students.full_access");
  const canManage = permissions.includes("users.full_access");

  try {
    const [notif, transferRequests] = await Promise.all([
      getNotificationBadge(user.id),
      canReview ? getPendingTransferBadge() : Promise.resolve(0),
    ]);

    return Response.json({
      notifications: notif.notifications,
      transferRequests,
      signupNotifications: canManage ? notif.signupNotifications : 0,
    });
  } catch (err) {
    console.error("[api/badges] error:", err);
    return Response.json(ZERO_COUNTS);
  }
};

export const GET = withErrorHandler(_GET);
