/**
 * gradeLevelService.ts
 * Fetches grade levels from public.grade_levels.
 */
import { supabase, GradeLevel } from '@/lib/exam-supabase';

export async function fetchGradeLevels(): Promise<GradeLevel[]> {
  const { data, error } = await supabase
    .from('grade_levels')
    .select('*')
    .order('level_number', { ascending: true });

  if (error) {
    console.error('[gradeLevelService] fetchGradeLevels error:', error.message);
    return [];
  }
  return data ?? [];
}
