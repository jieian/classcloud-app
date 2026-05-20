import { getSupabase } from "@/lib/supabase/client";

export interface Quarter {
  quarter_id: number;
  name: string;
  is_active: boolean;
  sy_id: number;
}

export interface SchoolYear {
  sy_id: number;
  year_range: string;
  start_year: number;
  end_year: number;
  is_active: boolean;
  deleted_at: string | null;
  quarters: Quarter[];
  hasExams: boolean;
}

export async function getSchoolYears(): Promise<SchoolYear[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("school_years")
    .select("sy_id, year_range, start_year, end_year, is_active, deleted_at, quarters(quarter_id, name, is_active, sy_id)")
    .is("deleted_at", null)
    .order("start_year", { ascending: false });

  if (error) throw new Error(error.message);

  const schoolYears = (data ?? []).map((sy: any) => ({
    ...sy,
    quarters: (Array.isArray(sy.quarters) ? sy.quarters : []).sort(
      (a: Quarter, b: Quarter) => a.quarter_id - b.quarter_id,
    ),
    hasExams: false,
  })) as SchoolYear[];

  // Check which school years have exams via their quarters (single batch query)
  const allQuarterIds = schoolYears.flatMap((sy) =>
    sy.quarters.map((q) => q.quarter_id),
  );

  if (allQuarterIds.length > 0) {
    const { data: examRows } = await supabase
      .from("exams")
      .select("quarter_id")
      .in("quarter_id", allQuarterIds);

    const quarterIdsWithExams = new Set(
      (examRows ?? []).map((e: any) => e.quarter_id as number),
    );

    for (const sy of schoolYears) {
      sy.hasExams = sy.quarters.some((q) => quarterIdsWithExams.has(q.quarter_id));
    }
  }

  return schoolYears;
}

export async function toggleQuarter(
  quarter_id: number,
  sy_id: number,
): Promise<{ success: boolean; code?: string }> {
  const res = await fetch("/api/schoolYear/toggle-quarter", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quarter_id, sy_id }),
  });
  const json = await res.json();
  if (!res.ok) return { success: false, code: json.error };
  return { success: true };
}

export async function hardDeleteSchoolYear(sy_id: number): Promise<void> {
  const res = await fetch(`/api/schoolYear/hard-delete/${sy_id}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const json = await res.json();
    throw new Error(json.error ?? "Failed to delete school year.");
  }
}

export class DuplicateYearError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DuplicateYearError";
  }
}
