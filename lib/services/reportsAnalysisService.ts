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

type RawScoreRow = {
  enrollment_id: number | null;
  calculated_score: number | null;
};

type RawScoreWithStudentRow = {
  enrollment_id: number | null;
  calculated_score: number | null;
  enrollments:
    | {
        students:
          | {
              full_name: string | null;
              sex?: string | null;
            }
          | {
              full_name: string | null;
              sex?: string | null;
            }[]
          | null;
      }
    | {
        students:
          | {
              full_name: string | null;
              sex?: string | null;
            }
          | {
              full_name: string | null;
              sex?: string | null;
            }[]
          | null;
      }[]
    | null;
};

type RawSectionTeacherRow = {
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

type RawExamObjectivesRow = {
  total_items?: number | null;
  answer_key?:
    | {
        total_questions?: number | null;
        answers?: Record<string, string | null> | null;
      }
    | null;
  objectives:
    | {
        objective?: string | null;
        start_item?: number | null;
        end_item?: number | null;
      }[]
    | null;
};

type RawScoreResponseRow = {
  enrollment_id: number | null;
  responses: Record<string, string | null> | null;
  graded_at: string | null;
};

function round2(value: number): number {
  return Number(value.toFixed(2));
}

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

function getSubjectInfo(exam: ExamJoin): { subjectId: number | null; subjectName: string } {
  const curriculumJoin = firstJoin(exam.curriculum_subjects);
  const subjectJoin = firstJoin(curriculumJoin?.subjects);
  return {
    subjectId: curriculumJoin?.subject_id ?? null,
    subjectName: subjectJoin?.name ?? "Unknown Subject",
  };
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

  const grouped = new Map<string, ReportExamCard>();

  for (const row of data ?? []) {
    const examJoin = firstJoin(row.exams);
    const sectionJoin = firstJoin(row.sections);
    if (!examJoin || !sectionJoin || sectionJoin.grade_level_id == null) continue;

    const gradeJoin = firstJoin(sectionJoin.grade_levels);
    if (!gradeJoin) continue;
    const subjectInfo = getSubjectInfo(examJoin);

    const key = `${examJoin.exam_id}-${sectionJoin.section_id}`;
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
      isFinalized: Boolean(examJoin.is_locked),
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
  const activeSections = await fetchActiveSectionsForReports();
  const grouped = new Map<number, ReportSectionCard>();
  const seenExamBySection = new Set<string>();

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
    const examKey = `${card.sectionId}-${card.examId}`;
    if (!seenExamBySection.has(examKey)) {
      seenExamBySection.add(examKey);
      current.totalExams += 1;
      if (card.isFinalized) current.finalizedExams += 1;

      const currentSort = getExamSortScore(current.latestExamDate, current.latestExamId ?? 0);
      const candidateSort = getExamSortScore(card.examDate, card.examId);
      if (candidateSort >= currentSort) {
        current.latestExamDate = card.examDate;
        current.latestExamId = card.examId;
      }
    }

    if (!current.subjectNames.includes(card.subjectName)) {
      current.subjectNames.push(card.subjectName);
    }
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
    subjectNames: card.subjectNames.sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    ),
    isFinalized: card.totalExams > 0 && card.finalizedExams === card.totalExams,
  }));

  return cacheSet("sectionCards", cards.sort((a, b) => {
    const ga = a.gradeLevelNumber ?? Number.MAX_SAFE_INTEGER;
    const gb = b.gradeLevelNumber ?? Number.MAX_SAFE_INTEGER;
    if (ga !== gb) return ga - gb;
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

export async function fetchLatestScoresForAssignments(
  assignmentIds: number[],
): Promise<number[]> {
  if (assignmentIds.length === 0) return [];
  const cacheKey = `scores:${[...assignmentIds].sort().join(",")}`;
  const cached = cacheGet<number[]>(cacheKey);
  if (cached) return cached;

  const { data, error } = await supabase
    .from("scores")
    .select("enrollment_id, calculated_score")
    .in("exam_assignment_id", assignmentIds)
    .order("graded_at", { ascending: false });

  if (error) {
    console.error(
      "[reportsAnalysisService] fetchLatestScoresForAssignments error:",
      error.message,
    );
    return [];
  }

  const latestByEnrollment = new Map<number, number>();
  for (const row of (data ?? []) as RawScoreRow[]) {
    if (row.enrollment_id == null) continue;
    if (latestByEnrollment.has(row.enrollment_id)) continue;
    latestByEnrollment.set(row.enrollment_id, row.calculated_score ?? 0);
  }

  return cacheSet(cacheKey, Array.from(latestByEnrollment.values()));
}

export function computeExamDetailsSummary(
  totalItems: number,
  latestScores: number[],
): ExamDetailsSummary {
  const numberOfCases = latestScores.length;
  const totalScore = latestScores.reduce((sum, score) => sum + score, 0);
  const mean = numberOfCases > 0 ? round2(totalScore / numberOfCases) : 0;
  const passMark = totalItems * 0.5;
  const passCount = latestScores.filter((score) => score >= passMark).length;
  const pl = numberOfCases > 0 ? round2(passCount / numberOfCases) : 0;
  const highestScore = numberOfCases > 0 ? Math.max(...latestScores) : 0;
  const lowestScore = numberOfCases > 0 ? Math.min(...latestScores) : 0;
  const mps = totalItems > 0 ? round2((mean / totalItems) * 100) : 0;

  return {
    totalItems,
    numberOfCases,
    totalScore,
    mean,
    pl,
    highestScore,
    lowestScore,
    mps,
    passCount,
  };
}

function objectiveForItem(
  itemNo: number,
  objectives:
    | {
        objective?: string | null;
        start_item?: number | null;
        end_item?: number | null;
      }[]
    | null,
): string {
  if (!objectives || objectives.length === 0) return "—";
  const hit = objectives.find((obj) => {
    const start = typeof obj.start_item === "number" ? obj.start_item : null;
    const end = typeof obj.end_item === "number" ? obj.end_item : null;
    if (start == null || end == null) return false;
    return itemNo >= start && itemNo <= end;
  });
  const label = hit?.objective?.trim();
  return label && label.length > 0 ? label : "—";
}

export async function fetchItemAnalysisSummary(
  examId: number,
  assignmentIds: number[] = [],
  totalItemsHint?: number | null,
): Promise<ItemAnalysisSummary> {
  const empty: ItemAnalysisSummary = {
    rows: [],
    topMostLearned: [],
    topLeastLearned: [],
  };
  if (!Number.isFinite(examId)) return empty;
  const cacheKey = `itemAnalysis:${examId}:${[...assignmentIds].sort().join(",")}`;
  const cached = cacheGet<ItemAnalysisSummary>(cacheKey);
  if (cached) return cached;

  const { data: examData, error: examError } = await supabase
    .from("exams")
    .select("objectives, answer_key, total_items")
    .eq("exam_id", examId)
    .maybeSingle();
  if (examError) {
    console.error(
      "[reportsAnalysisService] fetchItemAnalysisSummary objectives error:",
      examError.message,
    );
    return empty;
  }

  const examRow = (examData as RawExamObjectivesRow | null) ?? null;
  const objectives = examRow?.objectives ?? null;
  const scopedAssignmentIds =
    assignmentIds.length > 0
      ? assignmentIds
      : ((await supabase
          .from("exam_assignments")
          .select("id")
          .eq("exam_id", examId)).data ?? []
        )
          .map((r: { id?: number | null }) => r.id ?? null)
          .filter((id: number | null): id is number => id != null);
  if (scopedAssignmentIds.length === 0) return empty;

  const { data: scoreData, error: scoreError } = await supabase
    .from("scores")
    .select("enrollment_id, responses, graded_at")
    .in("exam_assignment_id", scopedAssignmentIds)
    .order("graded_at", { ascending: false });

  if (scoreError) {
    console.error(
      "[reportsAnalysisService] fetchItemAnalysisSummary scores error:",
      scoreError.message,
    );
    return empty;
  }

  const answerMap = examRow?.answer_key?.answers ?? {};
  const totalItems =
    examRow?.answer_key?.total_questions ??
    (typeof totalItemsHint === "number" && totalItemsHint > 0
      ? totalItemsHint
      : null) ??
    examRow?.total_items ??
    Object.keys(answerMap ?? {}).length;
  if (!totalItems || totalItems <= 0) return empty;

  const latestByEnrollment = new Map<number, RawScoreResponseRow>();
  for (const row of (scoreData ?? []) as RawScoreResponseRow[]) {
    if (row.enrollment_id == null) continue;
    if (latestByEnrollment.has(row.enrollment_id)) continue;
    latestByEnrollment.set(row.enrollment_id, row);
  }
  const latestAttempts = Array.from(latestByEnrollment.values());
  if (latestAttempts.length === 0) return empty;

  const rows = Array.from({ length: totalItems }, (_, i) => i + 1).map((itemNo) => {
    const answerKey = answerMap?.[String(itemNo)] ?? answerMap?.[itemNo as unknown as string];
    const correctResponses = latestAttempts.reduce((count, attempt) => {
      const response =
        attempt.responses?.[String(itemNo)] ??
        attempt.responses?.[itemNo as unknown as string];
      if (answerKey && response && String(response) === String(answerKey)) {
        return count + 1;
      }
      return count;
    }, 0);
    return {
      itemNo,
      objective: objectiveForItem(itemNo, objectives),
      correctResponses,
      rank: 0,
    };
  });

  const ranked = [...rows]
    .sort((a, b) => {
      if (b.correctResponses !== a.correctResponses) {
        return b.correctResponses - a.correctResponses;
      }
      return a.itemNo - b.itemNo;
    })
    .map((row, idx) => ({ ...row, rank: idx + 1 }));

  const rankByItem = new Map<number, number>(ranked.map((row) => [row.itemNo, row.rank]));
  const rowsWithRank = rows
    .map((row) => ({ ...row, rank: rankByItem.get(row.itemNo) ?? 0 }))
    .sort((a, b) => a.itemNo - b.itemNo);

  const topMostLearned = [...ranked].slice(0, 5);
  const topLeastLearned = [...ranked]
    .sort((a, b) => {
      if (a.correctResponses !== b.correctResponses) {
        return a.correctResponses - b.correctResponses;
      }
      return a.itemNo - b.itemNo;
    })
    .slice(0, 5)
    .map((row, idx) => ({ ...row, rank: idx + 1 }));

  return cacheSet(cacheKey, {
    rows: rowsWithRank,
    topMostLearned,
    topLeastLearned,
  });
}

export async function fetchProficiencyRowsForAssignments(
  assignmentIds: number[],
  totalItems: number,
): Promise<ProficiencyRow[]> {
  if (assignmentIds.length === 0 || totalItems <= 0) return [];

  const cacheKey = `proficiency:${[...assignmentIds].sort((a, b) => a - b).join(',')}:${totalItems}`;
  const cached = cacheGet<ProficiencyRow[]>(cacheKey);
  if (cached) return cached;

  const { data, error } = await supabase
    .from("scores")
    .select(
      "enrollment_id, calculated_score, enrollments!left(students!left(full_name, sex))",
    )
    .in("exam_assignment_id", assignmentIds)
    .order("graded_at", { ascending: false });

  if (error) {
    console.error(
      "[reportsAnalysisService] fetchProficiencyRowsForAssignments error:",
      error.message,
    );
    return [];
  }

  const latestByEnrollment = new Map<number, ProficiencyRow>();
  for (const row of (data ?? []) as RawScoreWithStudentRow[]) {
    if (row.enrollment_id == null) continue;
    if (latestByEnrollment.has(row.enrollment_id)) continue;

    const score = row.calculated_score ?? 0;
    const mpl = totalItems > 0 ? round2((score / totalItems) * 100) : 0;
    const enrollmentsJoin = firstJoin(row.enrollments);
    const studentJoin = firstJoin(enrollmentsJoin?.students ?? null);
    const pupilName = studentJoin?.full_name?.trim() || `Enrollment #${row.enrollment_id}`;
    const sex = normalizeSex(studentJoin?.sex) ?? "Male";

    latestByEnrollment.set(row.enrollment_id, {
      enrollmentId: row.enrollment_id,
      pupilName,
      testScore: score,
      totalItems,
      mpl,
      proficiencyLevel: getProficiencyFromMpl(mpl),
      sex,
    });
  }

  const result = Array.from(latestByEnrollment.values()).sort((a, b) =>
    a.pupilName.localeCompare(b.pupilName, undefined, { sensitivity: "base" }),
  );
  return cacheSet(cacheKey, result);
}
