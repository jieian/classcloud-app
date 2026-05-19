import { withErrorHandler } from "@/lib/api-error";
import { computeItemStatistics } from "@/lib/services/analysisService";
import type { ExamScore } from "@/lib/exam-supabase";
import { adminClient } from "@/lib/supabase/admin";
import {
  createServerSupabaseClient,
  getPermissionsFromUser,
} from "@/lib/supabase/server";
import { revalidateTag } from "next/cache";
import { EXAMS_CACHE_TAG } from "@/app/(app)/exam/_lib/examServerService";

type FinalizeParams = { examId: string };

type ExamFinalizeRow = {
  exam_id: number;
  total_items: number | null;
  answer_key:
    | {
        total_questions?: number | null;
        answers?: Record<string, string | null> | null;
      }
    | null;
  is_locked: boolean | null;
  curriculum_subject_id: number | null;
};

type AssignmentRow = {
  id: number;
  section_id: number;
  sections:
    | {
        grade_level_id: number | null;
      }
    | {
        grade_level_id: number | null;
      }[]
    | null;
};

type EnrollmentRow = {
  enrollment_id: number;
  section_id: number;
};

type ScoreRow = {
  score_id: number;
  enrollment_id: number | null;
  exam_assignment_id: number;
  responses: Record<string, string> | null;
  calculated_score: number;
  graded_at: string;
};

function normalizeAnswerKey(
  raw: ExamFinalizeRow["answer_key"],
  totalItems: number,
): { [item: number]: string | null } {
  const mapped: { [item: number]: string | null } = {};
  const source = raw?.answers ?? null;
  if (!source) return mapped;

  for (let i = 1; i <= totalItems; i++) {
    mapped[i] = null;
  }

  for (const [key, value] of Object.entries(source)) {
    const itemNo = Number(key);
    if (!Number.isInteger(itemNo) || itemNo <= 0) continue;
    mapped[itemNo] = value ?? null;
  }

  return mapped;
}

function asSectionJoin(
  join: AssignmentRow["sections"],
): { grade_level_id: number | null } | null {
  if (Array.isArray(join)) return join[0] ?? null;
  return join ?? null;
}

const _POST = async function (
  _request: Request,
  { params }: { params: Promise<FinalizeParams> },
) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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

  const { data: examData, error: examError } = await adminClient
    .from("exams")
    .select(
      "exam_id, total_items, answer_key, is_locked, curriculum_subject_id, deleted_at",
    )
    .eq("exam_id", examId)
    .is("deleted_at", null)
    .maybeSingle();

  if (examError) {
    console.error(
      "[api/exams/finalize-reports] exam fetch error:",
      examError.message,
    );
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }
  if (!examData) {
    return Response.json({ error: "Exam not found." }, { status: 404 });
  }

  const exam = examData as ExamFinalizeRow;

  const { data: assignmentData, error: assignmentError } = await adminClient
    .from("exam_assignments")
    .select("id, section_id, sections!inner(grade_level_id)")
    .eq("exam_id", examId);

  if (assignmentError) {
    console.error(
      "[api/exams/finalize-reports] assignment fetch error:",
      assignmentError.message,
    );
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }

  const assignments = (assignmentData ?? []) as AssignmentRow[];
  if (assignments.length === 0) {
    return Response.json(
      { error: "Exam has no assigned section." },
      { status: 400 },
    );
  }

  const firstAssignment = assignments[0];
  const firstSectionJoin = asSectionJoin(firstAssignment.sections);
  const sectionId = firstAssignment.section_id;
  const gradeLevelId = firstSectionJoin?.grade_level_id ?? null;

  if (!sectionId || !gradeLevelId) {
    return Response.json(
      { error: "Exam assignment is missing section context." },
      { status: 400 },
    );
  }

  if (exam.is_locked) {
    return Response.json(
      {
        examId,
        gradeLevelId,
        sectionId,
        finalized: true,
      },
      { status: 200 },
    );
  }

  const sectionIds = [...new Set(assignments.map((a) => a.section_id))];
  const assignmentIds = assignments.map((a) => a.id);

  if (!hasFullAccess) {
    const { data: teacherAssignments, error: teacherAssignmentsError } =
      await adminClient
        .from("teacher_class_assignments")
        .select("section_id, curriculum_subject_id")
        .eq("teacher_id", user.id)
        .in("section_id", sectionIds)
        .eq("curriculum_subject_id", exam.curriculum_subject_id)
        .is("deleted_at", null);

    if (teacherAssignmentsError) {
      console.error(
        "[api/exams/finalize-reports] teacher assignment check error:",
        teacherAssignmentsError.message,
      );
      return Response.json({ error: "Internal server error." }, { status: 500 });
    }

    if (!teacherAssignments || teacherAssignments.length === 0) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const { data: enrollmentsData, error: enrollmentsError } = await adminClient
    .from("enrollments")
    .select("enrollment_id, section_id")
    .in("section_id", sectionIds)
    .is("deleted_at", null);

  if (enrollmentsError) {
    console.error(
      "[api/exams/finalize-reports] enrollment fetch error:",
      enrollmentsError.message,
    );
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }

  const enrollments = (enrollmentsData ?? []) as EnrollmentRow[];
  if (enrollments.length === 0) {
    return Response.json(
      { error: "No students found for this examination." },
      { status: 409 },
    );
  }

  const sectionToAssignmentId = new Map<number, number>();
  for (const assignment of assignments) {
    if (!sectionToAssignmentId.has(assignment.section_id)) {
      sectionToAssignmentId.set(assignment.section_id, assignment.id);
    }
  }

  const requiredKeys = new Set<string>();
  for (const enrollment of enrollments) {
    const assignmentId = sectionToAssignmentId.get(enrollment.section_id);
    if (!assignmentId) continue;
    requiredKeys.add(`${enrollment.enrollment_id}-${assignmentId}`);
  }

  if (requiredKeys.size === 0) {
    return Response.json(
      { error: "No valid student-assignment pairs found for finalization." },
      { status: 409 },
    );
  }

  const { data: scoreRowsData, error: scoreRowsError } = await adminClient
    .from("scores")
    .select(
      "score_id, enrollment_id, exam_assignment_id, responses, calculated_score, graded_at",
    )
    .in("exam_assignment_id", assignmentIds)
    .order("graded_at", { ascending: false });

  if (scoreRowsError) {
    console.error(
      "[api/exams/finalize-reports] score fetch error:",
      scoreRowsError.message,
    );
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }

  const scoreRows = (scoreRowsData ?? []) as ScoreRow[];

  const latestScoreByPair = new Map<string, ScoreRow>();
  for (const row of scoreRows) {
    if (row.enrollment_id == null) continue;
    const key = `${row.enrollment_id}-${row.exam_assignment_id}`;
    if (!latestScoreByPair.has(key)) {
      latestScoreByPair.set(key, row);
    }
  }

  const missingCount = [...requiredKeys].filter(
    (key) => !latestScoreByPair.has(key),
  ).length;

  if (missingCount > 0) {
    return Response.json(
      {
        error:
          "Finalization requires all students to have scanned results saved.",
        missingCount,
        requiredCount: requiredKeys.size,
        scannedCount: requiredKeys.size - missingCount,
      },
      { status: 409 },
    );
  }

  const attempts: ExamScore[] = [...latestScoreByPair.values()].map((row) => ({
    score_id: row.score_id,
    enrollment_id: row.enrollment_id,
    exam_assignment_id: row.exam_assignment_id,
    responses: row.responses ?? {},
    calculated_score: row.calculated_score ?? 0,
    graded_at: row.graded_at,
  }));

  const totalItems =
    exam.answer_key?.total_questions ?? exam.total_items ?? 0;
  if (!totalItems || totalItems <= 0) {
    return Response.json(
      { error: "Exam has invalid total items for analysis." },
      { status: 400 },
    );
  }

  const answerKey = normalizeAnswerKey(exam.answer_key, totalItems);
  const itemStats = computeItemStatistics(attempts, answerKey, totalItems);

  let itemStatsSaved = true;
  let finalizeWarning: string | null = null;

  if (itemStats.length > 0) {
    const rows = itemStats.map((stat) => ({
      exam_id: examId,
      item_number: stat.item_number,
      difficulty_index: stat.difficulty_index,
      discrimination_index: stat.discrimination_index,
      choice_frequencies: stat.choice_frequencies,
      total_responses: stat.total_responses,
      computed_at: new Date().toISOString(),
    }));

    const { error: upsertError } = await adminClient
      .from("item_statistics")
      .upsert(rows, { onConflict: "exam_id,item_number" });

    if (upsertError) {
      console.error(
        "[api/exams/finalize-reports] item stats upsert error:",
        upsertError.message,
      );
      itemStatsSaved = false;
      finalizeWarning =
        "Examination was finalized, but item statistics could not be refreshed.";
    }
  }

  if (!exam.is_locked) {
    const { error: lockError } = await adminClient
      .from("exams")
      .update({ is_locked: true })
      .eq("exam_id", examId)
      .is("deleted_at", null);

    if (lockError) {
      console.error(
        "[api/exams/finalize-reports] lock update error:",
        lockError.message,
      );
      return Response.json(
        { error: "Failed to finalize and lock examination." },
        { status: 500 },
      );
    }
  }

  revalidateTag(EXAMS_CACHE_TAG, "minutes");
  return Response.json(
    {
      examId,
      gradeLevelId,
      sectionId,
      finalized: true,
      itemStatsSaved,
      warning: finalizeWarning,
    },
    { status: 200 },
  );
};

export const POST = withErrorHandler(_POST);
