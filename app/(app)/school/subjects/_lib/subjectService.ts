import { getSupabase } from "@/lib/supabase/client";

export interface GradeLevelWithCount {
  grade_level_id: number;
  level_number: number;
  display_name: string;
  subject_count: number;
}

export interface SubjectRow {
  subject_id: number;
  code: string;
  name: string;
  description: string | null;
  teachers: string[];
}

interface GradeLevelRow {
  grade_level_id: number;
  level_number: number;
  display_name: string;
}

interface SubjectBaseRow {
  subject_id: number;
  code: string;
  name: string;
  description: string | null;
}

interface SubjectRecord {
  subject_id: number;
  name: string;
  code: string;
  description: string | null;
  deleted_at: string | null;
}

interface SubjectGradeLevelCountRecord {
  grade_level_id: number | null;
  subjects: Pick<SubjectRecord, "deleted_at"> | Pick<SubjectRecord, "deleted_at">[] | null;
}

interface SubjectGradeLevelDetailRecord {
  subject_id: number;
  subjects: SubjectRecord | SubjectRecord[] | null;
}

interface ActiveSchoolYearRecord {
  sy_id: number;
}

interface TeacherAssignmentWithUser {
  subject_id: number;
  teacher_id: string;
  users:
    | {
        first_name: string | null;
        last_name: string | null;
      }
    | {
        first_name: string | null;
        last_name: string | null;
      }[]
    | null;
}

export async function fetchGradeLevelsWithSubjectCount(): Promise<GradeLevelWithCount[]> {
  const supabase = getSupabase();

  const [{ data: gradeLevels, error: glError }, { data: sglData, error: sglError }] =
    await Promise.all([
      supabase
        .from("grade_levels")
        .select("grade_level_id, level_number, display_name")
        .order("level_number"),
      supabase
        .from("subject_grade_levels")
        .select("grade_level_id, subjects(deleted_at)")
        .is("deleted_at", null),
    ]);

  if (glError) throw new Error(glError.message);
  if (sglError) throw new Error(sglError.message);

  // Count non-deleted subjects per grade level
  const countMap: Record<number, number> = {};
  for (const sgl of (sglData ?? []) as SubjectGradeLevelCountRecord[]) {
    if (typeof sgl.grade_level_id !== "number") continue;

    const raw = sgl.subjects;
    if (!raw) continue;
    const subjects = Array.isArray(raw) ? raw : [raw];
    for (const s of subjects) {
      if (s?.deleted_at !== null) continue;
      countMap[sgl.grade_level_id] = (countMap[sgl.grade_level_id] ?? 0) + 1;
    }
  }

  const gradeLevelRows = (gradeLevels ?? []) as GradeLevelRow[];

  return gradeLevelRows.map((gl) => ({
    grade_level_id: gl.grade_level_id,
    level_number: gl.level_number,
    display_name: gl.display_name,
    subject_count: countMap[gl.grade_level_id] ?? 0,
  }));
}

export async function fetchSubjectsByGradeLevel(gradeLevelId: number): Promise<{
  gradeLevelDisplay: string;
  subjects: SubjectRow[];
}> {
  const supabase = getSupabase();

  // Fetch grade level display name, subjects, and active school year in parallel
  const [
    { data: glData, error: glError },
    { data: sglData, error: sglError },
    { data: syData, error: syError },
  ] =
    await Promise.all([
      supabase
        .from("grade_levels")
        .select("display_name")
        .eq("grade_level_id", gradeLevelId)
        .maybeSingle(),
      supabase
        .from("subject_grade_levels")
        .select("subject_id, subjects(subject_id, name, code, description, deleted_at)")
        .eq("grade_level_id", gradeLevelId)
        .is("deleted_at", null),
      supabase
        .from("school_years")
        .select("sy_id")
        .eq("is_active", true)
        .maybeSingle(),
    ]);

  if (glError) throw new Error(glError.message);
  if (sglError) throw new Error(sglError.message);
  if (syError) throw new Error(syError.message);

  const subjects: SubjectBaseRow[] = ((sglData ?? []) as SubjectGradeLevelDetailRecord[]).flatMap((sgl) => {
    const raw = sgl.subjects;
    if (!raw) return [];
    const arr = Array.isArray(raw) ? raw : [raw];
    return arr
      .filter((s) => s.deleted_at === null)
      .map((s) => ({
        subject_id: s.subject_id,
        code: s.code,
        name: s.name,
        description: s.description ?? null,
      }));
  });

  if (subjects.length === 0) {
    return { gradeLevelDisplay: glData?.display_name ?? "", subjects: [] };
  }

  const activeSyId = (syData as ActiveSchoolYearRecord | null)?.sy_id ?? null;
  const subjectIds = subjects.map((s) => s.subject_id);

  let teacherAssignments: TeacherAssignmentWithUser[] = [];

  if (activeSyId && subjectIds.length > 0) {
    // One query: assignments for active SY and grade level, with joined user names.
    const { data: assignmentData, error: assignmentError } = await supabase
      .from("teacher_class_assignments")
      .select(
        "subject_id, teacher_id, users(first_name, last_name), sections!inner(grade_level_id)",
      )
      .eq("sy_id", activeSyId)
      .eq("sections.grade_level_id", gradeLevelId)
      .in("subject_id", subjectIds);

    if (assignmentError) throw new Error(assignmentError.message);
    teacherAssignments = (assignmentData ?? []) as TeacherAssignmentWithUser[];
  }

  // Map teachers to subjects with O(1) dedupe per subject.
  const teachersBySubject = new Map<number, Set<string>>();
  for (const assignment of teacherAssignments) {
    const user = Array.isArray(assignment.users)
      ? assignment.users[0]
      : assignment.users;
    const firstName = user?.first_name?.trim() ?? "";
    const lastName = user?.last_name?.trim() ?? "";
    const fullName = `${firstName} ${lastName}`.trim();
    if (!fullName) continue;

    if (!teachersBySubject.has(assignment.subject_id)) {
      teachersBySubject.set(assignment.subject_id, new Set());
    }
    teachersBySubject.get(assignment.subject_id)?.add(fullName);
  }

  const rows: SubjectRow[] = subjects.map((s) => ({
    subject_id: s.subject_id,
    code: s.code,
    name: s.name,
    description: s.description,
    teachers: Array.from(teachersBySubject.get(s.subject_id) ?? []),
  }));

  return {
    gradeLevelDisplay: glData?.display_name ?? "",
    subjects: rows,
  };
}
