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

export interface CanCreateResult {
  allowed: boolean;
  reason?: string;
}

export async function checkCanCreateSchoolYear(): Promise<CanCreateResult> {
  const supabase = getSupabase();

  const { data: prevSY } = await supabase
    .from("school_years")
    .select("sy_id, year_range")
    .is("deleted_at", null)
    .order("start_year", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!prevSY) return { allowed: true };

  const { data: quarters } = await supabase
    .from("quarters")
    .select("quarter_id, name")
    .eq("sy_id", (prevSY as any).sy_id);

  // Only the LAST term gates creation: if the final term's reports are complete,
  // the year is considered wrapped up. Quarters are named with ordinal words by
  // create_school_year_full ("First/Second/Third Quarter|Term"), so we rank by
  // that leading word and keep only the highest-ranked quarter.
  const ORDINAL_RANK: Record<string, number> = {
    first: 1,
    second: 2,
    third: 3,
    fourth: 4,
  };
  const rankOf = (name: string): number =>
    ORDINAL_RANK[(name ?? "").trim().split(/\s+/)[0]?.toLowerCase()] ?? 0;

  const lastQuarter = ((quarters ?? []) as any[]).reduce<
    { quarter_id: number; name: string } | null
  >((last, q) => (last && rankOf(last.name) >= rankOf(q.name) ? last : q), null);

  const quarterIds = lastQuarter ? [lastQuarter.quarter_id] : [];
  if (quarterIds.length === 0)
    return {
      allowed: false,
      reason: `Reports for the previous school year (${(prevSY as any).year_range}) must be accomplished first before creating a new one.`,
    };

  const { data: exams } = await supabase
    .from("exams")
    .select("exam_id")
    .in("quarter_id", quarterIds)
    .is("deleted_at", null);

  const examIds = ((exams ?? []) as any[]).map((e) => e.exam_id as number);
  if (examIds.length === 0)
    return {
      allowed: false,
      reason: `Reports for the previous school year (${(prevSY as any).year_range}) must be accomplished first before creating a new one.`,
    };

  const { data: assignments } = await supabase
    .from("exam_assignments")
    .select("exam_id, section_id")
    .in("exam_id", examIds);

  if (!assignments || (assignments as any[]).length === 0)
    return {
      allowed: false,
      reason: `Reports for the previous school year (${(prevSY as any).year_range}) must be accomplished first before creating a new one.`,
    };

  const { data: reports } = await supabase
    .from("exam_results_reports")
    .select("exam_id, section_id")
    .eq("sy_id", (prevSY as any).sy_id);

  const reportedSet = new Set(
    ((reports ?? []) as any[]).map((r) => `${r.exam_id}:${r.section_id}`),
  );

  const allReported = (assignments as any[]).every((a) =>
    reportedSet.has(`${a.exam_id}:${a.section_id}`),
  );

  if (allReported) return { allowed: true };

  return {
    allowed: false,
    reason: `The previous school year (${(prevSY as any).year_range}) still has pending exam reports. All reports must be submitted before creating a new school year.`,
  };
}
