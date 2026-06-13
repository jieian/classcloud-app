import { getServerUser } from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { getNotificationBadge } from "@/lib/services/badgeCache";

// ─── GET /api/notifications/count ─────────────────────────────────────────────
// Unread notification count for the current user. Served from the shared Redis
// badge cache (audit #4) so it doesn't re-query on every poll.

const _GET = async function () {
  const user = await getServerUser();
  if (!user) return Response.json({ count: 0 });

  try {
    const { notifications } = await getNotificationBadge(user.id);
    return Response.json({ count: notifications });
  } catch {
    return Response.json({ count: 0 });
  }
};

export const GET = withErrorHandler(_GET);
