/**
 * quarterService.ts
 * Fetches active-school-year quarters via the cached /api/quarters/active route
 * (Next.js data cache, tags: school-years + active-context) instead of a
 * browser-direct PostgREST read.
 */
import type { Quarter } from '@/lib/exam-supabase';

/**
 * Fetches all quarters belonging to the currently active school year.
 * Falls back to all quarters if no school year is marked active (server-side).
 */
export async function fetchActiveQuarters(): Promise<Quarter[]> {
  try {
    const res = await fetch('/api/quarters/active');
    if (!res.ok) {
      console.error('[quarterService] fetchActiveQuarters HTTP', res.status);
      return [];
    }
    const data = await res.json();
    return (data?.quarters as Quarter[]) ?? [];
  } catch (err) {
    console.error('[quarterService] fetchActiveQuarters error:', err);
    return [];
  }
}

export function abbreviateQuarterName(name: string): string {
  const lower = name.toLowerCase().trim();
  const ordinals: Record<string, string> = {
    first: '1', second: '2', third: '3', fourth: '4',
  };
  for (const [word, num] of Object.entries(ordinals)) {
    if (lower.includes(word)) {
      if (lower.includes('quarter')) return `Q${num}`;
      if (lower.includes('term')) return `T${num}`;
    }
  }
  return name;
}
