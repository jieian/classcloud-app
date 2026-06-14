import { getServerUser, getPermissionsFromUser } from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient as admin } from "@/lib/supabase/admin";

// ─── POST /api/exams/scores/exists ────────────────────────────────────────────
// Body: { assignmentIds: number[] }. Returns { withScores: number[] } — the
// subset of those exam_assignment_ids that have at least one saved score. Drives
// the "already scanned" indicators; replaces attemptService's browser-direct
// read so `scores` can be service-role-only (audit #17 residual).
//
// A limited (non exams.full_access) user only gets results for assignments whose
// section they teach — so the endpoint can't be used to probe arbitrary
// assignment ids. Full access sees all requested.

const _POST = async function (request: Request) {
  const user = await getServerUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const permissions = getPermissionsFromUser(user);
  if (!permissions.includes("exams.limited_access"))
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { assignmentIds?: unknown };
  const assignmentIds = Array.isArray(body.assignmentIds)
    ? body.assignmentIds
        .map((x) => Number(x))
        .filter((n) => Number.isInteger(n) && n > 0)
    : [];

  if (assignmentIds.length === 0) return Response.json({ withScores: [] });

  let allowedIds = assignmentIds;

  // Limited users: keep only assignments in sections they teach.
  if (!permissions.includes("exams.full_access")) {
    const [{ data: rows }, { data: taught }] = await Promise.all([
      admin.from("exam_assignments").select("id, section_id").in("id", assignmentIds),
      admin
        .from("teacher_class_assignments")
        .select("section_id")
        .eq("teacher_id", user.id)
        .is("deleted_at", null),
    ]);
    const taughtSections = new Set(
      ((taught ?? []) as { section_id: number }[]).map((t) => t.section_id),
    );
    allowedIds = ((rows ?? []) as { id: number; section_id: number | null }[])
      .filter((r) => r.section_id != null && taughtSections.has(r.section_id))
      .map((r) => r.id);
  }

  if (allowedIds.length === 0) return Response.json({ withScores: [] });

  const { data, error } = await admin
    .from("scores")
    .select("exam_assignment_id")
    .in("exam_assignment_id", allowedIds);

  if (error)
    return Response.json({ error: "Internal server error." }, { status: 500 });

  const withScores = [
    ...new Set(
      ((data ?? []) as { exam_assignment_id: number }[]).map((s) => s.exam_assignment_id),
    ),
  ];
  return Response.json({ withScores });
};

export const POST = withErrorHandler(_POST);
