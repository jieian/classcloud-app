import { createServerSupabaseClient } from "@/lib/supabase/server";

import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";
const _DELETE = async function(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }


  const { data: permsData, error: permsError } = await adminClient.rpc(
    "get_user_permissions",
    { user_uuid: user.id },
  );

  const hasFullAccess = permsData?.some((p: any) => p.permission_name === "exams.full_access");
  const hasLimitedAccess = permsData?.some((p: any) => p.permission_name === "exams.limited_access");

  if (permsError || (!hasFullAccess && !hasLimitedAccess)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const examId = Number(body?.exam_id);

  if (!Number.isInteger(examId) || examId <= 0) {
    return Response.json({ error: "Invalid exam_id." }, { status: 400 });
  }

  const { data: examData, error: examFetchError } = await adminClient
    .from("exams")
    .select("exam_id, curriculum_subject_id, creator_teacher_id")
    .eq("exam_id", examId)
    .is("deleted_at", null)
    .single();

  if (examFetchError || !examData) {
    return Response.json({ error: "Exam not found." }, { status: 404 });
  }

  const examCurriculumSubjectId = examData.curriculum_subject_id;

  const { data: examAssignments, error: examAssignmentsError } = await adminClient
    .from("exam_assignments")
    .select("section_id")
    .eq("exam_id", examId);
  if (examAssignmentsError) {
    console.error("[api/exams/delete] fetch exam_assignments error:", examAssignmentsError.message);
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }

  const sectionIds = (examAssignments ?? [])
    .map((a: { section_id: number }) => a.section_id)
    .filter((sectionId) => Number.isInteger(sectionId) && sectionId > 0);

  if (!examCurriculumSubjectId || sectionIds.length === 0) {
    return Response.json({ error: "Exam missing subject or section associations." }, { status: 400 });
  }

  if (!hasFullAccess) {
    // Creator can always delete their own exam (covers copies assigned to SSES/cross-type sections
    // where the exam's subject_id differs from the teacher's SSES assignment subject_id)
    if (examData.creator_teacher_id !== user.id) {
      const { data: teacherAssignments, error: teacherAssignmentsError } = await adminClient
        .from("teacher_class_assignments")
        .select("section_id, curriculum_subject_id")
        .eq("teacher_id", user.id)
        .in("section_id", sectionIds)
        .eq("curriculum_subject_id", examCurriculumSubjectId)
        .is("deleted_at", null);

      if (teacherAssignmentsError) {
        console.error("[api/exams/delete] teacher assignment check error:", teacherAssignmentsError.message);
        return Response.json({ error: "Internal server error." }, { status: 500 });
      }

      if (!teacherAssignments || teacherAssignments.length === 0) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }
    }
  }

  const { error } = await adminClient
    .from("exams")
    .update({ deleted_at: new Date().toISOString() })
    .eq("exam_id", examId)
    .is("deleted_at", null);

  if (error) {
    console.error("[api/exams/delete] delete exam error:", error.message);
    return Response.json(
      { error: "Failed to delete exam." },
      { status: 500 },
    );
  }

  return Response.json({ success: true }, { status: 200 });
}

export const DELETE = withErrorHandler(_DELETE)
