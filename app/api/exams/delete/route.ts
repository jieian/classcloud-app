import { getServerUser, getPermissionsFromUser } from "@/lib/supabase/server";
import { revalidateTag } from "next/cache";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";
import { after } from "next/server";
import { insertAuditLog } from "@/lib/audit";
import { EXAMS_CACHE_TAG } from "@/app/(app)/exam/_lib/examServerService";
const _DELETE = async function(request: Request) {
  const user = await getServerUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }


  const permissions = getPermissionsFromUser(user);
  const hasFullAccess = permissions.includes("exams.full_access");
  const hasLimitedAccess = permissions.includes("exams.limited_access");

  if (!hasFullAccess && !hasLimitedAccess) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const examId = Number(body?.exam_id);

  if (!Number.isInteger(examId) || examId <= 0) {
    return Response.json({ error: "Invalid exam_id." }, { status: 400 });
  }

  const { data: examData, error: examFetchError } = await adminClient
    .from("exams")
    .select("exam_id, curriculum_subject_id, creator_teacher_id, title, is_locked, curriculum_subjects!inner(subjects!inner(name))")
    .eq("exam_id", examId)
    .is("deleted_at", null)
    .single();

  if (examFetchError || !examData) {
    return Response.json({ error: "Exam not found." }, { status: 404 });
  }

  if ((examData as { is_locked?: boolean }).is_locked) {
    return Response.json({ error: "Cannot delete a finalized exam." }, { status: 409 });
  }

  const examCurriculumSubjectId = examData.curriculum_subject_id;

  // Names for the audit log — pulled from the auth select above (no extra read).
  const examTitle = (examData as { title?: string | null }).title ?? null;
  const csEmbed = (examData as { curriculum_subjects?: unknown }).curriculum_subjects;
  const csObj = (Array.isArray(csEmbed) ? csEmbed[0] : csEmbed) as { subjects?: unknown } | null;
  const subjEmbed = csObj?.subjects;
  const subjObj = (Array.isArray(subjEmbed) ? subjEmbed[0] : subjEmbed) as { name?: string | null } | null;
  const examSubject = subjObj?.name ?? null;

  const { data: examAssignments, error: examAssignmentsError } = await adminClient
    .from("exam_assignments")
    .select("id, section_id")
    .eq("exam_id", examId);
  if (examAssignmentsError) {
    console.error("[api/exams/delete] fetch exam_assignments error:", examAssignmentsError.message);
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }

  const assignmentRows = (examAssignments ?? []) as { id: number; section_id: number }[];
  const sectionIds = assignmentRows
    .map((a) => a.section_id)
    .filter((sectionId) => Number.isInteger(sectionId) && sectionId > 0);

  if (!examCurriculumSubjectId || sectionIds.length === 0) {
    return Response.json({ error: "Exam missing subject or section associations." }, { status: 400 });
  }

  const assignmentIds = assignmentRows.map((a) => a.id).filter((id) => id > 0);
  if (assignmentIds.length > 0) {
    const { count: scoreCount, error: scoreError } = await adminClient
      .from("scores")
      .select("*", { count: "exact", head: true })
      .in("exam_assignment_id", assignmentIds);
    if (scoreError) {
      console.error("[api/exams/delete] score check error:", scoreError.message);
      return Response.json({ error: "Internal server error." }, { status: 500 });
    }
    if ((scoreCount ?? 0) > 0) {
      return Response.json({ error: "Cannot delete an exam with existing scan records." }, { status: 409 });
    }
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

  revalidateTag(EXAMS_CACHE_TAG, "minutes");

  after(() =>
    insertAuditLog({
      actor_id: user.id,
      action: "exam_deleted",
      entity_type: "exam",
      entity_id: String(examId),
      entity_label: examTitle,
      new_values: { title: examTitle, subject: examSubject, curriculum_subject_id: examCurriculumSubjectId },
    }).catch(() => {}),
  );

  return Response.json({ success: true }, { status: 200 });
}

export const DELETE = withErrorHandler(_DELETE)
