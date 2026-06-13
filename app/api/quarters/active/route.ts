import { getServerUser, getPermissionsFromUser } from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { getActiveQuartersCached } from "@/app/(app)/exam/_lib/examRefDataServerService";

// ─── GET /api/quarters/active ─────────────────────────────────────────────────
// Quarters of the active school year for the exam create flow. Served from the
// Next.js data cache (tags: school-years, active-context — both revalidated by
// toggle-quarter and schoolYear mutations) — replaces the browser-direct read
// in quarterService.

const _GET = async function () {
  const user = await getServerUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  if (!getPermissionsFromUser(user).includes("exams.limited_access"))
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const quarters = await getActiveQuartersCached();
  return Response.json({ quarters });
};

export const GET = withErrorHandler(_GET);
