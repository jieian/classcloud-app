import { supabase } from "@/lib/exam-supabase";
import type { ExamScore } from "@/lib/exam-supabase";

type ScoreCreatePayload = {
  enrollment_id: number;
  exam_assignment_id: number;
  responses: { [item: number]: string };
  calculated_score: number;
};

type LegacyAttemptPayload = {
  exam_id: number;
  student_lrn?: string | null;
  student_name?: string | null;
  enrollment_id?: number | null;
  section_id?: number | null;
  responses: { [item: number]: string };
  score: number;
  total_items: number;
};

export type CreateAttemptPayload = ScoreCreatePayload | LegacyAttemptPayload;

type AssignmentIdRow = { id: number };
type ScoreAssignmentRow = { exam_assignment_id: number };

const LEGACY_ATTEMPT_TABLE = "exam_attempts";

function isMissingResourceError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("could not find the table") ||
    m.includes("does not exist") ||
    m.includes("schema cache") ||
    m.includes("could not find the column")
  );
}

function normalizeResponses(raw: unknown): { [item: number]: string } {
  if (!raw || typeof raw !== "object") return {};
  return raw as { [item: number]: string };
}

function getNestedStudentName(row: Record<string, unknown>): string | null {
  const enrollmentsRaw = row.enrollments;
  if (!enrollmentsRaw || typeof enrollmentsRaw !== "object") return null;

  const enrollments = enrollmentsRaw as Record<string, unknown>;
  const studentsRaw = enrollments.students;

  if (Array.isArray(studentsRaw)) {
    const first = studentsRaw[0];
    if (first && typeof first === "object" && "full_name" in first) {
      const fullName = (first as { full_name?: string | null }).full_name;
      return fullName ?? null;
    }
  }

  if (studentsRaw && typeof studentsRaw === "object" && "full_name" in studentsRaw) {
    const fullName = (studentsRaw as { full_name?: string | null }).full_name;
    return fullName ?? null;
  }

  return null;
}

function normalizeScoreRow(row: Record<string, unknown>): ExamScore {
  return {
    score_id: Number(row.score_id ?? row.attempt_id ?? row.id ?? 0),
    enrollment_id: (row.enrollment_id ?? null) as number | null,
    exam_assignment_id: Number(row.exam_assignment_id ?? 0),
    responses: normalizeResponses(row.responses ?? row.answers),
    calculated_score: Number(row.calculated_score ?? row.score ?? 0),
    graded_at: String(
      row.graded_at ?? row.scanned_at ?? row.created_at ?? new Date(0).toISOString()
    ),
    student_name:
      (row.student_name as string | null | undefined) ??
      (row.full_name as string | null | undefined) ??
      getNestedStudentName(row),
  };
}

function sortScoresNewestFirst(attempts: ExamScore[]): ExamScore[] {
  return attempts.sort((a, b) => {
    const ta = new Date(a.graded_at).getTime();
    const tb = new Date(b.graded_at).getTime();
    return tb - ta;
  });
}

function isScoreCreatePayload(payload: CreateAttemptPayload): payload is ScoreCreatePayload {
  return (
    typeof (payload as Partial<ScoreCreatePayload>).enrollment_id === "number" &&
    typeof (payload as Partial<ScoreCreatePayload>).exam_assignment_id === "number" &&
    typeof (payload as Partial<ScoreCreatePayload>).calculated_score === "number"
  );
}

async function createScoreViaApi(payload: ScoreCreatePayload): Promise<ExamScore | null> {
  try {
    const response = await fetch("/api/exams/scores/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const body = (await response.json()) as {
      error?: string;
      score?: Record<string, unknown>;
    };

    if (!response.ok) {
      console.error("[attemptService] create score API error:", body.error ?? "Unknown error");
      return null;
    }

    if (!body.score) {
      console.error("[attemptService] create score API returned no score row.");
      return null;
    }

    return normalizeScoreRow(body.score);
  } catch (error) {
    console.error("[attemptService] create score API request failed:", error);
    return null;
  }
}

async function createLegacyAttempt(payload: LegacyAttemptPayload): Promise<ExamScore | null> {
  const { data, error } = await supabase
    .from(LEGACY_ATTEMPT_TABLE)
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error("[attemptService] create legacy attempt error:", error.message);
    return null;
  }

  if (!data) return null;
  return normalizeScoreRow(data as Record<string, unknown>);
}

/** Insert a new scan attempt/score and return it. */
export async function createAttempt(payload: CreateAttemptPayload): Promise<ExamScore | null> {
  if (isScoreCreatePayload(payload)) {
    const created = await createScoreViaApi(payload);
    if (created) return created;
  }

  if ("exam_id" in payload) {
    return createLegacyAttempt(payload);
  }

  return null;
}

function normalizeScoreRows(rows: Record<string, unknown>[]): ExamScore[] {
  return sortScoresNewestFirst(rows.map(normalizeScoreRow));
}

async function fetchScoresForExamViaAssignments(examId: number): Promise<ExamScore[] | null> {
  const { data: assignments, error: assignmentError } = await supabase
    .from("exam_assignments")
    .select("id")
    .eq("exam_id", examId);

  if (assignmentError) {
    console.error("[attemptService] fetch assignments for scores failed:", assignmentError.message);
    return null;
  }

  const assignmentIds = ((assignments ?? []) as { id: number }[]).map((a) => a.id);
  if (assignmentIds.length === 0) return [];

  const selectCandidates = [
    "score_id, enrollment_id, exam_assignment_id, responses, calculated_score, graded_at, enrollments!left(students!left(full_name))",
    "score_id, enrollment_id, exam_assignment_id, responses, calculated_score, graded_at, enrollments(students(full_name))",
    "score_id, enrollment_id, exam_assignment_id, responses, calculated_score, graded_at",
  ];

  for (const selectClause of selectCandidates) {
    const { data, error } = await supabase
      .from("scores")
      .select(selectClause)
      .in("exam_assignment_id", assignmentIds)
      .order("graded_at", { ascending: false });

    if (!error) {
      return normalizeScoreRows((data ?? []) as Record<string, unknown>[]);
    }

    if (!isMissingResourceError(error.message)) {
      console.error("[attemptService] fetch scores failed:", error.message);
      return [];
    }
  }

  return [];
}

async function fetchLegacyAttemptsForExam(examId: number): Promise<ExamScore[]> {
  const { data, error } = await supabase
    .from(LEGACY_ATTEMPT_TABLE)
    .select("*")
    .eq("exam_id", examId)
    .order("scanned_at", { ascending: false });

  if (error) {
    if (!isMissingResourceError(error.message)) {
      console.error("[attemptService] fetch legacy attempts failed:", error.message);
    }
    return [];
  }

  return normalizeScoreRows((data ?? []) as Record<string, unknown>[]);
}

/** Fetch all attempts/scores for an exam, newest first. */
export async function fetchAttemptsForExam(examId: number): Promise<ExamScore[]> {
  const modernScores = await fetchScoresForExamViaAssignments(examId);
  if (modernScores !== null) return modernScores;

  return fetchLegacyAttemptsForExam(examId);
}

/** Delete a single score/attempt by ID. */
export async function deleteAttempt(attemptId: number): Promise<boolean> {
  const { error: scoreError } = await supabase
    .from("scores")
    .delete()
    .eq("score_id", attemptId);

  if (!scoreError) return true;

  if (!isMissingResourceError(scoreError.message)) {
    console.error("[attemptService] delete score error:", scoreError.message);
    return false;
  }

  const legacyIdColumns = ["attempt_id", "id"] as const;
  for (const idCol of legacyIdColumns) {
    const { error } = await supabase
      .from(LEGACY_ATTEMPT_TABLE)
      .delete()
      .eq(idCol, attemptId);

    if (!error) return true;
    if (!isMissingResourceError(error.message)) {
      console.error(`[attemptService] delete legacy attempt error (${idCol}):`, error.message);
      return false;
    }
  }

  return false;
}

/**
 * Given a map of assignmentId -> examId, returns exam IDs
 * that have at least one saved score.
 */
export async function fetchExamIdsWithScores(
  assignmentIdToExamId: Map<number, number>
): Promise<Set<number>> {
  const assignmentIds = Array.from(assignmentIdToExamId.keys());
  const result = new Set<number>();

  if (assignmentIds.length === 0) return result;

  const { data, error } = await supabase
    .from("scores")
    .select("exam_assignment_id")
    .in("exam_assignment_id", assignmentIds);

  if (error) {
    if (!isMissingResourceError(error.message)) {
      console.error("[attemptService] fetchExamIdsWithScores failed:", error.message);
    }
    return result;
  }

  for (const row of data ?? []) {
    const examId = assignmentIdToExamId.get(row.exam_assignment_id);
    if (examId != null) result.add(examId);
  }

  return result;
}

/**
 * Scores a response set against the stored answer key.
 * Returns the number of correct answers.
 */
export function scoreResponses(
  responses: { [item: number]: string },
  answerKey: { [item: number]: string | null }
): number {
  let score = 0;
  for (const [itemStr, response] of Object.entries(responses)) {
    const item = parseInt(itemStr, 10);
    if (answerKey[item] && response === answerKey[item]) score++;
  }
  return score;
}
