/**
 * examService.ts
 * All database interactions for public.exams and public.exam_assignments.
 */
import { supabase, ExamWithRelations, AnswerKeyJsonb } from '@/lib/exam-supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export type CreateExamPayload = {
  title: string;
  total_items: number;
  exam_date: string;
  description?: string | null;
  subject_id?: number | null;
  quarter_id?: number | null;
  creator_teacher_id?: string | null;
  is_locked?: boolean;
};

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function fetchExamsWithRelations(): Promise<ExamWithRelations[]> {
  const { data, error } = await supabase
    .from('exams')
    .select(`
      *,
      subjects ( name, code ),
      quarters ( name ),
      exam_assignments (
        id,
        sections (
          section_id,
          name,
          grade_levels ( display_name )
        )
      )
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[examService] fetchExamsWithRelations error:', error.message);
    return [];
  }
  return (data as ExamWithRelations[]) ?? [];
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createExamWithAssignments(
  payload: CreateExamPayload,
  sectionIds: number[]
): Promise<number | null> {
  const res = await fetch('/api/exams/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload, sectionIds }),
  });

  if (!res.ok) {
    const { error } = await res.json();
    console.error('[examService] createExamWithAssignments error:', error);
    return null;
  }

  const { exam_id } = await res.json();
  return exam_id ?? null;
}


// ─── Update ───────────────────────────────────────────────────────────────────

export async function saveAnswerKey(examId: number, answerKey: AnswerKeyJsonb): Promise<boolean> {
  const res = await fetch('/api/exams/answer-key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ examId, answerKey }),
  });

  if (!res.ok) {
    const payload = await res.json().catch(() => ({ error: 'Unknown error' }));
    console.error('[examService] saveAnswerKey error:', payload?.error ?? 'Unknown error');
    return false;
  }

  return true;
}

export async function setExamLocked(examId: number, isLocked: boolean): Promise<boolean> {
  const { data, error } = await supabase
    .from('exams')
    .update({ is_locked: isLocked })
    .eq('exam_id', examId)
    .select('exam_id, is_locked')
    .maybeSingle();

  if (error) {
    console.error('[examService] setExamLocked error:', error.message);
    return false;
  }
  if (!data || data.is_locked !== isLocked) {
    console.error('[examService] setExamLocked no row updated or stale value for exam_id:', examId);
    return false;
  }
  return true;
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteExamWithAssignments(examId: number): Promise<boolean> {
  await supabase.from('exam_assignments').delete().eq('exam_id', examId);
  const { error } = await supabase.from('exams').delete().eq('exam_id', examId);
  if (error) { console.error('[examService] deleteExam error:', error.message); return false; }
  return true;
}
