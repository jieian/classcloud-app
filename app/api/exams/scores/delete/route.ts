import { createServerSupabaseClient, getPermissionsFromUser } from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";

const _DELETE = async function (request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const permissions = getPermissionsFromUser(user);
  if (!permissions.includes("exams.limited_access")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { scoreId } = (await request.json()) as { scoreId?: number };
  if (!scoreId || !Number.isFinite(scoreId)) {
    return Response.json({ error: "Missing or invalid scoreId" }, { status: 400 });
  }

  // Look up the score to verify the teacher is assigned to its section
  const { data: scoreRow, error: scoreLookupError } = await adminClient
    .from("scores")
    .select("score_id, exam_assignment_id, exam_assignments!inner(section_id, exams!inner(is_locked, deleted_at))")
    .eq("score_id", scoreId)
    .maybeSingle();

  if (scoreLookupError) {
    console.error("[api/exams/scores/delete] score lookup error:", scoreLookupError.message);
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }

  if (!scoreRow) {
    return Response.json({ error: "Score not found." }, { status: 404 });
  }

  const assignment = (scoreRow as Record<string, unknown>).exam_assignments as Record<string, unknown> | null;
  const exam = assignment ? (Array.isArray(assignment.exams) ? assignment.exams[0] : assignment.exams) as Record<string, unknown> | null : null;

  if (exam?.is_locked) {
    return Response.json({ error: "Exam is finalized and cannot be modified." }, { status: 409 });
  }

  // Verify teacher is assigned to the section
  const hasFullAccess = permissions.includes("exams.full_access");
  if (!hasFullAccess) {
    const sectionId = assignment?.section_id as number | null;
    if (sectionId != null) {
      const { count } = await adminClient
        .from("teacher_class_assignments")
        .select("section_id", { count: "exact", head: true })
        .eq("teacher_id", user.id)
        .eq("section_id", sectionId)
        .is("deleted_at", null);

      if ((count ?? 0) === 0) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }
    }
  }

  const { error: deleteError } = await adminClient
    .from("scores")
    .delete()
    .eq("score_id", scoreId);

  if (deleteError) {
    console.error("[api/exams/scores/delete] delete error:", deleteError.message);
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }

  return Response.json({ success: true }, { status: 200 });
};

export const DELETE = withErrorHandler(_DELETE);
