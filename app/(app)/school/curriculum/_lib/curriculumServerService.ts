import { cacheTag, cacheLife } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import type {
  Curriculum,
  CurriculumDetail,
  CurriculumGradeLevel,
  SubjectGroup,
} from "./curriculumService";
import type { GradeLevel } from "../create/_lib/types";

export const CURRICULUM_CACHE_TAG = "curriculums";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function getCurriculumsCached(): Promise<Curriculum[]> {
  "use cache";
  cacheTag(CURRICULUM_CACHE_TAG);
  cacheLife("minutes");
  const supabase = getAdminClient();

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
  const { data, error } = await getAdminClient()
    .from("grade_levels")
    .select("grade_level_id, level_number, display_name")
    .order("level_number");
  if (error) throw new Error(error.message);
  return (data ?? []) as GradeLevel[];
}

/**
 * Non-cached: returns subject_ids (within this curriculum) that have records
 * (exams OR teacher_class_assignments) across ANY curriculum. These subjects
 * are locked in edit mode — cannot be edited or removed.
 */
export async function getLockedSubjectIds(curriculumId: number): Promise<number[]> {
  const supabase = getAdminClient();

  // All subject_ids belonging to this curriculum
  const { data: csRows } = await supabase
    .from("curriculum_subjects")
    .select("subject_id")
    .eq("curriculum_id", curriculumId)
    .is("deleted_at", null);

  if (!csRows || csRows.length === 0) return [];

  const subjectIds = (csRows as { subject_id: number }[]).map((r) => r.subject_id);

  // All curriculum_subject_ids for those subject_ids across ALL curricula
  const { data: allCsRows } = await supabase
    .from("curriculum_subjects")
    .select("curriculum_subject_id, subject_id")
    .in("subject_id", subjectIds)
    .is("deleted_at", null);

  if (!allCsRows || allCsRows.length === 0) return [];

  const allCsIds = (allCsRows as { curriculum_subject_id: number; subject_id: number }[]).map((r) => r.curriculum_subject_id);

  // Check exams and teacher_class_assignments in parallel
  const [examRes, tcaRes] = await Promise.all([
    supabase.from("exams").select("curriculum_subject_id").in("curriculum_subject_id", allCsIds),
    supabase.from("teacher_class_assignments").select("curriculum_subject_id").in("curriculum_subject_id", allCsIds),
  ]);

  const lockedCsIds = new Set([
    ...(examRes.data ?? []).map((r: any) => r.curriculum_subject_id),
    ...(tcaRes.data ?? []).map((r: any) => r.curriculum_subject_id),
  ]);

  if (lockedCsIds.size === 0) return [];

  const locked = new Set<number>();
  for (const row of allCsRows as { curriculum_subject_id: number; subject_id: number }[]) {
    if (lockedCsIds.has(row.curriculum_subject_id)) locked.add(row.subject_id);
  }
  return Array.from(locked);
}

/** Non-cached: checks whether a curriculum has never been referenced by a school year or exam. */
export async function isCurriculumDeletable(curriculumId: number): Promise<boolean> {
  const supabase = getAdminClient();

  // Fail fast: if any school year references this curriculum, it's in use
  const { data: syRow } = await supabase
    .from("school_years")
    .select("curriculum_id")
    .eq("curriculum_id", curriculumId)
    .limit(1)
    .maybeSingle();

  if (syRow) return false;

  // Get all curriculum_subject_ids for this curriculum
  const { data: csRows } = await supabase
    .from("curriculum_subjects")
    .select("curriculum_subject_id")
    .eq("curriculum_id", curriculumId);

  if (!csRows || csRows.length === 0) return true;

  // Check if any exam references one of those subjects
  const ids = (csRows as { curriculum_subject_id: number }[]).map((r) => r.curriculum_subject_id);
  const { data: examRow } = await supabase
    .from("exams")
    .select("exam_id")
    .in("curriculum_subject_id", ids)
    .limit(1)
    .maybeSingle();

  return !examRow;
}

export async function getCurriculumDetailCached(curriculumId: number): Promise<CurriculumDetail | null> {
  "use cache";
  cacheTag(CURRICULUM_CACHE_TAG);
  cacheLife("minutes");
  const supabase = getAdminClient();

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

    const csMap = new Map<number, { code: string; name: string }>();
    for (const row of subjectsRes.data ?? []) {
      const r = row as any;
      csMap.set(r.curriculum_subject_id, { code: r.subjects.code, name: r.subjects.name });
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
