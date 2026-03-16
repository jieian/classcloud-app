import { supabase } from '@/lib/exam-supabase';
import type { ExamAttempt } from '@/lib/exam-supabase';

export type CreateAttemptPayload = {
  exam_id: number;
  student_lrn?: string | null;
  student_name?: string | null;
  enrollment_id?: number | null;
  section_id?: number | null;
  responses: { [item: number]: string };
  score: number;
  total_items: number;
};

const ATTEMPT_TABLES = ['exam_attempts', 'scores'] as const;

function isMissingResourceError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('could not find the table') ||
    m.includes('does not exist') ||
    m.includes('schema cache') ||
    m.includes('could not find the column') ||
    m.includes('column') // catches "column scores.exam_id does not exist"
  );
}

function normalizeAttemptRow(row: Record<string, unknown>, examIdFallback: number): ExamAttempt {
  return {
    attempt_id: Number(row.attempt_id ?? row.score_id ?? row.id ?? 0),
    exam_id: Number(row.exam_id ?? examIdFallback),
    student_lrn: (row.student_lrn ?? row.lrn ?? null) as string | null,
    student_name: (row.student_name ?? row.full_name ?? null) as string | null,
    enrollment_id: (row.enrollment_id ?? null) as number | null,
    section_id: (row.section_id ?? null) as number | null,
    responses: ((row.responses ?? row.answers ?? {}) as { [item: number]: string }) ?? {},
    score: Number(row.score ?? 0),
    total_items: Number(row.total_items ?? 0),
    scanned_at: (row.scanned_at ?? row.created_at ?? new Date(0).toISOString()) as string,
  };
}

function sortAttemptsNewestFirst(attempts: ExamAttempt[]): ExamAttempt[] {
  return attempts.sort((a, b) => {
    const ta = new Date(a.scanned_at).getTime();
    const tb = new Date(b.scanned_at).getTime();
    return tb - ta;
  });
}

/** Insert a new attempt and return it. */
export async function createAttempt(payload: CreateAttemptPayload): Promise<ExamAttempt | null> {
  let lastError: string | null = null;

  for (const table of ATTEMPT_TABLES) {
    const { data, error } = await supabase
      .from(table)
      .insert(payload)
      .select()
      .single();

    if (!error && data) {
      return normalizeAttemptRow(data as Record<string, unknown>, payload.exam_id);
    }

    if (!error) continue;
    lastError = error.message;
    if (!isMissingResourceError(error.message)) {
      console.error(`[attemptService] createAttempt error (${table}):`, error.message);
      return null;
    }
  }

  if (lastError) {
    console.error('[attemptService] createAttempt error:', lastError);
  }
  return null;
}

/** Fetch all attempts for an exam, newest first. */
export async function fetchAttemptsForExam(examId: number): Promise<ExamAttempt[]> {
  let lastError: string | null = null;

  for (const table of ATTEMPT_TABLES) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('exam_id', examId);

    if (!error) {
      const attempts = ((data ?? []) as Record<string, unknown>[])
        .map((row) => normalizeAttemptRow(row, examId));
      return sortAttemptsNewestFirst(attempts);
    }

    lastError = error.message;
    if (!isMissingResourceError(error.message)) {
      console.error(`[attemptService] fetchAttemptsForExam error (${table}):`, error.message);
      return [];
    }
  }

  if (lastError) {
    console.error('[attemptService] fetchAttemptsForExam error:', lastError);
  }
  return [];
}

/** Delete a single attempt by ID. */
export async function deleteAttempt(attemptId: number): Promise<boolean> {
  for (const table of ATTEMPT_TABLES) {
    const idColumns = ['attempt_id', 'score_id', 'id'];
    for (const idCol of idColumns) {
      const { error } = await supabase
        .from(table)
        .delete()
        .eq(idCol, attemptId);

      if (!error) return true;
      if (!isMissingResourceError(error.message)) {
        console.error(`[attemptService] deleteAttempt error (${table}.${idCol}):`, error.message);
        return false;
      }
    }
  }
  return false;
}

/**
 * Given a map of assignmentId → examId, returns the Set of examIds
 * that have at least one saved attempt/score.
 */
export async function fetchExamIdsWithScores(
  assignmentIdToExamId: Map<number, number>
): Promise<Set<number>> {
  const examIds = Array.from(new Set(assignmentIdToExamId.values()));
  if (examIds.length === 0) return new Set();

  const result = new Set<number>();

  for (const table of ATTEMPT_TABLES) {
    const { data, error } = await supabase
      .from(table)
      .select('exam_id')
      .in('exam_id', examIds);

    if (!error && data) {
      for (const row of data as { exam_id: number }[]) {
        result.add(row.exam_id);
      }
      return result;
    }

    if (error && !isMissingResourceError(error.message)) {
      console.error(`[attemptService] fetchExamIdsWithScores error (${table}):`, error.message);
      return result;
    }
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
