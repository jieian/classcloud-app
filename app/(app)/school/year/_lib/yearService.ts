import { getSupabase } from "@/lib/supabase/client";

export interface SchoolYear {
  sy_id: number;
  year_range: string;
  is_active: boolean;
}

/*
 * Fetches all school years from the database
 */
export async function getSchoolYears(): Promise<SchoolYear[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("school_years")
    .select("*")
    .order("year_range", { ascending: false });

  if (error) throw new Error(error.message);
  return (data as SchoolYear[]) ?? [];
}

/*
 * Updates the status of a specific school year.
 */
export async function updateYearStatus(sy_id: number, newStatus: boolean) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("school_years")
    .update({ is_active: newStatus })
    .eq("sy_id", sy_id);

  if (error) throw new Error(error.message);
}