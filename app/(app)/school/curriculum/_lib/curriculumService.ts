import { getSupabase } from "@/lib/supabase/client";

export interface Curriculum {
  curriculum_id: number;
  name: string;
  description: string | null;
  created_at: string;
  is_active: boolean; // true if linked to the currently active school year
}

export async function getCurriculums(): Promise<Curriculum[]> {
  const supabase = getSupabase();

  // Parallel: (1) all curriculums (no join), (2) active school year's curriculum_id (1 row max)
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

export interface SubjectGroupMember {
  curriculum_subject_id: number;
  subjects: { code: string; name: string } | null;
}

export interface SubjectGroup {
  subject_group_id: number;
  name: string;
  description: string | null;
  members: SubjectGroupMember[];
}

export interface CurriculumSubject {
  curriculum_subject_id: number;
  subject_id: number;
  code: string;
  name: string;
  description: string | null;
  subject_type: "BOTH" | "SSES";
}

export interface CurriculumGradeLevel {
  grade_level_id: number;
  level_number: number;
  display_name: string;
  subjects: CurriculumSubject[];
}

export interface CurriculumDetail {
  curriculum_id: number;
  name: string;
  description: string | null;
  created_at: string;
  is_active: boolean;
  subject_groups: SubjectGroup[];
  grade_levels: CurriculumGradeLevel[];
}

export async function getCurriculumDetail(curriculumId: number): Promise<CurriculumDetail> {
  const supabase = getSupabase();

  // 3 lean parallel queries instead of 1 deep nested + 1 flat:
  // (1) curriculum meta + is_active only — single row, minimal join
  // (2) subject groups + member IDs only — no redundant subject join
  // (3) curriculum subjects + subject details + grade level
  const [metaRes, groupsRes, subjectsRes] = await Promise.all([
    supabase
      .from("curriculums")
      .select("curriculum_id, name, description, created_at, school_years(is_active)")
      .eq("curriculum_id", curriculumId)
      .is("deleted_at", null)
      .single(),

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

  const c = metaRes.data as any;
  const years: { is_active: boolean }[] = Array.isArray(c.school_years)
    ? c.school_years
    : c.school_years
    ? [c.school_years]
    : [];

  // Build curriculum_subject_id → subject lookup from query 3 (avoids redundant join in query 2)
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

  // Group curriculum_subjects by grade level
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

export async function createCurriculum(payload: {
  name: string;
  description?: string | null;
}): Promise<void> {
  const res = await fetch("/api/curriculum/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || "Failed to create curriculum.");
}
