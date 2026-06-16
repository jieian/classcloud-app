import { cacheTag, cacheLife } from "next/cache";
import { adminClient as admin } from "@/lib/supabase/admin";
import { getActiveContext } from "@/lib/active-context";
import type { GradeLevel, Section } from "@/lib/exam-supabase";
import type { SubjectWithGradeLevel } from "@/lib/services/subjectService";

export const EXAMS_CACHE_TAG = "exams";

export type SchoolYearSimple = {
  sy_id: number;
  year_range: string;
  is_active: boolean;
};

export type ExamInitialData = {
  gradeLevels: GradeLevel[];
  schoolYears: SchoolYearSimple[];
  subjects: SubjectWithGradeLevel[];
  sections: Section[];
  activeSyId: number | null;
  activeQuarterId: number | null;
};

async function getGradeLevelsCached(): Promise<GradeLevel[]> {
  "use cache";
  cacheTag("grade-levels");
  cacheLife("days");
  const { data, error } = await admin
    .from("grade_levels")
    .select("grade_level_id, level_number, display_name")
    .order("level_number");
  if (error) throw new Error(error.message);
  return (data ?? []) as GradeLevel[];
}

async function getSchoolYearsCached(): Promise<SchoolYearSimple[]> {
  "use cache";
  cacheTag("school-years");
  cacheLife("days");
  const { data, error } = await admin
    .from("school_years")
    .select("sy_id, year_range, is_active")
    .is("deleted_at", null)
    .order("start_year", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as SchoolYearSimple[];
}

async function getSubjectsCached(): Promise<SubjectWithGradeLevel[]> {
  "use cache";
  cacheTag("subjects");
  cacheLife("days");
  const { data: sy } = await admin
    .from("school_years")
    .select("curriculum_id")
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();

  const curriculumId = (sy as { curriculum_id?: number } | null)?.curriculum_id ?? null;
  if (!curriculumId) return [];

  const { data, error } = await admin
    .from("curriculum_subjects")
    .select(
      "curriculum_subject_id, grade_level_id, subjects!inner(subject_id, name, code, subject_type, deleted_at)",
    )
    .eq("curriculum_id", curriculumId)
    .is("deleted_at", null);

  if (error) throw new Error(error.message);

  return ((data ?? []) as any[]).flatMap((row: any) => {
    const sub = row.subjects;
    if (!sub || sub.deleted_at !== null) return [];
    return [
      {
        curriculum_subject_id: row.curriculum_subject_id as number,
        subject_id: sub.subject_id as number,
        name: sub.name as string,
        code: sub.code as string,
        grade_level_id: row.grade_level_id as number,
        subject_type: sub.subject_type as "BOTH" | "SSES",
      },
    ];
  });
}

async function getSectionsCached(syId: number): Promise<Section[]> {
  "use cache";
  cacheTag("sections");
  cacheLife("minutes");
  const { data, error } = await admin
    .from("sections")
    .select(
      "section_id, name, grade_level_id, sy_id, adviser_id, section_type, grade_levels ( display_name )",
    )
    .eq("sy_id", syId)
    .is("deleted_at", null)
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data as unknown as Section[]) ?? [];
}

export async function getExamInitData(): Promise<ExamInitialData> {
  // Single Redis-cached active-context read (sy_id + quarter_id) instead of two
  // uncached admin queries — and the same value the client reuses, so the term
  // is resolved once per page load rather than 4×.
  const [activeContext, gradeLevels, schoolYears, subjects] = await Promise.all([
    getActiveContext(),
    getGradeLevelsCached(),
    getSchoolYearsCached(),
    getSubjectsCached(),
  ]);

  const activeSyId = activeContext.sy_id;
  const activeQuarterId = activeContext.quarter_id;
  const sections = activeSyId ? await getSectionsCached(activeSyId) : [];

  return { gradeLevels, schoolYears, subjects, sections, activeSyId, activeQuarterId };
}
