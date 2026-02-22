/**
 * sectionService.ts
 * Fetches sections from public.sections, joined with grade_levels.
 */
import { supabase, Section } from '@/lib/exam-supabase';

/**
 * Fetches all sections for the active school year, joined with grade_levels.
 * Falls back to all sections if no active school year is found.
 */
export async function fetchActiveSections(): Promise<Section[]> {
  // Find the active school year
  const { data: syData } = await supabase
    .from('school_years')
    .select('sy_id')
    .eq('is_active', true)
    .single();

  let query = supabase
    .from('sections')
    .select(`
      section_id,
      name,
      grade_level_id,
      sy_id,
      adviser_id,
      grade_levels ( display_name )
    `)
    .order('name', { ascending: true });

  if (syData?.sy_id) {
    query = query.eq('sy_id', syData.sy_id);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[sectionService] fetchActiveSections error:', error.message);
    return [];
  }
  return (data as Section[]) ?? [];
}
