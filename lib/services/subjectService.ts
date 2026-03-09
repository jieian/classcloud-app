/**
 * subjectService.ts
 * Fetches subjects from public.subjects table.
 */
import { supabase, Subject } from '@/lib/exam-supabase';

export async function fetchSubjects(): Promise<Subject[]> {
  const { data, error } = await supabase
    .from('subjects')
    .select('*')
    .order('name', { ascending: true });

  if (error) {
    console.error('[subjectService] fetchSubjects error:', error.message);
    return [];
  }
  return data ?? [];
}

export interface SubjectWithGradeLevel extends Subject {
  grade_level_id: number;
}

export async function fetchSubjectsWithGradeLevels(): Promise<SubjectWithGradeLevel[]> {
  const { data, error } = await supabase
    .from('subject_grade_levels')
    .select('grade_level_id, subjects(subject_id, name, code)')
    .is('deleted_at', null);

  if (error) {
    console.error('[subjectService] fetchSubjectsWithGradeLevels error:', error.message);
    return [];
  }

  return ((data ?? []) as any[]).flatMap((row: any) => {
    const s = row.subjects;
    if (!s) return [];
    const subjects = Array.isArray(s) ? s : [s];
    return subjects.map((sub: any) => ({
      subject_id: sub.subject_id,
      name: sub.name,
      code: sub.code,
      grade_level_id: row.grade_level_id,
    }));
  });
}
