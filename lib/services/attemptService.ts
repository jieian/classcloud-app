/**
 * attemptService.ts
 * CRUD operations for the public.scores table.
 */

import { supabase } from '@/lib/exam-supabase';
import type { ExamScore } from '@/lib/exam-supabase';

export type CreateScorePayload = {
  enrollment_id: number;
  exam_assignment_id: number;
  responses: { [item: number]: string };
  calculated_score: number;
};

/** Insert a new score row and return it. */
export async function createAttempt(payload: CreateScorePayload): Promise<ExamScore | null> {
  const response = await fetch("/api/exams/scores/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let message = "Failed to create score attempt";
    try {
      const json = (await response.json()) as { error?: string };
      if (json.error) message = json.error;
    } catch {
      // Keep fallback message when response is not JSON.
    }
    console.error("[attemptService] createAttempt error:", message);
    return null;
  }

  const json = (await response.json()) as { score: ExamScore };
  return json.score;
}

/** Fetch all scores for an exam (via exam_assignments), newest first. */
export async function fetchAttemptsForExam(examId: number): Promise<ExamScore[]> {
  // First resolve all exam_assignment_ids for this exam
  const { data: assignments, error: assignErr } = await supabase
    .from('exam_assignments')
    .select('id')
    .eq('exam_id', examId);

  if (assignErr) {
    console.error('[attemptService] fetchAttemptsForExam assignments error:', assignErr.message);
    return [];
  }

  const assignmentIds = (assignments ?? []).map((a: { id: number }) => a.id);
  if (assignmentIds.length === 0) return [];

  const { data, error } = await supabase
    .from('scores')
    .select('score_id, enrollment_id, exam_assignment_id, responses, calculated_score, graded_at, enrollments(students(full_name))')
    .in('exam_assignment_id', assignmentIds)
    .order('graded_at', { ascending: false });

  if (error) {
    console.error('[attemptService] fetchAttemptsForExam error:', error.message);
    return [];
  }
  return ((data ?? []) as unknown[]).map((row: unknown) => {
    const r = row as Record<string, unknown>;
    const enrollment = r.enrollments as Record<string, unknown> | null;
    const student = enrollment?.students as Record<string, unknown> | null;
    return {
      score_id: r.score_id,
      enrollment_id: r.enrollment_id,
      exam_assignment_id: r.exam_assignment_id,
      responses: r.responses,
      calculated_score: r.calculated_score,
      graded_at: r.graded_at,
      student_name: (student?.full_name as string) ?? null,
    } as ExamScore;
  });
}

/**
 * Given a map of { assignmentId → examId }, returns the set of examIds
 * that have at least one score row. Used to enable/disable "Review Papers".
 */
export async function fetchExamIdsWithScores(
  assignmentIdToExamId: Map<number, number>
): Promise<Set<number>> {
  const assignmentIds = [...assignmentIdToExamId.keys()];
  if (assignmentIds.length === 0) return new Set();

  const { data, error } = await supabase
    .from('scores')
    .select('exam_assignment_id')
    .in('exam_assignment_id', assignmentIds);

  if (error) {
    console.error('[attemptService] fetchExamIdsWithScores error:', error.message);
    return new Set();
  }

  const result = new Set<number>();
  for (const row of (data ?? []) as { exam_assignment_id: number }[]) {
    const examId = assignmentIdToExamId.get(row.exam_assignment_id);
    if (examId !== undefined) result.add(examId);
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
    const item = parseInt(itemStr);
    if (answerKey[item] && response === answerKey[item]) score++;
  }
  return score;
}
