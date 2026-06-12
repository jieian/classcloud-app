import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";
import { getServerUser, getPermissionsFromUser } from "@/lib/supabase/server";
import { revalidateTag } from "next/cache";
import { after } from "next/server";
import { insertAuditLog } from "@/lib/audit";
import { dispatchReportCompletions } from "@/lib/notifications";
import { EXAMS_CACHE_TAG } from "@/app/(app)/exam/_lib/examServerService";
import { REPORTS_CACHE_TAG } from "@/app/(app)/reports/_lib/reportServerService";

type FinalizeParams = { examId: string };

type FinalizeRpcResult = {
  examId?: number;
  gradeLevelId?: number | null;
  sectionId?: number | null;
  finalized?: boolean;
  reportsSaved?: boolean;
  itemAnalysisReportsSaved?: boolean;
  error?: string;
  missingCount?: number;
  requiredCount?: number;
  scannedCount?: number;
};

type TeacherAssignmentRow = {
  teacher_id: string | null;
};

type ExamContextRow = {
  curriculum_subject_id: number | null;
  exam_assignments:
    | {
        section_id: number | null;
        sections: { section_id: number } | { section_id: number }[] | null;
      }
    | {
        section_id: number | null;
        sections: { section_id: number } | { section_id: number }[] | null;
      }[]
    | null;
};

function normalizeRpcResult(data: unknown, examId: number): FinalizeRpcResult {
  if (Array.isArray(data)) {
    return normalizeRpcResult(data[0], examId);
  }
  if (data && typeof data === "object") {
    return data as FinalizeRpcResult;
  }
  return {
    examId,
    finalized: true,
    reportsSaved: true,
    itemAnalysisReportsSaved: true,
  };
}

function firstJoin<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

const _POST = async function (
  _request: Request,
  { params }: { params: Promise<FinalizeParams> },
) {
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

  const { examId: examIdRaw } = await params;
  const examId = Number(examIdRaw);
  if (!Number.isInteger(examId) || examId <= 0) {
    return Response.json({ error: "Invalid exam ID." }, { status: 400 });
  }

  if (!hasFullAccess) {
    const { data: contextData, error: contextError } = await adminClient
      .from("exams")
      .select(
        "curriculum_subject_id, exam_assignments!inner(section_id, sections!inner(section_id))",
      )
      .eq("exam_id", examId)
      .is("deleted_at", null)
      .maybeSingle();

    if (contextError) {
      console.error(
        "[api/exams/finalize-reports] permission context error:",
        contextError.message,
      );
      return Response.json({ error: "Internal server error." }, { status: 500 });
    }

    const context = contextData as ExamContextRow | null;
    if (!context || context.curriculum_subject_id == null) {
      return Response.json({ error: "Exam not found." }, { status: 404 });
    }

    const assignments = Array.isArray(context.exam_assignments)
      ? context.exam_assignments
      : context.exam_assignments
        ? [context.exam_assignments]
        : [];
    const sectionIds = assignments
      .map((assignment) => assignment.section_id ?? firstJoin(assignment.sections)?.section_id ?? null)
      .filter((sectionId): sectionId is number => sectionId != null);

    const { data: teacherAssignmentsData, error: teacherAssignmentsError } =
      await adminClient
        .from("teacher_class_assignments")
        .select("teacher_id")
        .in("section_id", sectionIds)
        .eq("curriculum_subject_id", context.curriculum_subject_id)
        .is("deleted_at", null);

    if (teacherAssignmentsError) {
      console.error(
        "[api/exams/finalize-reports] teacher assignment check error:",
        teacherAssignmentsError.message,
      );
      return Response.json({ error: "Internal server error." }, { status: 500 });
    }

    const teacherAssignments =
      (teacherAssignmentsData ?? []) as TeacherAssignmentRow[];
    if (
      !teacherAssignments.some(
        (assignment) => assignment.teacher_id === user.id,
      )
    ) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const { data, error } = await adminClient.rpc("finalize_exam_reports_atomic", {
    p_exam_id: examId,
    p_generated_by: user.id,
  });

  if (error) {
    console.error(
      "[api/exams/finalize-reports] finalize RPC error:",
      error.message,
    );

    const message = String(error.message);
    const status =
      message.includes("EXAM_NOT_FOUND") ? 404 :
      message.includes("MISSING_REPORT_CONTEXT") ||
      message.includes("NO_ASSIGNED_SECTION") ||
      message.includes("MISSING_ASSIGNMENT_CONTEXT") ||
      message.includes("INVALID_TOTAL_ITEMS") ? 400 :
      message.includes("NO_STUDENTS") ||
      message.includes("NO_VALID_STUDENT_ASSIGNMENT_PAIRS") ||
      message.includes("MISSING_SCANNED_RESULTS") ? 409 :
      500;

    return Response.json(
      { error: status === 500 ? "Internal server error." : message },
      { status },
    );
  }

  const result = normalizeRpcResult(data, examId);
  if (result.error) {
    const status =
      result.error === "EXAM_NOT_FOUND" ? 404 :
      result.error === "MISSING_SCANNED_RESULTS" ||
      result.error === "NO_STUDENTS" ||
      result.error === "NO_VALID_STUDENT_ASSIGNMENT_PAIRS" ? 409 :
      400;
    return Response.json(result, { status });
  }

  revalidateTag(EXAMS_CACHE_TAG, "minutes");
  revalidateTag(REPORTS_CACHE_TAG, "minutes");

  after(() =>
    insertAuditLog({
      actor_id: user.id,
      action: "exam_reports_finalized",
      entity_type: "exam",
      entity_id: String(examId),
      new_values: {
        section_id: result.sectionId ?? null,
        reports_saved: result.reportsSaved ?? null,
        item_analysis_saved: result.itemAnalysisReportsSaved ?? null,
      },
    }).catch(() => {}),
  );

  // Detect newly-completed report milestones and notify the responsible
  // monitors (GSL / coordinator / principal). Runs off the response path; the
  // promise is returned (not voided) so after() keeps the instance alive until
  // the in-app inserts AND emails flush. The dispatcher never throws.
  after(() => dispatchReportCompletions({ examId, actorUid: user.id }));

  return Response.json(result, { status: 200 });
};

export const POST = withErrorHandler(_POST);
