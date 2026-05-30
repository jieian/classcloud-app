import { cacheTag, cacheLife } from "next/cache";
import { adminClient as admin } from "@/lib/supabase/admin";
import {
  resolveDefaultSyId,
  type GradeLevelRow,
  type SchoolYearOption,
  type SectionCard,
} from "@/lib/services/classService";
import type { SectionUserRow, SectionRow } from "@/lib/types/class.types";

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
  cacheLife("days");
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
 * Fetches sections, enrollment counts, and teacher assignments for a given
 * school year. Used by both getClassesInitData (SSR) and GET /api/classes/sections
 * (client-side year switching) so the logic lives in one place.
 */
export async function buildSectionCardsForSy(
  syId: number,
  userId: string,
): Promise<{ sections: SectionCard[]; assignedSectionIds: number[] }> {
  const [secResult, enrollResult, assignResult] = await Promise.all([
    admin
      .from("sections")
      .select(
        "section_id, name, section_type, grade_level_id, adviser_id, users(first_name, last_name, deleted_at)",
      )
      .eq("sy_id", syId)
      .is("deleted_at", null),
    admin
      .from("enrollments")
      .select("section_id")
      .eq("sy_id", syId)
      .is("deleted_at", null),
    admin
      .from("teacher_class_assignments")
      .select("section_id, sections!inner(sy_id)")
      .eq("teacher_id", userId)
      .eq("sections.sy_id", syId)
      .is("deleted_at", null),
  ]);

  const countMap: Record<number, number> = {};
  for (const e of ((enrollResult.data ?? []) as { section_id: number }[])) {
    countMap[e.section_id] = (countMap[e.section_id] ?? 0) + 1;
  }

  const sections: SectionCard[] = ((secResult.data ?? []) as SectionRow[]).map((s) => {
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

  return { sections, assignedSectionIds };
}

/**
 * Used by page server components to gate access before rendering.
 * Checks adviser_id and teacher_class_assignments in parallel.
 * Returns true if the limited_access user may access this section.
 */
export async function canLimitedAccessSection(
  userId: string,
  sectionId: number,
): Promise<boolean> {
  const [sectionResult, assignResult] = await Promise.all([
    admin
      .from("sections")
      .select("adviser_id")
      .eq("section_id", sectionId)
      .is("deleted_at", null)
      .maybeSingle(),
    admin
      .from("teacher_class_assignments")
      .select("section_id", { count: "exact", head: true })
      .eq("section_id", sectionId)
      .eq("teacher_id", userId)
      .is("deleted_at", null),
  ]);

  if (!sectionResult.data) return false;
  const isAdviser = (sectionResult.data as any).adviser_id === userId;
  const isTeacher = (assignResult.count ?? 0) > 0;
  return isAdviser || isTeacher;
}

/**
 * Used by API routes that have already fetched the section and confirmed the
 * user is NOT the adviser. Returns true if a teacher_class_assignment exists.
 */
export async function isTeacherInSection(
  userId: string,
  sectionId: number,
): Promise<boolean> {
  const { count } = await admin
    .from("teacher_class_assignments")
    .select("section_id", { count: "exact", head: true })
    .eq("section_id", sectionId)
    .eq("teacher_id", userId)
    .is("deleted_at", null);
  return (count ?? 0) > 0;
}

/**
 * Fetches the full data set needed to render the classes page.
 * School years and grade levels come from cache; sections are always live.
 */
export async function getClassesInitData(
  userId: string,
): Promise<ClassesInitialData> {
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

  const defaultSyId =
    (activeSyResult.data as { sy_id: number } | null)?.sy_id ??
    resolveDefaultSyId(schoolYears);

  if (!defaultSyId) {
    return { schoolYears, gradeLevels, sections: [], defaultSyId: null, assignedSectionIds: [] };
  }

  const { sections, assignedSectionIds } = await buildSectionCardsForSy(defaultSyId, userId);
  return { schoolYears, gradeLevels, sections, defaultSyId, assignedSectionIds };
}
