import * as XLSXStyle from "xlsx-js-style";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient } from "@/lib/supabase/admin";
import { getServerUser, getPermissionsFromUser } from "@/lib/supabase/server";
import {
  fetchMyAssignedScope,
  type ConsolidatedSubjectDiagnosticResult,
  type ConsolidatedSubjectSectionResult,
  type ExamDetailsSummary,
  type ItemAnalysisRow,
  type ItemAnalysisSummary,
  type ProficiencyRow,
} from "@/lib/services/reportsAnalysisService";

type Worksheet = XLSXStyle.WorkSheet & {
  "!pageSetup"?: { paperSize: number; orientation: "landscape" | "portrait" };
  "!margins"?: {
    left: number;
    right: number;
    top: number;
    bottom: number;
    header: number;
    footer: number;
  };
};

type MaybeArray<T> = T | T[] | null;

type ExamRow = {
  exam_id: number;
  title: string;
  exam_date: string | null;
  total_items: number | null;
  quarters?: MaybeArray<{ name?: string | null }>;
};

type SchoolYearRow = {
  school_year: string | null;
  sy_id: number | null;
  curriculum_id: number | null;
};

type CoordinatorRow = {
  users?: MaybeArray<{ first_name?: string | null; last_name?: string | null }>;
};

type CurriculumSubjectRow = {
  curriculum_subject_id: number | null;
  subjects?: MaybeArray<{ name?: string | null }>;
};

type SectionRow = {
  section_id: number;
  name: string | null;
};

type SavedReportRow = {
  exam_id: number | null;
  section_id: number | null;
  curriculum_subject_id: number | null;
  grade_level_id: number | null;
  quarter_id: number | null;
  total_items: number | null;
  total_cases: number | null;
  total_score: number | null;
  mean: number | null;
  pl: number | null;
  highest_score: number | null;
  lowest_score: number | null;
  mps: number | null;
  total_achieved: number | null;
  student_scores: unknown;
};

type SavedStudentScore = {
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

type SavedItemAnalysisRow = {
  item_no?: number | null;
  itemNo?: number | null;
  objective?: string | null;
  correct_responses?: number | null;
  correctResponses?: number | null;
  rank?: number | null;
};

type ItemReportRow = {
  exam_id: number | null;
  section_id: number | null;
  item_scores?: unknown;
  most_learned?: unknown;
  least_learned?: unknown;
};

const MPL_THRESHOLD = 60;
const PROFICIENCY_LEVELS = [
  "Highly Proficient",
  "Proficient",
  "Nearly Proficient",
  "Low Proficient",
  "Not Proficient",
] as const;

const DASH = "-";

function firstJoin<T>(value: MaybeArray<T> | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatNumber(value: number | null | undefined, digits = 2): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : DASH;
}

function formatPercentage(numerator: number, denominator: number): string {
  if (denominator <= 0) return "0.00%";
  return `${((numerator / denominator) * 100).toFixed(2)}%`;
}

function formatDiagnosticValue(value: number | null | undefined, digits = 0): string | number {
  if (value == null || !Number.isFinite(value)) return DASH;
  return digits > 0 ? value.toFixed(digits) : Math.round(value);
}

function normalizeSex(value: string | null | undefined): "Male" | "Female" | null {
  const raw = (value ?? "").trim().toLowerCase();
  if (!raw) return null;
  if (raw === "m" || raw === "male" || raw.startsWith("male")) return "Male";
  if (raw === "f" || raw === "female" || raw.startsWith("female")) return "Female";
  return null;
}

function getProficiencyFromMpl(mpl: number): string {
  if (mpl >= 90) return "Highly Proficient";
  if (mpl >= 75) return "Proficient";
  if (mpl >= 50) return "Nearly Proficient";
  if (mpl >= 25) return "Low Proficient";
  return "Not Proficient";
}

function safeFilename(value: string): string {
  return value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").replace(/\s+/g, " ").trim();
}

function safeSheetName(value: string, fallback: string): string {
  const cleaned = value.replace(/[\[\]:*?/\\]/g, " ").replace(/\s+/g, " ").trim();
  return (cleaned || fallback).slice(0, 31);
}

function stripSectionSuffix(title: string, sections: { sectionName: string }[]): string {
  let cleaned = title.trim();
  for (const section of sections) {
    const escaped = section.sectionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    cleaned = cleaned.replace(new RegExp(`\\s*-\\s*${escaped}\\s*$`, "i"), "").trim();
  }
  return cleaned || title;
}

function teacherName(row: CoordinatorRow | null): string {
  const user = firstJoin(row?.users);
  const name = `${user?.first_name ?? ""} ${user?.last_name ?? ""}`.trim();
  return name || "Unassigned";
}

function makeStyles() {
  const thin = { style: "thin", color: { rgb: "000000" } };
  const border = { top: thin, bottom: thin, left: thin, right: thin };
  const center = { horizontal: "center", vertical: "center", wrapText: true };
  const left = { horizontal: "left", vertical: "center", wrapText: true };
  const greenFill = { patternType: "solid", fgColor: { rgb: "4EAE4A" } };
  const grayFill = { patternType: "solid", fgColor: { rgb: "E9ECEF" } };
  return {
    border,
    center,
    left,
    title: { font: { name: "Sans Serif", sz: 18, bold: true }, alignment: center },
    sectionTitle: { font: { name: "Sans Serif", sz: 11, bold: true }, alignment: left },
    label: { font: { name: "Sans Serif", sz: 10, bold: true }, alignment: left, border },
    labelNoWrap: { font: { name: "Sans Serif", sz: 10, bold: true }, alignment: { horizontal: "left", vertical: "center" }, border },
    value: { font: { name: "Sans Serif", sz: 10 }, alignment: left, border },
    header: {
      font: { name: "Sans Serif", sz: 10, bold: true, color: { rgb: "FFFFFF" } },
      alignment: center,
      fill: greenFill,
      border,
    },
    headerNoWrap: {
      font: { name: "Sans Serif", sz: 10, bold: true, color: { rgb: "FFFFFF" } },
      alignment: { horizontal: "center", vertical: "center", wrapText: false },
      fill: greenFill,
      border,
    },
    group: {
      font: { name: "Sans Serif", sz: 10, bold: true },
      alignment: center,
      fill: grayFill,
      border,
    },
    body: { font: { name: "Sans Serif", sz: 10 }, alignment: center, border },
    bodyLeft: { font: { name: "Sans Serif", sz: 10 }, alignment: left, border },
    bodyLeftNoWrap: { font: { name: "Sans Serif", sz: 10 }, alignment: { horizontal: "left", vertical: "center", wrapText: false }, border },
    note: { font: { name: "Sans Serif", sz: 12, bold: true }, alignment: center, border },
    generatedBy: { font: { name: "Sans Serif", sz: 10 }, alignment: { horizontal: "left", vertical: "center" } },
    rightBorder: { border: { right: thin } },
  };
}

function setCell(
  ws: Worksheet,
  address: string,
  value: string | number,
  style: XLSXStyle.CellObject["s"],
  type: "s" | "n" = typeof value === "number" ? "n" : "s",
) {
  ws[address] = { v: value, t: type, s: style };
}

function appendSheet(wb: XLSXStyle.WorkBook, ws: Worksheet, name: string, lastRef: string) {
  ws["!ref"] = lastRef;
  ws["!pageSetup"] = { paperSize: 9, orientation: "landscape" };
  ws["!margins"] = { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 };
  ws["!protect"] = {};
  XLSXStyle.utils.book_append_sheet(wb, ws, safeSheetName(name, "Sheet"));
}

function summaryDetails(summary: ExamDetailsSummary | null, sd = 0): (string | number)[] {
  if (!summary) return Array.from({ length: 8 }, () => DASH);
  return [
    summary.totalItems,
    summary.numberOfCases,
    summary.totalScore,
    formatNumber(summary.mean),
    formatNumber(summary.pl),
    summary.highestScore,
    summary.lowestScore,
    formatNumber(sd),
  ];
}

function computeStats(rows: ProficiencyRow[]): { median: number | null; sd: number | null } {
  const scores = rows.map((r) => r.testScore).filter((s) => Number.isFinite(s));
  if (scores.length === 0) return { median: null, sd: null };
  const sorted = [...scores].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const sd = Math.sqrt(scores.reduce((sum, x) => sum + (x - mean) ** 2, 0) / scores.length);
  return { median, sd };
}

function makeMplRows(rows: ProficiencyRow[]) {
  const maleRows = rows.filter((row) => row.sex === "Male");
  const femaleRows = rows.filter((row) => row.sex === "Female");
  const makeRow = (label: string, groupRows: ProficiencyRow[]) => {
    const testTakers = groupRows.length;
    const achieved = groupRows.filter((row) => row.mpl >= MPL_THRESHOLD).length;
    const failed = testTakers - achieved;
    return { label, testTakers, achieved, failed };
  };
  return [
    makeRow("Male", maleRows),
    makeRow("Female", femaleRows),
    makeRow("Total", rows),
  ];
}

function rankByValue(rows: { itemNo: number; value: number }[]): Map<number, number> {
  return new Map(
    [...rows]
      .sort((a, b) => b.value - a.value || a.itemNo - b.itemNo)
      .map((row, index) => [row.itemNo, index + 1]),
  );
}

function getSectionItemValue(section: ConsolidatedSubjectSectionResult, itemNo: number): number | null {
  if (!section.isFinalized) return null;
  return section.itemAnalysis.rows.find((row) => row.itemNo === itemNo)?.correctResponses ?? 0;
}

function getRankingSummary(sections: ConsolidatedSubjectSectionResult[]) {
  const grouped = new Map<number, number>();
  for (const section of sections) {
    if (!section.isFinalized) continue;
    for (const row of section.itemAnalysis.rows) {
      grouped.set(row.itemNo, (grouped.get(row.itemNo) ?? 0) + row.correctResponses);
    }
  }
  const ranked = Array.from(grouped.entries())
    .map(([itemNo, correctResponses]) => ({ itemNo, correctResponses }))
    .sort((a, b) => b.correctResponses - a.correctResponses || a.itemNo - b.itemNo)
    .map((row, index) => ({ ...row, rank: index + 1 }));

  return {
    most: ranked.slice(0, 5),
    least: [...ranked].reverse().slice(0, 5),
  };
}

function countByProficiency(rows: ProficiencyRow[]) {
  const result = new Map<string, { male: number; female: number; total: number }>();
  for (const level of PROFICIENCY_LEVELS) result.set(level, { male: 0, female: 0, total: 0 });
  for (const row of rows) {
    const bucket = result.get(row.proficiencyLevel) ?? result.get(getProficiencyFromMpl(row.mpl));
    if (!bucket) continue;
    if (row.sex === "Male") bucket.male += 1;
    if (row.sex === "Female") bucket.female += 1;
    bucket.total += 1;
  }
  return result;
}

function getConsolidatedMatrixRows(result: ConsolidatedSubjectDiagnosticResult) {
  const ssesRows = result.sections
    .filter((section) => section.isSses)
    .flatMap((section) => section.proficiencyRows);
  const regularSections = result.sections.filter((section) => !section.isSses);
  const regularRows = regularSections.flatMap((section) => section.proficiencyRows);
  const rows: { label: string; values: ProficiencyRow[]; highlight?: boolean }[] = [];

  if (ssesRows.length > 0 || result.sections.some((section) => section.isSses)) {
    rows.push({ label: "SSES", values: ssesRows, highlight: true });
  }
  for (const section of regularSections) {
    rows.push({ label: section.sectionName, values: section.proficiencyRows });
  }
  rows.push({ label: "Regular", values: regularRows, highlight: true });
  if (ssesRows.length > 0 && regularSections.length > 0) {
    rows.push({ label: "Combined", values: [...ssesRows, ...regularRows], highlight: true });
  }
  return rows;
}

function makeLaemplSummary(values: ProficiencyRow[]) {
  const maleRows = values.filter((row) => row.sex === "Male");
  const femaleRows = values.filter((row) => row.sex === "Female");
  const maleAchieved = maleRows.filter((row) => row.mpl >= MPL_THRESHOLD).length;
  const femaleAchieved = femaleRows.filter((row) => row.mpl >= MPL_THRESHOLD).length;
  const totalAchieved = maleAchieved + femaleAchieved;
  return {
    enrolled: [maleRows.length, femaleRows.length, values.length] as const,
    testTakers: [maleRows.length, femaleRows.length, values.length] as const,
    achieved: [maleAchieved, femaleAchieved, totalAchieved] as const,
    percentage: [
      formatPercentage(maleAchieved, maleRows.length),
      formatPercentage(femaleAchieved, femaleRows.length),
      formatPercentage(totalAchieved, values.length),
    ] as const,
    mean: formatNumber(average(values.map((row) => row.testScore))),
    mps: `${formatNumber(average(values.map((row) => row.mpl)))}%`,
  };
}

function aggregateItemRows(summaries: ItemAnalysisSummary[]): ItemAnalysisSummary {
  const grouped = new Map<number, ItemAnalysisRow>();
  for (const summary of summaries) {
    for (const row of summary.rows) {
      const existing = grouped.get(row.itemNo);
      if (!existing) {
        grouped.set(row.itemNo, { ...row });
        continue;
      }
      existing.correctResponses += row.correctResponses;
      if (existing.objective === DASH && row.objective !== DASH) existing.objective = row.objective;
    }
  }
  const ranked = Array.from(grouped.values())
    .sort((a, b) => b.correctResponses - a.correctResponses || a.itemNo - b.itemNo)
    .map((row, index) => ({ ...row, rank: index + 1 }));
  return {
    rows: [...ranked].sort((a, b) => a.itemNo - b.itemNo),
    topMostLearned: ranked.slice(0, 5),
    topLeastLearned: [...ranked].reverse().slice(0, 5),
  };
}

function parseProficiencyRows(report: SavedReportRow): ProficiencyRow[] {
  const scores = Array.isArray(report.student_scores)
    ? (report.student_scores as SavedStudentScore[])
    : [];
  return scores
    .map((score) => {
      const enrollmentId = score.enrollment_id ?? score.enrollmentId ?? null;
      const mpl = toFiniteNumber(score.mpl);
      return {
        enrollmentId: enrollmentId ?? 0,
        pupilName:
          score.student_name?.trim() ||
          score.pupilName?.trim() ||
          `Enrollment #${enrollmentId ?? DASH}`,
        testScore: toFiniteNumber(score.score ?? score.testScore),
        totalItems: toFiniteNumber(score.total_items ?? score.totalItems ?? report.total_items),
        mpl,
        proficiencyLevel:
          score.proficiency_level?.trim() ||
          score.proficiencyLevel?.trim() ||
          getProficiencyFromMpl(mpl),
        sex: normalizeSex(score.sex) ?? "Male",
      };
    })
    .sort((a, b) => a.pupilName.localeCompare(b.pupilName, undefined, { sensitivity: "base" }));
}

function summaryFromReport(report: SavedReportRow): ExamDetailsSummary {
  return {
    totalItems: toFiniteNumber(report.total_items),
    numberOfCases: toFiniteNumber(report.total_cases),
    totalScore: toFiniteNumber(report.total_score),
    mean: toFiniteNumber(report.mean),
    pl: toFiniteNumber(report.pl),
    highestScore: toFiniteNumber(report.highest_score),
    lowestScore: toFiniteNumber(report.lowest_score),
    mps: toFiniteNumber(report.mps),
    passCount: toFiniteNumber(report.total_achieved),
  };
}

function aggregateSummaries(summaries: ExamDetailsSummary[]): ExamDetailsSummary | null {
  if (summaries.length === 0) return null;
  const totalItems = Math.max(...summaries.map((summary) => summary.totalItems));
  const numberOfCases = summaries.reduce((sum, summary) => sum + summary.numberOfCases, 0);
  const totalScore = summaries.reduce((sum, summary) => sum + summary.totalScore, 0);
  return {
    totalItems,
    numberOfCases,
    totalScore,
    mean: numberOfCases > 0 ? totalScore / numberOfCases : 0,
    pl: average(summaries.map((summary) => summary.pl)),
    highestScore: Math.max(...summaries.map((summary) => summary.highestScore)),
    lowestScore: Math.min(...summaries.map((summary) => summary.lowestScore)),
    mps: average(summaries.map((summary) => summary.mps)),
    passCount: summaries.reduce((sum, summary) => sum + summary.passCount, 0),
  };
}

function mapSavedItemRows(value: unknown): ItemAnalysisRow[] {
  if (!Array.isArray(value)) return [];
  return (value as SavedItemAnalysisRow[])
    .map((row) => {
      const itemNo = row.item_no ?? row.itemNo ?? null;
      if (itemNo == null) return null;
      return {
        itemNo,
        objective: row.objective?.trim() || DASH,
        correctResponses: toFiniteNumber(row.correct_responses ?? row.correctResponses),
        rank: toFiniteNumber(row.rank),
      };
    })
    .filter((row): row is ItemAnalysisRow => row != null);
}

function itemSummaryFromReport(report: ItemReportRow | null): ItemAnalysisSummary {
  if (!report) return { rows: [], topMostLearned: [], topLeastLearned: [] };
  return {
    rows: mapSavedItemRows(report.item_scores).sort((a, b) => a.itemNo - b.itemNo),
    topMostLearned: mapSavedItemRows(report.most_learned),
    topLeastLearned: mapSavedItemRows(report.least_learned),
  };
}

async function findCurriculumSubjectId(gradeLevelId: number, subjectId: number) {
  const { data: activeSy } = await adminClient
    .from("school_years")
    .select("curriculum_id")
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();
  const curriculumId = (activeSy as { curriculum_id?: number | null } | null)?.curriculum_id ?? null;
  if (curriculumId == null) return null;

  const { data } = await adminClient
    .from("curriculum_subjects")
    .select("curriculum_subject_id")
    .eq("curriculum_id", curriculumId)
    .eq("grade_level_id", gradeLevelId)
    .eq("subject_id", subjectId)
    .is("deleted_at", null)
    .maybeSingle();

  return ((data as CurriculumSubjectRow | null)?.curriculum_subject_id ?? null);
}

function canAccessConsolidated({
  permissions,
  gradeLevelId,
  curriculumSubjectId,
  sectionIds,
  scope,
}: {
  permissions: string[];
  gradeLevelId: number;
  curriculumSubjectId: number | null;
  sectionIds: number[];
  scope: Awaited<ReturnType<typeof fetchMyAssignedScope>>;
}) {
  if (permissions.includes("reports.view_all")) return true;
  if (curriculumSubjectId == null) return false;
  if (
    permissions.includes("reports.monitor_grade_level") &&
    scope.curriculumSubjectIds.includes(curriculumSubjectId) &&
    sectionIds.some((id) => scope.glSectionIds.includes(id))
  ) {
    return true;
  }
  if (
    permissions.includes("reports.monitor_subjects") &&
    scope.curriculumSubjectIds.includes(curriculumSubjectId) &&
    sectionIds.some((id) => scope.subjectSectionIds.includes(id))
  ) {
    return true;
  }
  if (
    permissions.includes("reports.view_assigned") &&
    scope.assignedPairs.some(
      (pair) =>
        pair.curriculumSubjectId === curriculumSubjectId &&
        sectionIds.includes(pair.sectionId),
    )
  ) {
    return true;
  }
  return Boolean(gradeLevelId && false);
}

async function getCoordinatorName(gradeLevelId: number, subjectId: number) {
  const { data: groups } = await adminClient
    .from("subject_groups")
    .select(
      "subject_group_id, subject_group_members!inner(curriculum_subjects!inner(subject_id, grade_level_id))",
    )
    .is("deleted_at", null)
    .is("subject_group_members.deleted_at", null)
    .eq("subject_group_members.curriculum_subjects.subject_id", subjectId)
    .eq("subject_group_members.curriculum_subjects.grade_level_id", gradeLevelId)
    .limit(1);
  const groupId =
    ((groups ?? []) as { subject_group_id: number | null }[])[0]?.subject_group_id ?? null;
  if (groupId == null) return "Unassigned";

  const { data } = await adminClient
    .from("subject_coordinators")
    .select("users!user_id(first_name, last_name)")
    .eq("subject_group_id", groupId)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();

  return teacherName(data as CoordinatorRow | null);
}

async function buildConsolidatedResultFromSavedReports({
  gradeLevelId,
  subjectId,
  exam,
  sectionFilter,
}: {
  gradeLevelId: number;
  subjectId: number;
  exam: ExamRow;
  sectionFilter: number[] | null;
}): Promise<ConsolidatedSubjectDiagnosticResult | null> {
  const curriculumSubjectId = await findCurriculumSubjectId(gradeLevelId, subjectId);
  if (curriculumSubjectId == null) return null;

  const { data: sectionData, error: sectionError } = await adminClient
    .from("sections")
    .select("section_id, name")
    .eq("grade_level_id", gradeLevelId)
    .is("deleted_at", null)
    .order("name", { ascending: true });
  if (sectionError) return null;

  const sections = ((sectionData ?? []) as SectionRow[])
    .filter((section) => sectionFilter == null || sectionFilter.includes(section.section_id));
  if (sections.length === 0) return null;

  const sectionIds = sections.map((section) => section.section_id);

  const { data: contextData } = await adminClient
    .from("exam_results_reports")
    .select("quarter_id")
    .eq("exam_id", exam.exam_id)
    .eq("grade_level_id", gradeLevelId)
    .eq("curriculum_subject_id", curriculumSubjectId)
    .in("section_id", sectionIds)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const quarterId = (contextData as { quarter_id?: number | null } | null)?.quarter_id ?? null;

  let reportQuery = adminClient
    .from("exam_results_reports")
    .select(
      "exam_id, section_id, curriculum_subject_id, grade_level_id, quarter_id, total_items, total_cases, total_score, mean, pl, highest_score, lowest_score, mps, total_achieved, student_scores, generated_at",
    )
    .eq("grade_level_id", gradeLevelId)
    .eq("curriculum_subject_id", curriculumSubjectId)
    .in("section_id", sectionIds);
  if (quarterId != null) {
    reportQuery = reportQuery.eq("quarter_id", quarterId);
  } else {
    reportQuery = reportQuery.eq("exam_id", exam.exam_id);
  }
  const { data: reportData, error: reportError } = await reportQuery.order("generated_at", { ascending: false });
  if (reportError) return null;

  const latestReportBySection = new Map<number, SavedReportRow>();
  for (const row of (reportData ?? []) as SavedReportRow[]) {
    if (row.section_id == null || latestReportBySection.has(row.section_id)) continue;
    latestReportBySection.set(row.section_id, row);
  }

  const reportExamIds = Array.from(
    new Set(
      Array.from(latestReportBySection.values())
        .map((report) => report.exam_id)
        .filter((id): id is number => id != null),
    ),
  );
  const { data: itemData } =
    reportExamIds.length === 0
      ? { data: [] }
      : await adminClient
          .from("item_analysis_reports")
          .select("exam_id, section_id, item_scores, most_learned, least_learned")
          .in("exam_id", reportExamIds)
          .in("section_id", sectionIds)
          .order("generated_at", { ascending: false });
  const latestItemByKey = new Map<string, ItemReportRow>();
  for (const row of (itemData ?? []) as ItemReportRow[]) {
    if (row.exam_id == null || row.section_id == null) continue;
    const key = `${row.exam_id}:${row.section_id}`;
    if (!latestItemByKey.has(key)) latestItemByKey.set(key, row);
  }

  const resultSections: ConsolidatedSubjectSectionResult[] = sections.map((section) => {
    const report = latestReportBySection.get(section.section_id) ?? null;
    const itemReport =
      report?.exam_id != null
        ? latestItemByKey.get(`${report.exam_id}:${section.section_id}`) ?? null
        : null;
    const proficiencyRows = report ? parseProficiencyRows(report) : [];
    return {
      sectionId: section.section_id,
      sectionName: section.name ?? `Section ${section.section_id}`,
      isSses: /\bSSES\b/i.test(section.name ?? ""),
      examId: report?.exam_id ?? null,
      isFinalized: Boolean(report),
      summary: report ? summaryFromReport(report) : null,
      median: null,
      sd: null,
      proficiencyRows,
      itemAnalysis: itemSummaryFromReport(itemReport),
    };
  });

  const summaries = resultSections
    .map((section) => section.summary)
    .filter((summary): summary is ExamDetailsSummary => summary != null);
  const itemSummaries = resultSections
    .filter((section) => section.isFinalized)
    .map((section) => section.itemAnalysis);

  const { data: subjectData } = await adminClient
    .from("curriculum_subjects")
    .select("subjects(name)")
    .eq("curriculum_subject_id", curriculumSubjectId)
    .maybeSingle();
  const subjectJoin = firstJoin((subjectData as CurriculumSubjectRow | null)?.subjects);

  const sortedSections = resultSections.sort((a, b) => {
    if (a.isSses !== b.isSses) return a.isSses ? -1 : 1;
    return a.sectionName.localeCompare(b.sectionName, undefined, { sensitivity: "base" });
  });

  return {
    examTitle: stripSectionSuffix(exam.title, sortedSections),
    subjectName: subjectJoin?.name ?? "Unknown Subject",
    gradeDisplayName: `Grade ${gradeLevelId}`,
    sections: sortedSections,
    summary: aggregateSummaries(summaries),
    median: null,
    sd: null,
    itemAnalysis: aggregateItemRows(itemSummaries),
    sectionCount: resultSections.length,
    finalizedSectionCount: resultSections.filter((section) => section.isFinalized).length,
  };
}

const _GET = async function (request: Request) {
  const user = await getServerUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const gradeLevelId = Number(url.searchParams.get("gradeLevelId"));
  const subjectId = Number(url.searchParams.get("subjectId"));
  const examId = Number(url.searchParams.get("examId"));
  const sectionsParam = url.searchParams.get("sections");
  const requestedSectionIds = sectionsParam
    ? sectionsParam.split(",").map(Number).filter((id) => Number.isFinite(id) && id > 0)
    : [];
  const sectionFilter = requestedSectionIds.length > 0 ? requestedSectionIds : null;

  if (!Number.isFinite(gradeLevelId) || !Number.isFinite(subjectId) || !Number.isFinite(examId)) {
    return Response.json({ error: "Invalid consolidated report request." }, { status: 400 });
  }

  const { data: examData, error: examError } = await adminClient
    .from("exams")
    .select("exam_id, title, exam_date, total_items, quarters(name)")
    .eq("exam_id", examId)
    .maybeSingle();
  if (examError || !examData) {
    return Response.json({ error: "Exam not found." }, { status: 404 });
  }
  const exam = examData as ExamRow;

  const result = await buildConsolidatedResultFromSavedReports({
    gradeLevelId,
    subjectId,
    exam,
    sectionFilter,
  });
  if (!result || result.finalizedSectionCount === 0) {
    return Response.json({ error: "No finalized reports found for this consolidated report." }, { status: 404 });
  }

  const permissions = getPermissionsFromUser(user);
  const hasReportPermission =
    permissions.includes("reports.view_all") ||
    permissions.includes("reports.view_assigned") ||
    permissions.includes("reports.monitor_grade_level") ||
    permissions.includes("reports.monitor_subjects");
  if (!hasReportPermission) return Response.json({ error: "Forbidden" }, { status: 403 });

  const curriculumSubjectId = await findCurriculumSubjectId(gradeLevelId, subjectId);
  const scope = await fetchMyAssignedScope(user.id, adminClient);
  const sectionIds = result.sections.map((section) => section.sectionId);
  if (!canAccessConsolidated({ permissions, gradeLevelId, curriculumSubjectId, sectionIds, scope })) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const [{ data: schoolYearData }, coordinatorName] = await Promise.all([
    adminClient
      .from("school_years")
      .select("school_year, sy_id, curriculum_id")
      .eq("is_active", true)
      .is("deleted_at", null)
      .maybeSingle(),
    getCoordinatorName(gradeLevelId, subjectId),
  ]);
  const schoolYear = (schoolYearData as SchoolYearRow | null)?.school_year ?? DASH;
  const quarterName = firstJoin(exam.quarters)?.name ?? DASH;

  return buildWorkbook({
    result,
    exam,
    coordinatorName,
    schoolYear,
    quarterName,
    userEmail: user.email ?? user.id,
  });
};

function baseCols(count = 24) {
  return Array.from({ length: count }, (_, index) => ({
    wch: index === 1 ? 34 : 14,
  }));
}

function writeHeaderBlock({
  ws,
  styles,
  title,
  metadata,
  merges,
  width,
  generatedBy,
}: {
  ws: Worksheet;
  styles: ReturnType<typeof makeStyles>;
  title: string;
  metadata: [string, string | number][];
  merges: XLSXStyle.Range[];
  width: number;
  generatedBy: string;
}) {
  setCell(ws, "A1", generatedBy, styles.generatedBy);
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: width - 1 } });
  setCell(ws, "A2", title, styles.title);
  merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: width - 1 } });
  metadata.forEach(([label, value], index) => {
    const row = index + 4;
    setCell(ws, `A${row}`, label, styles.label);
    setCell(ws, `B${row}`, value, styles.value, typeof value === "number" ? "n" : "s");
    merges.push({ s: { r: row - 1, c: 1 }, e: { r: row - 1, c: Math.min(width - 1, 4) } });
  });
}

function writeTable({
  ws,
  styles,
  row,
  col,
  title,
  headers,
  values,
  firstColCenter = false,
  merges,
  headerStyle,
}: {
  ws: Worksheet;
  styles: ReturnType<typeof makeStyles>;
  row: number;
  col: number;
  title: string;
  headers: string[];
  values: (string | number)[][];
  firstColCenter?: boolean;
  merges?: XLSXStyle.Range[];
  headerStyle?: XLSXStyle.CellObject["s"];
}) {
  setCell(ws, XLSXStyle.utils.encode_cell({ r: row - 1, c: col }), title, styles.sectionTitle);
  if (merges && headers.length > 1) {
    merges.push({ s: { r: row - 1, c: col }, e: { r: row - 1, c: col + headers.length - 1 } });
  }
  headers.forEach((header, index) =>
    setCell(ws, XLSXStyle.utils.encode_cell({ r: row, c: col + index }), header, headerStyle ?? styles.header),
  );
  values.forEach((valueRow, r) =>
    valueRow.forEach((value, c) =>
      setCell(
        ws,
        XLSXStyle.utils.encode_cell({ r: row + r + 1, c: col + c }),
        value,
        c === 0 && !firstColCenter ? styles.bodyLeft : styles.body,
        typeof value === "number" ? "n" : "s",
      ),
    ),
  );
  return row + values.length + 3;
}

function writeLongMatrixTable({
  ws,
  styles,
  merges,
  row,
  col,
  title,
  groups,
  trailingHeaders = [],
  trailingValues = [],
}: {
  ws: Worksheet;
  styles: ReturnType<typeof makeStyles>;
  merges: XLSXStyle.Range[];
  row: number;
  col: number;
  title: string;
  groups: { label: string; values: [string | number, string | number, string | number] }[];
  trailingHeaders?: string[];
  trailingValues?: (string | number)[];
}) {
  setCell(ws, XLSXStyle.utils.encode_cell({ r: row - 1, c: col }), title, styles.sectionTitle);
  merges.push({ s: { r: row - 1, c: col }, e: { r: row - 1, c: col + groups.length * 3 + trailingHeaders.length - 1 } });
  let currentCol = col;
  for (const group of groups) {
    for (let offset = 0; offset < 3; offset++) {
      setCell(
        ws,
        XLSXStyle.utils.encode_cell({ r: row, c: currentCol + offset }),
        offset === 0 ? group.label : "",
        styles.header,
      );
    }
    merges.push({ s: { r: row, c: currentCol }, e: { r: row, c: currentCol + 2 } });
    ["Male", "Female", "Total"].forEach((label, offset) =>
      setCell(ws, XLSXStyle.utils.encode_cell({ r: row + 1, c: currentCol + offset }), label, styles.header),
    );
    group.values.forEach((value, offset) =>
      setCell(
        ws,
        XLSXStyle.utils.encode_cell({ r: row + 2, c: currentCol + offset }),
        value,
        styles.body,
        typeof value === "number" ? "n" : "s",
      ),
    );
    currentCol += 3;
  }
  trailingHeaders.forEach((header, index) => {
    const c = currentCol + index;
    setCell(ws, XLSXStyle.utils.encode_cell({ r: row, c }), header, styles.header);
    setCell(ws, XLSXStyle.utils.encode_cell({ r: row + 1, c }), header, styles.header);
    setCell(
      ws,
      XLSXStyle.utils.encode_cell({ r: row + 2, c }),
      trailingValues[index] ?? "",
      styles.body,
      typeof trailingValues[index] === "number" ? "n" : "s",
    );
    merges.push({ s: { r: row, c }, e: { r: row + 1, c } });
  });
  return row + 5;
}

function writeSummaryTables({
  ws,
  styles,
  merges,
  row,
  col,
  rows,
}: {
  ws: Worksheet;
  styles: ReturnType<typeof makeStyles>;
  merges: XLSXStyle.Range[];
  row: number;
  col: number;
  rows: ProficiencyRow[];
}) {
  const maleRows = rows.filter((item) => item.sex === "Male");
  const femaleRows = rows.filter((item) => item.sex === "Female");
  const mplRows = makeMplRows(rows);
  let next = writeTable({
    ws,
    styles,
    row,
    col,
    title: "Achieved/Exceeded 60% MPL",
    headers: ["Group", "Test Taker", "Achieved", "Percentage"],
    values: mplRows.map((item) => [
      item.label,
      item.testTakers,
      item.achieved,
      formatPercentage(item.achieved, item.testTakers),
    ]),
    merges,
  });
  next = writeTable({
    ws,
    styles,
    row: next,
    col,
    title: "Failed 30% MPL",
    headers: ["Group", "Test Taker", "Failed", "Percentage"],
    values: mplRows.map((item) => [
      item.label,
      item.testTakers,
      item.failed,
      formatPercentage(item.failed, item.testTakers),
    ]),
    merges,
  });
  const total = rows.length;
  const maleAchieved = maleRows.filter((item) => item.mpl >= MPL_THRESHOLD).length;
  const femaleAchieved = femaleRows.filter((item) => item.mpl >= MPL_THRESHOLD).length;
  const achieved = maleAchieved + femaleAchieved;
  next = writeLongMatrixTable({
    ws,
    styles,
    merges,
    row: next,
    col,
    title: "LAEMPL",
    groups: [
      { label: "Number of Enrolled Learners", values: [maleRows.length, femaleRows.length, total] },
      { label: "Number of Test Takers", values: [maleRows.length, femaleRows.length, total] },
      { label: "Number of Learners who attained or exceeded the Minimum Proficiency Level (60%)", values: [maleAchieved, femaleAchieved, achieved] },
      {
        label: "Percentage of LAEMPL",
        values: [
          formatPercentage(maleAchieved, maleRows.length),
          formatPercentage(femaleAchieved, femaleRows.length),
          formatPercentage(achieved, total),
        ],
      },
    ],
    trailingHeaders: ["MEAN", "MPS"],
    trailingValues: [
      formatNumber(average(rows.map((item) => item.testScore))),
      `${formatNumber(average(rows.map((item) => item.mpl)))}%`,
    ],
  });
  writeLongMatrixTable({
    ws,
    styles,
    merges,
    row: next,
    col,
    title: "Proficiency Level",
    groups: PROFICIENCY_LEVELS.map((level) => {
      const male = maleRows.filter((item) => item.proficiencyLevel === level).length;
      const female = femaleRows.filter((item) => item.proficiencyLevel === level).length;
      return { label: `Number of ${level} Learners`, values: [male, female, male + female] };
    }),
    trailingHeaders: ["OVER ALL"],
    trailingValues: [rows.length],
  });
}

function addTestResultsSheet({
  wb,
  result,
  exam,
  coordinatorName,
  schoolYear,
  generatedBy,
}: {
  wb: XLSXStyle.WorkBook;
  result: ConsolidatedSubjectDiagnosticResult;
  exam: ExamRow;
  coordinatorName: string;
  schoolYear: string;
  generatedBy: string;
}) {
  const styles = makeStyles();
  const ws: Worksheet = {};
  const merges: XLSXStyle.Range[] = [];
  ws["!cols"] = baseCols(12);
  writeHeaderBlock({
    ws,
    styles,
    title: "Consolidated Test Results",
    metadata: [
      ["Exam Title", result.examTitle],
      ["Subject Coordinator", coordinatorName],
      ["Grade", result.gradeDisplayName],
      ["Subject", result.subjectName],
      ["School Year", schoolYear],
    ],
    merges,
    width: 12,
    generatedBy,
  });
  const detailRow = (
    label: string,
    summary: ExamDetailsSummary | null,
    median: number | null | undefined,
    sd: number | null | undefined,
  ) => [
    label,
    summary?.totalItems ?? DASH,
    summary?.numberOfCases ?? DASH,
    summary?.totalScore ?? DASH,
    summary ? formatNumber(summary.mean) : DASH,
    formatDiagnosticValue(median, 2),
    summary ? formatNumber(summary.pl) : DASH,
    summary ? formatNumber(summary.mps) : DASH,
    summary?.highestScore ?? DASH,
    summary?.lowestScore ?? DASH,
    formatDiagnosticValue(sd, 2),
  ];
  const rows = result.sections.map((section) => {
    const { median, sd } = computeStats(section.proficiencyRows);
    return detailRow(section.sectionName, section.summary, median, sd);
  });
  const allProfRows = result.sections.flatMap((section) => section.proficiencyRows);
  const { median: totalMedian, sd: totalSd } = computeStats(allProfRows);
  rows.push(detailRow("Total", result.summary, totalMedian, totalSd));
  writeTable({
    ws,
    styles,
    row: 10,
    col: 0,
    title: `Diagnostic Test - ${result.examTitle}`,
    headers: ["Section", "No. of Items", "Number of Cases", "Total Score", "Mean", "Median", "PL", "MPS", "Highest Score", "Lowest Score", "SD"],
    values: rows,
  });
  merges.push({ s: { r: 9, c: 0 }, e: { r: 9, c: 10 } });
  ws["!merges"] = merges;
  appendSheet(wb, ws, "Test Results", `A1:L${Math.max(15, rows.length + 12)}`);
}

function addItemAnalysisSheet({
  wb,
  result,
}: {
  wb: XLSXStyle.WorkBook;
  result: ConsolidatedSubjectDiagnosticResult;
}) {
  const styles = makeStyles();
  const ws: Worksheet = {};
  const regularSections = result.sections.filter((section) => !section.isSses);
  const ssesSections = result.sections.filter((section) => section.isSses);

  // Dynamic column widths: size each section column to its name, not a fixed width
  const nameW = (name: string) => Math.min(Math.max(name.length + 1, 8), 20);
  const colWidths: { wch: number }[] = [
    { wch: 6 },  // Item
    ...regularSections.map((s) => ({ wch: nameW(s.sectionName) })),
    { wch: 8 }, { wch: 7 }, { wch: 2 },  // Total, Rank, gap
    { wch: 6 }, { wch: 8 }, { wch: 8 }, { wch: 7 }, { wch: 2 },  // SSES table + gap
    { wch: 6 }, { wch: 8 }, { wch: 10 }, { wch: 8 }, { wch: 7 }, { wch: 2 },  // Combined + gap
    { wch: 7 }, { wch: 13 }, { wch: 7 }, { wch: 13 },  // Ranking table
  ];
  ws["!cols"] = colWidths;
  const merges: XLSXStyle.Range[] = [];

  const itemNos = Array.from(
    new Set(result.sections.flatMap((section) => section.itemAnalysis.rows.map((row) => row.itemNo))),
  ).sort((a, b) => a - b);
  const regularTotals = itemNos.map((itemNo) => ({
    itemNo,
    value: regularSections.reduce((sum, section) => sum + (getSectionItemValue(section, itemNo) ?? 0), 0),
  }));
  const ssesTotals = itemNos.map((itemNo) => ({
    itemNo,
    value: ssesSections.reduce((sum, section) => sum + (getSectionItemValue(section, itemNo) ?? 0), 0),
  }));
  const combinedTotals = itemNos.map((itemNo) => ({
    itemNo,
    value:
      (regularTotals.find((row) => row.itemNo === itemNo)?.value ?? 0) +
      (ssesTotals.find((row) => row.itemNo === itemNo)?.value ?? 0),
  }));
  const regularRanks = rankByValue(regularTotals);
  const ssesRanks = rankByValue(ssesTotals);
  const combinedRanks = rankByValue(combinedTotals);

  const writeItemTable = (
    title: string,
    col: number,
    headers: string[],
    values: (string | number)[][],
  ) => {
    writeTable({ ws, styles, row: 3, col, title, headers, values, firstColCenter: true, merges, headerStyle: styles.headerNoWrap });
  };

  const regularValues = itemNos.length === 0
    ? [[DASH, DASH, DASH, DASH]]
    : itemNos.map((itemNo) => {
        const total = regularTotals.find((row) => row.itemNo === itemNo)?.value ?? 0;
        return [
          itemNo,
          ...regularSections.map((section) => getSectionItemValue(section, itemNo) ?? DASH),
          total,
          regularRanks.get(itemNo) ?? DASH,
        ];
      });
  const ssesValues = itemNos.length === 0
    ? [[DASH, DASH, DASH, DASH]]
    : itemNos.map((itemNo) => {
        const total = ssesTotals.find((row) => row.itemNo === itemNo)?.value ?? 0;
        return [itemNo, total, total, ssesRanks.get(itemNo) ?? DASH];
      });
  const combinedValues = itemNos.length === 0
    ? [[DASH, DASH, DASH, DASH, DASH]]
    : itemNos.map((itemNo) => {
        const sses = ssesTotals.find((row) => row.itemNo === itemNo)?.value ?? 0;
        const regular = regularTotals.find((row) => row.itemNo === itemNo)?.value ?? 0;
        return [itemNo, sses, regular, sses + regular, combinedRanks.get(itemNo) ?? DASH];
      });

  writeItemTable(
    "Regular",
    0,
    ["Item", ...regularSections.map((section) => section.sectionName), "Total", "Rank"],
    regularValues,
  );
  const ssesCol = regularSections.length + 4;
  writeItemTable("SSES", ssesCol, ["Item", "SSES", "Total", "Rank"], ssesValues);
  const combinedCol = ssesCol + 5;
  writeItemTable("Combined", combinedCol, ["Item", "SSES", "Regular", "Total", "Rank"], combinedValues);

  const writeRankingTable = (title: string, sections: ConsolidatedSubjectSectionResult[], row: number, col: number) => {
    const ranking = getRankingSummary(sections);
    const values = Array.from({ length: 5 }).map((_, index) => [
      index + 1,
      ranking.most[index]?.itemNo ?? DASH,
      ranking.least[index]?.rank ?? DASH,
      ranking.least[index]?.itemNo ?? DASH,
    ]);
    writeTable({ ws, styles, row, col, title, headers: ["Rank", "Most Learned", "Rank", "Least Learned"], values, firstColCenter: true, merges, headerStyle: styles.headerNoWrap });
  };
  const rankingCol = combinedCol + 6;
  writeRankingTable("SSES", ssesSections, 3, rankingCol);
  writeRankingTable("Regular", regularSections, 13, rankingCol);
  ws["!merges"] = merges;
  const lastCol = XLSXStyle.utils.encode_col(rankingCol + 3);
  appendSheet(wb, ws, "Item Analysis", `A1:${lastCol}${Math.max(40, itemNos.length + 8)}`);
}

function addSectionSheet({
  wb,
  section,
  result,
  exam,
  generatedBy,
}: {
  wb: XLSXStyle.WorkBook;
  section: ConsolidatedSubjectSectionResult;
  result: ConsolidatedSubjectDiagnosticResult;
  exam: ExamRow;
  generatedBy: string;
}) {
  const styles = makeStyles();
  const ws: Worksheet = {};
  ws["!cols"] = [
    { wch: 6 },  { wch: 34 }, { wch: 12 }, { wch: 12 }, { wch: 24 },  // No., Name, Score, MPL, Prof Level
    { wch: 16 }, { wch: 24 }, { wch: 18 }, { wch: 18 }, { wch: 18 },
    { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
    { wch: 12 }, { wch: 12 },
  ];
  if (!section.isFinalized || !section.summary) {
    const unfinMerges: XLSXStyle.Range[] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 8 } },
    ];
    setCell(ws, "A1", section.sectionName, styles.title);
    setCell(ws, "A3", "Section not yet finalized", styles.note);
    ws["!merges"] = unfinMerges;
    appendSheet(wb, ws, section.sectionName, "A1:I6");
    return;
  }

  // Pre-defined merges — mirrors exam-result-download exactly
  const merges: XLSXStyle.Range[] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 10 } },   // generated-by
    { s: { r: 1, c: 0 }, e: { r: 1, c: 10 } },   // title
    { s: { r: 3, c: 1 }, e: { r: 3, c: 3 } },    // left value row 4
    { s: { r: 4, c: 1 }, e: { r: 4, c: 3 } },    // left value row 5
    { s: { r: 5, c: 1 }, e: { r: 5, c: 3 } },    // left value row 6
    { s: { r: 6, c: 1 }, e: { r: 6, c: 3 } },    // left value row 7
    { s: { r: 3, c: 7 }, e: { r: 3, c: 10 } },   // right value row 4
    { s: { r: 4, c: 7 }, e: { r: 4, c: 10 } },   // right value row 5
    { s: { r: 5, c: 7 }, e: { r: 5, c: 10 } },   // right value row 6
    { s: { r: 6, c: 7 }, e: { r: 6, c: 10 } },   // right value row 7
    { s: { r: 9, c: 0 }, e: { r: 9, c: 7 } },    // Details label
    { s: { r: 13, c: 0 }, e: { r: 13, c: 4 } },  // Proficiency Level label
  ];

  ws["!rows"] = [
    { hpt: 14 }, { hpt: 30 }, { hpt: 14 },
    { hpt: 20 }, { hpt: 20 }, { hpt: 20 }, { hpt: 20 },
    { hpt: 10 }, { hpt: 10 }, { hpt: 20 },
    { hpt: 20 }, { hpt: 18 }, { hpt: 10 },
    { hpt: 20 }, { hpt: 20 },
  ];

  // Row 1: generated-by | Row 2: title
  setCell(ws, "A1", generatedBy, styles.generatedBy);
  setCell(ws, "A2", "Individual Exam Result", styles.title);

  // Metadata — same layout as individual download (labelCol A/G, valueCol B/H, rows 4–7)
  const metadata: [string, string | number][] = [
    ["Exam Title", result.examTitle],
    ["Subject Teacher", "See masterlist"],
    ["Grade", result.gradeDisplayName],
    ["Section", section.sectionName],
    ["Subject", result.subjectName],
    ["Quarter", firstJoin(exam.quarters)?.name ?? DASH],
    ["Exam Date", exam.exam_date ?? DASH],
    ["Total Items", section.summary.totalItems],
  ];
  metadata.forEach(([label, value], index) => {
    const labelCol = index < 4 ? "A" : "G";
    const valueCol = index < 4 ? "B" : "H";
    const actualRow = index < 4 ? index + 4 : index;
    setCell(ws, `${labelCol}${actualRow}`, label, styles.labelNoWrap);
    setCell(ws, `${valueCol}${actualRow}`, value, styles.value, typeof value === "number" ? "n" : "s");
  });

  // Right-edge borders (col D and col K, rows 4–7)
  for (let i = 0; i < 4; i++) {
    ws[XLSXStyle.utils.encode_cell({ r: 3 + i, c: 3 })]  = { v: "", t: "s", s: styles.rightBorder };
    ws[XLSXStyle.utils.encode_cell({ r: 3 + i, c: 10 })] = { v: "", t: "s", s: styles.rightBorder };
  }

  // Details table (row 10 = label, row 11 = headers, row 12 = values)
  const profRows = section.proficiencyRows;
  const meanScore = section.summary.mean;
  const sdValue = profRows.length > 0
    ? Math.sqrt(profRows.reduce((sum, r) => sum + (r.testScore - meanScore) ** 2, 0) / profRows.length)
    : 0;
  setCell(ws, "A10", "Details", styles.sectionTitle);
  ["No. of Items", "Number of Cases", "Total Score", "Mean", "PL", "Highest Score", "Lowest Score", "SD"].forEach((h, i) =>
    setCell(ws, XLSXStyle.utils.encode_cell({ r: 10, c: i }), h, styles.headerNoWrap),
  );
  summaryDetails(section.summary, sdValue).forEach((v, i) =>
    setCell(ws, XLSXStyle.utils.encode_cell({ r: 11, c: i }), v, styles.body, typeof v === "number" ? "n" : "s"),
  );

  // Proficiency table header (row 14 = label, row 15 = headers)
  let row = 15;
  setCell(ws, "A14", "Proficiency Level Obtained", styles.sectionTitle);
  ["No.", "Name", "Score", "MPL", "Proficiency Level Obtained"].forEach((h, i) =>
    setCell(ws, XLSXStyle.utils.encode_cell({ r: 14, c: i }), h, styles.headerNoWrap),
  );
  const groups = [
    ["Male", section.proficiencyRows.filter((item) => item.sex === "Male")] as const,
    ["Female", section.proficiencyRows.filter((item) => item.sex === "Female")] as const,
  ];
  for (const [label, rows] of groups) {
    if (rows.length === 0) continue;
    for (let c = 0; c <= 4; c++) {
      setCell(ws, XLSXStyle.utils.encode_cell({ r: row, c }), c === 0 ? `${label} (${rows.length})` : "", styles.group);
    }
    merges.push({ s: { r: row, c: 0 }, e: { r: row, c: 4 } });
    row++;
    rows.forEach((item, index) => {
      [index + 1, item.pupilName, item.testScore, `${formatNumber(item.mpl, 1)}%`, item.proficiencyLevel].forEach((value, c) =>
        setCell(ws, XLSXStyle.utils.encode_cell({ r: row, c }), value, c === 1 ? styles.bodyLeftNoWrap : styles.body, typeof value === "number" ? "n" : "s"),
      );
      row++;
    });
  }
  writeSummaryTables({ ws, styles, merges, row: 15, col: 6, rows: section.proficiencyRows });
  ws["!merges"] = merges;
  appendSheet(wb, ws, section.sectionName, `A1:V${Math.max(row, 40)}`);
}

function addLevelOfProficiencySheet({
  wb,
  result,
}: {
  wb: XLSXStyle.WorkBook;
  result: ConsolidatedSubjectDiagnosticResult;
}) {
  const styles = makeStyles();
  const ws: Worksheet = {};
  const merges: XLSXStyle.Range[] = [];
  ws["!cols"] = baseCols(18);
  const rows = getConsolidatedMatrixRows(result);
  setCell(ws, "A1", "Level of Proficiency", styles.title);
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 15 } });
  setCell(ws, "A4", "Level of Proficiency", styles.header);
  merges.push({ s: { r: 3, c: 0 }, e: { r: 4, c: 0 } });
  PROFICIENCY_LEVELS.forEach((level, index) => {
    const col = 1 + index * 3;
    setCell(ws, XLSXStyle.utils.encode_cell({ r: 3, c: col }), `Number of ${level} Learners`, styles.header);
    setCell(ws, XLSXStyle.utils.encode_cell({ r: 3, c: col + 1 }), "", styles.header);
    setCell(ws, XLSXStyle.utils.encode_cell({ r: 3, c: col + 2 }), "", styles.header);
    merges.push({ s: { r: 3, c: col }, e: { r: 3, c: col + 2 } });
    ["Male", "Female", "Total"].forEach((label, offset) =>
      setCell(ws, XLSXStyle.utils.encode_cell({ r: 4, c: col + offset }), label, styles.header),
    );
  });
  rows.forEach((row, index) => {
    const sheetRow = 5 + index;
    setCell(
      ws,
      XLSXStyle.utils.encode_cell({ r: sheetRow, c: 0 }),
      row.label,
      row.highlight ? styles.group : styles.bodyLeft,
    );
    const counts = countByProficiency(row.values);
    PROFICIENCY_LEVELS.forEach((level, levelIndex) => {
      const col = 1 + levelIndex * 3;
      const count = counts.get(level) ?? { male: 0, female: 0, total: 0 };
      [count.male, count.female, count.total].forEach((value, offset) =>
        setCell(ws, XLSXStyle.utils.encode_cell({ r: sheetRow, c: col + offset }), value, styles.body, "n"),
      );
    });
  });
  if (rows.length === 0) {
    setCell(ws, "A6", DASH, styles.body);
  }
  ws["!merges"] = merges;
  appendSheet(wb, ws, "Level of Proficiency", `A1:P${Math.max(12, rows.length + 6)}`);
}

function addLaemplSheet({
  wb,
  result,
}: {
  wb: XLSXStyle.WorkBook;
  result: ConsolidatedSubjectDiagnosticResult;
}) {
  const styles = makeStyles();
  const ws: Worksheet = {};
  const merges: XLSXStyle.Range[] = [];
  ws["!cols"] = baseCols(18);
  const rows = getConsolidatedMatrixRows(result).filter((row) => row.label !== "Combined");
  setCell(ws, "A1", "LAEMPL", styles.title);
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 15 } });
  setCell(ws, "A4", "Section", styles.header);
  merges.push({ s: { r: 3, c: 0 }, e: { r: 4, c: 0 } });
  const groups = [
    "Enrolled Learners",
    "Test Takers",
    "Attained or Exceeded MPL (60%)",
    "Percentage of LAEMPL",
  ];
  groups.forEach((label, index) => {
    const col = 1 + index * 3;
    setCell(ws, XLSXStyle.utils.encode_cell({ r: 3, c: col }), label, styles.header);
    setCell(ws, XLSXStyle.utils.encode_cell({ r: 3, c: col + 1 }), "", styles.header);
    setCell(ws, XLSXStyle.utils.encode_cell({ r: 3, c: col + 2 }), "", styles.header);
    merges.push({ s: { r: 3, c: col }, e: { r: 3, c: col + 2 } });
    ["Male", "Female", "Total"].forEach((sex, offset) =>
      setCell(ws, XLSXStyle.utils.encode_cell({ r: 4, c: col + offset }), sex, styles.header),
    );
  });
  ["Mean", "MPS"].forEach((label, index) => {
    const col = 13 + index;
    setCell(ws, XLSXStyle.utils.encode_cell({ r: 3, c: col }), label, styles.header);
    setCell(ws, XLSXStyle.utils.encode_cell({ r: 4, c: col }), label, styles.header);
    merges.push({ s: { r: 3, c: col }, e: { r: 4, c: col } });
  });
  rows.forEach((row, index) => {
    const sheetRow = 5 + index;
    const summary = makeLaemplSummary(row.values);
    setCell(
      ws,
      XLSXStyle.utils.encode_cell({ r: sheetRow, c: 0 }),
      row.label,
      row.highlight ? styles.group : styles.bodyLeft,
    );
    [summary.enrolled, summary.testTakers, summary.achieved, summary.percentage].forEach((values, groupIndex) => {
      values.forEach((value, offset) =>
        setCell(
          ws,
          XLSXStyle.utils.encode_cell({ r: sheetRow, c: 1 + groupIndex * 3 + offset }),
          value,
          styles.body,
          typeof value === "number" ? "n" : "s",
        ),
      );
    });
    setCell(ws, XLSXStyle.utils.encode_cell({ r: sheetRow, c: 13 }), summary.mean, styles.body);
    setCell(ws, XLSXStyle.utils.encode_cell({ r: sheetRow, c: 14 }), summary.mps, styles.body);
  });
  if (rows.length === 0) {
    setCell(ws, "A6", DASH, styles.body);
  }
  ws["!merges"] = merges;
  appendSheet(wb, ws, "LAEMPL", `A1:O${Math.max(12, rows.length + 6)}`);
}

function addMplResultSheet({
  wb,
  result,
}: {
  wb: XLSXStyle.WorkBook;
  result: ConsolidatedSubjectDiagnosticResult;
}) {
  const styles = makeStyles();
  const ws: Worksheet = {};
  const merges: XLSXStyle.Range[] = [];
  ws["!cols"] = baseCols(8);
  setCell(ws, "A1", "MPL Result", styles.title);
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } });
  const makeValues = (sections: ConsolidatedSubjectSectionResult[]) => {
    const rows = sections.flatMap((section) => section.proficiencyRows);
    return makeMplRows(rows).map((item) => [
      item.label,
      item.testTakers,
      item.achieved,
      formatPercentage(item.achieved, item.testTakers),
      item.failed,
      formatPercentage(item.failed, item.testTakers),
    ]);
  };
  let row = writeTable({
    ws,
    styles,
    row: 4,
    col: 0,
    title: "SSES Exceeded and Failed",
    headers: ["Group", "Test Taker", "Achieved", "Achieved %", "Failed", "Failed %"],
    values: makeValues(result.sections.filter((section) => section.isSses)),
    merges,
  });
  row = writeTable({
    ws,
    styles,
    row,
    col: 0,
    title: "Regular Exceeded and Failed",
    headers: ["Group", "Test Taker", "Achieved", "Achieved %", "Failed", "Failed %"],
    values: makeValues(result.sections.filter((section) => !section.isSses)),
    merges,
  });
  writeTable({
    ws,
    styles,
    row,
    col: 0,
    title: "Combined Exceeded and Failed",
    headers: ["Group", "Test Taker", "Achieved", "Achieved %", "Failed", "Failed %"],
    values: makeValues(result.sections),
    merges,
  });
  ws["!merges"] = merges;
  appendSheet(wb, ws, "MPL Result", "A1:H40");
}

function buildWorkbook({
  result,
  exam,
  coordinatorName,
  schoolYear,
  quarterName: _quarterName,
  userEmail,
}: {
  result: ConsolidatedSubjectDiagnosticResult;
  exam: ExamRow;
  coordinatorName: string;
  schoolYear: string;
  quarterName: string;
  userEmail: string;
}) {
  const generatedOn = new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date());
  const generatedBy = `Generated by ${userEmail} on ${generatedOn}`;

  const wb = XLSXStyle.utils.book_new();
  addTestResultsSheet({ wb, result, exam, coordinatorName, schoolYear, generatedBy });
  addItemAnalysisSheet({ wb, result });
  for (const section of result.sections) {
    addSectionSheet({ wb, section, result, exam, generatedBy });
  }
  addLevelOfProficiencySheet({ wb, result });
  addLaemplSheet({ wb, result });
  addMplResultSheet({ wb, result });

  const buffer = XLSXStyle.write(wb, { type: "buffer", bookType: "xlsx" });
  const displayFilename = safeFilename(`${result.gradeDisplayName} • ${result.subjectName} • ${result.examTitle}.xlsx`);
  const asciiFilename = displayFilename.replace(/[^\x20-\x7E]/g, "_");
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(displayFilename)}`,
    },
  });
}

export const GET = withErrorHandler(_GET);
