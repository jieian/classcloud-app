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
import { REPORTS_CACHE_TAG } from "@/app/(app)/assessment-reports/_lib/reportServerService";

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
  creator_teacher_id: string | null;
  quarter_id: number | null;
  curriculum_subject_id: number | null;
};

type SectionJoin = {
  grade_level_id: number | null;
  sy_id: number | null;
  section_type: "REGULAR" | "SSES" | null;
};

type AssignmentRow = {
  id: number;
  section_id: number;
  sections: SectionJoin | SectionJoin[] | null;
};

type EnrollmentRow = {
  enrollment_id: number;
  section_id: number;
  students:
    | {
        full_name: string | null;
        sex: string | null;
      }
    | {
        full_name: string | null;
        sex: string | null;
      }[]
    | null;
};

type ScoreRow = {
  score_id: number;
  enrollment_id: number | null;
  exam_assignment_id: number;
  responses: Record<string, string> | null;
  calculated_score: number;
  graded_at: string;
};

type TeacherAssignmentRow = {
  section_id: number | null;
  teacher_id: string | null;
};

type ReportStudentScore = {
  enrollment_id: number;
  student_name: string;
  sex: "Male" | "Female";
  score_id: number;
  score: number;
  total_items: number;
  mpl: number;
  proficiency_level: string;
  graded_at: string;
};

const MPL_THRESHOLD = 60;

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

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function asSectionJoin(join: AssignmentRow["sections"]): SectionJoin | null {
  if (Array.isArray(join)) return join[0] ?? null;
  return join ?? null;
}

function asStudentJoin(
  join: EnrollmentRow["students"],
): { full_name: string | null; sex: string | null } | null {
  if (Array.isArray(join)) return join[0] ?? null;
  return join ?? null;
}

function normalizeSex(value: string | null | undefined): "Male" | "Female" {
  const raw = (value ?? "").trim().toLowerCase();
  return raw === "f" || raw === "female" || raw.startsWith("female")
    ? "Female"
    : "Male";
}

function getProficiencyLevel(mpl: number): string {
  if (mpl >= 90) return "Highly Proficient";
  if (mpl >= 75) return "Proficient";
  if (mpl >= 50) return "Nearly Proficient";
  if (mpl >= 25) return "Low Proficient";
  return "Not Proficient";
}

function percent(part: number, total: number): number {
  return total > 0 ? round2((part / total) * 100) : 0;
}

function buildExamResultReportRows({
  exam,
  examId,
  assignments,
  enrollments,
  latestScoreByPair,
  sectionToTeacherId,
  totalItems,
  generatedBy,
}: {
  exam: ExamFinalizeRow;
  examId: number;
  assignments: AssignmentRow[];
  enrollments: EnrollmentRow[];
  latestScoreByPair: Map<string, ScoreRow>;
  sectionToTeacherId: Map<number, string>;
  totalItems: number;
  generatedBy: string;
}): Record<string, unknown>[] {
  const now = new Date().toISOString();
  const enrollmentsBySection = new Map<number, EnrollmentRow[]>();
  for (const enrollment of enrollments) {
    const group = enrollmentsBySection.get(enrollment.section_id) ?? [];
    group.push(enrollment);
    enrollmentsBySection.set(enrollment.section_id, group);
  }

  return assignments.map((assignment) => {
    const section = asSectionJoin(assignment.sections);
    const sectionEnrollments = enrollmentsBySection.get(assignment.section_id) ?? [];
    const studentScores: ReportStudentScore[] = [];

    for (const enrollment of sectionEnrollments) {
      const score = latestScoreByPair.get(
        `${enrollment.enrollment_id}-${assignment.id}`,
      );
      if (!score) continue;

      const student = asStudentJoin(enrollment.students);
      const sex = normalizeSex(student?.sex);
      const scoreValue = score.calculated_score ?? 0;
      const mpl = totalItems > 0 ? round2((scoreValue / totalItems) * 100) : 0;

      studentScores.push({
        enrollment_id: enrollment.enrollment_id,
        student_name:
          student?.full_name?.trim() || `Enrollment #${enrollment.enrollment_id}`,
        sex,
        score_id: score.score_id,
        score: scoreValue,
        total_items: totalItems,
        mpl,
        proficiency_level: getProficiencyLevel(mpl),
        graded_at: score.graded_at,
      });
    }

    const scores = studentScores.map((studentScore) => studentScore.score);
    const totalCases = studentScores.length;
    const maleScores = studentScores.filter((studentScore) => studentScore.sex === "Male");
    const femaleScores = studentScores.filter((studentScore) => studentScore.sex === "Female");
    const totalScore = scores.reduce((sum, score) => sum + score, 0);
    const mean = totalCases > 0 ? round2(totalScore / totalCases) : 0;
    const mps = totalItems > 0 ? round2(mean / totalItems) : 0;
    const pl = totalItems > 0 ? round2((mean / totalItems) * 100) : 0;
    const sd =
      totalCases > 0
        ? round2(
            Math.sqrt(
              scores.reduce((sum, score) => sum + (score - mean) ** 2, 0) /
                totalCases,
            ),
          )
        : 0;

    const achieved = studentScores.filter((studentScore) => studentScore.mpl >= MPL_THRESHOLD);
    const failed = studentScores.filter((studentScore) => studentScore.mpl < MPL_THRESHOLD);
    const countBySex = (
      rows: ReportStudentScore[],
      sex: "Male" | "Female",
    ) => rows.filter((row) => row.sex === sex).length;
    const countByLevel = (
      sex: "Male" | "Female",
      level: ReportStudentScore["proficiency_level"],
    ) =>
      studentScores.filter(
        (row) => row.sex === sex && row.proficiency_level === level,
      ).length;

    const totalMaleCases = maleScores.length;
    const totalFemaleCases = femaleScores.length;
    const totalEnrolledMale = sectionEnrollments.filter(
      (enrollment) => normalizeSex(asStudentJoin(enrollment.students)?.sex) === "Male",
    ).length;
    const totalEnrolledFemale = sectionEnrollments.filter(
      (enrollment) => normalizeSex(asStudentJoin(enrollment.students)?.sex) === "Female",
    ).length;
    const totalEnrolled = totalEnrolledMale + totalEnrolledFemale;

    const maleHighly = countByLevel("Male", "Highly Proficient");
    const femaleHighly = countByLevel("Female", "Highly Proficient");
    const maleProficient = countByLevel("Male", "Proficient");
    const femaleProficient = countByLevel("Female", "Proficient");
    const maleNearly = countByLevel("Male", "Nearly Proficient");
    const femaleNearly = countByLevel("Female", "Nearly Proficient");
    const maleLow = countByLevel("Male", "Low Proficient");
    const femaleLow = countByLevel("Female", "Low Proficient");
    const maleNot = countByLevel("Male", "Not Proficient");
    const femaleNot = countByLevel("Female", "Not Proficient");

    return {
      exam_id: examId,
      section_id: assignment.section_id,
      teacher_id:
        exam.creator_teacher_id ?? sectionToTeacherId.get(assignment.section_id) ?? null,
      sy_id: section?.sy_id ?? null,
      curriculum_subject_id: exam.curriculum_subject_id,
      grade_level_id: section?.grade_level_id ?? null,
      quarter_id: exam.quarter_id,
      section_type: section?.section_type ?? "REGULAR",
      total_items: totalItems,
      total_cases: totalCases,
      total_male_cases: totalMaleCases,
      total_female_cases: totalFemaleCases,
      total_score: totalScore,
      mean,
      mps,
      pl,
      sd,
      highest_score: scores.length > 0 ? Math.max(...scores) : 0,
      lowest_score: scores.length > 0 ? Math.min(...scores) : 0,
      mpl_threshold: MPL_THRESHOLD,
      total_male_achieved: countBySex(achieved, "Male"),
      total_female_achieved: countBySex(achieved, "Female"),
      total_achieved: achieved.length,
      male_achieved_percent: percent(countBySex(achieved, "Male"), totalMaleCases),
      female_achieved_percent: percent(countBySex(achieved, "Female"), totalFemaleCases),
      total_achieved_percent: percent(achieved.length, totalCases),
      total_male_failed: countBySex(failed, "Male"),
      total_female_failed: countBySex(failed, "Female"),
      total_failed: failed.length,
      male_failed_percent: percent(countBySex(failed, "Male"), totalMaleCases),
      female_failed_percent: percent(countBySex(failed, "Female"), totalFemaleCases),
      total_failed_percent: percent(failed.length, totalCases),
      total_male_highly: maleHighly,
      total_male_proficient: maleProficient,
      total_male_nearly: maleNearly,
      total_male_low: maleLow,
      total_male_not: maleNot,
      total_female_highly: femaleHighly,
      total_female_proficient: femaleProficient,
      total_female_nearly: femaleNearly,
      total_female_low: femaleLow,
      total_female_not: femaleNot,
      percent_highly: percent(maleHighly + femaleHighly, totalCases),
      percent_proficient: percent(maleProficient + femaleProficient, totalCases),
      percent_nearly: percent(maleNearly + femaleNearly, totalCases),
      percent_low: percent(maleLow + femaleLow, totalCases),
      percent_not: percent(maleNot + femaleNot, totalCases),
      student_scores: studentScores,
      total_enrolled_male: totalEnrolledMale,
      total_enrolled_female: totalEnrolledFemale,
      male_percentage: percent(totalMaleCases, totalEnrolledMale),
      female_percentage: percent(totalFemaleCases, totalEnrolledFemale),
      total_percentage: percent(totalCases, totalEnrolled),
      generated_at: now,
      generated_by: generatedBy,
    };
  });
}

async function saveExamResultReportRows(
  rows: Record<string, unknown>[],
): Promise<{ error: { message: string } | null }> {
  for (const row of rows) {
    const examId = row.exam_id;
    const sectionId = row.section_id;
    const { data: existing, error: lookupError } = await adminClient
      .from("exam_results_reports")
      .select("report_id")
      .eq("exam_id", examId)
      .eq("section_id", sectionId);

    if (lookupError) return { error: { message: lookupError.message } };

    if ((existing ?? []).length > 0) {
      const { error: updateError } = await adminClient
        .from("exam_results_reports")
        .update(row)
        .eq("exam_id", examId)
        .eq("section_id", sectionId);
      if (updateError) return { error: { message: updateError.message } };
      continue;
    }

    const { error: insertError } = await adminClient
      .from("exam_results_reports")
      .insert(row);
    if (insertError) return { error: { message: insertError.message } };
  }

  return { error: null };
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
      "exam_id, total_items, answer_key, is_locked, creator_teacher_id, quarter_id, curriculum_subject_id, deleted_at",
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
  if (exam.curriculum_subject_id == null || exam.quarter_id == null) {
    return Response.json(
      { error: "Exam is missing report context." },
      { status: 400 },
    );
  }

  const { data: assignmentData, error: assignmentError } = await adminClient
    .from("exam_assignments")
    .select("id, section_id, sections!inner(grade_level_id, sy_id, section_type)")
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
  const hasMissingAssignmentContext = assignments.some((assignment) => {
    const section = asSectionJoin(assignment.sections);
    return !section?.grade_level_id || !section.sy_id || !section.section_type;
  });

  if (hasMissingAssignmentContext) {
    return Response.json(
      { error: "Exam assignment is missing report context." },
      { status: 400 },
    );
  }

  const sectionIds = [...new Set(assignments.map((a) => a.section_id))];
  const assignmentIds = assignments.map((a) => a.id);

  const { data: teacherAssignmentsData, error: teacherAssignmentsError } =
    await adminClient
      .from("teacher_class_assignments")
      .select("section_id, teacher_id")
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

  const teacherAssignments = (teacherAssignmentsData ?? []) as TeacherAssignmentRow[];
  if (
    !hasFullAccess &&
    !teacherAssignments.some((assignment) => assignment.teacher_id === user.id)
  ) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const sectionToTeacherId = new Map<number, string>();
  for (const assignment of teacherAssignments) {
    if (assignment.section_id == null || assignment.teacher_id == null) continue;
    if (!sectionToTeacherId.has(assignment.section_id)) {
      sectionToTeacherId.set(assignment.section_id, assignment.teacher_id);
    }
  }

  const { data: enrollmentsData, error: enrollmentsError } = await adminClient
    .from("enrollments")
    .select("enrollment_id, section_id, students!left(full_name, sex)")
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

  const reportRows = buildExamResultReportRows({
    exam,
    examId,
    assignments,
    enrollments,
    latestScoreByPair,
    sectionToTeacherId,
    totalItems,
    generatedBy: user.id,
  });
  const { error: reportsSaveError } = await saveExamResultReportRows(reportRows);

  if (reportsSaveError) {
    console.error(
      "[api/exams/finalize-reports] exam results report save error:",
      reportsSaveError.message,
    );
    return Response.json(
      { error: "Failed to save examination results report." },
      { status: 500 },
    );
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
  revalidateTag(REPORTS_CACHE_TAG, "minutes");
  return Response.json(
    {
      examId,
      gradeLevelId,
      sectionId,
      finalized: true,
      reportsSaved: true,
      itemStatsSaved,
      warning: finalizeWarning,
    },
    { status: 200 },
  );
};

export const POST = withErrorHandler(_POST);
