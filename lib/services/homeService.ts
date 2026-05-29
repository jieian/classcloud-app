import { getSupabase } from "@/lib/supabase/client";

export interface HomeActiveContext {
  termName: string | null;
  yearRange: string | null;
}

export async function fetchHomeActiveContext(): Promise<HomeActiveContext> {
  const supabase = getSupabase();

  const { data: schoolYear, error: schoolYearError } = await supabase
    .from("school_years")
    .select("sy_id, year_range")
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (schoolYearError || !schoolYear) {
    return { termName: null, yearRange: null };
  }

  const { data: quarter, error: quarterError } = await supabase
    .from("quarters")
    .select("name")
    .eq("sy_id", schoolYear.sy_id)
    .eq("is_active", true)
    .maybeSingle();

  return {
    termName: quarterError ? null : (quarter?.name ?? null),
    yearRange: schoolYear.year_range ?? null,
  };
}
