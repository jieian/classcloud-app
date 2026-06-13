import { getServerUser, getPermissionsFromUser } from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { getPendingTransferBadge } from "@/lib/services/badgeCache";

// ─── GET /api/classes/transfer-requests/count ─────────────────────────────────
// Lightweight NavBar badge endpoint: school-wide count of PENDING transfer
// requests the current user must review. Served from the shared global Redis
// badge cache (audit #4).

const _GET = async function () {
  const user = await getServerUser();
  if (!user) return Response.json({ count: 0 });

  const permissions = getPermissionsFromUser(user);
  if (!permissions.includes("students.full_access")) return Response.json({ count: 0 });

  try {
    const count = await getPendingTransferBadge();
    return Response.json({ count });
  } catch {
    return Response.json({ count: 0 });
  }
};

export const GET = withErrorHandler(_GET);
