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
  subjectName: string;
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

type SubjectJoin = {
  name: string | null;
};

type CurriculumSubjectJoin = {
  subject_id: number | null;
  subjects: SubjectJoin | SubjectJoin[] | null;
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
  return name.trim().toUpperCase() === "SSES";
}

function getSubjectInfo(exam: ExamJoin): { subjectId: number | null; subjectName: string } {
  const curriculumJoin = firstJoin(exam.curriculum_subjects);
  const subjectJoin = firstJoin(curriculumJoin?.subjects);
  return {
    subjectId: curriculumJoin?.subject_id ?? null,
    subjectName: subjectJoin?.name ?? "Unknown Subject",
  };
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function reportKey(examId: number, sectionId: number): string {
  return `${examId}-${sectionId}`;
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
        "id, exam_id, section_id, sections!inner(section_id, name, grade_level_id, grade_levels!inner(display_name, level_number)), exams!inner(exam_id, title, total_items, answer_key, exam_date, is_locked, deleted_at, curriculum_subjects(subject_id, subjects(name)))",
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
  const [activeSections, sectionSubjects] = await Promise.all([
    fetchActiveSectionsForReports(),
    fetchSectionSubjectsForReports(),
  ]);
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
      if (!sectionSubjects.has(card.sectionId)) {
        sectionSubjects.set(card.sectionId, new Map());
      }
      sectionSubjects.get(card.sectionId)!.set(card.subjectId, card.subjectName);
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
    subjectNames: Array.from(sectionSubjects.get(card.sectionId)?.values() ?? []).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    ),
    totalExams: sectionSubjects.get(card.sectionId)?.size ?? 0,
    isFinalized:
      (sectionSubjects.get(card.sectionId)?.size ?? 0) > 0 &&
      card.finalizedExams === (sectionSubjects.get(card.sectionId)?.size ?? 0),
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

  const { data: teacherData, error: teacherError } = await supabase
    .from("teacher_class_assignments")
    .select(
      "curriculum_subject_id, users!teacher_id(first_name, last_name), curriculum_subjects!inner(subject_id, subjects(name))",
    )
    .eq("section_id", sectionId)
    .is("deleted_at", null);

  if (teacherError) {
    console.error(
      "[reportsAnalysisService] fetchReportSectionOverview teacher error:",
      teacherError.message,
    );
  }

  const subjectRows = new Map<number, ReportSectionSubjectRow>();

  for (const row of (teacherData ?? []) as RawSectionTeacherRow[]) {
    const curriculum = firstJoin(row.curriculum_subjects);
    if (!curriculum) continue;
    const subjectId = curriculum?.subject_id ?? null;
    if (subjectId == null) continue;
    const subjectJoin = firstJoin(curriculum.subjects);
    const subjectName = subjectJoin?.name ?? "Unknown Subject";
    const teacherName = toTeacherName(row.users);
    const latestExam = latestBySubject.get(subjectId) ?? null;

    subjectRows.set(subjectId, {
      subjectId,
      subjectName,
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

  for (const card of examCards) {
    if (card.subjectId == null || subjectRows.has(card.subjectId)) continue;
    const latestExam = latestBySubject.get(card.subjectId) ?? card;
    subjectRows.set(card.subjectId, {
      subjectId: card.subjectId,
      subjectName: card.subjectName,
      teacherName: null,
      status: latestExam.isFinalized ? "Finalized" : "Not Finalized",
      latestExamId: latestExam.examId,
      latestExamTitle: latestExam.title,
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
      a.subjectName.localeCompare(b.subjectName, undefined, {
        sensitivity: "base",
      }),
    ),
  };
  return cacheSet(cacheKey, result);
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
