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
  curriculum_subject_id: number;
  subject_id: number;
  name: string;
  code: string;
  grade_level_id: number;
  subject_type: "BOTH" | "SSES";
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

  // Round 1: 4 parallel — sections filtered via school_years!inner so sy_id is not needed upfront
  const [
    { data: syData },
    { data: facultyRaw },
    { data: gradeLevelsRaw },
    { data: sectionsRaw },
  ] = await Promise.all([
    supabase
      .from("school_years")
      .select("sy_id, curriculum_id")
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
      .from("sections")
      .select(
        "section_id, name, grade_level_id, sy_id, adviser_id, section_type, adviser:users!adviser_id(first_name, last_name, deleted_at), school_years!inner(is_active)",
      )
      .eq("school_years.is_active", true)
      .is("deleted_at", null)
      .order("name"),
  ]);

  const activeSyId = (syData as any)?.sy_id ?? null;
  const curriculumId = (syData as any)?.curriculum_id ?? null;

  // Build sections early — needed for sectionIds before Round 2
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

  const sectionIds = sections.map((s) => s.section_id);

  // Round 2: 2 parallel — assignments use IN filter (no JOIN), curriculum_subjects direct
  const [{ data: allAssignmentsRaw }, { data: csRaw }] = await Promise.all([
    sectionIds.length > 0
      ? supabase
          .from("teacher_class_assignments")
          .select(
            "section_id, teacher_id, curriculum_subject:curriculum_subjects!curriculum_subject_id(curriculum_subject_id, subject_id, deleted_at, subject:subjects!subject_id(subject_type, deleted_at)), teacher:users!teacher_id(first_name, last_name)",
          )
          .in("section_id", sectionIds)
          .is("deleted_at", null)
      : Promise.resolve({ data: [] }),
    curriculumId
      ? supabase
          .from("curriculum_subjects")
          .select("curriculum_subject_id, grade_level_id, subjects!inner(subject_id, name, code, subject_type, deleted_at)")
          .eq("curriculum_id", curriculumId)
          .is("deleted_at", null)
      : Promise.resolve({ data: [] }),
  ]);

  const subjectsByGradeLevel: SubjectForGradeLevel[] = ((csRaw ?? []) as any[])
    .filter((cs: any) => cs.subjects && !cs.subjects.deleted_at)
    .map((cs: any) => ({
      curriculum_subject_id: cs.curriculum_subject_id,
      subject_id: cs.subjects.subject_id,
      name: cs.subjects.name,
      code: cs.subjects.code,
      grade_level_id: cs.grade_level_id,
      subject_type: cs.subjects.subject_type as "BOTH" | "SSES",
    }));

  // Build allAssignments — exclude assignments where curriculum_subject or subject is soft-deleted
  const allAssignments: TeacherAssignment[] = ((allAssignmentsRaw ?? []) as any[])
    .filter((a: any) => {
      const cs = a.curriculum_subject as { deleted_at: string | null; subject: { deleted_at: string | null } | null } | null;
      return cs?.deleted_at === null && cs?.subject?.deleted_at === null;
    })
    .map((a: any) => {
      const teacher = a.teacher as { first_name: string; last_name: string } | null;
      return {
        section_id: a.section_id,
        subject_id: (a.curriculum_subject as any).subject_id,
        teacher_id: a.teacher_id,
        teacher_name:
          a.teacher_id === facultyUid
            ? "You"
            : teacher
              ? `${teacher.first_name} ${teacher.last_name}`
              : "Unknown",
      };
    });

  return {
    active_sy_id: activeSyId,
    faculty: facultyRaw
      ? {
          uid: (facultyRaw as any).uid,
          first_name: (facultyRaw as any).first_name,
          last_name: (facultyRaw as any).last_name,
        }
      : null,
    grade_levels: (gradeLevelsRaw ?? []) as GradeLevel[],
    sections,
    subjects_by_grade_level: subjectsByGradeLevel,
    all_assignments: allAssignments,
    // Derived from already-fetched data — no extra queries needed
    current_advisory_section_id:
      sections.find((s) => s.adviser_id === facultyUid)?.section_id ?? null,
    current_teaching_assignments: (() => {
      const sectionTypeMap = new Map(sections.map((s) => [s.section_id, s.section_type]));
      return ((allAssignmentsRaw ?? []) as any[])
        .filter((a: any) => {
          if (a.teacher_id !== facultyUid) return false;
          const cs = a.curriculum_subject as { deleted_at: string | null; subject: { subject_type: string; deleted_at: string | null } | null } | null;
          if (!cs || cs.deleted_at !== null) return false;
          const subject = cs.subject;
          if (!subject || subject.deleted_at !== null) return false;
          // BOTH subjects are valid for any section; SSES subjects only valid for SSES sections
          return subject.subject_type === "BOTH" || sectionTypeMap.get(a.section_id) === "SSES";
        })
        .map((a: any) => ({
          section_id: a.section_id,
          subject_id: (a.curriculum_subject as any).subject_id,
        }));
    })(),
  };
}

export async function assignAcademicLoad(payload: {
  faculty_id: string;
  advisory_section_id: number | null;
  subject_assignments: { section_id: number; curriculum_subject_id: number }[];
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
