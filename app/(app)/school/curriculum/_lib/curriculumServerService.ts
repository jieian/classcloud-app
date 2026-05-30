import { cacheTag, cacheLife } from "next/cache";
import { adminClient as supabase } from "@/lib/supabase/admin";
import type {
  Curriculum,
  CurriculumDetail,
  CurriculumGradeLevel,
  SubjectGroup,
} from "./curriculumService";
import type { GradeLevel } from "../create/_lib/types";

export const CURRICULUM_CACHE_TAG = "curriculums";

export async function getCurriculumsCached(): Promise<Curriculum[]> {
  "use cache";
  cacheTag(CURRICULUM_CACHE_TAG);
  cacheLife("days");
  const [curriculumsRes, activeYearRes] = await Promise.all([
    supabase
      .from("curriculums")
      .select("curriculum_id, name, description, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),

    supabase
      .from("school_years")
      .select("curriculum_id")
      .eq("is_active", true)
      .maybeSingle(),
  ]);

  if (curriculumsRes.error) throw new Error(curriculumsRes.error.message);
  if (activeYearRes.error) throw new Error(activeYearRes.error.message);

  const activeCurriculumId = (activeYearRes.data as any)?.curriculum_id ?? null;

  return (curriculumsRes.data ?? []).map((c: any) => ({
    curriculum_id: c.curriculum_id as number,
    name: c.name as string,
    description: (c.description ?? null) as string | null,
    created_at: c.created_at as string,
    is_active: c.curriculum_id === activeCurriculumId,
  }));
}

export async function getGradeLevelsCached(): Promise<GradeLevel[]> {
  "use cache";
  cacheTag("grade-levels");
  cacheLife("days");
  const { data, error } = await supabase
    .from("grade_levels")
    .select("grade_level_id, level_number, display_name")
    .order("level_number");
  if (error) throw new Error(error.message);
  return (data ?? []) as GradeLevel[];
}

/**
 * Non-cached: returns two sets of subject_ids for use in curriculum edit mode.
 * - examLockedIds: subject has exam records in ANY curriculum → edit + remove both blocked
 * - importedIds: subject also lives in another curriculum → edit blocked, remove allowed
 */
export async function getSubjectLockInfo(curriculumId: number): Promise<{
  examLockedIds: number[];
  importedIds: number[];
}> {

  const { data: csRows } = await supabase
    .from("curriculum_subjects")
    .select("curriculum_subject_id, subject_id")
    .eq("curriculum_id", curriculumId)
    .is("deleted_at", null);

  if (!csRows || csRows.length === 0) return { examLockedIds: [], importedIds: [] };

  const rows = csRows as { curriculum_subject_id: number; subject_id: number }[];
  const subjectIds = [...new Set(rows.map((r) => r.subject_id))];

  // All curriculum_subject_ids across ALL curricula for these subjects (for exam check)
  const { data: allCsRows } = await supabase
    .from("curriculum_subjects")
    .select("curriculum_subject_id, subject_id")
    .in("subject_id", subjectIds)
    .is("deleted_at", null);

  const allCsIds = (allCsRows ?? []).map((r: any) => r.curriculum_subject_id as number);
  const csIdToSubjectId = new Map<number, number>();
  for (const r of (allCsRows ?? []) as any[]) csIdToSubjectId.set(r.curriculum_subject_id, r.subject_id);

  const [examRes, otherCsRes] = await Promise.all([
    supabase.from("exams").select("curriculum_subject_id").in("curriculum_subject_id", allCsIds),
    supabase
      .from("curriculum_subjects")
      .select("subject_id")
      .in("subject_id", subjectIds)
      .neq("curriculum_id", curriculumId)
      .is("deleted_at", null),
  ]);

  const examLockedCsIds = new Set((examRes.data ?? []).map((r: any) => r.curriculum_subject_id as number));
  const examLockedIds = [
    ...new Set(
      Array.from(examLockedCsIds)
        .map((csId) => csIdToSubjectId.get(csId))
        .filter((id): id is number => id !== undefined),
    ),
  ];

  const importedIds = [...new Set((otherCsRes.data ?? []).map((r: any) => r.subject_id as number))];

  return { examLockedIds, importedIds };
}

/** Non-cached: checks whether a curriculum can be edited or deleted (no active school year references it). */
export async function isCurriculumDeletable(curriculumId: number): Promise<boolean> {

  const { data: syRow } = await supabase
    .from("school_years")
    .select("curriculum_id")
    .eq("curriculum_id", curriculumId)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();

  return !syRow;
}

export async function getCurriculumDetailCached(curriculumId: number): Promise<CurriculumDetail | null> {
  "use cache";
  cacheTag(CURRICULUM_CACHE_TAG);
  cacheLife("days");

    const [metaRes, groupsRes, subjectsRes] = await Promise.all([
      supabase
        .from("curriculums")
        .select("curriculum_id, name, description, created_at, school_years(is_active)")
        .eq("curriculum_id", curriculumId)
        .is("deleted_at", null)
        .maybeSingle(),

      supabase
        .from("subject_groups")
        .select("subject_group_id, name, description, subject_group_members(curriculum_subject_id)")
        .eq("curriculum_id", curriculumId),

      supabase
        .from("curriculum_subjects")
        .select(
          `curriculum_subject_id, subject_id,
           subjects!inner(code, name, description, subject_type),
           grade_levels!inner(grade_level_id, level_number, display_name)`
        )
        .eq("curriculum_id", curriculumId)
        .is("deleted_at", null),
    ]);

    if (metaRes.error) throw new Error(metaRes.error.message);
    if (groupsRes.error) throw new Error(groupsRes.error.message);
    if (subjectsRes.error) throw new Error(subjectsRes.error.message);
    if (!metaRes.data) return null;

    const c = metaRes.data as any;
    const years: { is_active: boolean }[] = Array.isArray(c.school_years)
      ? c.school_years
      : c.school_years
      ? [c.school_years]
      : [];

    const csMap = new Map<number, { code: string; name: string; subject_type: "BOTH" | "SSES" }>();
    for (const row of subjectsRes.data ?? []) {
      const r = row as any;
      csMap.set(r.curriculum_subject_id, { code: r.subjects.code, name: r.subjects.name, subject_type: r.subjects.subject_type });
    }

    const subject_groups: SubjectGroup[] = (groupsRes.data ?? []).map((sg: any) => ({
      subject_group_id: sg.subject_group_id,
      name: sg.name,
      description: sg.description ?? null,
      members: (sg.subject_group_members ?? []).map((m: any) => ({
        curriculum_subject_id: m.curriculum_subject_id,
        subjects: csMap.get(m.curriculum_subject_id) ?? null,
      })),
    }));

    const glMap = new Map<number, CurriculumGradeLevel>();
    for (const row of subjectsRes.data ?? []) {
      const r = row as any;
      const gl = r.grade_levels;
      if (!glMap.has(gl.grade_level_id)) {
        glMap.set(gl.grade_level_id, {
          grade_level_id: gl.grade_level_id,
          level_number: gl.level_number,
          display_name: gl.display_name,
          subjects: [],
        });
      }
      glMap.get(gl.grade_level_id)!.subjects.push({
        curriculum_subject_id: r.curriculum_subject_id,
        subject_id: r.subject_id,
        code: r.subjects.code,
        name: r.subjects.name,
        description: r.subjects.description ?? null,
        subject_type: r.subjects.subject_type,
      });
    }

    const grade_levels = Array.from(glMap.values()).sort(
      (a, b) => a.level_number - b.level_number
    );

    return {
      curriculum_id: c.curriculum_id,
      name: c.name,
      description: c.description ?? null,
      created_at: c.created_at,
      is_active: years.some((y) => y.is_active),
      subject_groups,
      grade_levels,
    };
}
