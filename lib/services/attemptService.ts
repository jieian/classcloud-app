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

type ApiJson = Record<string, unknown>;
type ParsedResponsePayload = {
  json: unknown;
  rawText: string | null;
};

async function readResponsePayload(
  response: Response,
): Promise<ParsedResponsePayload> {
  const rawText = await response.text();
  if (!rawText) return { json: null, rawText: null };

  try {
    return { json: JSON.parse(rawText), rawText };
  } catch {
    return { json: null, rawText };
  }
}

function asApiJson(payload: unknown): ApiJson {
  return payload && typeof payload === "object" ? (payload as ApiJson) : {};
}

function getErrorMessageFromPayload(
  parsed: ParsedResponsePayload,
  fallback: string,
): string {
  const payload = asApiJson(parsed.json);
  const error = payload.error;
  if (typeof error === "string" && error.trim()) return error;

  const message = payload.message;
  if (typeof message === "string" && message.trim()) return message;

  if (parsed.rawText && parsed.rawText.trim()) {
    return parsed.rawText.slice(0, 200);
  }

  return fallback;
}

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
    const parsed = await readResponsePayload(response);
    const body = asApiJson(parsed.json);

    if (!response.ok) {
      console.error(
        "[attemptService] create score API error:",
        getErrorMessageFromPayload(parsed, "Unknown error"),
      );
      return null;
    }

    if (!body.score || typeof body.score !== "object") {
      console.error("[attemptService] create score API returned no score row.");
      return null;
    }

    return normalizeScoreRow(body.score as Record<string, unknown>);
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
  // Scores are service-role-only (audit #17); read them through the
  // section-authorized server route instead of PostgREST.
  try {
    const res = await fetch(`/api/exams/${examId}/scores`);
    if (res.ok) {
      const { scores } = (await res.json()) as { scores?: Record<string, unknown>[] };
      return normalizeScoreRows(scores ?? []);
    }
    // No access to this exam → no scores (and no legacy fallback).
    if (res.status === 403) return [];
    // Other errors → null so fetchAttemptsForExam can try the legacy table.
    return null;
  } catch (error) {
    console.error("[attemptService] fetch scores request failed:", error);
    return null;
  }
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
  try {
    const response = await fetch("/api/exams/scores/delete", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scoreId: attemptId }),
    });
    if (response.ok) return true;
    const body = await response.json().catch(() => ({})) as { error?: string };
    console.error("[attemptService] delete score API error:", body.error ?? response.statusText);
    return false;
  } catch (error) {
    console.error("[attemptService] delete score request failed:", error);
    return false;
  }
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

  // Scores are service-role-only (audit #17); ask the section-authorized route
  // which of these assignments have scores.
  try {
    const res = await fetch("/api/exams/scores/exists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignmentIds }),
    });
    if (!res.ok) return result;
    const { withScores } = (await res.json()) as { withScores?: number[] };
    for (const assignmentId of withScores ?? []) {
      const examId = assignmentIdToExamId.get(assignmentId);
      if (examId != null) result.add(examId);
    }
  } catch (error) {
    console.error("[attemptService] fetchExamIdsWithScores request failed:", error);
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
