/**
 * gradeLevelService.ts
 * Fetches grade levels from public.grade_levels.
 */
import { supabase, GradeLevel } from '@/lib/exam-supabase';

function isSchemaCacheTransientError(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("schema cache");
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchGradeLevels(): Promise<GradeLevel[]> {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const { data, error } = await supabase
      .from('grade_levels')
      .select('*')
      .order('level_number', { ascending: true });

    if (!error) return data ?? [];

    if (
      isSchemaCacheTransientError(error.message) &&
      attempt < maxAttempts
    ) {
      await sleep(180 * attempt);
      continue;
    }

    console.error('[gradeLevelService] fetchGradeLevels error:', error.message);
    return [];
  }

  return [];
}
