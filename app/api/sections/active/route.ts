import { getServerUser, getPermissionsFromUser } from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { getActiveSectionsCached } from "@/app/(app)/exam/_lib/examRefDataServerService";

// ─── GET /api/sections/active ─────────────────────────────────────────────────
// Active-school-year sections (with grade-level display name) for the exam
// create/copy flow. Served from the Next.js data cache (tags: sections,
// active-context) — replaces the browser-direct read in sectionService.

const _GET = async function () {
  const user = await getServerUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  if (!getPermissionsFromUser(user).includes("exams.limited_access"))
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const sections = await getActiveSectionsCached();
  return Response.json({ sections });
};

export const GET = withErrorHandler(_GET);
