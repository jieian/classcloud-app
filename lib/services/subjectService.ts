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
