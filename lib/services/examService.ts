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
  skipSectionSuffix?: boolean;
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

async function fetchActiveQuarterId(): Promise<number | null> {
  const { data, error } = await supabase
    .from('quarters')
    .select('quarter_id')
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    console.error('[examService] active quarter lookup error:', error.message);
    return null;
  }

  const qId = (data as { quarter_id?: number } | null)?.quarter_id;
  return typeof qId === 'number' ? qId : null;
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function fetchExamsWithRelations(
  sectionIds?: number[],
  activeContext?: { activeSyId: number | null; activeQuarterId: number | null },
): Promise<ExamWithRelations[]> {
  // Exams are isolated per active Term. Prefer the active SY/quarter the server
  // already resolved (passed in from initialData) to avoid two redundant
  // browser-direct round-trips on every load and refetch.
  // No active quarter → no exams are shown (creation is also blocked without an active term).
  let activeSyId: number | null;
  let activeQuarterId: number | null;
  if (activeContext) {
    activeSyId = activeContext.activeSyId;
    activeQuarterId = activeContext.activeQuarterId;
  } else {
    [activeSyId, activeQuarterId] = await Promise.all([
      fetchActiveSchoolYearId(),
      fetchActiveQuarterId(),
    ]);
  }

  if (!activeQuarterId) return [];

  // Faculty/restricted view: filter to exams assigned to the teacher's sections.
  // Empty array means the user has no assigned sections — return nothing.
  if (sectionIds !== undefined && sectionIds.length === 0) {
    return [];
  }

  // When scoping to a teacher's sections, use an inner join so PostgREST drops
  // exams with no matching assignment at the DB instead of shipping the whole
  // quarter's exam table and filtering it out client-side.
  const scoped = sectionIds !== undefined && sectionIds.length > 0;
  const assignmentEmbed = scoped ? 'exam_assignments!inner' : 'exam_assignments';

  // answer_key/objectives are intentionally omitted here — they are heavy JSONB
  // only needed on demand (answer-sheet download, view-details, copy) and are
  // fetched per-exam via fetchExamGradingData() to keep the list payload small.
  let query = supabase
    .from('exams')
    .select(`
      exam_id, title, total_items, exam_date, is_locked,
      creator_teacher_id, quarter_id, curriculum_subject_id, created_at,
      creator_user:users!creator_teacher_id ( first_name, last_name ),
      curriculum_subjects ( subject_id, subjects ( name, code, subject_type ) ),
      quarters ( name ),
      ${assignmentEmbed} (
        id,
        sections (
          section_id,
          name,
          sy_id,
          grade_level_id,
          grade_levels ( display_name, level_number )
        )
      )
    `)
    .is('deleted_at', null)
    .eq('quarter_id', activeQuarterId)
    .order('created_at', { ascending: false });

  if (scoped) {
    // Push the section filter into the join so Supabase resolves it in a single query
    // instead of a pre-fetch of exam IDs followed by a second round-trip.
    query = query.in('exam_assignments.section_id', sectionIds);
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
      creator_user:users!creator_teacher_id ( first_name, last_name ),
      curriculum_subjects ( subject_id, subjects ( name, code, subject_type ) ),
      quarters ( name ),
      exam_assignments (
        id,
        sections (
          section_id,
          name,
          grade_level_id,
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

/**
 * Fetches only the heavy grading JSONB (answer_key + objectives) for a single
 * exam. These are omitted from the list query and loaded on demand by the
 * answer-sheet download, view-details modal, and copy modal.
 */
export async function fetchExamGradingData(
  examId: number,
): Promise<{ answer_key: AnswerKeyJsonb | null; objectives: LearningObjective[] | null } | null> {
  const { data, error } = await supabase
    .from('exams')
    .select('answer_key, objectives')
    .eq('exam_id', examId)
    .is('deleted_at', null)
    .single();

  if (error) {
    console.error('[examService] fetchExamGradingData error:', error.message);
    return null;
  }

  return data as { answer_key: AnswerKeyJsonb | null; objectives: LearningObjective[] | null };
}

// ─── Duplicate check ──────────────────────────────────────────────────────────

export async function checkOccupiedSubjects(
  sectionIds: number[],
  quarterId: number,
): Promise<Set<number>> {
  if (sectionIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from('exam_assignments')
    .select('exams!inner(curriculum_subject_id, quarter_id, deleted_at)')
    .in('section_id', sectionIds)
    .eq('exams.quarter_id', quarterId)
    .is('exams.deleted_at', null);
  if (error) return new Set();
  return new Set(
    (data ?? []).map((row: unknown) => (row as { exams: { curriculum_subject_id: number } }).exams.curriculum_subject_id)
  );
}

export async function fetchOccupiedSectionSubjectPairs(
  quarterId: number,
): Promise<Map<number, Set<number>>> {
  const { data, error } = await supabase
    .from('exam_assignments')
    .select('section_id, exams!inner(curriculum_subject_id, quarter_id, deleted_at)')
    .eq('exams.quarter_id', quarterId)
    .is('exams.deleted_at', null)
    .limit(2000);

  if (error) return new Map();

  const result = new Map<number, Set<number>>();
  for (const row of (data ?? [])) {
    const r = row as { section_id: number; exams: { curriculum_subject_id: number } };
    if (!result.has(r.section_id)) result.set(r.section_id, new Set());
    result.get(r.section_id)!.add(r.exams.curriculum_subject_id);
  }
  return result;
}

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


// ─── Duplicate check (client-side, used in copy flow) ────────────────────────

export async function checkDuplicateExamSections(
  sectionIds: number[],
  curriculumSubjectId: number,
  quarterId: number,
): Promise<Set<number>> {
  if (sectionIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from("exam_assignments")
    .select("section_id, exams!inner(curriculum_subject_id, quarter_id, deleted_at)")
    .in("section_id", sectionIds)
    .eq("exams.curriculum_subject_id", curriculumSubjectId)
    .eq("exams.quarter_id", quarterId)
    .is("exams.deleted_at", null);

  if (error) return new Set();
  return new Set((data ?? []).map((row: any) => row.section_id as number));
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
  // The exams table is SELECT-only for the authenticated role under RLS, so the
  // write goes through the service-role route rather than a browser-direct UPDATE
  // (which RLS silently denies).
  const res = await fetch('/api/exams/lock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ exam_id: examId, is_locked: isLocked }),
  });
  const parsed = await readResponsePayload(res);

  if (!res.ok) {
    console.error(
      '[examService] setExamLocked error:',
      getErrorMessageFromPayload(parsed, 'Unknown error'),
    );
    return false;
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
