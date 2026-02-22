/**
 * quarterService.ts
 * Fetches quarters from public.quarters, filtered to the active school year.
 */
import { supabase, Quarter } from '@/lib/exam-supabase';

/**
 * Fetches all quarters belonging to the currently active school year.
 * Falls back to all quarters if no school year is marked active.
 */
export async function fetchActiveQuarters(): Promise<Quarter[]> {
  // First, find the active school year
  const { data: syData } = await supabase
    .from('school_years')
    .select('sy_id')
    .eq('is_active', true)
    .single();

  let query = supabase
    .from('quarters')
    .select('*')
    .order('quarter_id', { ascending: true });

  // If an active SY exists, filter to only its quarters
  if (syData?.sy_id) {
    query = query.eq('sy_id', syData.sy_id);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[quarterService] fetchActiveQuarters error:', error.message);
    return [];
  }
  return data ?? [];
}
