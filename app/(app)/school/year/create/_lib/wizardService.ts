import { getSupabase } from "@/lib/supabase/client";
import type {
  PreviousSySnapshot,
  WizardCurriculumDetail,
  WizardCurriculumListItem,
  WizardFacultyOption,
  WizardGradeLevel,
  WizardSubjectGroup,
} from "./types";

// ── Curricula list ────────────────────────────────────────────────────────────

export async function fetchWizardCurricula(): Promise<WizardCurriculumListItem[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("curriculums")
    .select("curriculum_id, name, description, created_at")
    .is("deleted_at", null)
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []).map((c: any) => ({
    curriculum_id: c.curriculum_id as number,
    name: c.name as string,
    description: (c.description ?? null) as string | null,
    created_at: c.created_at as string,
  }));
}

// ── Curriculum detail (reuses same query pattern as curriculumService) ─────────

export async function fetchWizardCurriculumDetail(
  curriculumId: number
): Promise<WizardCurriculumDetail> {
  const supabase = getSupabase();

  const [metaRes, groupsRes, subjectsRes] = await Promise.all([
    supabase
      .from("curriculums")
      .select("curriculum_id, name, description, created_at, school_years(is_active)")
      .eq("curriculum_id", curriculumId)
      .is("deleted_at", null)
      .single(),

    supabase
      .from("subject_groups")
      .select(
        "subject_group_id, name, description, subject_group_members(curriculum_subject_id)"
      )
      .eq("curriculum_id", curriculumId)
      .is("deleted_at", null),

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

  // Build cs_id → {code, name, description, subject_type} map for group members
  const csDetailMap = new Map<
    number,
    { code: string; name: string; description: string | null; subject_type: "BOTH" | "SSES" }
  >();
  for (const row of subjectsRes.data ?? []) {
    const r = row as any;
    csDetailMap.set(r.curriculum_subject_id, {
      code: r.subjects.code,
      name: r.subjects.name,
      description: r.subjects.description ?? null,
      subject_type: r.subjects.subject_type as "BOTH" | "SSES",
    });
  }

  // Subject groups
  const subject_groups: WizardSubjectGroup[] = (groupsRes.data ?? []).map((sg: any) => ({
    subject_group_id: sg.subject_group_id,
    name: sg.name,
    description: sg.description ?? null,
    members: (sg.subject_group_members ?? [])
      .map((m: any) => {
        const detail = csDetailMap.get(m.curriculum_subject_id);
        return detail
          ? {
              curriculum_subject_id: m.curriculum_subject_id as number,
              code: detail.code,
              name: detail.name,
              subject_type: detail.subject_type,
            }
          : null;
      })
      .filter(Boolean),
  }));

  // Grade levels grouped from curriculum_subjects
  const glMap = new Map<number, WizardGradeLevel>();
  for (const row of subjectsRes.data ?? []) {
    const r = row as any;
    const gl = r.grade_levels;
    if (!glMap.has(gl.grade_level_id)) {
      glMap.set(gl.grade_level_id, {
        grade_level_id: gl.grade_level_id,
        level_number: gl.level_number,
        display_name: gl.display_name,
        subjects: [],
        hasSsesSubjects: false,
      });
    }
    const entry = glMap.get(gl.grade_level_id)!;
    const subjectType = r.subjects.subject_type as "BOTH" | "SSES";
    entry.subjects.push({
      curriculum_subject_id: r.curriculum_subject_id,
      subject_id: r.subject_id,
      code: r.subjects.code,
      name: r.subjects.name,
      description: r.subjects.description ?? null,
      subject_type: subjectType,
    });
    if (subjectType === "SSES") entry.hasSsesSubjects = true;
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
    grade_levels,
    subject_groups,
  };
}

// ── Faculty list ──────────────────────────────────────────────────────────────

export async function fetchWizardFaculty(): Promise<WizardFacultyOption[]> {
  const supabase = getSupabase();

  // All active, non-deleted users — no role filter so newly added users are immediately assignable
  const { data, error } = await supabase
    .from("users")
    .select("uid, first_name, last_name")
    .eq("active_status", 1)
    .is("deleted_at", null);

  if (error) throw new Error(error.message);

  return (data ?? [])
    .map((r: { uid: string; first_name: string; last_name: string }) => ({
      uid: r.uid,
      first_name: r.first_name,
      last_name: r.last_name,
    }))
    .sort((a: WizardFacultyOption, b: WizardFacultyOption) =>
      a.first_name.localeCompare(b.first_name) || a.last_name.localeCompare(b.last_name)
    );
}

// ── Previous SY snapshot (for "Replicate" mode) ───────────────────────────────

export async function fetchPreviousSySnapshot(
  prevSyId: number
): Promise<PreviousSySnapshot> {
  const supabase = getSupabase();

  // Round 1: Fetch sections
  const { data: sectionsData, error: sectionsError } = await supabase
    .from("sections")
    .select("section_id, name, grade_level_id, section_type, adviser_id")
    .eq("sy_id", prevSyId)
    .is("deleted_at", null);

  if (sectionsError) throw new Error(sectionsError.message);

  const sections = (sectionsData ?? []).map((s: any) => ({
    section_id: s.section_id as number,
    name: s.name as string,
    grade_level_id: s.grade_level_id as number,
    section_type: s.section_type as "SSES" | "REGULAR",
    adviser_id: (s.adviser_id ?? null) as string | null,
  }));

  const sectionIds = sections.map((s: { section_id: number }) => s.section_id);

  if (sectionIds.length === 0) {
    // No sections in prev SY
    const syRow = await supabase
      .from("school_years")
      .select("sy_id, curriculum_id")
      .eq("sy_id", prevSyId)
      .single();
    return {
      sy_id: prevSyId,
      curriculum_id: (syRow.data as any)?.curriculum_id ?? null,
      sections: [],
      assignments: [],
      coordinators: [],
      gsl_assignments: [],
    };
  }

  // Round 2: assignments + coordinators + GSLs in parallel
  const [assignmentsRes, coordinatorsRes, gslRes, syRes] = await Promise.all([
    supabase
      .from("teacher_class_assignments")
      .select(
        "section_id, curriculum_subject_id, teacher_id, curriculum_subjects!inner(subject_id)"
      )
      .in("section_id", sectionIds)
      .is("deleted_at", null),

    supabase
      .from("subject_coordinators")
      .select(
        "subject_group_id, user_id, subject_groups!inner(name)"
      )
      .eq("sy_id", prevSyId)
      .is("deleted_at", null),

    supabase
      .from("grade_subject_leaders")
      .select(
        "curriculum_subject_id, grade_level_id, user_id, curriculum_subjects!inner(subject_id)"
      )
      .eq("sy_id", prevSyId)
      .is("deleted_at", null),

    supabase
      .from("school_years")
      .select("curriculum_id")
      .eq("sy_id", prevSyId)
      .single(),
  ]);

  if (assignmentsRes.error) throw new Error(assignmentsRes.error.message);
  if (coordinatorsRes.error) throw new Error(coordinatorsRes.error.message);
  if (gslRes.error) throw new Error(gslRes.error.message);

  const assignments = (assignmentsRes.data ?? []).map((a: any) => ({
    section_id: a.section_id as number,
    curriculum_subject_id: a.curriculum_subject_id as number,
    subject_id: a.curriculum_subjects.subject_id as number,
    teacher_id: a.teacher_id as string,
  }));

  const coordinators = (coordinatorsRes.data ?? []).map((c: any) => ({
    subject_group_id: c.subject_group_id as number,
    subject_group_name: c.subject_groups.name as string,
    user_id: c.user_id as string,
  }));

  const gsl_assignments = (gslRes.data ?? []).map((g: any) => ({
    curriculum_subject_id: g.curriculum_subject_id as number,
    subject_id: g.curriculum_subjects.subject_id as number,
    grade_level_id: g.grade_level_id as number,
    user_id: g.user_id as string,
  }));

  return {
    sy_id: prevSyId,
    curriculum_id: (syRes.data as any)?.curriculum_id ?? null,
    sections,
    assignments,
    coordinators,
    gsl_assignments,
  };
}
