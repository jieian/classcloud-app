import { getSupabase } from "@/lib/supabase/client";

export interface AddFacultyForm {
  activeStep: number;
  advisory_section_id: number | null;
  selected_sections: number[];
  subject_assignments: { section_id: number; subject_ids: number[] }[];
}

export interface GradeLevel {
  grade_level_id: number;
  level_number: number;
  display_name: string;
}

export interface SectionWithAdviser {
  section_id: number;
  name: string;
  grade_level_id: number;
  sy_id: number;
  adviser_id: string | null;
  section_type: "SSES" | "REGULAR";
  adviser_name: string | null;
}

export interface SubjectForGradeLevel {
  subject_id: number;
  name: string;
  code: string;
  grade_level_id: number;
}

export interface TeacherAssignment {
  section_id: number;
  subject_id: number;
  teacher_id: string;
  teacher_name: string;
}

export interface WizardData {
  active_sy_id: number | null;
  faculty: { uid: string; first_name: string; last_name: string } | null;
  grade_levels: GradeLevel[];
  sections: SectionWithAdviser[];
  subjects_by_grade_level: SubjectForGradeLevel[];
  all_assignments: TeacherAssignment[];
  current_advisory_section_id: number | null;
  current_teaching_assignments: { section_id: number; subject_id: number }[];
}

export async function fetchWizardData(facultyUid: string): Promise<WizardData> {
  const supabase = getSupabase();

  // Round 1: active SY + SY-independent data all in parallel
  const [
    { data: syData },
    { data: facultyRaw },
    { data: gradeLevelsRaw },
    { data: subjectGlRaw },
  ] = await Promise.all([
    supabase
      .from("school_years")
      .select("sy_id")
      .eq("is_active", true)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("users")
      .select("uid, first_name, last_name")
      .eq("uid", facultyUid)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("grade_levels")
      .select("grade_level_id, level_number, display_name")
      .order("level_number"),
    supabase
      .from("subject_grade_levels")
      .select("grade_level_id, deleted_at, subjects(subject_id, name, code, deleted_at)")
      .is("deleted_at", null),
  ]);

  const activeSyId = syData?.sy_id ?? null;

  // Round 2: SY-dependent queries — adviser/teacher names joined directly,
  // eliminating the separate names-lookup round entirely
  const [
    { data: sectionsRaw },
    { data: allAssignmentsRaw },
    { data: currentAdvisory },
    { data: currentTeaching },
  ] = await Promise.all([
    activeSyId
      ? supabase
          .from("sections")
          .select(
            "section_id, name, grade_level_id, sy_id, adviser_id, section_type, adviser:users!adviser_id(first_name, last_name, deleted_at)",
          )
          .eq("sy_id", activeSyId)
          .is("deleted_at", null)
          .order("name")
      : Promise.resolve({ data: [] }),
    activeSyId
      ? supabase
          .from("teacher_class_assignments")
          .select(
            "section_id, subject_id, teacher_id, teacher:users!teacher_id(first_name, last_name)",
          )
          .eq("sy_id", activeSyId)
          .is("deleted_at", null)
      : Promise.resolve({ data: [] }),
    activeSyId
      ? supabase
          .from("sections")
          .select("section_id")
          .eq("adviser_id", facultyUid)
          .eq("sy_id", activeSyId)
          .is("deleted_at", null)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    activeSyId
      ? supabase
          .from("teacher_class_assignments")
          .select("section_id, subject_id")
          .eq("teacher_id", facultyUid)
          .eq("sy_id", activeSyId)
          .is("deleted_at", null)
      : Promise.resolve({ data: [] }),
  ]);

  // Build sections — adviser name comes from join; if soft-deleted treat as unadvised
  const sections: SectionWithAdviser[] = ((sectionsRaw ?? []) as any[]).map((s: any) => {
    const adviser = s.adviser as {
      first_name: string;
      last_name: string;
      deleted_at: string | null;
    } | null;
    const isOwnSection = s.adviser_id === facultyUid;
    const adviserIsActive = adviser !== null && adviser.deleted_at === null;
    return {
      section_id: s.section_id,
      name: s.name,
      grade_level_id: s.grade_level_id,
      sy_id: s.sy_id,
      adviser_id: !isOwnSection && !adviserIsActive ? null : s.adviser_id,
      section_type: s.section_type as "SSES" | "REGULAR",
      adviser_name:
        !isOwnSection && adviserIsActive
          ? `${adviser!.first_name} ${adviser!.last_name}`
          : null,
    };
  });

  // Build allAssignments — teacher name comes from join
  const allAssignments: TeacherAssignment[] = ((allAssignmentsRaw ?? []) as any[]).map(
    (a: any) => {
      const teacher = a.teacher as { first_name: string; last_name: string } | null;
      return {
        section_id: a.section_id,
        subject_id: a.subject_id,
        teacher_id: a.teacher_id,
        teacher_name:
          a.teacher_id === facultyUid
            ? "You"
            : teacher
              ? `${teacher.first_name} ${teacher.last_name}`
              : "Unknown",
      };
    },
  );

  // Flatten subjects — exclude soft-deleted
  const subjectsByGradeLevel: SubjectForGradeLevel[] = (
    (subjectGlRaw ?? []) as any[]
  ).flatMap((sgl: any) => {
    const raw = sgl.subjects;
    if (!raw) return [];
    const subjects = (Array.isArray(raw) ? raw : [raw]) as any[];
    return subjects
      .filter((s: any) => s.deleted_at === null)
      .map((s: any) => ({
        subject_id: s.subject_id,
        name: s.name,
        code: s.code,
        grade_level_id: sgl.grade_level_id,
      }));
  });

  return {
    active_sy_id: activeSyId,
    faculty: facultyRaw
      ? {
          uid: facultyRaw.uid,
          first_name: facultyRaw.first_name,
          last_name: facultyRaw.last_name,
        }
      : null,
    grade_levels: (gradeLevelsRaw ?? []) as GradeLevel[],
    sections,
    subjects_by_grade_level: subjectsByGradeLevel,
    all_assignments: allAssignments,
    current_advisory_section_id: (currentAdvisory as any)?.section_id ?? null,
    current_teaching_assignments: ((currentTeaching ?? []) as any[]).map((a: any) => ({
      section_id: a.section_id,
      subject_id: a.subject_id,
    })),
  };
}

export async function assignAcademicLoad(payload: {
  faculty_id: string;
  sy_id: number;
  advisory_section_id: number | null;
  subject_assignments: { section_id: number; subject_id: number }[];
}): Promise<void> {
  const response = await fetch("/api/faculty/assign-load", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || "Failed to assign academic load.");
  }
}
