/**
 * subjectService.ts
 * Fetches active-curriculum subjects via the cached /api/subjects/active route
 * (Next.js data cache, tags: subjects + active-context) instead of a
 * browser-direct PostgREST read.
 */
import type { Subject } from '@/lib/exam-supabase';

export interface SubjectWithGradeLevel extends Subject {
  curriculum_subject_id: number;
  grade_level_id: number;
  /** 'BOTH' = applies to all sections; 'SSES' = SSES sections only */
  subject_type: 'BOTH' | 'SSES';
}

export async function fetchSubjectsWithGradeLevels(): Promise<SubjectWithGradeLevel[]> {
  try {
    const res = await fetch('/api/subjects/active');
    if (!res.ok) {
      console.error('[subjectService] fetchSubjectsWithGradeLevels HTTP', res.status);
      return [];
    }
    const data = await res.json();
    return (data?.subjects as SubjectWithGradeLevel[]) ?? [];
  } catch (err) {
    console.error('[subjectService] fetchSubjectsWithGradeLevels error:', err);
    return [];
  }
}
