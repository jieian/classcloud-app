import { getSupabase } from "@/lib/supabase/client";

export type SectionType = "REGULAR" | "SSES";

export interface GradeLevelWithCount {
  grade_level_id: number;
  level_number: number;
  display_name: string;
  subject_count: number;
}

export interface GradeLevelsWithSubjectCountResult {
  gradeLevels: GradeLevelWithCount[];
  totalSubjectCount: number;
}

export interface SubjectRow {
  subject_id: number;
  code: string;
  name: string;
  description: string | null;
  section_type: SectionType;
  teachers: string[];
}

interface GradeLevelRow {
  grade_level_id: number;
  level_number: number;
  display_name: string;
}


interface SubjectRecord {
  subject_id: number;
  name: string;
  code: string;
  description: string | null;
  section_type: SectionType;
  deleted_at: string | null;
}

interface SubjectGradeLevelCountRecord {
  grade_level_id: number | null;
  subject_id: number;
  subjects: Pick<SubjectRecord, "deleted_at"> | Pick<SubjectRecord, "deleted_at">[] | null;
}

interface TeacherAssignmentWithUser {
  subject_id: number;
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

export async function fetchGradeLevelsWithSubjectCount(): Promise<GradeLevelsWithSubjectCountResult> {
  const supabase = getSupabase();

  const [
    { data: gradeLevels, error: glError },
    { data: sglData, error: sglError },
    { count: totalCount, error: totalError },
  ] = await Promise.all([
    supabase
      .from("grade_levels")
      .select("grade_level_id, level_number, display_name")
      .order("level_number"),
    supabase
      .from("subject_grade_levels")
      .select("grade_level_id, subject_id, subjects(deleted_at)")
      .is("deleted_at", null),
    supabase
      .from("subjects")
      .select("*", { count: "exact", head: true })
      .is("deleted_at", null),
  ]);

  if (glError) throw new Error(glError.message);
  if (sglError) throw new Error(sglError.message);
  if (totalError) throw new Error(totalError.message);

  // Count unique non-deleted subjects per grade level (deduplicate across section types)
  const seenMap: Record<number, Set<number>> = {};
  for (const sgl of (sglData ?? []) as SubjectGradeLevelCountRecord[]) {
    if (typeof sgl.grade_level_id !== "number") continue;
    const raw = sgl.subjects;
    if (!raw) continue;
    const subjects = Array.isArray(raw) ? raw : [raw];
    const subject = subjects[0];
    if (!subject || subject.deleted_at !== null) continue;
    if (!seenMap[sgl.grade_level_id]) seenMap[sgl.grade_level_id] = new Set();
    seenMap[sgl.grade_level_id].add(sgl.subject_id);
  }

  const countMap: Record<number, number> = {};
  for (const [glId, ids] of Object.entries(seenMap)) {
    countMap[Number(glId)] = ids.size;
  }

  const gradeLevelRows = (gradeLevels ?? []) as GradeLevelRow[];

  return {
    gradeLevels: gradeLevelRows.map((gl) => ({
      grade_level_id: gl.grade_level_id,
      level_number: gl.level_number,
      display_name: gl.display_name,
      subject_count: countMap[gl.grade_level_id] ?? 0,
    })),
    totalSubjectCount: totalCount ?? 0,
  };
}

// Phase 1: fast fetch — grade level name + subjects only (no teacher joins).
export async function fetchSubjectsByGradeLevel(
  gradeLevelId: number,
  sectionType: SectionType = "REGULAR",
): Promise<{
  gradeLevelDisplay: string;
  subjects: SubjectRow[];
}> {
  const supabase = getSupabase();

  // Two parallel queries: grade level name + subjects filtered in DB
  const [
    { data: glData, error: glError },
    { data: subjectsData, error: subjectsError },
  ] = await Promise.all([
    supabase
      .from("grade_levels")
      .select("display_name")
      .eq("grade_level_id", gradeLevelId)
      .maybeSingle(),
    // Query subjects directly: DB-side section_type + deleted_at filters,
    // !inner join to subject_grade_levels to restrict to this grade level only,
    // sorted in DB to avoid a JS sort pass.
    supabase
      .from("subjects")
      .select("subject_id, name, code, description, section_type, subject_grade_levels!inner(grade_level_id)")
      .eq("subject_grade_levels.grade_level_id", gradeLevelId)
      .is("subject_grade_levels.deleted_at", null)
      .eq("section_type", sectionType)
      .is("deleted_at", null)
      .order("code"),
  ]);

  if (glError) throw new Error(glError.message);
  if (subjectsError) throw new Error(subjectsError.message);

  const subjects: SubjectRow[] = (subjectsData ?? []).map((s: SubjectRecord) => ({
    subject_id: s.subject_id,
    code: s.code,
    name: s.name,
    description: s.description,
    section_type: s.section_type as SectionType,
    teachers: [],
  }));

  return { gradeLevelDisplay: glData?.display_name ?? "", subjects };
}

// Phase 2: background fetch — teacher assignments for the given subjects.
// Filtered by grade_level (via sections join) and active school year (via school_years join).
// deleted_at IS NULL covers soft-deleted assignments and soft-deleted teachers.
export async function fetchTeachersForSubjects(
  gradeLevelId: number,
  subjectIds: number[],
): Promise<Map<number, string[]>> {
  if (subjectIds.length === 0) return new Map();

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("teacher_class_assignments")
    .select(
      "subject_id, users(first_name, last_name), sections!inner(grade_level_id), school_years!inner(is_active)",
    )
    .eq("sections.grade_level_id", gradeLevelId)
    .eq("school_years.is_active", true)
    .in("subject_id", subjectIds)
    .is("deleted_at", null);

  if (error) throw new Error(error.message);

  const bySubject = new Map<number, Set<string>>();
  for (const assignment of (data ?? []) as TeacherAssignmentWithUser[]) {
    const user = Array.isArray(assignment.users) ? assignment.users[0] : assignment.users;
    const fullName = `${user?.first_name?.trim() ?? ""} ${user?.last_name?.trim() ?? ""}`.trim();
    if (!fullName) continue;
    if (!bySubject.has(assignment.subject_id)) bySubject.set(assignment.subject_id, new Set());
    bySubject.get(assignment.subject_id)!.add(fullName);
  }

  return new Map(Array.from(bySubject.entries()).map(([id, names]) => [id, Array.from(names)]));
}
