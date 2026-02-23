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

  // 1. Active school year
  const { data: syData } = await supabase
    .from("school_years")
    .select("sy_id")
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();

  const activeSyId = syData?.sy_id ?? null;

  // 2. Fetch faculty info + parallel data (even if no active SY, we need faculty name)
  const [
    { data: facultyRaw },
    { data: gradeLevelsRaw },
    { data: sectionsRaw },
    { data: subjectGlRaw },
    { data: allAssignmentsRaw },
    { data: currentAdvisory },
    { data: currentTeaching },
  ] = await Promise.all([
    supabase
      .from("users")
      .select("uid, first_name, last_name")
      .eq("uid", facultyUid)
      .maybeSingle(),
    supabase
      .from("grade_levels")
      .select("grade_level_id, level_number, display_name")
      .order("level_number"),
    activeSyId
      ? supabase
          .from("sections")
          .select("section_id, name, grade_level_id, sy_id, adviser_id, section_type")
          .eq("sy_id", activeSyId)
          .order("name")
      : Promise.resolve({ data: [] }),
    supabase
      .from("subject_grade_levels")
      .select("grade_level_id, subjects(subject_id, name, code)"),
    activeSyId
      ? supabase
          .from("teacher_class_assignments")
          .select("section_id, subject_id, teacher_id")
          .eq("sy_id", activeSyId)
      : Promise.resolve({ data: [] }),
    activeSyId
      ? supabase
          .from("sections")
          .select("section_id")
          .eq("adviser_id", facultyUid)
          .eq("sy_id", activeSyId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    activeSyId
      ? supabase
          .from("teacher_class_assignments")
          .select("section_id, subject_id")
          .eq("teacher_id", facultyUid)
          .eq("sy_id", activeSyId)
      : Promise.resolve({ data: [] }),
  ]);

  // 3. Collect all external user IDs (advisers + teachers) and fetch names in one query
  const adviserIds = new Set(
    (sectionsRaw ?? [])
      .filter((s) => s.adviser_id && s.adviser_id !== facultyUid)
      .map((s) => s.adviser_id as string),
  );
  const teacherIds = new Set(
    (allAssignmentsRaw ?? [])
      .filter((a) => a.teacher_id !== facultyUid)
      .map((a) => a.teacher_id),
  );
  const externalIds = [...new Set([...adviserIds, ...teacherIds])];

  let nameMap: Record<string, string> = {};
  if (externalIds.length > 0) {
    const { data: externalUsers } = await supabase
      .from("users")
      .select("uid, first_name, last_name")
      .in("uid", externalIds);
    nameMap = Object.fromEntries(
      (externalUsers ?? []).map((u) => [u.uid, `${u.first_name} ${u.last_name}`]),
    );
  }

  // 4. Build sections with adviser names
  const sections: SectionWithAdviser[] = (sectionsRaw ?? []).map((s) => ({
    section_id: s.section_id,
    name: s.name,
    grade_level_id: s.grade_level_id,
    sy_id: s.sy_id,
    adviser_id: s.adviser_id,
    section_type: s.section_type as "SSES" | "REGULAR",
    adviser_name:
      s.adviser_id && s.adviser_id !== facultyUid
        ? (nameMap[s.adviser_id] ?? null)
        : null,
  }));

  // 6. Flatten subjects by grade level
  const subjectsByGradeLevel: SubjectForGradeLevel[] = (subjectGlRaw ?? []).flatMap(
    (sgl: any) => {
      const raw = sgl.subjects;
      if (!raw) return [];
      const subjects = Array.isArray(raw) ? raw : [raw];
      return subjects.map((s: any) => ({
        subject_id: s.subject_id,
        name: s.name,
        code: s.code,
        grade_level_id: sgl.grade_level_id,
      }));
    },
  );

  // 5. All assignments with teacher names
  const allAssignments: TeacherAssignment[] = (allAssignmentsRaw ?? []).map((a) => ({
    section_id: a.section_id,
    subject_id: a.subject_id,
    teacher_id: a.teacher_id,
    teacher_name:
      a.teacher_id === facultyUid ? "You" : (nameMap[a.teacher_id] ?? "Unknown"),
  }));

  return {
    active_sy_id: activeSyId,
    faculty: facultyRaw
      ? { uid: facultyRaw.uid, first_name: facultyRaw.first_name, last_name: facultyRaw.last_name }
      : null,
    grade_levels: (gradeLevelsRaw ?? []) as GradeLevel[],
    sections,
    subjects_by_grade_level: subjectsByGradeLevel,
    all_assignments: allAssignments,
    current_advisory_section_id: (currentAdvisory as any)?.section_id ?? null,
    current_teaching_assignments: (currentTeaching ?? []).map((a) => ({
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
