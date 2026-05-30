import { cacheTag, cacheLife } from "next/cache";
import { adminClient as admin } from "@/lib/supabase/admin";
import type { SchoolYear } from "./yearService";

export const SCHOOL_YEARS_FULL_CACHE_TAG = "school-years";

export async function getSchoolYearsFullCached(): Promise<SchoolYear[]> {
  "use cache";
  cacheTag(SCHOOL_YEARS_FULL_CACHE_TAG);
  cacheLife("days");

  const { data, error } = await admin
    .from("school_years")
    .select("sy_id, year_range, start_year, end_year, is_active, deleted_at, quarters(quarter_id, name, is_active, sy_id)")
    .is("deleted_at", null)
    .order("start_year", { ascending: false });

  if (error) throw new Error(error.message);

  const schoolYears = (data ?? []).map((sy: any) => ({
    ...sy,
    quarters: (Array.isArray(sy.quarters) ? sy.quarters : []).sort(
      (a: any, b: any) => a.quarter_id - b.quarter_id,
    ),
    hasExams: false,
  })) as SchoolYear[];

  const allQuarterIds = schoolYears.flatMap((sy) =>
    sy.quarters.map((q) => q.quarter_id),
  );

  if (allQuarterIds.length > 0) {
    const { data: examRows } = await admin
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
