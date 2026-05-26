import { supabase } from "@/lib/exam-supabase";

// ─── In-memory session cache ──────────────────────────────────────────────────
// Keyed by a string derived from function arguments. Cleared on full page reload.
const _cache = new Map<string, unknown>();

function cacheGet<T>(key: string): T | undefined {
  return _cache.has(key) ? (_cache.get(key) as T) : undefined;
}
function cacheSet<T>(key: string, value: T): T {
  _cache.set(key, value);
  return value;
}

/** Call after exam finalization so stale report data is not served. */
export function invalidateReportsCache(): void {
  _cache.clear();
}

export type ReportExamOption = {
  examId: number;
  title: string;
  totalItems: number;
  examDate: string | null;
  assignmentIds: number[];
};

export type ExamDetailsSummary = {
  totalItems: number;
  numberOfCases: number;
  totalScore: number;
  mean: number;
  pl: number;
  highestScore: number;
  lowestScore: number;
  mps: number;
  passCount: number;
};

export type ProficiencyRow = {
  enrollmentId: number;
  pupilName: string;
  testScore: number;
  totalItems: number;
  mpl: number;
  proficiencyLevel: string;
  sex: "Male" | "Female";
};

export type ItemAnalysisRow = {
  itemNo: number;
  objective: string;
  correctResponses: number;
  rank: number;
};

export type ItemAnalysisSummary = {
  rows: ItemAnalysisRow[];
  topMostLearned: ItemAnalysisRow[];
  topLeastLearned: ItemAnalysisRow[];
};

export type ReportExamCard = {
  examId: number;
  title: string;
  totalItems: number;
  examDate: string | null;
  subjectId: number | null;
  subjectName: string;
  subjectType: "BOTH" | "SSES" | null;
  isFinalized: boolean;
  sectionId: number;
  sectionName: string;
  gradeLevelId: number;
  gradeDisplayName: string;
  gradeLevelNumber: number | null;
  assignmentIds: number[];
};

export type ReportSectionCard = {
  sectionId: number;
  sectionName: string;
  gradeLevelId: number;
  gradeDisplayName: string;
  gradeLevelNumber: number | null;
  totalExams: number;
  finalizedExams: number;
  isFinalized: boolean;
  latestExamDate: string | null;
  latestExamId: number | null;
  subjectNames: string[];
};

export type ReportSubjectStatus = "Finalized" | "Not Finalized" | "No exam yet";

export type ReportSectionSubjectRow = {
  subjectId: number;
  curriculumSubjectId: number;
  subjectName: string;
  subjectType: "BOTH" | "SSES" | null;
  teacherName: string | null;
  status: ReportSubjectStatus;
  latestExamId: number | null;
  latestExamTitle: string | null;
};

export type ReportSectionOverview = {
  sectionId: number;
  sectionName: string;
  gradeLevelId: number;
  gradeDisplayName: string;
  gradeLevelNumber: number | null;
  totalExams: number;
  finalizedExams: number;
  isFinalized: boolean;
  latestExamId: number | null;
  latestExamTitle: string | null;
  latestExamDate: string | null;
  subjects: ReportSectionSubjectRow[];
};

export type ReportSubjectCard = {
  subjectId: number;
  subjectName: string;
  subjectType: "BOTH" | "SSES" | null;
  gradeLevelId: number;
  gradeDisplayName: string;
  gradeLevelNumber: number | null;
  sectionCount: number;
  finalizedSections: number;
  isFinalized: boolean;
  teacherNames: string[];
  sectionNames: string[];
  latestExamId: number | null;
  latestExamDate: string | null;
};

export type ReportSubjectSectionRow = {
  sectionId: number;
  sectionName: string;
  teacherName: string | null;
  status: ReportSubjectStatus;
  latestExamId: number | null;
  latestExamTitle: string | null;
};

export type ReportSubjectOverview = {
  subjectId: number;
  curriculumSubjectId: number;
  subjectName: string;
  subjectType: "BOTH" | "SSES" | null;
  gradeLevelId: number;
  gradeDisplayName: string;
  gradeLevelNumber: number | null;
  sectionCount: number;
  finalizedSections: number;
  isFinalized: boolean;
  latestExamId: number | null;
  latestExamTitle: string | null;
  latestExamDate: string | null;
  sections: ReportSubjectSectionRow[];
};

export type ConsolidatedReportResult = {
  summary: ExamDetailsSummary | null;
  proficiencyRows: ProficiencyRow[];
  itemAnalysis: ItemAnalysisSummary;
  sectionCount: number;
};

export type ConsolidatedSubjectSectionResult = {
  sectionId: number;
  sectionName: string;
  isSses: boolean;
  examId: number | null;
  isFinalized: boolean;
  summary: ExamDetailsSummary | null;
  median: number | null;
  sd: number | null;
  proficiencyRows: ProficiencyRow[];
  itemAnalysis: ItemAnalysisSummary;
};

export type ConsolidatedSubjectDiagnosticResult = {
  examTitle: string;
  subjectName: string;
  gradeDisplayName: string;
  sections: ConsolidatedSubjectSectionResult[];
  summary: ExamDetailsSummary | null;
  median: number | null;
  sd: number | null;
  itemAnalysis: ItemAnalysisSummary;
  sectionCount: number;
  finalizedSectionCount: number;
};

type SubjectJoin = {
  name: string | null;
  subject_type?: "BOTH" | "SSES" | null;
};

type CurriculumSubjectJoin = {
  subject_id: number | null;
  subjects: SubjectJoin | SubjectJoin[] | null;
};

type ActiveCurriculumSubject = {
  curriculumSubjectId: number;
  subjectId: number;
  subjectName: string;
  subjectType: "BOTH" | "SSES" | null;
  gradeLevelId: number;
};

type GradeJoin = {
  display_name: string;
  level_number: number | null;
};

type SectionJoin = {
  section_id: number;
  name: string;
  grade_level_id: number | null;
  grade_levels: GradeJoin | GradeJoin[] | null;
};

type ExamJoin = {
  exam_id: number;
  title: string;
  total_items: number | null;
  answer_key:
    | {
        total_questions?: number | null;
      }
    | null;
  exam_date: string | null;
  is_locked?: boolean | null;
  curriculum_subjects?: CurriculumSubjectJoin | CurriculumSubjectJoin[] | null;
};

type RawAssignmentRow = {
  id: number;
  exam_id: number | null;
  section_id?: number | null;
  sections?: SectionJoin | SectionJoin[] | null;
  exams: ExamJoin | ExamJoin[] | null;
};

type RawSectionTeacherRow = {
  section_id?: number | null;
  curriculum_subject_id: number | null;
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
  curriculum_subjects:
    | {
        subject_id: number | null;
        subjects: SubjectJoin | SubjectJoin[] | null;
      }
    | {
        subject_id: number | null;
        subjects: SubjectJoin | SubjectJoin[] | null;
      }[]
    | null;
};

type RawSectionOnly = {
  section_id: number;
  name: string;
  grade_level_id: number | null;
  sy_id?: number | null;
  grade_levels: GradeJoin | GradeJoin[] | null;
};

type RawExamResultReportRow = {
  exam_id?: number | null;
  section_id?: number | null;
  curriculum_subject_id?: number | null;
  grade_level_id?: number | null;
  quarter_id?: number | null;
  section_type?: "REGULAR" | "SSES" | null;
  generated_at?: string | null;
  total_items?: number | null;
  total_cases?: number | null;
  total_score?: number | null;
  mean?: number | null;
  pl?: number | null;
  highest_score?: number | null;
  lowest_score?: number | null;
  mps?: number | null;
  total_achieved?: number | null;
  student_scores?: unknown;
};

type RawSavedStudentScore = {
  enrollment_id?: number | null;
  enrollmentId?: number | null;
  student_name?: string | null;
  pupilName?: string | null;
  score?: number | null;
  testScore?: number | null;
  total_items?: number | null;
  totalItems?: number | null;
  mpl?: number | null;
  proficiency_level?: string | null;
  proficiencyLevel?: string | null;
  sex?: string | null;
};

type RawItemAnalysisReportRow = {
  item_scores?: unknown;
  most_learned?: unknown;
  least_learned?: unknown;
};

type RawSavedItemAnalysisRow = {
  item_no?: number | null;
  itemNo?: number | null;
  objective?: string | null;
  correct_responses?: number | null;
  correctResponses?: number | null;
  rank?: number | null;
};

function getProficiencyFromMpl(mpl: number): string {
  if (mpl >= 90) return "Highly Proficient";
  if (mpl >= 75) return "Proficient";
  if (mpl >= 50) return "Nearly Proficient";
  if (mpl >= 25) return "Low Proficient";
  return "Not Proficient";
}

function normalizeSex(value: string | null | undefined): "Male" | "Female" | null {
  const raw = (value ?? "").trim().toLowerCase();
  if (!raw) return null;
  if (
    raw === "male" ||
    raw === "m" ||
    raw === "boy" ||
    raw === "lalaki" ||
    raw.startsWith("male")
  ) {
    return "Male";
  }
  if (
    raw === "female" ||
    raw === "f" ||
    raw === "girl" ||
    raw === "babae" ||
    raw.startsWith("female")
  ) {
    return "Female";
  }
  return null;
}

function isSchemaCacheTransientError(message: string): boolean {
  return message.toLowerCase().includes("schema cache");
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function firstJoin<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function toTeacherName(
  userJoin:
    | { first_name: string | null; last_name: string | null }
    | { first_name: string | null; last_name: string | null }[]
    | null
    | undefined,
): string | null {
  const user = firstJoin(userJoin);
  if (!user) return null;
  const full = `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim();
  return full || null;
}

function resolveReportTotalItems(exam: {
  total_items: number | null;
  answer_key: { total_questions?: number | null } | null;
}): number {
  const fromAnswerKey = exam.answer_key?.total_questions;
  if (typeof fromAnswerKey === "number" && Number.isFinite(fromAnswerKey)) {
    return fromAnswerKey;
  }
  if (typeof exam.total_items === "number" && Number.isFinite(exam.total_items)) {
    return exam.total_items;
  }
  return 0;
}

function getExamSortScore(examDate: string | null, examId: number): number {
  const timestamp = examDate ? new Date(examDate).getTime() : 0;
  const safeTimestamp = Number.isFinite(timestamp) ? timestamp : 0;
  return safeTimestamp * 10_000 + examId;
}

function isSsesSectionName(name: string): boolean {
  return /\bSSES\b/i.test(name.trim());
}

function isSubjectApplicableToSection(
  subject: { subjectType: "BOTH" | "SSES" | null },
  sectionName: string,
): boolean {
  return subject.subjectType !== "SSES" || isSsesSectionName(sectionName);
}

function getSubjectInfo(exam: ExamJoin): {
  subjectId: number | null;
  subjectName: string;
  subjectType: "BOTH" | "SSES" | null;
} {
  const curriculumJoin = firstJoin(exam.curriculum_subjects);
  const subjectJoin = firstJoin(curriculumJoin?.subjects);
  return {
    subjectId: curriculumJoin?.subject_id ?? null,
    subjectName: subjectJoin?.name ?? "Unknown Subject",
    subjectType: subjectJoin?.subject_type ?? null,
  };
}

type BulkTeacherEntry = {
  teacherName: string | null;
  subjectName: string;
  subjectType: "BOTH" | "SSES" | null;
};

function compareSubjectType(a: "BOTH" | "SSES" | null, b: "BOTH" | "SSES" | null): number {
  if (a === b) return 0;
  return a === "SSES" ? -1 : 1;
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function reportKey(examId: number, sectionId: number): string {
  return `${examId}-${sectionId}`;
}

function subjectGradeKey(gradeLevelId: number, subjectId: number): string {
  return `${gradeLevelId}-${subjectId}`;
}

function aggregateSummaries(rows: ExamDetailsSummary[]): ExamDetailsSummary | null {
  if (rows.length === 0) return null;
  const numberOfCases = rows.reduce((sum, row) => sum + row.numberOfCases, 0);
  const totalScore = rows.reduce((sum, row) => sum + row.totalScore, 0);
  const totalItems = Math.max(...rows.map((row) => row.totalItems), 0);
  const highestScore = Math.max(...rows.map((row) => row.highestScore), 0);
  const lowestScore = Math.min(...rows.map((row) => row.lowestScore));
  const passCount = rows.reduce((sum, row) => sum + row.passCount, 0);
  const mean = numberOfCases > 0 ? totalScore / numberOfCases : 0;
  const mps = totalItems > 0 ? (mean / totalItems) * 100 : 0;
  const pl = rows.reduce((sum, row) => sum + row.pl * row.numberOfCases, 0) / Math.max(numberOfCases, 1);

  return {
    totalItems,
    numberOfCases,
    totalScore,
    mean,
    pl,
    highestScore,
    lowestScore: Number.isFinite(lowestScore) ? lowestScore : 0,
    mps,
    passCount,
  };
}

function aggregateItemAnalysis(summaries: ItemAnalysisSummary[]): ItemAnalysisSummary {
  const grouped = new Map<number, ItemAnalysisRow>();
  for (const summary of summaries) {
    for (const row of summary.rows) {
      const existing = grouped.get(row.itemNo);
      if (!existing) {
        grouped.set(row.itemNo, { ...row });
        continue;
      }
      existing.correctResponses += row.correctResponses;
      if (existing.objective === "-" && row.objective !== "-") existing.objective = row.objective;
    }
  }

  const ranked = Array.from(grouped.values())
    .sort((a, b) => b.correctResponses - a.correctResponses || a.itemNo - b.itemNo)
    .map((row, index) => ({ ...row, rank: index + 1 }));
  const rows = [...ranked].sort((a, b) => a.itemNo - b.itemNo);

  return {
    rows,
    topMostLearned: ranked.slice(0, 5),
    topLeastLearned: [...ranked].reverse().slice(0, 5),
  };
}

function median(values: number[]): number | null {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function standardDeviation(values: number[]): number | null {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) return null;
  const mean = finite.reduce((sum, value) => sum + value, 0) / finite.length;
  const variance =
    finite.reduce((sum, value) => sum + (value - mean) ** 2, 0) / finite.length;
  return Math.sqrt(variance);
}

async function fetchFinalizedReportKeys(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("exam_results_reports")
    .select("exam_id, section_id");

  if (error) {
    console.error(
      "[reportsAnalysisService] fetchFinalizedReportKeys error:",
      error.message,
    );
    return new Set();
  }

  return new Set(
    ((data ?? []) as RawExamResultReportRow[])
      .filter((row) => row.exam_id != null && row.section_id != null)
      .map((row) => reportKey(Number(row.exam_id), Number(row.section_id))),
  );
}

async function fetchActiveSectionsForReports(): Promise<RawSectionOnly[]> {
  const { data: syData } = await supabase
    .from("school_years")
    .select("sy_id")
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();

  let query = supabase
    .from("sections")
    .select("section_id, name, grade_level_id, sy_id, grade_levels(display_name, level_number)")
    .is("deleted_at", null)
    .order("name", { ascending: true });

  if (syData?.sy_id) {
    query = query.eq("sy_id", syData.sy_id);
  }

  const { data, error } = await query;
  if (error) {
    console.error(
      "[reportsAnalysisService] fetchActiveSectionsForReports error:",
      error.message,
    );
    return [];
  }

  return (data ?? []) as RawSectionOnly[];
}

async function fetchSectionSubjectsForReports(): Promise<Map<number, Map<number, string>>> {
  const { data, error } = await supabase
    .from("teacher_class_assignments")
    .select(
      "section_id, curriculum_subjects!inner(subject_id, subjects(name))",
    )
    .is("deleted_at", null);

  if (error) {
    console.error(
      "[reportsAnalysisService] fetchSectionSubjectsForReports error:",
      error.message,
    );
    return new Map();
  }

  const result = new Map<number, Map<number, string>>();

  for (const row of (data ?? []) as RawSectionTeacherRow[]) {
    const sectionId = row.section_id ?? null;
    const curriculum = firstJoin(row.curriculum_subjects);
    if (sectionId == null || !curriculum || curriculum.subject_id == null) continue;
    const subjectId = curriculum.subject_id;

    const subjectJoin = firstJoin(curriculum.subjects);
    const subjectName = subjectJoin?.name ?? "Unknown Subject";

    if (!result.has(sectionId)) result.set(sectionId, new Map());
    result.get(sectionId)!.set(subjectId, subjectName);
  }

  return result;
}

async function fetchAllTeacherAssignmentsWithNames(): Promise<Map<number, Map<number, BulkTeacherEntry>>> {
  const cacheKey = "allTeacherAssignments";
  const cached = cacheGet<Map<number, Map<number, BulkTeacherEntry>>>(cacheKey);
  if (cached) return cached;

  const { data, error } = await supabase
    .from("teacher_class_assignments")
    .select(
      "section_id, curriculum_subjects!inner(subject_id, subjects(name, subject_type)), users!teacher_id(first_name, last_name)",
    )
    .is("deleted_at", null);

  if (error) {
    console.error("[reportsAnalysisService] fetchAllTeacherAssignmentsWithNames error:", error.message);
    return new Map();
  }

  const result = new Map<number, Map<number, BulkTeacherEntry>>();

  for (const row of (data ?? []) as RawSectionTeacherRow[]) {
    const sectionId = row.section_id ?? null;
    const curriculum = firstJoin(row.curriculum_subjects);
    if (sectionId == null || !curriculum || curriculum.subject_id == null) continue;
    const subjectId = curriculum.subject_id;
    const subjectJoin = firstJoin(curriculum.subjects);
    const teacherName = toTeacherName(row.users);

    if (!result.has(sectionId)) result.set(sectionId, new Map());
    if (!result.get(sectionId)!.has(subjectId)) {
      result.get(sectionId)!.set(subjectId, {
        teacherName,
        subjectName: subjectJoin?.name ?? "Unknown Subject",
        subjectType: subjectJoin?.subject_type ?? null,
      });
    }
  }

  return cacheSet(cacheKey, result);
}

async function fetchActiveCurriculumSubjectsForReports(): Promise<ActiveCurriculumSubject[]> {
  const { data: syData, error: syError } = await supabase
    .from("school_years")
    .select("curriculum_id")
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (syError) {
    console.error(
      "[reportsAnalysisService] fetchActiveCurriculumSubjectsForReports sy error:",
      syError.message,
    );
    return [];
  }

  const curriculumId = (syData as { curriculum_id?: number | null } | null)?.curriculum_id ?? null;
  if (curriculumId == null) return [];

  const { data, error } = await supabase
    .from("curriculum_subjects")
    .select("curriculum_subject_id, subject_id, grade_level_id, subjects!inner(name, subject_type, deleted_at)")
    .eq("curriculum_id", curriculumId)
    .is("deleted_at", null);

  if (error) {
    console.error(
      "[reportsAnalysisService] fetchActiveCurriculumSubjectsForReports error:",
      error.message,
    );
    return [];
  }

  return ((data ?? []) as {
    curriculum_subject_id: number | null;
    subject_id: number | null;
    grade_level_id: number | null;
    subjects: SubjectJoin | SubjectJoin[] | null;
  }[])
    .map((row) => {
      const subjectJoin = firstJoin(row.subjects);
      if (
        row.curriculum_subject_id == null ||
        row.subject_id == null ||
        row.grade_level_id == null ||
        !subjectJoin
      ) {
        return null;
      }
      return {
        curriculumSubjectId: row.curriculum_subject_id,
        subjectId: row.subject_id,
        subjectName: subjectJoin.name ?? "Unknown Subject",
        subjectType: subjectJoin.subject_type ?? null,
        gradeLevelId: row.grade_level_id,
      };
    })
    .filter((row): row is ActiveCurriculumSubject => row != null);
}

export async function fetchReportExamsForSection(
  sectionId: number,
): Promise<ReportExamOption[]> {
  const { data, error } = await supabase
    .from("exam_assignments")
    .select(
      "id, exam_id, exams!inner(exam_id, title, total_items, answer_key, exam_date, deleted_at)",
    )
    .eq("section_id", sectionId)
    .is("exams.deleted_at", null);

  if (error) {
    console.error(
      "[reportsAnalysisService] fetchReportExamsForSection error:",
      error.message,
    );
    return [];
  }

  const grouped = new Map<number, ReportExamOption>();

  for (const row of (data ?? []) as RawAssignmentRow[]) {
    const examJoin = firstJoin(row.exams);
    const examId = examJoin?.exam_id ?? row.exam_id ?? null;
    if (!examJoin || examId == null) continue;

    const existing = grouped.get(examId);
    if (existing) {
      existing.assignmentIds.push(row.id);
      continue;
    }

    grouped.set(examId, {
      examId,
      title: examJoin.title,
      totalItems: resolveReportTotalItems(examJoin),
      examDate: examJoin.exam_date,
      assignmentIds: [row.id],
    });
  }

  return Array.from(grouped.values()).sort((a, b) => {
    const ta = a.examDate ? new Date(a.examDate).getTime() : 0;
    const tb = b.examDate ? new Date(b.examDate).getTime() : 0;
    if (tb !== ta) return tb - ta;
    return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  });
}

export async function fetchReportExamCards(): Promise<ReportExamCard[]> {
  const cached = cacheGet<ReportExamCard[]>("examCards");
  if (cached) return cached;
  const maxAttempts = 3;
  let data: RawAssignmentRow[] | null = null;
  let finalError: { message: string } | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await supabase
      .from("exam_assignments")
      .select(
        "id, exam_id, section_id, sections!inner(section_id, name, grade_level_id, grade_levels!inner(display_name, level_number)), exams!inner(exam_id, title, total_items, answer_key, exam_date, is_locked, deleted_at, curriculum_subjects(subject_id, subjects(name, subject_type)))",
      )
      .is("exams.deleted_at", null);

    if (!result.error) {
      data = (result.data ?? []) as RawAssignmentRow[];
      finalError = null;
      break;
    }

    finalError = { message: result.error.message };
    if (
      isSchemaCacheTransientError(result.error.message) &&
      attempt < maxAttempts
    ) {
      await sleep(180 * attempt);
      continue;
    }
    break;
  }

  if (finalError) {
    console.error(
      "[reportsAnalysisService] fetchReportExamCards error:",
      finalError.message,
    );
    return [];
  }

  const finalizedKeys = await fetchFinalizedReportKeys();
  const grouped = new Map<string, ReportExamCard>();

  for (const row of data ?? []) {
    const examJoin = firstJoin(row.exams);
    const sectionJoin = firstJoin(row.sections);
    if (!examJoin || !sectionJoin || sectionJoin.grade_level_id == null) continue;

    const gradeJoin = firstJoin(sectionJoin.grade_levels);
    if (!gradeJoin) continue;
    const subjectInfo = getSubjectInfo(examJoin);

    const key = reportKey(examJoin.exam_id, sectionJoin.section_id);
    const existing = grouped.get(key);
    if (existing) {
      existing.assignmentIds.push(row.id);
      continue;
    }

    grouped.set(key, {
      examId: examJoin.exam_id,
      title: examJoin.title,
      totalItems: resolveReportTotalItems(examJoin),
      examDate: examJoin.exam_date,
      subjectId: subjectInfo.subjectId,
      subjectName: subjectInfo.subjectName,
      subjectType: subjectInfo.subjectType,
      isFinalized: finalizedKeys.has(key),
      sectionId: sectionJoin.section_id,
      sectionName: sectionJoin.name,
      gradeLevelId: sectionJoin.grade_level_id,
      gradeDisplayName: gradeJoin.display_name,
      gradeLevelNumber: gradeJoin.level_number,
      assignmentIds: [row.id],
    });
  }

  return cacheSet("examCards", Array.from(grouped.values()).sort((a, b) => {
    const ga = a.gradeLevelNumber ?? Number.MAX_SAFE_INTEGER;
    const gb = b.gradeLevelNumber ?? Number.MAX_SAFE_INTEGER;
    if (ga !== gb) return ga - gb;

    const ta = a.examDate ? new Date(a.examDate).getTime() : 0;
    const tb = b.examDate ? new Date(b.examDate).getTime() : 0;
    if (tb !== ta) return tb - ta;

    return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  }));
}

export async function fetchReportSectionCards(): Promise<ReportSectionCard[]> {
  const cached = cacheGet<ReportSectionCard[]>("sectionCards");
  if (cached) return cached;
  const examCards = await fetchReportExamCards();
  const [activeSections, activeSubjects] = await Promise.all([
    fetchActiveSectionsForReports(),
    fetchActiveCurriculumSubjectsForReports(),
  ]);
  const subjectsByGrade = new Map<number, ActiveCurriculumSubject[]>();
  for (const subject of activeSubjects) {
    if (!subjectsByGrade.has(subject.gradeLevelId)) subjectsByGrade.set(subject.gradeLevelId, []);
    subjectsByGrade.get(subject.gradeLevelId)!.push(subject);
  }
  const grouped = new Map<number, ReportSectionCard>();
  const latestBySectionSubject = new Map<string, ReportExamCard>();

  for (const card of examCards) {
    const existing = grouped.get(card.sectionId);
    if (!existing) {
      grouped.set(card.sectionId, {
        sectionId: card.sectionId,
        sectionName: card.sectionName,
        gradeLevelId: card.gradeLevelId,
        gradeDisplayName: card.gradeDisplayName,
        gradeLevelNumber: card.gradeLevelNumber,
        totalExams: 0,
        finalizedExams: 0,
        isFinalized: false,
        latestExamDate: null,
        latestExamId: null,
        subjectNames: [],
      });
    }

    const current = grouped.get(card.sectionId)!;
    const currentSort = getExamSortScore(current.latestExamDate, current.latestExamId ?? 0);
    const candidateSort = getExamSortScore(card.examDate, card.examId);
    if (candidateSort >= currentSort) {
      current.latestExamDate = card.examDate;
      current.latestExamId = card.examId;
    }

    if (card.subjectId != null) {
      const subjectKey = `${card.sectionId}-${card.subjectId}`;
      const latest = latestBySectionSubject.get(subjectKey);
      if (!latest) {
        latestBySectionSubject.set(subjectKey, card);
      } else {
        const latestSort = getExamSortScore(latest.examDate, latest.examId);
        if (candidateSort >= latestSort) {
          latestBySectionSubject.set(subjectKey, card);
        }
      }
    }
  }

  for (const latestCard of latestBySectionSubject.values()) {
    const current = grouped.get(latestCard.sectionId);
    if (!current) continue;
    const activeSectionSubjects = subjectsByGrade
      .get(current.gradeLevelId)
      ?.filter((subject) => isSubjectApplicableToSection(subject, current.sectionName)) ?? [];
    if (!activeSectionSubjects.some((subject) => subject.subjectId === latestCard.subjectId)) {
      continue;
    }
    current.totalExams += 1;
    if (latestCard.isFinalized) current.finalizedExams += 1;
  }

  for (const section of activeSections) {
    if (section.grade_level_id == null) continue;
    const gradeJoin = firstJoin(section.grade_levels);
    if (!gradeJoin) continue;
    if (grouped.has(section.section_id)) continue;

    grouped.set(section.section_id, {
      sectionId: section.section_id,
      sectionName: section.name,
      gradeLevelId: section.grade_level_id,
      gradeDisplayName: gradeJoin.display_name,
      gradeLevelNumber: gradeJoin.level_number,
      totalExams: 0,
      finalizedExams: 0,
      isFinalized: false,
      latestExamDate: null,
      latestExamId: null,
      subjectNames: [],
    });
  }

  const cards = Array.from(grouped.values()).map((card) => ({
    ...card,
    subjectNames: (subjectsByGrade.get(card.gradeLevelId) ?? [])
      .filter((subject) => isSubjectApplicableToSection(subject, card.sectionName))
      .map((subject) => subject.subjectName)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
  })).map((card) => ({
    ...card,
    totalExams: card.subjectNames.length,
    isFinalized: card.subjectNames.length > 0 && card.finalizedExams === card.subjectNames.length,
  }));

  return cacheSet("sectionCards", cards.sort((a, b) => {
    const ga = a.gradeLevelNumber ?? Number.MAX_SAFE_INTEGER;
    const gb = b.gradeLevelNumber ?? Number.MAX_SAFE_INTEGER;
    if (ga !== gb) return ga - gb;
    const aIsSses = isSsesSectionName(a.sectionName);
    const bIsSses = isSsesSectionName(b.sectionName);
    if (aIsSses !== bIsSses) return aIsSses ? -1 : 1;
    return a.sectionName.localeCompare(b.sectionName, undefined, {
      sensitivity: "base",
    });
  }));
}

export async function fetchReportSectionOverview(
  sectionId: number,
): Promise<ReportSectionOverview | null> {
  const cacheKey = `sectionOverview:${sectionId}`;
  const cached = cacheGet<ReportSectionOverview | null>(cacheKey);
  if (cached !== undefined) return cached;
  const sectionCards = await fetchReportSectionCards();
  const sectionCard = sectionCards.find((card) => card.sectionId === sectionId) ?? null;

  const { data: sectionOnlyData, error: sectionOnlyError } = await supabase
    .from("sections")
    .select("section_id, name, grade_level_id, grade_levels(display_name, level_number)")
    .eq("section_id", sectionId)
    .maybeSingle();

  if (sectionOnlyError) {
    console.error(
      "[reportsAnalysisService] fetchReportSectionOverview section error:",
      sectionOnlyError.message,
    );
    return null;
  }

  const sectionOnly = sectionOnlyData as RawSectionOnly | null;
  if (!sectionOnly || sectionOnly.grade_level_id == null) return null;
  const gradeJoin = firstJoin(sectionOnly.grade_levels);
  if (!gradeJoin) return null;

  const examCards = (await fetchReportExamCards()).filter(
    (card) => card.sectionId === sectionId,
  );

  const latestBySubject = new Map<number, ReportExamCard>();
  for (const card of examCards) {
    if (card.subjectId == null) continue;
    const existing = latestBySubject.get(card.subjectId);
    if (!existing) {
      latestBySubject.set(card.subjectId, card);
      continue;
    }
    const existingSort = getExamSortScore(existing.examDate, existing.examId);
    const candidateSort = getExamSortScore(card.examDate, card.examId);
    if (candidateSort >= existingSort) {
      latestBySubject.set(card.subjectId, card);
    }
  }

  const [activeSubjects, teacherResult] = await Promise.all([
    fetchActiveCurriculumSubjectsForReports(),
    supabase
    .from("teacher_class_assignments")
    .select(
      "curriculum_subject_id, users!teacher_id(first_name, last_name), curriculum_subjects!inner(subject_id, subjects(name, subject_type))",
    )
    .eq("section_id", sectionId)
      .is("deleted_at", null),
  ]);

  if (teacherResult.error) {
    console.error(
      "[reportsAnalysisService] fetchReportSectionOverview teacher error:",
      teacherResult.error.message,
    );
  }

  const subjectRows = new Map<number, ReportSectionSubjectRow>();

  for (const subject of activeSubjects.filter(
    (row) =>
      row.gradeLevelId === sectionOnly.grade_level_id &&
      isSubjectApplicableToSection(row, sectionOnly.name),
  )) {
    const latestExam = latestBySubject.get(subject.subjectId) ?? null;
    subjectRows.set(subject.subjectId, {
      subjectId: subject.subjectId,
      curriculumSubjectId: subject.curriculumSubjectId,
      subjectName: subject.subjectName,
      subjectType: subject.subjectType,
      teacherName: null,
      status: latestExam
        ? latestExam.isFinalized
          ? "Finalized"
          : "Not Finalized"
        : "No exam yet",
      latestExamId: latestExam?.examId ?? null,
      latestExamTitle: latestExam?.title ?? null,
    });
  }

  for (const row of (teacherResult.data ?? []) as RawSectionTeacherRow[]) {
    const curriculum = firstJoin(row.curriculum_subjects);
    if (!curriculum) continue;
    const subjectId = curriculum?.subject_id ?? null;
    if (subjectId == null) continue;
    if (!subjectRows.has(subjectId)) continue;
    const subjectJoin = firstJoin(curriculum.subjects);
    const subjectName = subjectJoin?.name ?? "Unknown Subject";
    const teacherName = toTeacherName(row.users);
    const latestExam = latestBySubject.get(subjectId) ?? null;

    subjectRows.set(subjectId, {
      subjectId,
      curriculumSubjectId: row.curriculum_subject_id ?? subjectRows.get(subjectId)?.curriculumSubjectId ?? 0,
      subjectName,
      subjectType: subjectJoin?.subject_type ?? null,
      teacherName,
      status: latestExam
        ? latestExam.isFinalized
          ? "Finalized"
          : "Not Finalized"
        : "No exam yet",
      latestExamId: latestExam?.examId ?? null,
      latestExamTitle: latestExam?.title ?? null,
    });
  }

  const latestOverall = examCards.reduce<ReportExamCard | null>((latest, card) => {
    if (!latest) return card;
    const latestSort = getExamSortScore(latest.examDate, latest.examId);
    const currentSort = getExamSortScore(card.examDate, card.examId);
    return currentSort >= latestSort ? card : latest;
  }, null);

  const totalExams = sectionCard?.totalExams ?? 0;
  const finalizedExams = sectionCard?.finalizedExams ?? 0;
  const isFinalized = totalExams > 0 && finalizedExams === totalExams;

  const result: ReportSectionOverview = {
    sectionId: sectionOnly.section_id,
    sectionName: sectionOnly.name,
    gradeLevelId: sectionOnly.grade_level_id,
    gradeDisplayName: gradeJoin.display_name,
    gradeLevelNumber: gradeJoin.level_number,
    totalExams,
    finalizedExams,
    isFinalized,
    latestExamId: latestOverall?.examId ?? null,
    latestExamTitle: latestOverall?.title ?? null,
    latestExamDate: latestOverall?.examDate ?? null,
    subjects: Array.from(subjectRows.values()).sort((a, b) =>
      compareSubjectType(a.subjectType, b.subjectType) ||
      a.subjectName.localeCompare(b.subjectName, undefined, {
        sensitivity: "base",
      }),
    ),
  };
  return cacheSet(cacheKey, result);
}

export async function fetchReportSubjectCards(): Promise<ReportSubjectCard[]> {
  const cached = cacheGet<ReportSubjectCard[]>("subjectCards");
  if (cached) return cached;

  // Single parallel fetch — no per-section waterfall
  const [sectionCards, examCards, teacherMap] = await Promise.all([
    fetchReportSectionCards(),
    fetchReportExamCards(),
    fetchAllTeacherAssignmentsWithNames(),
  ]);

  const grouped = new Map<string, ReportSubjectCard>();

  for (const section of sectionCards) {
    const sectionTeachers = teacherMap.get(section.sectionId) ?? new Map<number, BulkTeacherEntry>();
    const sectionExams = examCards.filter((c) => c.sectionId === section.sectionId);

    const subjectIds = new Set<number>([
      ...sectionExams.map((c) => c.subjectId).filter((id): id is number => id != null),
      ...Array.from(sectionTeachers.keys()),
    ]);

    for (const subjectId of subjectIds) {
      const key = subjectGradeKey(section.gradeLevelId, subjectId);

      const subjectExams = sectionExams.filter((c) => c.subjectId === subjectId);
      const latestExam = subjectExams.reduce<ReportExamCard | null>((best, card) => {
        if (!best) return card;
        return getExamSortScore(card.examDate, card.examId) >=
          getExamSortScore(best.examDate, best.examId)
          ? card
          : best;
      }, null);

      const teacherEntry = sectionTeachers.get(subjectId) ?? null;
      const subjectName = latestExam?.subjectName ?? teacherEntry?.subjectName ?? "Unknown Subject";
      const subjectType = latestExam?.subjectType ?? teacherEntry?.subjectType ?? null;
      const teacherName = teacherEntry?.teacherName ?? null;
      const isFinalized = latestExam?.isFinalized ?? false;

      const existing = grouped.get(key);
      if (!existing) {
        grouped.set(key, {
          subjectId,
          subjectName,
          subjectType,
          gradeLevelId: section.gradeLevelId,
          gradeDisplayName: section.gradeDisplayName,
          gradeLevelNumber: section.gradeLevelNumber,
          sectionCount: 1,
          finalizedSections: isFinalized ? 1 : 0,
          isFinalized: false,
          teacherNames: teacherName ? [teacherName] : [],
          sectionNames: [section.sectionName],
          latestExamId: latestExam?.examId ?? null,
          latestExamDate: latestExam?.examDate ?? null,
        });
      } else {
        existing.sectionCount += 1;
        existing.sectionNames.push(section.sectionName);
        if (teacherName && !existing.teacherNames.includes(teacherName)) {
          existing.teacherNames.push(teacherName);
        }
        if (isFinalized) existing.finalizedSections += 1;
        if (latestExam) {
          const existingSort = getExamSortScore(existing.latestExamDate, existing.latestExamId ?? 0);
          const candidateSort = getExamSortScore(latestExam.examDate, latestExam.examId);
          if (candidateSort >= existingSort) {
            existing.latestExamId = latestExam.examId;
            existing.latestExamDate = latestExam.examDate;
          }
        }
      }
    }
  }

  const cards = Array.from(grouped.values()).map((card) => ({
    ...card,
    isFinalized: card.sectionCount > 0 && card.finalizedSections === card.sectionCount,
    teacherNames: card.teacherNames.sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    ),
    sectionNames: card.sectionNames.sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    ),
  }));

  return cacheSet(
    "subjectCards",
    cards.sort((a, b) => {
      const ga = a.gradeLevelNumber ?? Number.MAX_SAFE_INTEGER;
      const gb = b.gradeLevelNumber ?? Number.MAX_SAFE_INTEGER;
      if (ga !== gb) return ga - gb;
      const typeCompare = compareSubjectType(a.subjectType, b.subjectType);
      if (typeCompare !== 0) return typeCompare;
      return a.subjectName.localeCompare(b.subjectName, undefined, { sensitivity: "base" });
    }),
  );
}

export async function fetchReportSubjectOverview(
  gradeLevelId: number,
  subjectId: number,
): Promise<ReportSubjectOverview | null> {
  if (!Number.isFinite(gradeLevelId) || !Number.isFinite(subjectId)) return null;
  const cacheKey = `subjectOverview:${gradeLevelId}:${subjectId}`;
  const cached = cacheGet<ReportSubjectOverview | null>(cacheKey);
  if (cached !== undefined) return cached;

  const [subjectCards, sectionCards] = await Promise.all([
    fetchReportSubjectCards(),
    fetchReportSectionCards(),
  ]);
  const subjectCard =
    subjectCards.find(
      (card) => card.gradeLevelId === gradeLevelId && card.subjectId === subjectId,
    ) ?? null;
  if (!subjectCard) return cacheSet(cacheKey, null);

  const sectionRows: ReportSubjectSectionRow[] = [];
  let curriculumSubjectId = 0;
  for (const section of sectionCards.filter((card) => card.gradeLevelId === gradeLevelId)) {
    const overview = await fetchReportSectionOverview(section.sectionId);
    const subject = overview?.subjects.find((row) => row.subjectId === subjectId);
    if (!subject) continue;
    if (curriculumSubjectId === 0 && subject.curriculumSubjectId) {
      curriculumSubjectId = subject.curriculumSubjectId;
    }
    sectionRows.push({
      sectionId: section.sectionId,
      sectionName: section.sectionName,
      teacherName: subject.teacherName,
      status: subject.status,
      latestExamId: subject.latestExamId,
      latestExamTitle: subject.latestExamTitle,
    });
  }

  const latestCard = (await fetchReportExamCards())
    .filter((card) => card.gradeLevelId === gradeLevelId && card.subjectId === subjectId)
    .reduce<ReportExamCard | null>((latest, card) => {
      if (!latest) return card;
      return getExamSortScore(card.examDate, card.examId) >=
        getExamSortScore(latest.examDate, latest.examId)
        ? card
        : latest;
    }, null);

  return cacheSet(cacheKey, {
    subjectId,
    curriculumSubjectId,
    subjectName: subjectCard.subjectName,
    subjectType: subjectCard.subjectType,
    gradeLevelId,
    gradeDisplayName: subjectCard.gradeDisplayName,
    gradeLevelNumber: subjectCard.gradeLevelNumber,
    sectionCount: subjectCard.sectionCount,
    finalizedSections: subjectCard.finalizedSections,
    isFinalized: subjectCard.isFinalized,
    latestExamId: latestCard?.examId ?? subjectCard.latestExamId,
    latestExamTitle: latestCard?.title ?? null,
    latestExamDate: latestCard?.examDate ?? subjectCard.latestExamDate,
    sections: sectionRows.sort((a, b) => {
      const aIsSses = isSsesSectionName(a.sectionName);
      const bIsSses = isSsesSectionName(b.sectionName);
      if (aIsSses !== bIsSses) return aIsSses ? -1 : 1;
      return a.sectionName.localeCompare(b.sectionName, undefined, { sensitivity: "base" });
    }),
  });
}

export async function fetchSavedExamDetailsSummary(
  examId: number,
  sectionId: number,
): Promise<ExamDetailsSummary | null> {
  if (!Number.isFinite(examId) || !Number.isFinite(sectionId)) return null;
  const cacheKey = `savedSummary:${examId}:${sectionId}`;
  const cached = cacheGet<ExamDetailsSummary | null>(cacheKey);
  if (cached !== undefined) return cached;

  const { data, error } = await supabase
    .from("exam_results_reports")
    .select(
      "total_items, total_cases, total_score, mean, pl, highest_score, lowest_score, mps, total_achieved",
    )
    .eq("exam_id", examId)
    .eq("section_id", sectionId)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(
      "[reportsAnalysisService] fetchSavedExamDetailsSummary error:",
      error.message,
    );
    return cacheSet(cacheKey, null);
  }

  const row = data as RawExamResultReportRow | null;
  if (!row) return cacheSet(cacheKey, null);

  return cacheSet(cacheKey, {
    totalItems: toFiniteNumber(row.total_items),
    numberOfCases: toFiniteNumber(row.total_cases),
    totalScore: toFiniteNumber(row.total_score),
    mean: toFiniteNumber(row.mean),
    pl: toFiniteNumber(row.pl),
    highestScore: toFiniteNumber(row.highest_score),
    lowestScore: toFiniteNumber(row.lowest_score),
    mps: toFiniteNumber(row.mps),
    passCount: toFiniteNumber(row.total_achieved),
  });
}

export async function fetchSavedProficiencyRows(
  examId: number,
  sectionId: number,
): Promise<ProficiencyRow[]> {
  if (!Number.isFinite(examId) || !Number.isFinite(sectionId)) return [];
  const cacheKey = `savedProficiency:${examId}:${sectionId}`;
  const cached = cacheGet<ProficiencyRow[]>(cacheKey);
  if (cached) return cached;

  const { data, error } = await supabase
    .from("exam_results_reports")
    .select("student_scores")
    .eq("exam_id", examId)
    .eq("section_id", sectionId)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(
      "[reportsAnalysisService] fetchSavedProficiencyRows error:",
      error.message,
    );
    return [];
  }

  const row = data as RawExamResultReportRow | null;
  const savedScores = Array.isArray(row?.student_scores)
    ? (row.student_scores as RawSavedStudentScore[])
    : [];

  const result = savedScores
    .map((score) => {
      const enrollmentId = score.enrollment_id ?? score.enrollmentId ?? null;
      if (enrollmentId == null) return null;
      const sex = normalizeSex(score.sex) ?? "Male";
      return {
        enrollmentId,
        pupilName:
          score.student_name?.trim() ||
          score.pupilName?.trim() ||
          `Enrollment #${enrollmentId}`,
        testScore: toFiniteNumber(score.score ?? score.testScore),
        totalItems: toFiniteNumber(score.total_items ?? score.totalItems),
        mpl: toFiniteNumber(score.mpl),
        proficiencyLevel:
          score.proficiency_level?.trim() ||
          score.proficiencyLevel?.trim() ||
          getProficiencyFromMpl(toFiniteNumber(score.mpl)),
        sex,
      };
    })
    .filter((row): row is ProficiencyRow => row != null)
    .sort((a, b) =>
      a.pupilName.localeCompare(b.pupilName, undefined, { sensitivity: "base" }),
    );

  return cacheSet(cacheKey, result);
}

function mapSavedItemAnalysisRows(value: unknown): ItemAnalysisRow[] {
  if (!Array.isArray(value)) return [];
  return (value as RawSavedItemAnalysisRow[])
    .map((row) => {
      const itemNo = row.item_no ?? row.itemNo ?? null;
      if (itemNo == null) return null;
      return {
        itemNo,
        objective: row.objective?.trim() || "-",
        correctResponses: toFiniteNumber(row.correct_responses ?? row.correctResponses),
        rank: toFiniteNumber(row.rank),
      };
    })
    .filter((row): row is ItemAnalysisRow => row != null);
}

export async function fetchSavedItemAnalysisSummary(
  examId: number,
  sectionId: number,
): Promise<ItemAnalysisSummary> {
  const empty: ItemAnalysisSummary = {
    rows: [],
    topMostLearned: [],
    topLeastLearned: [],
  };
  if (!Number.isFinite(examId) || !Number.isFinite(sectionId)) return empty;
  const cacheKey = `savedItemAnalysis:${examId}:${sectionId}`;
  const cached = cacheGet<ItemAnalysisSummary>(cacheKey);
  if (cached) return cached;

  const { data, error } = await supabase
    .from("item_analysis_reports")
    .select("item_scores, most_learned, least_learned")
    .eq("exam_id", examId)
    .eq("section_id", sectionId)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(
      "[reportsAnalysisService] fetchSavedItemAnalysisSummary error:",
      error.message,
    );
    return empty;
  }

  const row = data as RawItemAnalysisReportRow | null;
  if (!row) return cacheSet(cacheKey, empty);

  return cacheSet(cacheKey, {
    rows: mapSavedItemAnalysisRows(row.item_scores).sort((a, b) => a.itemNo - b.itemNo),
    topMostLearned: mapSavedItemAnalysisRows(row.most_learned),
    topLeastLearned: mapSavedItemAnalysisRows(row.least_learned),
  });
}

export async function fetchConsolidatedSubjectAnalytics(
  gradeLevelId: number,
  subjectId: number,
  examId: number | null,
): Promise<ConsolidatedReportResult> {
  const empty: ConsolidatedReportResult = {
    summary: null,
    proficiencyRows: [],
    itemAnalysis: { rows: [], topMostLearned: [], topLeastLearned: [] },
    sectionCount: 0,
  };
  if (!Number.isFinite(gradeLevelId) || !Number.isFinite(subjectId)) return empty;

  const allExamCards = await fetchReportExamCards();

  // Primary pass: regular sections whose exam is linked to the correct curriculum subject
  const bySubjectId = allExamCards.filter(
    (card) =>
      card.gradeLevelId === gradeLevelId &&
      card.subjectId === subjectId &&
      card.isFinalized &&
      (examId == null || card.examId === examId),
  );

  const sectionsWithData = new Set(bySubjectId.map((card) => card.sectionId));

  // Secondary pass: sections in the subject's authoritative list (teacher_class_assignments)
  // that were not matched above — handles SSES exams linked to a different curriculum entry
  const subjectOverview = await fetchReportSubjectOverview(gradeLevelId, subjectId);
  const remainingSectionIds = (subjectOverview?.sections ?? [])
    .map((s) => s.sectionId)
    .filter((id) => !sectionsWithData.has(id));

  const bySectionId =
    remainingSectionIds.length > 0
      ? allExamCards.filter(
          (card) =>
            remainingSectionIds.includes(card.sectionId) &&
            card.isFinalized &&
            (examId == null || card.examId === examId),
        )
      : [];

  const examCards = [...bySubjectId, ...bySectionId];

  const latestBySection = new Map<number, ReportExamCard>();
  for (const card of examCards) {
    const existing = latestBySection.get(card.sectionId);
    if (!existing) {
      latestBySection.set(card.sectionId, card);
      continue;
    }
    if (
      getExamSortScore(card.examDate, card.examId) >=
      getExamSortScore(existing.examDate, existing.examId)
    ) {
      latestBySection.set(card.sectionId, card);
    }
  }

  const cards = Array.from(latestBySection.values());
  if (cards.length === 0) return empty;

  const [summaries, proficiencyGroups, itemSummaries] = await Promise.all([
    Promise.all(cards.map((card) => fetchSavedExamDetailsSummary(card.examId, card.sectionId))),
    Promise.all(cards.map((card) => fetchSavedProficiencyRows(card.examId, card.sectionId))),
    Promise.all(cards.map((card) => fetchSavedItemAnalysisSummary(card.examId, card.sectionId))),
  ]);

  return {
    summary: aggregateSummaries(
      summaries.filter((summary): summary is ExamDetailsSummary => summary != null),
    ),
    proficiencyRows: proficiencyGroups.flat().sort((a, b) =>
      a.pupilName.localeCompare(b.pupilName, undefined, { sensitivity: "base" }),
    ),
    itemAnalysis: aggregateItemAnalysis(itemSummaries),
    sectionCount: cards.length,
  };
}

export type AssignedScope = {
  sectionIds: number[];
  subjectIds: number[];
  curriculumSubjectIds: number[];
  assignedPairs: { sectionId: number; curriculumSubjectId: number }[];
  glSectionIds: number[];
  subjectSectionIds: number[];
};

export async function fetchMyAssignedScope(userId: string): Promise<AssignedScope> {
  const cacheKey = `assignedScope:${userId}`;
  const cached = cacheGet<AssignedScope>(cacheKey);
  if (cached) return cached;

  const empty: AssignedScope = {
    sectionIds: [],
    subjectIds: [],
    curriculumSubjectIds: [],
    assignedPairs: [],
    glSectionIds: [],
    subjectSectionIds: [],
  };

  type MyRow = {
    section_id: number | null;
    curriculum_subject_id: number | null;
    curriculum_subjects: { subject_id: number | null; grade_level_id: number | null } | { subject_id: number | null; grade_level_id: number | null }[] | null;
  };

  const { data: myData, error: myError } = await supabase
    .from("teacher_class_assignments")
    .select("section_id, curriculum_subject_id, curriculum_subjects!inner(subject_id, grade_level_id)")
    .eq("teacher_id", userId)
    .is("deleted_at", null);

  if (myError) {
    console.error("[reportsAnalysisService] fetchMyAssignedScope error:", myError.message);
    return cacheSet(cacheKey, empty);
  }

  const mySectionIds = new Set<number>();
  const myCurriculumSubjectIds = new Set<number>();
  const mySubjectIds = new Set<number>();
  const myGradeLevelIds = new Set<number>();
  const assignedPairs: { sectionId: number; curriculumSubjectId: number }[] = [];

  for (const row of (myData ?? []) as MyRow[]) {
    if (row.section_id != null) mySectionIds.add(row.section_id);
    if (row.curriculum_subject_id != null) myCurriculumSubjectIds.add(row.curriculum_subject_id);
    if (row.section_id != null && row.curriculum_subject_id != null) {
      assignedPairs.push({ sectionId: row.section_id, curriculumSubjectId: row.curriculum_subject_id });
    }
    const cs = firstJoin(row.curriculum_subjects);
    if (cs?.subject_id != null) mySubjectIds.add(cs.subject_id);
    if (cs?.grade_level_id != null) myGradeLevelIds.add(cs.grade_level_id);
  }

  if (myCurriculumSubjectIds.size === 0) {
    return cacheSet(cacheKey, empty);
  }

  type AllRow = {
    section_id: number | null;
    curriculum_subjects: { subject_id: number | null; grade_level_id: number | null } | { subject_id: number | null; grade_level_id: number | null }[] | null;
  };

  type GlRow = {
    section_id: number | null;
    curriculum_subject_id: number | null;
    curriculum_subjects: { grade_level_id: number | null } | { grade_level_id: number | null }[] | null;
  };

  const [allResult, glResult] = await Promise.all([
    supabase
      .from("teacher_class_assignments")
      .select("section_id, curriculum_subjects!inner(subject_id, grade_level_id)")
      .is("deleted_at", null),
    supabase
      .from("teacher_class_assignments")
      .select("section_id, curriculum_subject_id, curriculum_subjects!inner(grade_level_id)")
      .in("curriculum_subject_id", Array.from(myCurriculumSubjectIds))
      .is("deleted_at", null),
  ]);

  const subjectIdSet = mySubjectIds;
  const gradeLevelIdSet = myGradeLevelIds;

  const subjectSectionIds = [
    ...new Set(
      ((allResult.data ?? []) as AllRow[])
        .filter((row) => {
          const cs = firstJoin(row.curriculum_subjects);
          return cs?.subject_id != null && subjectIdSet.has(cs.subject_id);
        })
        .map((row) => row.section_id)
        .filter((id): id is number => id != null),
    ),
  ];

  const glSectionIds = [
    ...new Set(
      ((glResult.data ?? []) as GlRow[])
        .filter((row) => {
          const cs = firstJoin(row.curriculum_subjects);
          return cs?.grade_level_id != null && gradeLevelIdSet.has(cs.grade_level_id);
        })
        .map((row) => row.section_id)
        .filter((id): id is number => id != null),
    ),
  ];

  return cacheSet(cacheKey, {
    sectionIds: Array.from(mySectionIds),
    subjectIds: Array.from(mySubjectIds),
    curriculumSubjectIds: Array.from(myCurriculumSubjectIds),
    assignedPairs,
    glSectionIds,
    subjectSectionIds,
  });
}

export async function fetchConsolidatedSubjectDiagnosticAnalytics(
  gradeLevelId: number,
  subjectId: number,
  selectedExamId: number,
  examTitle: string,
): Promise<ConsolidatedSubjectDiagnosticResult | null> {
  if (
    !Number.isFinite(gradeLevelId) ||
    !Number.isFinite(subjectId) ||
    !Number.isFinite(selectedExamId) ||
    !examTitle.trim()
  ) {
    return null;
  }

  const cacheKey = `subjectDiagnostic:${gradeLevelId}:${subjectId}:${selectedExamId}:${examTitle.trim().toLowerCase()}`;
  const cached = cacheGet<ConsolidatedSubjectDiagnosticResult | null>(cacheKey);
  if (cached !== undefined) return cached;

  const [overview, examCards] = await Promise.all([
    fetchReportSubjectOverview(gradeLevelId, subjectId),
    fetchReportExamCards(),
  ]);
  if (!overview) return cacheSet(cacheKey, null);

  const normalizedTitle = examTitle.trim().toLowerCase();
  const bySubjectId = examCards.filter(
    (card) =>
      card.gradeLevelId === gradeLevelId &&
      card.subjectId === subjectId &&
      card.title.trim().toLowerCase() === normalizedTitle,
  );

  const sectionsWithData = new Set(bySubjectId.map((card) => card.sectionId));
  const remainingSectionIds = overview.sections
    .map((section) => section.sectionId)
    .filter((sectionId) => !sectionsWithData.has(sectionId));

  const bySectionId =
    remainingSectionIds.length > 0
      ? examCards.filter(
          (card) =>
            card.gradeLevelId === gradeLevelId &&
            remainingSectionIds.includes(card.sectionId) &&
            card.title.trim().toLowerCase() === normalizedTitle,
        )
      : [];

  const matchingCards = [...bySubjectId, ...bySectionId];

  const latestBySection = new Map<number, ReportExamCard>();
  for (const card of matchingCards) {
    const existing = latestBySection.get(card.sectionId);
    if (
      !existing ||
      getExamSortScore(card.examDate, card.examId) >=
        getExamSortScore(existing.examDate, existing.examId)
    ) {
      latestBySection.set(card.sectionId, card);
    }
  }

  const savedFallbackBySection = new Map<number, { examId: number; sectionId: number }>();
  const unmatchedSectionIds = overview.sections
    .map((section) => section.sectionId)
    .filter((sectionId) => !latestBySection.has(sectionId));

  if (unmatchedSectionIds.length > 0) {
    const { data: contextData, error: contextError } = await supabase
      .from("exam_results_reports")
      .select("exam_id, section_id, curriculum_subject_id, grade_level_id, quarter_id, generated_at")
      .eq("exam_id", selectedExamId)
      .eq("grade_level_id", gradeLevelId)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (contextError) {
      console.error(
        "[reportsAnalysisService] fetchConsolidatedSubjectDiagnosticAnalytics context error:",
        contextError.message,
      );
    }

    const context = contextData as RawExamResultReportRow | null;
    if (
      context?.curriculum_subject_id != null &&
      context.grade_level_id != null &&
      context.quarter_id != null
    ) {
      const { data: fallbackData, error: fallbackError } = await supabase
        .from("exam_results_reports")
        .select("exam_id, section_id, generated_at")
        .eq("curriculum_subject_id", context.curriculum_subject_id)
        .eq("grade_level_id", context.grade_level_id)
        .eq("quarter_id", context.quarter_id)
        .in("section_id", unmatchedSectionIds)
        .order("generated_at", { ascending: false });

      if (fallbackError) {
        console.error(
          "[reportsAnalysisService] fetchConsolidatedSubjectDiagnosticAnalytics fallback error:",
          fallbackError.message,
        );
      }

      for (const row of (fallbackData ?? []) as RawExamResultReportRow[]) {
        if (row.exam_id == null || row.section_id == null) continue;
        if (savedFallbackBySection.has(row.section_id)) continue;
        savedFallbackBySection.set(row.section_id, {
          examId: row.exam_id,
          sectionId: row.section_id,
        });
      }
    }
  }

  const sections = await Promise.all(
    overview.sections.map(async (section): Promise<ConsolidatedSubjectSectionResult> => {
      const card = latestBySection.get(section.sectionId) ?? null;
      const savedFallback = savedFallbackBySection.get(section.sectionId) ?? null;
      const resolvedExamId = card?.examId ?? savedFallback?.examId ?? null;
      const isFinalized = Boolean(card?.isFinalized || savedFallback);
      const base = {
        sectionId: section.sectionId,
        sectionName: section.sectionName,
        isSses: isSsesSectionName(section.sectionName),
        examId: resolvedExamId,
        isFinalized,
      };

      if (!resolvedExamId || !isFinalized) {
        return {
          ...base,
          summary: null,
          median: null,
          sd: null,
          proficiencyRows: [],
          itemAnalysis: { rows: [], topMostLearned: [], topLeastLearned: [] },
        };
      }

      const [summary, proficiencyRows, itemAnalysis] = await Promise.all([
        fetchSavedExamDetailsSummary(resolvedExamId, section.sectionId),
        fetchSavedProficiencyRows(resolvedExamId, section.sectionId),
        fetchSavedItemAnalysisSummary(resolvedExamId, section.sectionId),
      ]);
      const scores = proficiencyRows.map((row) => row.testScore);

      return {
        ...base,
        summary,
        median: median(scores),
        sd: standardDeviation(scores),
        proficiencyRows,
        itemAnalysis,
      };
    }),
  );

  const sortedSections = sections.sort((a, b) => {
    if (a.isSses !== b.isSses) return a.isSses ? -1 : 1;
    return a.sectionName.localeCompare(b.sectionName, undefined, { sensitivity: "base" });
  });
  const summaries = sortedSections
    .map((section) => section.summary)
    .filter((summary): summary is ExamDetailsSummary => summary != null);
  const allScores = sortedSections.flatMap((section) =>
    section.proficiencyRows.map((row) => row.testScore),
  );
  const itemSummaries = sortedSections
    .filter((section) => section.isFinalized)
    .map((section) => section.itemAnalysis);

  return cacheSet(cacheKey, {
    examTitle,
    subjectName: overview.subjectName,
    gradeDisplayName: overview.gradeDisplayName,
    sections: sortedSections,
    summary: aggregateSummaries(summaries),
    median: median(allScores),
    sd: standardDeviation(allScores),
    itemAnalysis: aggregateItemAnalysis(itemSummaries),
    sectionCount: sortedSections.length,
    finalizedSectionCount: sortedSections.filter((section) => section.isFinalized).length,
  });
}
