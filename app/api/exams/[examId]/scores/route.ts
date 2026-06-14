import { getServerUser, getPermissionsFromUser } from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient as admin } from "@/lib/supabase/admin";

// ─── GET /api/exams/[examId]/scores ───────────────────────────────────────────
// Scores (with student names) for one exam, for the scan/grade view. Replaces
// attemptService's browser-direct read so `scores` can be locked to
// service-role-only (audit #17 residual). Authorization mirrors
// /api/exams/scores/delete: exams.limited_access required; a limited (non
// exams.full_access) user must teach at least one section the exam is assigned
// to. The section check is a direct teacher_class_assignments query (not the
// active-SY context cache) so it stays correct for historical exams.

const _GET = async function (
  _request: Request,
  { params }: { params: Promise<{ examId: string }> },
) {
  const user = await getServerUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const permissions = getPermissionsFromUser(user);
  if (!permissions.includes("exams.limited_access"))
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const examId = Number((await params).examId);
  if (!Number.isFinite(examId) || examId <= 0)
    return Response.json({ error: "Invalid exam ID." }, { status: 400 });

  // The exam's assignments (and their sections).
  const { data: assignments, error: aErr } = await admin
    .from("exam_assignments")
    .select("id, section_id")
    .eq("exam_id", examId);

  if (aErr)
    return Response.json({ error: "Internal server error." }, { status: 500 });

  const assignmentIds = ((assignments ?? []) as { id: number }[]).map((a) => a.id);
  if (assignmentIds.length === 0) return Response.json({ scores: [] });

  // Limited users: must teach a section this exam touches. Full access bypasses.
  if (!permissions.includes("exams.full_access")) {
    const sectionIds = [
      ...new Set(
        ((assignments ?? []) as { section_id: number | null }[])
          .map((a) => a.section_id)
          .filter((s): s is number => s != null),
      ),
    ];
    const { count } = await admin
      .from("teacher_class_assignments")
      .select("section_id", { count: "exact", head: true })
      .eq("teacher_id", user.id)
      .in("section_id", sectionIds)
      .is("deleted_at", null);

    if ((count ?? 0) === 0)
      return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await admin
    .from("scores")
    .select(
      "score_id, enrollment_id, exam_assignment_id, responses, calculated_score, graded_at, enrollments(students(full_name))",
    )
    .in("exam_assignment_id", assignmentIds)
    .order("graded_at", { ascending: false });

  if (error)
    return Response.json({ error: "Internal server error." }, { status: 500 });

  return Response.json({ scores: data ?? [] });
};

export const GET = withErrorHandler(_GET);
