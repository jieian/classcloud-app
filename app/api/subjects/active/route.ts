import { getServerUser, getPermissionsFromUser } from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { getActiveSubjectsWithGradeLevelsCached } from "@/app/(app)/exam/_lib/examRefDataServerService";

// ─── GET /api/subjects/active ─────────────────────────────────────────────────
// Subjects of the active curriculum (with curriculum_subject_id + grade level)
// for the exam create flow. Served from the Next.js data cache (tags: subjects,
// active-context) — replaces the browser-direct read in subjectService.

const _GET = async function () {
  const user = await getServerUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  if (!getPermissionsFromUser(user).includes("exams.limited_access"))
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const subjects = await getActiveSubjectsWithGradeLevelsCached();
  return Response.json({ subjects });
};

export const GET = withErrorHandler(_GET);
