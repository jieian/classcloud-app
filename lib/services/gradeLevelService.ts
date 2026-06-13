/**
 * gradeLevelService.ts
 * Fetches grade levels via the cached /api/grade-levels route (Next.js data
 * cache, tag: grade-levels) instead of a browser-direct PostgREST read.
 */
import { GradeLevel } from '@/lib/exam-supabase';

export async function fetchGradeLevels(): Promise<GradeLevel[]> {
  try {
    const res = await fetch('/api/grade-levels');
    if (!res.ok) {
      console.error('[gradeLevelService] fetchGradeLevels HTTP', res.status);
      return [];
    }
    const data = await res.json();
    return (data?.gradeLevels as GradeLevel[]) ?? [];
  } catch (err) {
    console.error('[gradeLevelService] fetchGradeLevels error:', err);
    return [];
  }
}
