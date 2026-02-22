/**
 * attemptService.ts
 * Supabase CRUD operations for the exam_attempts table.
 */

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

/** Insert a new attempt and return it. */
export async function createAttempt(payload: CreateAttemptPayload): Promise<ExamAttempt | null> {
  const { data, error } = await supabase
    .from('exam_attempts')
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error('[attemptService] createAttempt error:', error.message);
    return null;
  }
  return data;
}

/** Fetch all attempts for an exam, newest first. */
export async function fetchAttemptsForExam(examId: number): Promise<ExamAttempt[]> {
  const { data, error } = await supabase
    .from('exam_attempts')
    .select('*')
    .eq('exam_id', examId)
    .order('scanned_at', { ascending: false });

  if (error) {
    console.error('[attemptService] fetchAttemptsForExam error:', error.message);
    return [];
  }
  return data ?? [];
}

/** Delete a single attempt by ID. */
export async function deleteAttempt(attemptId: number): Promise<boolean> {
  const { error } = await supabase
    .from('exam_attempts')
    .delete()
    .eq('attempt_id', attemptId);

  if (error) {
    console.error('[attemptService] deleteAttempt error:', error.message);
    return false;
  }
  return true;
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
