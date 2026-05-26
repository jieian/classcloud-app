import { cacheTag, cacheLife } from "next/cache";
import { adminClient as admin } from "@/lib/supabase/admin";
import type { GradeLevel } from "@/lib/exam-supabase";
import type { ReportExamCard, ReportSectionCard } from "@/lib/services/reportsAnalysisService";

export const REPORTS_CACHE_TAG = "reports";

type RawGradeJoin = { display_name: string; level_number: number | null };
type RawSubjectJoin = { name: string | null; subject_type?: "BOTH" | "SSES" | null };
type RawCurriculumSubjectJoin = { subject_id: number | null; subjects: RawSubjectJoin | RawSubjectJoin[] | null };
type ActiveCurriculumSubject = {
  subjectId: number;
  subjectName: string;
  subjectType: "BOTH" | "SSES" | null;
  gradeLevelId: number;
};
type RawSectionJoin = {
  section_id: number;
  name: string;
  grade_level_id: number | null;
  grade_levels: RawGradeJoin | RawGradeJoin[] | null;
};
type RawExamJoin = {
  exam_id: number;
  title: string;
  total_items: number | null;
  answer_key: { total_questions?: number | null } | null;
  exam_date: string | null;
  is_locked?: boolean | null;
  curriculum_subjects?: RawCurriculumSubjectJoin | RawCurriculumSubjectJoin[] | null;
};
type RawRow = {
  id: number;
  exam_id: number | null;
  section_id?: number | null;
  sections?: RawSectionJoin | RawSectionJoin[] | null;
  exams: RawExamJoin | RawExamJoin[] | null;
};
type RawSectionRow = {
  section_id: number;
  name: string;
  grade_level_id: number | null;
  grade_levels: RawGradeJoin | RawGradeJoin[] | null;
};
type RawTeacherAssignmentRow = {
  section_id: number | null;
  curriculum_subjects:
    | {
        subject_id: number | null;
        subjects: RawSubjectJoin | RawSubjectJoin[] | null;
      }
    | {
        subject_id: number | null;
        subjects: RawSubjectJoin | RawSubjectJoin[] | null;
      }[]
    | null;
};
type RawReportKeyRow = {
  exam_id: number | null;
  section_id: number | null;
};

function firstJoin<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function resolveReportTotalItems(exam: {
  total_items: number | null;
  answer_key: { total_questions?: number | null } | null;
}): number {
  const fromAnswerKey = exam.answer_key?.total_questions;
  if (typeof fromAnswerKey === "number" && Number.isFinite(fromAnswerKey)) return fromAnswerKey;
  if (typeof exam.total_items === "number" && Number.isFinite(exam.total_items)) return exam.total_items;
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

function reportKey(examId: number, sectionId: number): string {
  return `${examId}-${sectionId}`;
}

async function getFinalizedReportKeysCached(): Promise<Set<string>> {
  "use cache";
  cacheTag(REPORTS_CACHE_TAG);
  cacheLife("minutes");

  const { data, error } = await admin
    .from("exam_results_reports")
    .select("exam_id, section_id");

  if (error) {
    console.error("[reportServerService] getFinalizedReportKeysCached error:", error.message);
    return new Set();
  }

  return new Set(
    ((data ?? []) as RawReportKeyRow[])
      .filter((row) => row.exam_id != null && row.section_id != null)
      .map((row) => reportKey(Number(row.exam_id), Number(row.section_id))),
  );
}

async function getReportExamCardsCached(): Promise<ReportExamCard[]> {
  "use cache";
  cacheTag(REPORTS_CACHE_TAG);
  cacheTag("grade-levels");
  cacheLife("minutes");

  const { data, error } = await admin
    .from("exam_assignments")
    .select(
      "id, exam_id, section_id, sections!inner(section_id, name, grade_level_id, grade_levels!inner(display_name, level_number)), exams!inner(exam_id, title, total_items, answer_key, exam_date, is_locked, deleted_at, curriculum_subjects(subject_id, subjects(name, subject_type)))",
    )
    .is("exams.deleted_at", null);

  if (error) {
    console.error("[reportServerService] getReportExamCardsCached error:", error.message);
    return [];
  }

  const finalizedKeys = await getFinalizedReportKeysCached();
  const grouped = new Map<string, ReportExamCard>();

  for (const row of (data ?? []) as RawRow[]) {
    const examJoin = firstJoin(row.exams);
    const sectionJoin = firstJoin(row.sections);
    if (!examJoin || !sectionJoin || sectionJoin.grade_level_id == null) continue;

    const gradeJoin = firstJoin(sectionJoin.grade_levels);
    if (!gradeJoin) continue;

    const curriculumJoin = firstJoin(examJoin.curriculum_subjects);
    const subjectJoin = firstJoin(curriculumJoin?.subjects);
    const subjectId = curriculumJoin?.subject_id ?? null;
    const subjectName = subjectJoin?.name ?? "Unknown Subject";
    const subjectType = subjectJoin?.subject_type ?? null;

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
      subjectId,
      subjectName,
      subjectType,
      isFinalized: finalizedKeys.has(key),
      sectionId: sectionJoin.section_id,
      sectionName: sectionJoin.name,
      gradeLevelId: sectionJoin.grade_level_id,
      gradeDisplayName: gradeJoin.display_name,
      gradeLevelNumber: gradeJoin.level_number,
      assignmentIds: [row.id],
    });
  }

  return Array.from(grouped.values()).sort((a, b) => {
    const ga = a.gradeLevelNumber ?? Number.MAX_SAFE_INTEGER;
    const gb = b.gradeLevelNumber ?? Number.MAX_SAFE_INTEGER;
    if (ga !== gb) return ga - gb;
    const ta = a.examDate ? new Date(a.examDate).getTime() : 0;
    const tb = b.examDate ? new Date(b.examDate).getTime() : 0;
    if (tb !== ta) return tb - ta;
    return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  });
}

async function getActiveSectionsCached(): Promise<RawSectionRow[]> {
  "use cache";
  cacheTag(REPORTS_CACHE_TAG);
  cacheTag("sections");
  cacheLife("minutes");

  const { data: syData } = await admin
    .from("school_years")
    .select("sy_id")
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();

  let query = admin
    .from("sections")
    .select("section_id, name, grade_level_id, grade_levels(display_name, level_number)")
    .is("deleted_at", null)
    .order("name", { ascending: true });

  const syId = (syData as { sy_id: number } | null)?.sy_id;
  if (syId) query = query.eq("sy_id", syId);

  const { data, error } = await query;
  if (error) {
    console.error("[reportServerService] getActiveSectionsCached error:", error.message);
    return [];
  }
  return (data ?? []) as RawSectionRow[];
}

async function getGradeLevelsCached(): Promise<GradeLevel[]> {
  "use cache";
  cacheTag("grade-levels");
  cacheLife("days");

  const { data, error } = await admin
    .from("grade_levels")
    .select("grade_level_id, level_number, display_name")
    .order("level_number");
  if (error) throw new Error(error.message);
  return (data ?? []) as GradeLevel[];
}

async function getSectionSubjectsCached(): Promise<Map<number, Map<number, string>>> {
  "use cache";
  cacheTag(REPORTS_CACHE_TAG);
  cacheTag("teacher-assignments");
  cacheLife("minutes");

  const { data, error } = await admin
    .from("teacher_class_assignments")
    .select("section_id, curriculum_subjects!inner(subject_id, subjects(name))")
    .is("deleted_at", null);

  if (error) {
    console.error("[reportServerService] getSectionSubjectsCached error:", error.message);
    return new Map();
  }

  const result = new Map<number, Map<number, string>>();

  for (const row of (data ?? []) as RawTeacherAssignmentRow[]) {
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

async function getActiveCurriculumSubjectsCached(): Promise<ActiveCurriculumSubject[]> {
  "use cache";
  cacheTag(REPORTS_CACHE_TAG);
  cacheTag("curriculum");
  cacheTag("school-years");
  cacheLife("minutes");

  const { data: syData, error: syError } = await admin
    .from("school_years")
    .select("curriculum_id")
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (syError) {
    console.error("[reportServerService] getActiveCurriculumSubjectsCached sy error:", syError.message);
    return [];
  }

  const curriculumId = (syData as { curriculum_id?: number | null } | null)?.curriculum_id ?? null;
  if (curriculumId == null) return [];

  const { data, error } = await admin
    .from("curriculum_subjects")
    .select("subject_id, grade_level_id, subjects!inner(name, subject_type, deleted_at)")
    .eq("curriculum_id", curriculumId)
    .is("deleted_at", null);

  if (error) {
    console.error("[reportServerService] getActiveCurriculumSubjectsCached error:", error.message);
    return [];
  }

  return ((data ?? []) as {
    subject_id: number | null;
    grade_level_id: number | null;
    subjects: RawSubjectJoin | RawSubjectJoin[] | null;
  }[])
    .map((row) => {
      const subjectJoin = firstJoin(row.subjects);
      if (row.subject_id == null || row.grade_level_id == null || !subjectJoin) return null;
      return {
        subjectId: row.subject_id,
        subjectName: subjectJoin.name ?? "Unknown Subject",
        subjectType: subjectJoin.subject_type ?? null,
        gradeLevelId: row.grade_level_id,
      };
    })
    .filter((row): row is ActiveCurriculumSubject => row != null);
}

function buildSectionCards(
  examCards: ReportExamCard[],
  activeSections: RawSectionRow[],
  activeSubjects: ActiveCurriculumSubject[],
): ReportSectionCard[] {
  const grouped = new Map<number, ReportSectionCard>();
  const latestBySectionSubject = new Map<string, ReportExamCard>();
  const subjectsByGrade = new Map<number, ActiveCurriculumSubject[]>();
  for (const subject of activeSubjects) {
    if (!subjectsByGrade.has(subject.gradeLevelId)) subjectsByGrade.set(subject.gradeLevelId, []);
    subjectsByGrade.get(subject.gradeLevelId)!.push(subject);
  }

  for (const card of examCards) {
    if (!grouped.has(card.sectionId)) {
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
    if (!gradeJoin || grouped.has(section.section_id)) continue;

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

  return cards.sort((a, b) => {
    const ga = a.gradeLevelNumber ?? Number.MAX_SAFE_INTEGER;
    const gb = b.gradeLevelNumber ?? Number.MAX_SAFE_INTEGER;
    if (ga !== gb) return ga - gb;
    const aIsSses = isSsesSectionName(a.sectionName);
    const bIsSses = isSsesSectionName(b.sectionName);
    if (aIsSses !== bIsSses) return aIsSses ? -1 : 1;
    return a.sectionName.localeCompare(b.sectionName, undefined, { sensitivity: "base" });
  });
}

export type ReportInitData = {
  sectionCards: ReportSectionCard[];
  gradeLevels: GradeLevel[];
};

export async function getReportInitData(): Promise<ReportInitData> {
  const [examCards, activeSections, gradeLevels, activeSubjects] = await Promise.all([
    getReportExamCardsCached(),
    getActiveSectionsCached(),
    getGradeLevelsCached(),
    getActiveCurriculumSubjectsCached(),
  ]);

  const sectionCards = buildSectionCards(examCards, activeSections, activeSubjects);
  return { sectionCards, gradeLevels };
}
