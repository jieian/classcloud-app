/**
 * examService.ts
 * All database interactions for public.exams and public.exam_assignments.
 */
import { supabase, ExamWithRelations, AnswerKeyJsonb, LearningObjective } from '@/lib/exam-supabase';

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

// ─── Types ────────────────────────────────────────────────────────────────────

export type CreateExamPayload = {
  title: string;
  titleSuffix?: string;
  total_items: number;
  exam_date: string;
  description?: string | null;
  curriculum_subject_id: number;
  quarter_id?: number | null;
  creator_teacher_id?: string | null;
  is_locked?: boolean;
};

async function fetchActiveSchoolYearId(): Promise<number | null> {
  const { data, error } = await supabase
    .from('school_years')
    .select('sy_id')
    .eq('is_active', true)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    console.error('[examService] active school year lookup error:', error.message);
    return null;
  }

  const syId = (data as { sy_id?: number } | null)?.sy_id;
  return typeof syId === 'number' ? syId : null;
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function fetchExamsWithRelations(teacherId?: string): Promise<ExamWithRelations[]> {
  // Fetch the active SY for optional filtering, but never block exam visibility when it's absent.
  // Exams belong to sections permanently — toggling a school year's active status must not
  // cause previously created exams to disappear.
  const activeSyId = await fetchActiveSchoolYearId();

  let query = supabase
    .from('exams')
    .select(`
      exam_id, title, total_items, exam_date, is_locked,
      creator_teacher_id, quarter_id, curriculum_subject_id, created_at,
      answer_key, objectives,
      curriculum_subjects ( subject_id, subjects ( name, code ) ),
      quarters ( name ),
      exam_assignments (
        id,
        sections (
          section_id,
          name,
          sy_id,
          grade_levels ( display_name, level_number )
        )
      )
    `)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (teacherId) {
    query = query.eq('creator_teacher_id', teacherId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[examService] fetchExamsWithRelations error:', error.message);
    return [];
  }

  const exams = (data as ExamWithRelations[]) ?? [];

  // When an active school year is known, show only that year's exams.
  // When none is active (SY closed), show all exams so teachers don't lose access to their work.
  if (!activeSyId) {
    return exams.filter((exam) => (exam.exam_assignments ?? []).length > 0);
  }

  return exams
    .map((exam) => ({
      ...exam,
      exam_assignments: (exam.exam_assignments ?? []).filter(
        (assignment) => assignment.sections?.sy_id === activeSyId,
      ),
    }))
    .filter((exam) => exam.exam_assignments.length > 0);
}

export async function fetchExamById(examId: number): Promise<ExamWithRelations | null> {
  const { data, error } = await supabase
    .from('exams')
    .select(`
      *,
      curriculum_subjects ( subject_id, subjects ( name, code ) ),
      quarters ( name ),
      exam_assignments (
        id,
        sections (
          section_id,
          name,
          grade_levels ( display_name, level_number )
        )
      )
    `)
    .eq('exam_id', examId)
    .is('deleted_at', null)
    .single();

  if (error) {
    console.error('[examService] fetchExamById error:', error.message);
    return null;
  }
  return data as ExamWithRelations;
}

// ─── Duplicate check ──────────────────────────────────────────────────────────

export async function checkExamDuplicates(
  sectionIds: number[],
  curriculumSubjectId: number,
  quarterId: number,
): Promise<number[]> {
  if (sectionIds.length === 0) return [];

  const { data, error } = await supabase
    .from('exam_assignments')
    .select('section_id, exams!inner(curriculum_subject_id, quarter_id, deleted_at)')
    .in('section_id', sectionIds)
    .eq('exams.curriculum_subject_id', curriculumSubjectId)
    .eq('exams.quarter_id', quarterId)
    .is('exams.deleted_at', null);

  if (error) {
    console.error('[examService] checkExamDuplicates error:', error.message);
    return [];
  }

  return (data ?? []).map((row: unknown) => (row as { section_id: number }).section_id);
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createExamWithAssignments(
  payload: CreateExamPayload,
  sectionIds: number[]
): Promise<{ exam_ids: number[] }> {
  const res = await fetch('/api/exams/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload, sectionIds }),
  });
  const parsed = await readResponsePayload(res);
  const body = asApiJson(parsed.json);

  if (!res.ok) {
    const errorMessage = getErrorMessageFromPayload(parsed, 'Failed to create exam');
    console.error('[examService] createExamWithAssignments error:', errorMessage);
    throw new Error(errorMessage);
  }

  if (!Array.isArray(body.exam_ids) || body.exam_ids.length === 0) {
    throw new Error("Invalid response while creating exam.");
  }

  return body as { exam_ids: number[] };
}


// ─── Update ───────────────────────────────────────────────────────────────────

export async function saveAnswerKey(examId: number, answerKey: AnswerKeyJsonb): Promise<boolean> {
  const res = await fetch('/api/exams/answer-key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ examId, answerKey }),
  });
  const parsed = await readResponsePayload(res);

  if (!res.ok) {
    console.error(
      '[examService] saveAnswerKey error:',
      getErrorMessageFromPayload(parsed, 'Unknown error'),
    );
    return false;
  }

  return true;
}

export async function saveObjectives(examId: number, objectives: LearningObjective[]): Promise<boolean> {
  const res = await fetch('/api/exams/objectives', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ examId, objectives }),
  });
  const parsed = await readResponsePayload(res);

  if (!res.ok) {
    console.error(
      '[examService] saveObjectives error:',
      getErrorMessageFromPayload(parsed, 'Unknown error'),
    );
    return false;
  }

  return true;
}

export async function setExamLocked(examId: number, isLocked: boolean): Promise<boolean> {
  const { data, error, count } = await supabase
    .from('exams')
    .update({ is_locked: isLocked })
    .eq('exam_id', examId)
    .select('exam_id, is_locked', { count: 'exact' });

  if (error) {
    console.error('[examService] setExamLocked error:', error.message);
    return false;
  }

  // Definitive failure: no rows matched the update filter.
  if (count === 0) {
    console.error('[examService] setExamLocked no matching exam row for exam_id:', examId);
    return false;
  }

  // If rows are returned, verify value.
  if (Array.isArray(data) && data.length > 0) {
    const row = data[0];
    if (row?.is_locked !== isLocked) {
      console.error('[examService] setExamLocked stale returned value for exam_id:', examId);
      return false;
    }
  }

  // Some RLS/select-return combinations can produce null/empty data with successful update.
  if (!data || (Array.isArray(data) && data.length === 0)) {
    console.warn('[examService] setExamLocked update succeeded but no row data returned for exam_id:', examId);
  }

  return true;
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteExamWithAssignments(examId: number): Promise<boolean> {
  const res = await fetch('/api/exams/delete', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ exam_id: examId }),
  });
  const parsed = await readResponsePayload(res);

  if (!res.ok) {
    console.error(
      '[examService] deleteExam error:',
      getErrorMessageFromPayload(parsed, 'Unknown error'),
    );
    return false;
  }

  return true;
}
