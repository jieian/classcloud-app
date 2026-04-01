import { cacheTag, cacheLife } from "next/cache";
import { adminClient as admin } from "@/lib/supabase/admin";
import {
  resolveDefaultSyId,
  type GradeLevelRow,
  type SchoolYearOption,
  type SectionCard,
} from "@/lib/services/classService";

export const SCHOOL_YEARS_CACHE_TAG = "school-years";

export type ClassesInitialData = {
  schoolYears: SchoolYearOption[];
  gradeLevels: GradeLevelRow[];
  sections: SectionCard[];
  defaultSyId: number | null;
  assignedSectionIds: number[];
};

export async function getSchoolYearsCached(): Promise<SchoolYearOption[]> {
  "use cache";
  cacheTag(SCHOOL_YEARS_CACHE_TAG);
  cacheLife("minutes");
  const { data, error } = await admin
    .from("school_years")
    .select("sy_id, year_range, is_active")
    .is("deleted_at", null)
    .order("start_year", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as SchoolYearOption[];
}

export async function getGradeLevelsCached(): Promise<GradeLevelRow[]> {
  "use cache";
  cacheTag("grade-levels");
  cacheLife("days");
  const { data, error } = await admin
    .from("grade_levels")
    .select("grade_level_id, level_number, display_name")
    .order("level_number");
  if (error) throw new Error(error.message);
  return (data ?? []) as GradeLevelRow[];
}

/**
 * Fetches the full data set needed to render the classes page.
 * School years and grade levels come from cache; sections are always live.
 * The adviser deleted_at check is inlined into the join — no extra round-trip.
 */
export async function getClassesInitData(
  userId: string,
  permissions: string[],
): Promise<ClassesInitialData> {
  const isPartialAccess = !permissions.includes("classes.full_access");

  // Fetch the active school year ID live so it is never stale, even when
  // the school_years cache hasn't been revalidated yet after an activation.
  // The full school-years list (for the dropdown) still comes from cache.
  const [schoolYears, gradeLevels, activeSyResult] = await Promise.all([
    getSchoolYearsCached(),
    getGradeLevelsCached(),
    admin
      .from("school_years")
      .select("sy_id")
      .eq("is_active", true)
      .is("deleted_at", null)
      .maybeSingle(),
  ]);

  // Prefer the live active year; fall back to resolving from the cached list
  // (handles the edge case where no year is marked active yet).
  const defaultSyId =
    (activeSyResult.data as { sy_id: number } | null)?.sy_id ??
    resolveDefaultSyId(schoolYears);

  if (!defaultSyId) {
    return { schoolYears, gradeLevels, sections: [], defaultSyId: null, assignedSectionIds: [] };
  }

  const [secResult, enrollResult, assignResult] = await Promise.all([
    admin
      .from("sections")
      .select(
        "section_id, name, section_type, grade_level_id, adviser_id, users(first_name, last_name, deleted_at)",
      )
      .eq("sy_id", defaultSyId)
      .is("deleted_at", null),
    admin
      .from("enrollments")
      .select("section_id")
      .eq("sy_id", defaultSyId)
      .is("deleted_at", null),
    isPartialAccess
      ? admin
          .from("teacher_class_assignments")
          .select("section_id, sections!inner(sy_id)")
          .eq("teacher_id", userId)
          .eq("sections.sy_id", defaultSyId)
          .is("deleted_at", null)
      : Promise.resolve({ data: [] as { section_id: number }[], error: null }),
  ]);

  const countMap: Record<number, number> = {};
  for (const e of ((enrollResult.data ?? []) as { section_id: number }[])) {
    countMap[e.section_id] = (countMap[e.section_id] ?? 0) + 1;
  }

  const sections: SectionCard[] = ((secResult.data ?? []) as any[]).map((s) => {
    const u = Array.isArray(s.users) ? s.users[0] : s.users;
    const adviserName =
      u && s.adviser_id && u.deleted_at === null
        ? `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || null
        : null;
    return {
      section_id: s.section_id,
      name: s.name,
      section_type: s.section_type as "SSES" | "REGULAR",
      adviser_id: s.adviser_id,
      adviser_name: adviserName,
      student_count: countMap[s.section_id] ?? 0,
      grade_level_id: s.grade_level_id,
    };
  });

  const assignedSectionIds = (
    (assignResult.data ?? []) as { section_id: number }[]
  ).map((a) => a.section_id);

  return { schoolYears, gradeLevels, sections, defaultSyId, assignedSectionIds };
}
