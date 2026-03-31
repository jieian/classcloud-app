/**
 * subjectService.ts
 * Fetches subjects from the active curriculum for use in exam creation.
 */
import { supabase, Subject } from '@/lib/exam-supabase';

export interface SubjectWithGradeLevel extends Subject {
  curriculum_subject_id: number;
  grade_level_id: number;
  /** 'BOTH' = applies to all sections; 'SSES' = SSES sections only */
  subject_type: 'BOTH' | 'SSES';
}

export async function fetchSubjectsWithGradeLevels(): Promise<SubjectWithGradeLevel[]> {
  // Round 1: resolve the active curriculum — single-row fetch
  const { data: sy, error: syErr } = await supabase
    .from('school_years')
    .select('curriculum_id')
    .eq('is_active', true)
    .is('deleted_at', null)
    .maybeSingle();

  if (syErr) {
    console.error('[subjectService] fetchSubjectsWithGradeLevels sy error:', syErr.message);
    return [];
  }

  const curriculumId = (sy as any)?.curriculum_id as number | null;
  if (!curriculumId) return [];

  // Round 2: all subjects for that curriculum in one query via inner join
  const { data, error } = await supabase
    .from('curriculum_subjects')
    .select('curriculum_subject_id, grade_level_id, subjects!inner(subject_id, name, code, subject_type, deleted_at)')
    .eq('curriculum_id', curriculumId)
    .is('deleted_at', null);

  if (error) {
    console.error('[subjectService] fetchSubjectsWithGradeLevels error:', error.message);
    return [];
  }

  return ((data ?? []) as any[]).flatMap((row: any) => {
    const sub = row.subjects;
    if (!sub || sub.deleted_at !== null) return [];
    return [{
      curriculum_subject_id: row.curriculum_subject_id as number,
      subject_id: sub.subject_id as number,
      name: sub.name as string,
      code: sub.code as string,
      grade_level_id: row.grade_level_id as number,
      subject_type: sub.subject_type as 'BOTH' | 'SSES',
    }];
  });
}
