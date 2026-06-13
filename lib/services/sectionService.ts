/**
 * sectionService.ts
 * Fetches active-school-year sections via the cached /api/sections/active route
 * (Next.js data cache, tags: sections + active-context) instead of a
 * browser-direct PostgREST read.
 */
import type { Section } from '@/lib/exam-supabase';

/**
 * Fetches all sections for the active school year, joined with grade_levels.
 * Falls back to all sections if no active school year is found (server-side).
 */
export async function fetchActiveSections(): Promise<Section[]> {
  try {
    const res = await fetch('/api/sections/active');
    if (!res.ok) {
      console.error('[sectionService] fetchActiveSections HTTP', res.status);
      return [];
    }
    const data = await res.json();
    return (data?.sections as Section[]) ?? [];
  } catch (err) {
    console.error('[sectionService] fetchActiveSections error:', err);
    return [];
  }
}
