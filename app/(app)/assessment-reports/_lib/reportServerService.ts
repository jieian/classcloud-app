import { cacheTag, cacheLife } from "next/cache";
import { adminClient as admin } from "@/lib/supabase/admin";
import type { GradeLevel } from "@/lib/exam-supabase";
import type { ReportExamCard, ReportSectionCard } from "@/lib/services/reportsAnalysisService";

export const REPORTS_CACHE_TAG = "reports";

type RawGradeJoin = { display_name: string; level_number: number | null };
type RawSubjectJoin = { name: string | null };
type RawCurriculumSubjectJoin = { subject_id: number | null; subjects: RawSubjectJoin | RawSubjectJoin[] | null };
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

async function getReportExamCardsCached(): Promise<ReportExamCard[]> {
  "use cache";
  cacheTag(REPORTS_CACHE_TAG);
  cacheTag("grade-levels");
  cacheLife("minutes");

  const { data, error } = await admin
    .from("exam_assignments")
    .select(
      "id, exam_id, section_id, sections!inner(section_id, name, grade_level_id, grade_levels!inner(display_name, level_number)), exams!inner(exam_id, title, total_items, answer_key, exam_date, is_locked, deleted_at, curriculum_subjects(subject_id, subjects(name)))",
    )
    .is("exams.deleted_at", null);

  if (error) {
    console.error("[reportServerService] getReportExamCardsCached error:", error.message);
    return [];
  }

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
      subjectId,
      subjectName,
      isFinalized: Boolean(examJoin.is_locked),
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

function buildSectionCards(examCards: ReportExamCard[], activeSections: RawSectionRow[]): ReportSectionCard[] {
  const grouped = new Map<number, ReportSectionCard>();
  const seenExamBySection = new Set<string>();

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
    subjectNames: card.subjectNames.sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    ),
    isFinalized: card.totalExams > 0 && card.finalizedExams === card.totalExams,
  }));

  return cards.sort((a, b) => {
    const ga = a.gradeLevelNumber ?? Number.MAX_SAFE_INTEGER;
    const gb = b.gradeLevelNumber ?? Number.MAX_SAFE_INTEGER;
    if (ga !== gb) return ga - gb;
    return a.sectionName.localeCompare(b.sectionName, undefined, { sensitivity: "base" });
  });
}

export type ReportInitData = {
  sectionCards: ReportSectionCard[];
  gradeLevels: GradeLevel[];
};

export async function getReportInitData(): Promise<ReportInitData> {
  const [examCards, activeSections, gradeLevels] = await Promise.all([
    getReportExamCardsCached(),
    getActiveSectionsCached(),
    getGradeLevelsCached(),
  ]);

  const sectionCards = buildSectionCards(examCards, activeSections);
  return { sectionCards, gradeLevels };
}
