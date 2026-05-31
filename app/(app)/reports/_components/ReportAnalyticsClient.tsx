"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Accordion,
  ActionIcon,
  Button,
  Card,
  Group,
  Select,
  SegmentedControl,
  Skeleton,
  Stack,
  Table,
  TableScrollContainer,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconBook, IconChevronDown, IconDownload, IconReportOff, IconUsersGroup } from "@tabler/icons-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMediaQuery } from "@mantine/hooks";
import BackButton from "@/components/BackButton";
import {
  fetchReportExamCards,
  fetchReportSectionOverview,
  fetchReportSubjectOverview,
  fetchConsolidatedSubjectAnalytics,
  fetchConsolidatedSubjectDiagnosticAnalytics,
  fetchSavedExamDetailsSummary,
  fetchSavedItemAnalysisSummary,
  fetchSavedProficiencyRows,
  type ConsolidatedSubjectDiagnosticResult,
  type ConsolidatedSubjectSectionResult,
  type ExamDetailsSummary,
  type ItemAnalysisSummary,
  type ProficiencyRow,
  type ReportExamCard,
  type ReportSubjectOverview,
} from "@/lib/services/reportsAnalysisService";
import {
  isPairInScope,
  isSectionInScope,
  isSubjectInScope,
  useReportPermissions,
  type ReportPermissionScope,
} from "@/hooks/useReportPermissions";

interface ReportAnalyticsClientProps {
  initialGradeLevelId?: number | null;
  initialSectionId?: number | null;
  initialExamId?: number | null;
  initialSubjectId?: number | null;
  initialFrom?: string | null;
  mode?: "section" | "subject";
}

const COLLAPSIBLE_KEYS = ["details", "proficiency", "mpl", "itemRanking", "itemAnalysis", "proficiencyLevel", "laempl"] as const;
type CollapsibleKey = typeof COLLAPSIBLE_KEYS[number];

const TAB_COLLAPSIBLE_KEYS: Record<string, readonly CollapsibleKey[]> = {
  exam_results: ["details", "mpl", "proficiency"],
  item_analysis: ["itemRanking", "itemAnalysis"],
  proficiency_mpl: ["proficiencyLevel", "laempl"],
};

const ACCORDION_STYLES = {
  item: { border: "none", borderTop: "1px solid var(--mantine-color-gray-3)", borderBottom: "1px solid var(--mantine-color-gray-3)" },
  control: { padding: "8px 0", paddingRight: 0, background: "transparent", "&:hover": { background: "transparent" } },
  label: { padding: 0 },
  chevron: { color: "#808898" },
  content: { paddingLeft: 0, paddingRight: 0, paddingBottom: 8 },
} as const;

const TABLE_BORDER_COLOR = "#D6D9E0";
const CORRECT_HIGHLIGHT_STYLE: React.CSSProperties = {
  backgroundColor: "#eef8e9",
  color: "#2f5f2d",
  fontWeight: 700,
};
const WRONG_HIGHLIGHT_STYLE: React.CSSProperties = {
  backgroundColor: "#fef2f2",
  color: "#991b1b",
  fontWeight: 700,
};
const TABLE_CONTAINER_STYLE: React.CSSProperties = {
  border: `1px solid ${TABLE_BORDER_COLOR}`,
  borderRadius: 4,
  overflowX: "auto",
  overflowY: "hidden",
};
const FIT_TABLE_CONTAINER_STYLE: React.CSSProperties = {
  ...TABLE_CONTAINER_STYLE,
  display: "inline-block",
  maxWidth: "100%",
  verticalAlign: "top",
};
const COLUMN_TABLE_CONTAINER_STYLE: React.CSSProperties = {
  ...TABLE_CONTAINER_STYLE,
  width: "100%",
};
const GRID_TABLE_PROPS = {
  withColumnBorders: true,
  withTableBorder: false,
  borderColor: TABLE_BORDER_COLOR,
} as const;
const TABLE_TEXT_SIZE = "text-[12px] sm:text-sm";
const TABLE_HEADER_TEXT_SIZE = "text-[11px] sm:text-sm";
const WIDTH = {
  mplGroup: "clamp(76px, 8vw, 120px)",
  mplMetric: "clamp(82px, 9vw, 140px)",
  mplPercent: "clamp(90px, 9vw, 140px)",
  profNo: "clamp(44px, 5vw, 80px)",
  profScore: "clamp(82px, 8vw, 140px)",
  profMpl: "clamp(72px, 7vw, 120px)",
  profLevel: "clamp(130px, 14vw, 240px)",
  rankingRank: "clamp(54px, 6vw, 72px)",
  rankingItem: "clamp(70px, 7vw, 96px)",
  itemAnalysisItem: "clamp(74px, 8vw, 120px)",
  itemAnalysisCorrect: "clamp(82px, 12vw, 220px)",
  itemAnalysisRank: "clamp(64px, 7vw, 120px)",
} as const;

const MPL_THRESHOLD = 60;
const PROFICIENCY_LEVELS = [
  "Highly Proficient",
  "Proficient",
  "Nearly Proficient",
  "Low Proficient",
  "Not Proficient",
] as const;
const PROFICIENCY_HEADER_LABELS: Record<(typeof PROFICIENCY_LEVELS)[number], React.ReactNode> = {
  "Highly Proficient": <>Highly Proficient<br />Learners</>,
  Proficient: <>Proficient<br />Learners</>,
  "Nearly Proficient": <>Nearly Proficient<br />Learners</>,
  "Low Proficient": <>Low Proficient<br />Learners</>,
  "Not Proficient": <>Not Proficient<br />Learners</>,
};

function scrollReportShellToTop() {
  if (typeof document === "undefined") return;
  const main = document.querySelector("main");
  if (main instanceof HTMLElement) {
    main.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function canAccessReportCard(
  card: ReportExamCard,
  reportScope: ReportPermissionScope,
): boolean {
  if (reportScope.canViewAll) return true;
  if (!reportScope.assignedScope) return false;

  const hasCurriculumSubject =
    card.curriculumSubjectId != null && card.curriculumSubjectId !== 0;
  if (
    hasCurriculumSubject &&
    isPairInScope(card.sectionId, card.curriculumSubjectId, reportScope)
  ) {
    return true;
  }

  return isSectionInScope(card.sectionId, card.gradeLevelId, reportScope);
}

function canAccessSectionRoute(
  sectionId: number,
  reportScope: ReportPermissionScope,
  gradeLevelId?: number,
): boolean {
  if (reportScope.canViewAll) return true;
  if (!reportScope.assignedScope) return false;
  return isSectionInScope(sectionId, gradeLevelId ?? 0, reportScope);
}

function canAccessCurriculumSubjectRoute(
  curriculumSubjectId: number | null | undefined,
  reportScope: ReportPermissionScope,
  allowedSectionIds: number[] | null,
): boolean {
  if (reportScope.canViewAll) return true;
  const scope = reportScope.assignedScope;
  if (!scope || curriculumSubjectId == null || curriculumSubjectId === 0) {
    return false;
  }

  const sectionMatches = (sectionId: number) =>
    allowedSectionIds == null || allowedSectionIds.includes(sectionId);

  return (
    (reportScope.canViewAssigned &&
      scope.assignedPairs.some(
        (pair) =>
          pair.curriculumSubjectId === curriculumSubjectId &&
          sectionMatches(pair.sectionId),
      )) ||
    (reportScope.canMonitorGradeLevel &&
      scope.curriculumSubjectIds.includes(curriculumSubjectId) &&
      scope.glSectionIds.some(sectionMatches)) ||
    (reportScope.canMonitorSubjects &&
      scope.curriculumSubjectIds.includes(curriculumSubjectId) &&
      scope.subjectSectionIds.some(sectionMatches))
  );
}

function canAccessSubjectRoute(
  subjectId: number | null | undefined,
  curriculumSubjectId: number | null | undefined,
  reportScope: ReportPermissionScope,
  allowedSectionIds: number[] | null,
): boolean {
  if (reportScope.canViewAll) return true;
  if (!reportScope.assignedScope) return false;

  if (
    curriculumSubjectId != null &&
    curriculumSubjectId !== 0 &&
    canAccessCurriculumSubjectRoute(curriculumSubjectId, reportScope, allowedSectionIds)
  ) {
    return true;
  }

  if (subjectId == null || subjectId === 0 || !isSubjectInScope(subjectId, reportScope)) {
    return false;
  }

  if (allowedSectionIds == null || allowedSectionIds.length === 0) {
    return true;
  }

  const { sectionIds, glSectionIds, subjectSectionIds } = reportScope.assignedScope;
  return allowedSectionIds.some(
    (sectionId) =>
      (reportScope.canViewAssigned && sectionIds.includes(sectionId)) ||
      (reportScope.canMonitorGradeLevel && glSectionIds.includes(sectionId)) ||
      (reportScope.canMonitorSubjects && subjectSectionIds.includes(sectionId)),
  );
}

function DetailCard({ label, value }: { label: string; value: string }) {
  return (
    <Card
      withBorder
      radius="md"
      p={{ base: 6, sm: "xs" }}
      style={{
        borderColor: "#D6D9E0",
        backgroundColor: "#FFFFFF",
        minHeight: 58,
        width: "100%",
        minWidth: 0,
      }}
    >
      <Stack gap={2} align="center" justify="center" h="100%">
        <Text fz={{ base: 10, sm: "xs" }} fw={700} c="#111827" ta="center" lh={1.15}>
          {label}
        </Text>
        <Text fz={{ base: 15, sm: "lg" }} fw={800} c="#111827" ta="center" lh={1.15}>
          {value}
        </Text>
      </Stack>
    </Card>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xl sm:text-2xl font-bold leading-tight">
      {children}
    </h2>
  );
}

function SectionSubtitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-xs sm:text-sm text-[#808898]">
      {children}
    </p>
  );
}

function TableColumnHeader({
  children,
  style,
  ...props
}: React.ComponentProps<typeof TableTh>) {
  return (
    <ReportHeaderCell {...props} style={style}>
      {children}
    </ReportHeaderCell>
  );
}

function ReportTableShell({
  children,
  minWidth,
  containerStyle = COLUMN_TABLE_CONTAINER_STYLE,
}: {
  children: React.ReactNode;
  minWidth: number;
  containerStyle?: React.CSSProperties;
}) {
  return (
    <TableScrollContainer minWidth={minWidth} type="native" style={containerStyle}>
      <Table
        {...GRID_TABLE_PROPS}
        verticalSpacing="sm"
        striped={false}
        highlightOnHover
        style={{ width: "100%", minWidth, tableLayout: "fixed" }}
      >
        {children}
      </Table>
    </TableScrollContainer>
  );
}

function ReportHeaderCell({
  children,
  style,
  ...props
}: React.ComponentProps<typeof TableTh>) {
  return (
    <TableTh
      {...props}
      className={TABLE_HEADER_TEXT_SIZE}
      style={{
        border: `1px solid ${TABLE_BORDER_COLOR}`,
        backgroundColor: "#4EAE4A",
        color: "#ffffff",
        fontWeight: 700,
        lineHeight: 1.2,
        ...style,
      }}
    >
      {children}
    </TableTh>
  );
}

function ReportCell({
  children,
  style,
  ...props
}: React.ComponentProps<typeof TableTd>) {
  return (
    <TableTd
      {...props}
      className={TABLE_TEXT_SIZE}
      style={{
        border: `1px solid ${TABLE_BORDER_COLOR}`,
        padding: "10px 8px",
        backgroundColor: "#ffffff",
        ...style,
      }}
    >
      {children}
    </TableTd>
  );
}

function MatrixHeader({
  children,
  style,
  ...props
}: React.ComponentProps<typeof TableTh>) {
  return (
    <ReportHeaderCell {...props} style={style}>
      {children}
    </ReportHeaderCell>
  );
}

function MatrixCell({
  children,
  style,
  ...props
}: React.ComponentProps<typeof TableTd>) {
  return (
    <ReportCell {...props} style={style}>
      {children}
    </ReportCell>
  );
}

function formatSummaryValue(
  key: "mean" | "pl" | "mps" | "int",
  value: number,
): string {
  if (key === "mps") return `${value.toFixed(2)}%`;
  if (key === "mean" || key === "pl") return value.toFixed(2);
  return String(value);
}

function formatPercentage(numerator: number, denominator: number): string {
  if (denominator <= 0) return "0.00%";
  return `${((numerator / denominator) * 100).toFixed(2)}%`;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getMplCellStyle(mpl: number): React.CSSProperties | undefined {
  if (mpl >= 0 && mpl <= 29) {
    return WRONG_HIGHLIGHT_STYLE;
  }
  if (mpl >= 60 && mpl <= 100) {
    return CORRECT_HIGHLIGHT_STYLE;
  }
  return undefined;
}

function getScoreCellStyle(score: number, totalItems: number): React.CSSProperties | undefined {
  if (totalItems <= 0) return undefined;
  const scorePercent = (score / totalItems) * 100;
  if (scorePercent >= 0 && scorePercent < 60) {
    return WRONG_HIGHLIGHT_STYLE;
  }
  if (scorePercent >= 60) {
    return CORRECT_HIGHLIGHT_STYLE;
  }
  return undefined;
}

function EllipsisTooltipText({ text }: { text: string }) {
  return (
    <Tooltip label={text} multiline maw={420} withinPortal events={{ hover: true, focus: true, touch: true }}>
      <Text fz={{ base: 12, sm: "sm" }} truncate="end" tabIndex={0}>
        {text}
      </Text>
    </Tooltip>
  );
}

function getRankCellStyle(rank: number, totalItems: number): React.CSSProperties | undefined {
  if (totalItems <= 0) return undefined;
  if (rank >= 1 && rank <= Math.min(5, totalItems)) {
    return CORRECT_HIGHLIGHT_STYLE;
  }
  if (rank >= Math.max(totalItems - 4, 1) && rank <= totalItems) {
    return WRONG_HIGHLIGHT_STYLE;
  }
  return undefined;
}

function formatDiagnosticNumber(value: number | null | undefined, digits = 0): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return digits > 0 ? value.toFixed(digits) : String(Math.round(value));
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
    most: ranked.slice(0, 10),
    least: [...ranked].reverse().slice(0, 10),
  };
}

function countByProficiency(rows: ProficiencyRow[]) {
  const result = new Map<string, { male: number; female: number; total: number }>();
  for (const level of PROFICIENCY_LEVELS) result.set(level, { male: 0, female: 0, total: 0 });
  for (const row of rows) {
    const bucket = result.get(row.proficiencyLevel) ?? result.get(getProficiencyFallback(row.mpl));
    if (!bucket) continue;
    if (row.sex === "Male") bucket.male += 1;
    if (row.sex === "Female") bucket.female += 1;
    bucket.total += 1;
  }
  return result;
}

function getProficiencyFallback(mpl: number): string {
  if (mpl >= 90) return "Highly Proficient";
  if (mpl >= 75) return "Proficient";
  if (mpl >= 50) return "Nearly Proficient";
  if (mpl >= 25) return "Low Proficient";
  return "Not Proficient";
}

function DiagnosticResultsTable({
  result,
}: {
  result: ConsolidatedSubjectDiagnosticResult;
}) {
  const total = result.summary;
  return (
    <ReportTableShell minWidth={980} containerStyle={TABLE_CONTAINER_STYLE}>
        <TableThead>
          <TableTr style={{ backgroundColor: "#4EAE4A" }}>
            {["Section", "No. of Items", "Number of Cases", "Total Score", "Mean", "Median", "PL", "MPS", "Highest Score", "Lowest Score", "SD"].map((label) => (
              <PlainGreenHeader key={label} ta="center">
                {label}
              </PlainGreenHeader>
            ))}
          </TableTr>
        </TableThead>
        <TableTbody>
          {[...result.sections].sort((a, b) => (a.isSses === b.isSses ? 0 : a.isSses ? -1 : 1)).map((section) => {
            const summary = section.summary;
            return (
              <TableTr key={section.sectionId}>
                <MatrixCell ta="center" fw={700}>{section.sectionName}</MatrixCell>
                <MatrixCell ta="center">{summary ? summary.totalItems : "-"}</MatrixCell>
                <MatrixCell ta="center">{summary ? summary.numberOfCases : "-"}</MatrixCell>
                <MatrixCell ta="center">{summary ? summary.totalScore : "-"}</MatrixCell>
                <MatrixCell ta="center">{summary ? summary.mean.toFixed(2) : "-"}</MatrixCell>
                <MatrixCell ta="center">{formatDiagnosticNumber(section.median, 2)}</MatrixCell>
                <MatrixCell ta="center">{summary ? summary.pl.toFixed(2) : "-"}</MatrixCell>
                <MatrixCell ta="center">{summary ? summary.mps.toFixed(2) : "-"}</MatrixCell>
                <MatrixCell ta="center">{summary ? summary.highestScore : "-"}</MatrixCell>
                <MatrixCell ta="center">{summary ? summary.lowestScore : "-"}</MatrixCell>
                <MatrixCell ta="center">{formatDiagnosticNumber(section.sd, 2)}</MatrixCell>
              </TableTr>
            );
          })}
          <TableTr>
            <MatrixCell ta="center" fw={800}>Total</MatrixCell>
            <MatrixCell ta="center">{total ? total.totalItems : "-"}</MatrixCell>
            <MatrixCell ta="center">{total ? total.numberOfCases : "-"}</MatrixCell>
            <MatrixCell ta="center">{total ? total.totalScore : "-"}</MatrixCell>
            <MatrixCell ta="center">{total ? total.mean.toFixed(2) : "-"}</MatrixCell>
            <MatrixCell ta="center">{formatDiagnosticNumber(result.median, 2)}</MatrixCell>
            <MatrixCell ta="center">{total ? total.pl.toFixed(2) : "-"}</MatrixCell>
            <MatrixCell ta="center">{total ? total.mps.toFixed(2) : "-"}</MatrixCell>
            <MatrixCell ta="center">{total ? total.highestScore : "-"}</MatrixCell>
            <MatrixCell ta="center">{total ? total.lowestScore : "-"}</MatrixCell>
            <MatrixCell ta="center">{formatDiagnosticNumber(result.sd, 2)}</MatrixCell>
          </TableTr>
        </TableTbody>
    </ReportTableShell>
  );
}

function PlainGreenHeader({
  children,
  ...props
}: React.ComponentProps<typeof MatrixHeader>) {
  return (
    <MatrixHeader
      {...props}
      style={{
        backgroundColor: "#4EAE4A",
        color: "#ffffff",
        fontWeight: 700,
        lineHeight: 1.2,
        ...props.style,
      }}
    >
      {children}
    </MatrixHeader>
  );
}

function ConsolidatedItemAnalysisTables({
  result,
}: {
  result: ConsolidatedSubjectDiagnosticResult;
}) {
  const regularSections = result.sections.filter((section) => !section.isSses);
  const ssesSections = result.sections.filter((section) => section.isSses);
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
  const isRegularCrowded = regularSections.length > 4;
  const total = itemNos.length;

  const getRowStyle = (rank: number): React.CSSProperties | undefined => {
    if (rank >= 1 && rank <= 10) return CORRECT_HIGHLIGHT_STYLE;
    if (rank >= total - 9 && rank <= total) return WRONG_HIGHLIGHT_STYLE;
    return undefined;
  };

  if (itemNos.length === 0) return <SectionEmptyState message="-" />;

  return (
    <div className={`grid grid-cols-1 gap-4 ${isRegularCrowded ? "xl:grid-cols-2" : "2xl:grid-cols-3"}`}>
      <div className={isRegularCrowded ? "xl:col-span-2 min-w-0" : "min-w-0"}>
      <AnalysisMiniTable title="Regular" minWidth={Math.max(420, 160 + regularSections.length * 90)}>
        <TableThead>
          <TableTr style={{ backgroundColor: "#4EAE4A" }}>
            <PlainGreenHeader ta="center">Item</PlainGreenHeader>
            {regularSections.map((section) => (
              <PlainGreenHeader key={section.sectionId} ta="center">
                {section.sectionName}
              </PlainGreenHeader>
            ))}
            <PlainGreenHeader ta="center">Total</PlainGreenHeader>
            <PlainGreenHeader ta="center">Rank</PlainGreenHeader>
          </TableTr>
        </TableThead>
        <TableTbody>
          {itemNos.map((itemNo) => {
            const rowTotal = regularTotals.find((row) => row.itemNo === itemNo)?.value ?? 0;
            const rank = regularRanks.get(itemNo) ?? 0;
            return (
              <TableTr key={`regular-${itemNo}`}>
                <MatrixCell ta="center">{itemNo}</MatrixCell>
                {regularSections.map((section) => (
                  <MatrixCell key={section.sectionId} ta="center">
                    {getSectionItemValue(section, itemNo) ?? "-"}
                  </MatrixCell>
                ))}
                <MatrixCell ta="center">{rowTotal}</MatrixCell>
                <MatrixCell ta="center" style={getRowStyle(rank)}>{rank}</MatrixCell>
              </TableTr>
            );
          })}
        </TableTbody>
      </AnalysisMiniTable>
      </div>

      <AnalysisMiniTable title="SSES" minWidth={330}>
        <TableThead>
          <TableTr style={{ backgroundColor: "#4EAE4A" }}>
            <PlainGreenHeader ta="center">Item</PlainGreenHeader>
            <PlainGreenHeader ta="center">SSES</PlainGreenHeader>
            <PlainGreenHeader ta="center">Total</PlainGreenHeader>
            <PlainGreenHeader ta="center">Rank</PlainGreenHeader>
          </TableTr>
        </TableThead>
        <TableTbody>
          {itemNos.map((itemNo) => {
            const rowTotal = ssesTotals.find((row) => row.itemNo === itemNo)?.value ?? 0;
            const rank = ssesRanks.get(itemNo) ?? 0;
            return (
              <TableTr key={`sses-${itemNo}`}>
                <MatrixCell ta="center">{itemNo}</MatrixCell>
                <MatrixCell ta="center">{rowTotal}</MatrixCell>
                <MatrixCell ta="center">{rowTotal}</MatrixCell>
                <MatrixCell ta="center" style={getRowStyle(rank)}>{rank}</MatrixCell>
              </TableTr>
            );
          })}
        </TableTbody>
      </AnalysisMiniTable>

      <AnalysisMiniTable title="Combined" minWidth={430}>
        <TableThead>
          <TableTr style={{ backgroundColor: "#4EAE4A" }}>
            <PlainGreenHeader ta="center">Item</PlainGreenHeader>
            <PlainGreenHeader ta="center">SSES</PlainGreenHeader>
            <PlainGreenHeader ta="center">Regular</PlainGreenHeader>
            <PlainGreenHeader ta="center">Total</PlainGreenHeader>
            <PlainGreenHeader ta="center">Rank</PlainGreenHeader>
          </TableTr>
        </TableThead>
        <TableTbody>
          {itemNos.map((itemNo) => {
            const sses = ssesTotals.find((row) => row.itemNo === itemNo)?.value ?? 0;
            const regular = regularTotals.find((row) => row.itemNo === itemNo)?.value ?? 0;
            const rowTotal = sses + regular;
            const rank = combinedRanks.get(itemNo) ?? 0;
            return (
              <TableTr key={`combined-${itemNo}`}>
                <MatrixCell ta="center">{itemNo}</MatrixCell>
                <MatrixCell ta="center">{sses}</MatrixCell>
                <MatrixCell ta="center">{regular}</MatrixCell>
                <MatrixCell ta="center">{rowTotal}</MatrixCell>
                <MatrixCell ta="center" style={getRowStyle(rank)}>{rank}</MatrixCell>
              </TableTr>
            );
          })}
        </TableTbody>
      </AnalysisMiniTable>
    </div>
  );
}

function ConsolidatedItemRankingTables({
  result,
}: {
  result: ConsolidatedSubjectDiagnosticResult;
}) {
  const ssesRanking = getRankingSummary(result.sections.filter((section) => section.isSses));
  const regularRanking = getRankingSummary(result.sections.filter((section) => !section.isSses));
  const hasData =
    ssesRanking.most.length > 0 ||
    ssesRanking.least.length > 0 ||
    regularRanking.most.length > 0 ||
    regularRanking.least.length > 0;

  if (!hasData) return <SectionEmptyState message="-" />;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 w-full">
      <RankingPairTable title="SSES" ranking={ssesRanking} />
      <RankingPairTable title="Regular" ranking={regularRanking} />
    </div>
  );
}

function RankingPairTable({
  title,
  ranking,
}: {
  title: string;
  ranking: ReturnType<typeof getRankingSummary>;
}) {
  const count = Math.max(ranking.most.length, ranking.least.length);
  const rows = Array.from({ length: count }).map((_, index) => ({
    rank: index + 1,
    mostItem: ranking.most[index]?.itemNo ?? null,
    leastRank: ranking.least[index]?.rank ?? null,
    leastItem: ranking.least[index]?.itemNo ?? null,
  }));

  return (
    <div className="min-w-0">
      <Text size="xl" fw={700} mb={10} c="#111827">{title}</Text>
      <ReportTableShell minWidth={360}>
          <TableThead>
            <TableTr style={{ backgroundColor: "#4EAE4A" }}>
              <PlainGreenHeader w={WIDTH.rankingRank} ta="center">Rank</PlainGreenHeader>
              <PlainGreenHeader ta="center">Most Learned</PlainGreenHeader>
              <PlainGreenHeader w={WIDTH.rankingRank} ta="center">Rank</PlainGreenHeader>
              <PlainGreenHeader ta="center">Least Learned</PlainGreenHeader>
            </TableTr>
          </TableThead>
          <TableTbody>
            {rows.map((row) => (
              <TableTr key={`${title}-${row.rank}`}>
                <TableTd ta="center">{row.rank}</TableTd>
                <TableTd ta="center">{row.mostItem ?? "-"}</TableTd>
                <TableTd ta="center">{row.leastRank ?? "-"}</TableTd>
                <TableTd ta="center">{row.leastItem ?? "-"}</TableTd>
              </TableTr>
            ))}
          </TableTbody>
      </ReportTableShell>
    </div>
  );
}

function AnalysisMiniTable({
  title,
  minWidth,
  children,
}: {
  title: string;
  minWidth: number;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <Text size="xl" fw={700} mb={10} c="#111827">{title}</Text>
      <ReportTableShell minWidth={minWidth}>
          {children}
      </ReportTableShell>
    </div>
  );
}

function ConsolidatedProficiencyTable({
  result,
}: {
  result: ConsolidatedSubjectDiagnosticResult;
}) {
  const ssesRows = result.sections.filter((section) => section.isSses).flatMap((section) => section.proficiencyRows);
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

  if (rows.every((row) => row.values.length === 0)) return <SectionEmptyState message="-" />;

  return (
    <ReportTableShell minWidth={980} containerStyle={TABLE_CONTAINER_STYLE}>
        <TableThead>
          <TableTr>
            <PlainGreenHeader rowSpan={2} ta="center">
              Level of Proficiency
            </PlainGreenHeader>
            {PROFICIENCY_LEVELS.map((level) => (
              <PlainGreenHeader key={level} colSpan={3} ta="center">
                {PROFICIENCY_HEADER_LABELS[level]}
              </PlainGreenHeader>
            ))}
          </TableTr>
          <TableTr>
            {PROFICIENCY_LEVELS.flatMap((level) => [
              <PlainGreenHeader key={`${level}-m`} ta="center">Male</PlainGreenHeader>,
              <PlainGreenHeader key={`${level}-f`} ta="center">Female</PlainGreenHeader>,
              <PlainGreenHeader key={`${level}-t`} ta="center">Total</PlainGreenHeader>,
            ])}
          </TableTr>
        </TableThead>
        <TableTbody>
          {rows.map((row) => {
            const counts = countByProficiency(row.values);
            return (
              <TableTr key={row.label}>
                <MatrixCell ta="center" fw={row.highlight ? 800 : undefined}>{row.label}</MatrixCell>
                {PROFICIENCY_LEVELS.flatMap((level) => {
                  const count = counts.get(level) ?? { male: 0, female: 0, total: 0 };
                  return [
                    <MatrixCell key={`${row.label}-${level}-m`} ta="center">{count.male}</MatrixCell>,
                    <MatrixCell key={`${row.label}-${level}-f`} ta="center">{count.female}</MatrixCell>,
                    <MatrixCell key={`${row.label}-${level}-t`} ta="center" fw={700}>{count.total}</MatrixCell>,
                  ];
                })}
              </TableTr>
            );
          })}
        </TableTbody>
    </ReportTableShell>
  );
}

function ConsolidatedLaemplTable({
  result,
}: {
  result: ConsolidatedSubjectDiagnosticResult;
}) {
  const ssesRows = result.sections.filter((section) => section.isSses).flatMap((section) => section.proficiencyRows);
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

  if (rows.every((row) => row.values.length === 0)) return <SectionEmptyState message="-" />;

  const makeSummary = (values: ProficiencyRow[]) => {
    const maleRows = values.filter((row) => row.sex === "Male");
    const femaleRows = values.filter((row) => row.sex === "Female");
    const maleAchieved = maleRows.filter((row) => row.mpl >= MPL_THRESHOLD).length;
    const femaleAchieved = femaleRows.filter((row) => row.mpl >= MPL_THRESHOLD).length;
    const totalAchieved = maleAchieved + femaleAchieved;
    return {
      enrolled: { male: maleRows.length, female: femaleRows.length, total: values.length },
      testTakers: { male: maleRows.length, female: femaleRows.length, total: values.length },
      achieved: { male: maleAchieved, female: femaleAchieved, total: totalAchieved },
      percentage: {
        male: formatPercentage(maleAchieved, maleRows.length),
        female: formatPercentage(femaleAchieved, femaleRows.length),
        total: formatPercentage(totalAchieved, values.length),
      },
      mean: average(values.map((row) => row.testScore)),
      mps: average(values.map((row) => row.mpl)),
    };
  };

  return (
    <ReportTableShell minWidth={1040} containerStyle={TABLE_CONTAINER_STYLE}>
        <TableThead>
          <TableTr style={{ backgroundColor: "#4EAE4A" }}>
            <PlainGreenHeader rowSpan={2} ta="center">Section</PlainGreenHeader>
            <PlainGreenHeader colSpan={3} ta="center">Enrolled<br />Learners</PlainGreenHeader>
            <PlainGreenHeader colSpan={3} ta="center">Test<br />Takers</PlainGreenHeader>
            <PlainGreenHeader colSpan={3} ta="center">Attained or Exceeded<br />MPL (60%)</PlainGreenHeader>
            <PlainGreenHeader colSpan={3} ta="center">Percentage<br />of LAEMPL</PlainGreenHeader>
            <PlainGreenHeader rowSpan={2} ta="center">Mean</PlainGreenHeader>
            <PlainGreenHeader rowSpan={2} ta="center">MPS</PlainGreenHeader>
          </TableTr>
          <TableTr style={{ backgroundColor: "#4EAE4A" }}>
            {Array.from({ length: 4 }).flatMap((_, i) => [
              <PlainGreenHeader key={`claempl-m-${i}`} ta="center">Male</PlainGreenHeader>,
              <PlainGreenHeader key={`claempl-f-${i}`} ta="center">Female</PlainGreenHeader>,
              <PlainGreenHeader key={`claempl-t-${i}`} ta="center">Total</PlainGreenHeader>,
            ])}
          </TableTr>
        </TableThead>
        <TableTbody>
          {rows.map((row) => {
            const summary = makeSummary(row.values);
            return (
              <TableTr key={row.label}>
                <MatrixCell ta="center" fw={row.highlight ? 800 : undefined}>{row.label}</MatrixCell>
                <MatrixCell ta="center">{summary.enrolled.male}</MatrixCell>
                <MatrixCell ta="center">{summary.enrolled.female}</MatrixCell>
                <MatrixCell ta="center" fw={700}>{summary.enrolled.total}</MatrixCell>
                <MatrixCell ta="center">{summary.testTakers.male}</MatrixCell>
                <MatrixCell ta="center">{summary.testTakers.female}</MatrixCell>
                <MatrixCell ta="center" fw={700}>{summary.testTakers.total}</MatrixCell>
                <MatrixCell ta="center">{summary.achieved.male}</MatrixCell>
                <MatrixCell ta="center">{summary.achieved.female}</MatrixCell>
                <MatrixCell ta="center" fw={700}>{summary.achieved.total}</MatrixCell>
                <MatrixCell ta="center">{summary.percentage.male}</MatrixCell>
                <MatrixCell ta="center">{summary.percentage.female}</MatrixCell>
                <MatrixCell ta="center" fw={700}>{summary.percentage.total}</MatrixCell>
                <MatrixCell ta="center">{summary.mean.toFixed(2)}</MatrixCell>
                <MatrixCell ta="center">{`${summary.mps.toFixed(2)}%`}</MatrixCell>
              </TableTr>
            );
          })}
        </TableTbody>
    </ReportTableShell>
  );
}

function ConsolidatedMplResults({
  result,
}: {
  result: ConsolidatedSubjectDiagnosticResult;
}) {
  const ssesRows = result.sections.filter((section) => section.isSses).flatMap((section) => section.proficiencyRows);
  const regularRows = result.sections.filter((section) => !section.isSses).flatMap((section) => section.proficiencyRows);
  const groups = [
    { label: "All Sections Combined", rows: [...ssesRows, ...regularRows] },
    { label: "SSES Only", rows: ssesRows },
    { label: "Regular", rows: regularRows },
  ];

  if (groups.every((group) => group.rows.length === 0)) {
    return <SectionEmptyState message="No report data available." />;
  }

  return (
    <div className="space-y-5">
      {groups.map((group) => {
        const makeRow = (label: "Male" | "Female" | "Total", rows: ProficiencyRow[]) => {
          const testTakers = rows.length;
          const achieved = rows.filter((row) => row.mpl >= MPL_THRESHOLD).length;
          const failed = testTakers - achieved;
          return {
            label,
            testTakers,
            achieved,
            failed,
            achievedPercentage: formatPercentage(achieved, testTakers),
            failedPercentage: formatPercentage(failed, testTakers),
          };
        };
        const maleRows = group.rows.filter((row) => row.sex === "Male");
        const femaleRows = group.rows.filter((row) => row.sex === "Female");
        const summaryRows = [
          makeRow("Male", maleRows),
          makeRow("Female", femaleRows),
          makeRow("Total", group.rows),
        ];
        return (
          <div key={group.label} className="min-w-0">
            <Text size="xl" fw={700} mb={10} c="#111827">{group.label}</Text>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <div>
                <Text size="xl" fw={700} mb={10} c="#111827">Achieved/Exceeded 60% MPL</Text>
                <ReportTableShell minWidth={330}>
                    <TableThead>
                      <TableTr style={{ backgroundColor: "#4EAE4A" }}>
                        <TableColumnHeader w={WIDTH.mplGroup} ta="center">Group</TableColumnHeader>
                        <TableColumnHeader w={WIDTH.mplMetric} ta="center">Test Taker</TableColumnHeader>
                        <TableColumnHeader w={WIDTH.mplMetric} ta="center">Achieved</TableColumnHeader>
                        <TableColumnHeader w={WIDTH.mplPercent} ta="center">Percentage</TableColumnHeader>
                      </TableTr>
                    </TableThead>
                    <TableTbody>
                      {summaryRows.map((row) => (
                        <TableTr key={`ach-${group.label}-${row.label}`}>
                          <TableTd ta="center" fw={700}>{row.label}</TableTd>
                          <TableTd ta="center">{row.testTakers}</TableTd>
                          <TableTd ta="center">{row.achieved}</TableTd>
                          <TableTd ta="center">{row.achievedPercentage}</TableTd>
                        </TableTr>
                      ))}
                    </TableTbody>
                </ReportTableShell>
              </div>
              <div>
                <Text size="xl" fw={700} mb={10} c="#111827">Failed 30% MPL</Text>
                <ReportTableShell minWidth={330}>
                    <TableThead>
                      <TableTr style={{ backgroundColor: "#4EAE4A" }}>
                        <TableColumnHeader w={WIDTH.mplGroup} ta="center">Group</TableColumnHeader>
                        <TableColumnHeader w={WIDTH.mplMetric} ta="center">Test Taker</TableColumnHeader>
                        <TableColumnHeader w={WIDTH.mplMetric} ta="center">Failed</TableColumnHeader>
                        <TableColumnHeader w={WIDTH.mplPercent} ta="center">Percentage</TableColumnHeader>
                      </TableTr>
                    </TableThead>
                    <TableTbody>
                      {summaryRows.map((row) => (
                        <TableTr key={`fail-${group.label}-${row.label}`}>
                          <TableTd ta="center" fw={700}>{row.label}</TableTd>
                          <TableTd ta="center">{row.testTakers}</TableTd>
                          <TableTd ta="center">{row.failed}</TableTd>
                          <TableTd ta="center">{row.failedPercentage}</TableTd>
                        </TableTr>
                      ))}
                    </TableTbody>
                </ReportTableShell>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function ReportAnalyticsClient({
  initialGradeLevelId = null,
  initialSectionId = null,
  initialExamId = null,
  initialSubjectId = null,
  initialFrom = null,
  mode = "section",
}: ReportAnalyticsClientProps) {
  const router = useRouter();
  const isMobile = useMediaQuery("(max-width: 600px)");
  const searchParams = useSearchParams();
  const queryGradeParam = Number(searchParams.get("gradeLevelId"));
  const querySectionParam = Number(searchParams.get("sectionId"));
  const queryExamParam = Number(searchParams.get("examId"));
  const fromParam = searchParams.get("from") ?? initialFrom;
  const assignedSectionIdsFromQuery = useMemo(
    () =>
      (searchParams.get("sections") ?? "")
        .split(",")
        .map((value) => Number(value))
        .filter(Number.isFinite),
    [searchParams],
  );
  const pageTitle = (() => {
    if (fromParam === "advisory" || fromParam === "assigned") return "My Advisory & Subjects";
    if (fromParam === "grade") return "Grade Subject Monitoring";
    if (fromParam === "subject") return "Subject Group Monitoring";
    if (fromParam === "all") return "All Reports";
    if (fromParam === "exam") return "Report Analytics";
    return "Report Analytics";
  })();
  const gradeParam = Number.isFinite(initialGradeLevelId)
    ? Number(initialGradeLevelId)
    : queryGradeParam;
  const sectionParam = Number.isFinite(initialSectionId)
    ? Number(initialSectionId)
    : querySectionParam;
  const examParam = Number.isFinite(initialExamId)
    ? Number(initialExamId)
    : queryExamParam;

  const [cards, setCards] = useState<ReportExamCard[]>([]);
  const [loading, setLoading] = useState(true);
  const reportScope = useReportPermissions();
  const scopedCards = useMemo(
    () =>
      reportScope.scopeLoading
        ? []
        : cards.filter((card) => canAccessReportCard(card, reportScope)),
    [cards, reportScope],
  );
  const [selectedGradeId, setSelectedGradeId] = useState<number | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<number | null>(null);
  const [selectedConsolidated, setSelectedConsolidated] = useState(false);
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(
    Number.isFinite(initialSubjectId) ? Number(initialSubjectId) : null,
  );
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [subjectOverview, setSubjectOverview] = useState<ReportSubjectOverview | null>(null);
  const [subjectHydrated, setSubjectHydrated] = useState(false);
  const [subjectClearedByUser, setSubjectClearedByUser] = useState(false);
  const [sectionSubjectOptions, setSectionSubjectOptions] = useState<
    { value: string; label: string; disabled?: boolean; status?: string }[]
  >([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    "exam_results" | "item_analysis" | "proficiency_mpl"
  >("exam_results");
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summary, setSummary] = useState<ExamDetailsSummary | null>(null);
  const [consolidatedSectionCount, setConsolidatedSectionCount] = useState(0);
  const [diagnosticLoading, setDiagnosticLoading] = useState(false);
  const [diagnosticResult, setDiagnosticResult] =
    useState<ConsolidatedSubjectDiagnosticResult | null>(null);
  const [proficiencyLoading, setProficiencyLoading] = useState(false);
  const [proficiencyRows, setProficiencyRows] = useState<ProficiencyRow[]>([]);
  const [itemAnalysisLoading, setItemAnalysisLoading] = useState(false);
  const [itemAnalysis, setItemAnalysis] = useState<ItemAnalysisSummary>({
    rows: [],
    topMostLearned: [],
    topLeastLearned: [],
  });
  const [openCollapsibles, setOpenCollapsibles] = useState<string[]>([]);
  const [collapsibleInitialized, setCollapsibleInitialized] = useState(false);
  const SUBJECT_CLEARED_SENTINEL = "__CLEARED__";
  const subjectStorageKey = useMemo(
    () =>
      mode === "subject" && selectedSubjectId != null
        ? `reports:selected-subject:subject:${selectedSubjectId}`
        : selectedSectionId != null
        ? `reports:selected-subject:section:${selectedSectionId}`
        : null,
    [mode, selectedSectionId, selectedSubjectId],
  );
  const collapsibleStorageKey = useMemo(
    () =>
      mode === "subject" && selectedSubjectId != null
        ? `reports:analytics-open:subject:${selectedSubjectId}`
        : selectedSectionId != null
        ? `reports:analytics-open:section:${selectedSectionId}`
        : null,
    [mode, selectedSectionId, selectedSubjectId],
  );
  const maleProficiencyRows = useMemo(
    () => proficiencyRows.filter((row) => row.sex === "Male"),
    [proficiencyRows],
  );
  const femaleProficiencyRows = useMemo(
    () => proficiencyRows.filter((row) => row.sex === "Female"),
    [proficiencyRows],
  );
  const mplSummaryRows = useMemo(() => {
    const makeRow = (label: "Male" | "Female" | "Total", rows: ProficiencyRow[]) => {
      const testTakers = rows.length;
      const achieved = rows.filter((row) => row.mpl >= MPL_THRESHOLD).length;
      const failed = testTakers - achieved;
      return {
        label,
        testTakers,
        achieved,
        failed,
        achievedPercentage: formatPercentage(achieved, testTakers),
        failedPercentage: formatPercentage(failed, testTakers),
      };
    };

    return [
      makeRow("Male", maleProficiencyRows),
      makeRow("Female", femaleProficiencyRows),
      makeRow("Total", proficiencyRows),
    ];
  }, [femaleProficiencyRows, maleProficiencyRows, proficiencyRows]);
  const proficiencyMatrix = useMemo(
    () =>
      PROFICIENCY_LEVELS.map((level) => {
        const male = maleProficiencyRows.filter(
          (row) => row.proficiencyLevel === level,
        ).length;
        const female = femaleProficiencyRows.filter(
          (row) => row.proficiencyLevel === level,
        ).length;
        return { level, male, female, total: male + female };
      }),
    [femaleProficiencyRows, maleProficiencyRows],
  );
  const laemplSummary = useMemo(() => {
    const maleTotal = maleProficiencyRows.length;
    const femaleTotal = femaleProficiencyRows.length;
    const total = proficiencyRows.length;
    const maleAchieved = maleProficiencyRows.filter(
      (row) => row.mpl >= MPL_THRESHOLD,
    ).length;
    const femaleAchieved = femaleProficiencyRows.filter(
      (row) => row.mpl >= MPL_THRESHOLD,
    ).length;
    const achieved = maleAchieved + femaleAchieved;

    return {
      enrolled: { male: maleTotal, female: femaleTotal, total },
      testTakers: { male: maleTotal, female: femaleTotal, total },
      achieved: { male: maleAchieved, female: femaleAchieved, total: achieved },
      achievedPercentage: {
        male: formatPercentage(maleAchieved, maleTotal),
        female: formatPercentage(femaleAchieved, femaleTotal),
        total: formatPercentage(achieved, total),
      },
      mean: average(proficiencyRows.map((row) => row.testScore)),
      mps: average(proficiencyRows.map((row) => row.mpl)),
    };
  }, [femaleProficiencyRows, maleProficiencyRows, proficiencyRows]);

  const loadCards = async () => {
    setLoading(true);
    try {
      const reportCards = await fetchReportExamCards();
      setCards(reportCards);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCards();
  }, []);

  const gradeOptions = useMemo(() => {
    const dedup = new Map<number, { value: string; label: string; level: number }>();
    for (const card of scopedCards) {
      if (!dedup.has(card.gradeLevelId)) {
        dedup.set(card.gradeLevelId, {
          value: String(card.gradeLevelId),
          label: card.gradeDisplayName,
          level: card.gradeLevelNumber ?? Number.MAX_SAFE_INTEGER,
        });
      }
    }
    return Array.from(dedup.values())
      .sort((a, b) => a.level - b.level)
      .map(({ value, label }) => ({ value, label }));
  }, [scopedCards]);

  useEffect(() => {
    // In subject mode the grade is fixed by the URL path — never override with scopedCards fallback.
    // scopedCards only holds grades that have exam cards, so a grade with no exams yet would
    // incorrectly fall back to the first graded card (usually Grade 1).
    if (mode === "subject") {
      if (Number.isFinite(gradeParam) && selectedGradeId !== gradeParam) {
        setSelectedGradeId(gradeParam);
      }
      return;
    }
    if (scopedCards.length === 0) {
      setSelectedGradeId(null);
      return;
    }
    const hasCurrent =
      selectedGradeId != null && scopedCards.some((card) => card.gradeLevelId === selectedGradeId);
    if (hasCurrent) return;

    const queryMatch =
      Number.isFinite(gradeParam) &&
      scopedCards.some((card) => card.gradeLevelId === gradeParam)
        ? gradeParam
        : null;
    setSelectedGradeId(queryMatch ?? scopedCards[0].gradeLevelId);
  }, [scopedCards, gradeParam, selectedGradeId, mode]);

  useEffect(() => {
    if (mode !== "subject") return;
    const nextSubjectId = Number.isFinite(initialSubjectId) ? Number(initialSubjectId) : null;
    setSelectedSubjectId(nextSubjectId);
  }, [initialSubjectId, mode]);

  useEffect(() => {
    if (mode !== "subject" || selectedGradeId == null || selectedSubjectId == null) {
      setSubjectOverview(null);
      return;
    }

    let mounted = true;
    const load = async () => {
      const overview = await fetchReportSubjectOverview(selectedGradeId, selectedSubjectId);
      if (!mounted) return;
      setSubjectOverview(overview);
      setSelectedSubject(overview?.subjectName ?? null);
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [mode, selectedGradeId, selectedSubjectId]);

  const finalizedSectionIds = useMemo(() => {
    if (mode !== "subject" || selectedSubjectId == null || selectedGradeId == null) return new Set<number>();
    return new Set(
      cards
        .filter((c) => c.gradeLevelId === selectedGradeId && c.subjectId === selectedSubjectId && c.isFinalized)
        .map((c) => c.sectionId),
    );
  }, [cards, mode, selectedGradeId, selectedSubjectId]);

    // Monitoring contexts (grade/subject/all): always allow "All" — partial consolidated data is valid

  const sectionOptions = useMemo(() => {
    if (mode === "subject") {
      const allSections = subjectOverview?.sections ?? [];
      const toItem = (section: { sectionId: number; sectionName: string; status?: string }) => ({
        value: String(section.sectionId),
        label: section.sectionName,
        disabled: !finalizedSectionIds.has(section.sectionId),
        status: section.status,
      });
      const toAssignedItem = (section: { sectionId: number; sectionName: string; status?: string }) => ({
        value: String(section.sectionId),
        label: section.sectionName,
        disabled: section.status !== "Finalized",
        status: section.status,
      });

      const assignedSectionIds = new Set(reportScope.assignedScope?.sectionIds ?? []);
      const handledSubjectSectionIds = new Set(
        (reportScope.assignedScope?.assignedPairs ?? [])
          .filter((pair) => pair.curriculumSubjectId === subjectOverview?.curriculumSubjectId)
          .map((pair) => pair.sectionId),
      );
      const queryAssignedSectionIds = new Set(assignedSectionIdsFromQuery);
      const scopedAssignedSectionIds =
        fromParam === "assigned" && queryAssignedSectionIds.size > 0
          ? queryAssignedSectionIds
          : fromParam === "assigned"
          ? handledSubjectSectionIds
          : assignedSectionIds;
      const subjectGroupSectionIds =
        fromParam === "subject" && queryAssignedSectionIds.size > 0
          ? queryAssignedSectionIds
          : null;
      const subjectGroupSections =
        subjectGroupSectionIds == null
          ? allSections
          : allSections.filter((s) => subjectGroupSectionIds.has(s.sectionId));
      const hasAssigned =
        reportScope.canViewAssigned &&
        allSections.some((s) => scopedAssignedSectionIds.has(s.sectionId));

      const ssesFirst = <T extends { sectionName: string }>(arr: T[]) =>
        [...arr].sort((a, b) => {
          const aS = /\bSSES\b/i.test(a.sectionName.trim());
          const bS = /\bSSES\b/i.test(b.sectionName.trim());
          if (aS !== bS) return aS ? -1 : 1;
          return a.sectionName.localeCompare(b.sectionName, undefined, { sensitivity: "base" });
        });

      if (fromParam === "subject") {
        return [
          { value: "all", label: "Consolidated (All Sections)", disabled: false },
          ...ssesFirst(subjectGroupSections).map(toItem),
        ];
      }

      if (hasAssigned) {
        const assignedSections = allSections.filter((s) => scopedAssignedSectionIds.has(s.sectionId));
        const otherSections = allSections.filter((s) => !scopedAssignedSectionIds.has(s.sectionId));

        if (fromParam === "assigned") {
          return ssesFirst(assignedSections).map(toAssignedItem);
        }

        // My Advisory & Subjects context: only show sections the teacher handles for this subject.
        if (fromParam === "advisory") {
          return ssesFirst(assignedSections).map(toItem);
        }

        return [
          { group: "Summary", items: [{ value: "all", label: "Consolidated (All Sections)", disabled: false }] },
          { group: "My Sections", items: ssesFirst(assignedSections).map(toItem) },
          ...(otherSections.length > 0 ? [{ group: "Other Sections", items: ssesFirst(otherSections).map(toItem) }] : []),
        ];
      }

      return [
        { value: "all", label: "Consolidated (All Sections)", disabled: false },
        ...ssesFirst(allSections).map(toItem),
      ];
    }

    const rows = scopedCards.filter((card) =>
      selectedGradeId == null ? true : card.gradeLevelId === selectedGradeId,
    );
    const dedup = new Map<number, { value: string; label: string }>();
    for (const row of rows) {
      if (!dedup.has(row.sectionId)) {
        dedup.set(row.sectionId, { value: String(row.sectionId), label: row.sectionName });
      }
    }
    return Array.from(dedup.values()).sort((a, b) => {
      const aIsSses = /\bSSES\b/i.test(a.label.trim());
      const bIsSses = /\bSSES\b/i.test(b.label.trim());
      if (aIsSses !== bIsSses) return aIsSses ? -1 : 1;
      return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
    });
  }, [scopedCards, mode, selectedGradeId, subjectOverview, finalizedSectionIds, reportScope, fromParam, assignedSectionIdsFromQuery]);

  // Flat list of all leaf section items (value+label) from sectionOptions (handles grouped/flat structures)
  const flatSectionItems = useMemo(() => {
    const items: { value: string; label: string }[] = [];
    for (const opt of sectionOptions) {
      if ("group" in opt) {
        for (const item of opt.items) items.push({ value: item.value, label: item.label });
      } else {
        items.push({ value: opt.value, label: opt.label });
      }
    }
    return items;
  }, [sectionOptions]);

  const consolidatedSectionFilter = useMemo(
    () =>
      fromParam === "subject" && assignedSectionIdsFromQuery.length > 0
        ? assignedSectionIdsFromQuery
        : null,
    [fromParam, assignedSectionIdsFromQuery],
  );
  const consolidatedCandidateSectionIds = useMemo(() => {
    if (mode !== "subject") return null;
    const sectionIds = (subjectOverview?.sections ?? []).map((section) => section.sectionId);
    const filtered =
      consolidatedSectionFilter == null
        ? sectionIds
        : sectionIds.filter((sectionId) => consolidatedSectionFilter.includes(sectionId));
    return new Set(filtered);
  }, [consolidatedSectionFilter, mode, subjectOverview]);

  useEffect(() => {
    if (mode === "subject") {
      if (initialSectionId != null && Number.isFinite(initialSectionId)) {
        const hasRouteSection = flatSectionItems.some(
          (option) => option.value === String(initialSectionId),
        );
        setSelectedConsolidated(false);
        setSelectedSectionId(hasRouteSection ? Number(initialSectionId) : null);
        return;
      }
      if (selectedSectionId != null) {
        const hasCurrent = flatSectionItems.some(
          (option) => option.value === String(selectedSectionId),
        );
        if (hasCurrent) {
          setSelectedConsolidated(false);
          return;
        }
      }
      if (selectedConsolidated && flatSectionItems.some((option) => option.value === "all")) {
        return;
      }
      setSelectedConsolidated(false);
      setSelectedSectionId(null);
      return;
    }

    if (flatSectionItems.length === 0) {
      setSelectedSectionId(null);
      return;
    }

    const hasCurrent =
      selectedSectionId != null &&
      flatSectionItems.some((option) => Number(option.value) === selectedSectionId);
    if (hasCurrent) return;

    // Dynamic route section has highest priority in this page.
    const routeMatch =
      Number.isFinite(initialSectionId) &&
      flatSectionItems.some((option) => Number(option.value) === Number(initialSectionId))
        ? Number(initialSectionId)
        : null;
    if (routeMatch != null) {
      setSelectedSectionId(routeMatch);
      return;
    }

    // URL param fallback.
    const queryMatch =
      Number.isFinite(sectionParam) &&
      flatSectionItems.some((option) => Number(option.value) === sectionParam)
        ? sectionParam
        : null;
    if (queryMatch != null) {
      setSelectedSectionId(queryMatch);
      return;
    }

    // Last fallback: first available section under current grade scope.
    setSelectedSectionId(Number(flatSectionItems[0]?.value ?? null));
  }, [initialSectionId, mode, flatSectionItems, selectedSectionId, selectedConsolidated, sectionParam, fromParam]);

  useEffect(() => {
    let mounted = true;
    const loadSubjects = async () => {
      if (mode === "subject") {
        const options = subjectOverview
          ? [{ value: subjectOverview.subjectName, label: subjectOverview.subjectName }]
          : [];
        setSectionSubjectOptions(options);
        setSubjectHydrated(true);
        return;
      }

      if (selectedSectionId == null) {
        setSectionSubjectOptions([]);
        return;
      }

      const overview = await fetchReportSectionOverview(selectedSectionId);
      if (!mounted) return;

      const options = (overview?.subjects ?? [])
        .filter((subject) => subject.subjectName.trim().length > 0)
        .sort((a, b) => a.subjectName.localeCompare(b.subjectName, undefined, { sensitivity: "base" }))
        .map((subject) => ({
          value: subject.subjectName,
          label: subject.subjectName,
          disabled: subject.status !== "Finalized",
          status: subject.status,
        }));

      setSectionSubjectOptions(options);
    };

    void loadSubjects();
    return () => {
      mounted = false;
    };
  }, [mode, selectedSectionId, subjectOverview]);

  const availableExamCards = useMemo(() => {
    if (mode === "subject") {
      const inBaseScope = (card: ReportExamCard) => {
        if (selectedGradeId != null && card.gradeLevelId !== selectedGradeId) return false;
        if (selectedSectionId != null && card.sectionId !== selectedSectionId) return false;
        if (
          selectedSectionId == null &&
          consolidatedCandidateSectionIds != null &&
          !consolidatedCandidateSectionIds.has(card.sectionId)
        ) {
          return false;
        }
        return true;
      };
      const inSubjectScope = (card: ReportExamCard) =>
        inBaseScope(card) && (selectedSubjectId == null || card.subjectId === selectedSubjectId);
      const subjectCards = cards.filter(inSubjectScope);

      if (selectedSectionId != null || subjectCards.length > 0) return subjectCards;

      return cards.filter((card) => {
        if (!inBaseScope(card)) return false;
        return consolidatedCandidateSectionIds?.has(card.sectionId) ?? false;
      });
    }

    if (fromParam === "exam" && Number.isFinite(examParam) && Number.isFinite(sectionParam)) {
      return cards.filter(
        (card) => card.examId === examParam && card.sectionId === sectionParam,
      );
    }

    if (!selectedSubject) {
      if (!Number.isFinite(examParam)) return [];
      return cards.filter((card) => {
        if (selectedGradeId != null && card.gradeLevelId !== selectedGradeId) return false;
        if (selectedSectionId != null && card.sectionId !== selectedSectionId) return false;
        return card.examId === examParam;
      });
    }

    return cards.filter((card) => {
      if (selectedGradeId != null && card.gradeLevelId !== selectedGradeId) return false;
      if (selectedSectionId != null && card.sectionId !== selectedSectionId) return false;
      if (card.subjectName !== selectedSubject) return false;
      return true;
    });
  }, [cards, consolidatedCandidateSectionIds, examParam, mode, selectedGradeId, selectedSectionId, selectedSubject, selectedSubjectId]);

  useEffect(() => {
    if (mode === "subject") return;
    setSubjectHydrated(false);
    setSubjectClearedByUser(false);
    setSelectedSubject(null);
  }, [mode, selectedSectionId]);

  useEffect(() => {
    if (
      selectedSubject &&
      !sectionSubjectOptions.some((option) => option.value === selectedSubject)
    ) {
      setSelectedSubject(null);
    }
  }, [selectedSubject, sectionSubjectOptions]);

  useEffect(() => {
    if (mode === "subject") {
      setSelectedSubject(subjectOverview?.subjectName ?? null);
      setSubjectHydrated(true);
      return;
    }

    if (fromParam === "exam" && Number.isFinite(examParam) && Number.isFinite(sectionParam)) {
      const card = cards.find(
        (c) => c.examId === examParam && c.sectionId === sectionParam,
      );
      if (card?.subjectName) {
        setSelectedSubject(card.subjectName);
        setSubjectHydrated(true);
        return;
      }
    }

    if (sectionSubjectOptions.length === 0) {
      setSelectedSubject(null);
      setSubjectHydrated(true);
      return;
    }

    if (subjectClearedByUser) {
      setSelectedSubject(null);
      setSubjectHydrated(true);
      return;
    }

    if (
      selectedSubject &&
      sectionSubjectOptions.some((option) => option.value === selectedSubject)
    ) {
      setSubjectHydrated(true);
      return;
    }

    if (subjectStorageKey && typeof window !== "undefined") {
      const stored = window.sessionStorage.getItem(subjectStorageKey);
      if (stored === SUBJECT_CLEARED_SENTINEL) {
        setSelectedSubject(null);
        setSubjectClearedByUser(true);
        setSubjectHydrated(true);
        return;
      }
      if (stored && sectionSubjectOptions.some((option) => option.value === stored)) {
        setSelectedSubject(stored);
        setSubjectClearedByUser(false);
        setSubjectHydrated(true);
        return;
      }
    }

    const examSubjectFromQuery =
      Number.isFinite(examParam) && selectedSectionId != null
        ? cards.find(
            (card) =>
              card.examId === examParam &&
              card.sectionId === selectedSectionId &&
              (selectedGradeId == null || card.gradeLevelId === selectedGradeId),
          )?.subjectName ?? null
        : null;

    if (
      examSubjectFromQuery &&
      sectionSubjectOptions.some((option) => option.value === examSubjectFromQuery)
    ) {
      setSelectedSubject(examSubjectFromQuery);
      setSubjectHydrated(true);
      return;
    }

    // Intentional default: keep empty if no valid query-backed or remembered subject exists.
    setSelectedSubject(null);
    setSubjectHydrated(true);
  }, [
    cards,
    examParam,
    sectionParam,
    fromParam,
    sectionSubjectOptions,
    selectedGradeId,
    selectedSectionId,
    selectedSubject,
    subjectClearedByUser,
    subjectStorageKey,
    mode,
    subjectOverview,
  ]);

  useEffect(() => {
    if (!subjectHydrated || !subjectStorageKey || typeof window === "undefined") return;
    if (!selectedSubject) {
      if (subjectClearedByUser) {
        window.sessionStorage.setItem(subjectStorageKey, SUBJECT_CLEARED_SENTINEL);
      }
      return;
    }
    window.sessionStorage.setItem(subjectStorageKey, selectedSubject);
  }, [selectedSubject, subjectStorageKey, subjectHydrated, subjectClearedByUser, SUBJECT_CLEARED_SENTINEL]);
  // Reset accordion state when section changes.
  useEffect(() => {
    setCollapsibleInitialized(false);
    setOpenCollapsibles([...COLLAPSIBLE_KEYS]);
    setCollapsibleInitialized(true);
  }, [collapsibleStorageKey]);

  // Persist accordion state per section in-session.
  useEffect(() => {
    if (!collapsibleInitialized || !collapsibleStorageKey || typeof window === "undefined") return;
    window.sessionStorage.setItem(collapsibleStorageKey, JSON.stringify(openCollapsibles));
  }, [collapsibleInitialized, collapsibleStorageKey, openCollapsibles]);

  // On tab switch, force open target tab's accordions (keep others unchanged).
  useEffect(() => {
    const tabKeys = TAB_COLLAPSIBLE_KEYS[activeTab] ?? [];
    if (tabKeys.length === 0) return;
    setOpenCollapsibles((prev) => {
      const merged = new Set(prev);
      tabKeys.forEach((k) => merged.add(k));
      return Array.from(merged);
    });
  }, [activeTab]);

  const examOptions = useMemo(() => {
    if (mode === "subject" && selectedSectionId == null) {
      const dedup = new Map<number, { value: string; label: string; sort: number }>();
      for (const card of availableExamCards) {
        if (!card.isFinalized) continue;
        if (!dedup.has(card.examId)) {
          const timestamp = card.examDate ? new Date(card.examDate).getTime() : 0;
          dedup.set(card.examId, {
            value: `${card.examId}-all`,
            label: card.title,
            sort: (Number.isFinite(timestamp) ? timestamp : 0) * 10_000 + card.examId,
          });
        }
      }
      return Array.from(dedup.values())
        .sort((a, b) => b.sort - a.sort)
        .map(({ value, label }) => ({ value, label }));
    }

    return availableExamCards.map((card) => ({
      value: `${card.examId}-${card.sectionId}`,
      label: card.title,
    }));
  }, [availableExamCards, mode, selectedSectionId]);

  useEffect(() => {
    if (examOptions.length === 0) {
      if (fromParam !== "exam") setSelectedKey(null);
      return;
    }
    const hasCurrent =
      selectedKey != null && examOptions.some((option) => option.value === selectedKey);
    if (hasCurrent) return;

    const queryMatch =
      Number.isFinite(examParam)
        ? mode === "subject" && selectedSectionId == null
          ? examOptions.some((option) => option.value === `${examParam}-all`)
            ? `${examParam}-all`
            : null
          : Number.isFinite(sectionParam) &&
            examOptions.some((option) => option.value === `${examParam}-${sectionParam}`)
          ? `${examParam}-${sectionParam}`
          : null
        : null;

    // When coming from a specific exam, never fall back to a different exam.
    if (fromParam === "exam" && queryMatch == null) return;
    setSelectedKey(queryMatch ?? examOptions[0].value);
  }, [examOptions, fromParam, selectedKey, examParam, mode, selectedSectionId, sectionParam]);

  const selectedCard = useMemo(() => {
    if (!selectedKey) return null;
    if (mode === "subject" && selectedSectionId == null) {
      const [examIdPart] = selectedKey.split("-");
      const selectedExamId = Number(examIdPart);
      return (
        availableExamCards.find((card) => card.examId === selectedExamId && card.isFinalized) ??
        availableExamCards.find((card) => card.examId === selectedExamId) ??
        null
      );
    }
    return (
      availableExamCards.find(
        (card) => `${card.examId}-${card.sectionId}` === selectedKey,
      ) ?? null
    );
  }, [availableExamCards, mode, selectedKey, selectedSectionId]);

  const isConsolidatedSubjectView = mode === "subject" && selectedSectionId == null;
  const routeAccessCheckPending =
    loading ||
    reportScope.scopeLoading ||
    (mode === "subject" && selectedSubjectId != null && !subjectHydrated);
  const routeAccessDenied = useMemo(() => {
    if (routeAccessCheckPending) return false;

    // ── Permission-level gates — apply across all modes ──────────────────
    if (fromParam === "all" && !reportScope.canViewAll) return true;
    if (fromParam === "grade" && !reportScope.canMonitorGradeLevel) return true;
    if (fromParam === "subject" && !reportScope.canMonitorSubjects) return true;

    // ── Subject mode ─────────────────────────────────────────────────────
    if (mode === "subject") {
      // GSL: block even canViewAll users who are not the actual GSL for this curriculum subject
      if (fromParam === "grade") {
        const curriculumSubjectId = subjectOverview?.curriculumSubjectId;
        if (curriculumSubjectId == null) return false; // still loading
        return !reportScope.assignedScope?.glCurriculumSubjectIds.includes(curriculumSubjectId);
      }

      // Subject coordinator: must coordinate the subject group that contains this curriculum subject
      if (fromParam === "subject") {
        const curriculumSubjectId = subjectOverview?.curriculumSubjectId;
        if (curriculumSubjectId == null) return false; // still loading
        return !reportScope.assignedScope?.coordinatorCurriculumSubjectIds.includes(curriculumSubjectId);
      }

      // Assigned subject: must directly teach that curriculum subject (no canViewAll bypass)
      if (fromParam === "assigned") {
        if (!reportScope.canViewAssigned || !reportScope.assignedScope) return true;
        const curriculumSubjectId = subjectOverview?.curriculumSubjectId;
        if (curriculumSubjectId == null) return false; // still loading
        return !reportScope.assignedScope.assignedPairs.some(
          (p) => p.curriculumSubjectId === curriculumSubjectId,
        );
      }

      if (Number.isFinite(examParam)) {
        return selectedCard ? !canAccessReportCard(selectedCard, reportScope) : false;
      }

      if (selectedSubjectId != null || subjectOverview?.curriculumSubjectId != null) {
        return !canAccessSubjectRoute(
          selectedSubjectId,
          subjectOverview?.curriculumSubjectId,
          reportScope,
          consolidatedSectionFilter,
        );
      }

      return false;
    }

    // ── Section mode ─────────────────────────────────────────────────────
    // Advisory: must be the actual adviser — no canViewAll bypass
    if (fromParam === "advisory") {
      if (!reportScope.assignedScope) return true;
      const sectionId = Number.isFinite(sectionParam) ? sectionParam : selectedSectionId;
      if (sectionId == null) return false;
      return !reportScope.assignedScope.advisorySectionIds.includes(sectionId);
    }

    // Assigned section: must directly teach in that section — no canViewAll bypass
    if (fromParam === "assigned") {
      if (!reportScope.canViewAssigned || !reportScope.assignedScope) return true;
      const sectionId = Number.isFinite(sectionParam) ? sectionParam : selectedSectionId;
      if (sectionId == null) return false;
      return !reportScope.assignedScope.sectionIds.includes(sectionId);
    }

    if (Number.isFinite(examParam)) {
      const routeCard = cards.find(
        (card) =>
          card.examId === examParam &&
          (Number.isFinite(sectionParam) ? card.sectionId === sectionParam : true) &&
          (Number.isFinite(gradeParam) ? card.gradeLevelId === gradeParam : true),
      );
      return routeCard ? !canAccessReportCard(routeCard, reportScope) : false;
    }

    if (Number.isFinite(sectionParam)) {
      return !canAccessSectionRoute(
        sectionParam,
        reportScope,
        Number.isFinite(gradeParam) ? gradeParam : undefined,
      );
    }

    if (selectedSectionId != null) {
      return !canAccessSectionRoute(
        selectedSectionId,
        reportScope,
        selectedGradeId ?? undefined,
      );
    }

    return false;
  }, [
    cards,
    consolidatedSectionFilter,
    examParam,
    fromParam,
    gradeParam,
    mode,
    reportScope,
    routeAccessCheckPending,
    sectionParam,
    selectedCard,
    selectedGradeId,
    selectedSectionId,
    selectedSubjectId,
    subjectOverview?.curriculumSubjectId,
  ]);

  useEffect(() => {
    if (!routeAccessDenied) return;
    router.replace("/unauthorized");
  }, [routeAccessDenied, router]);

  useEffect(() => {
    let mounted = true;
    const loadDiagnostic = async () => {
      if (!isConsolidatedSubjectView || !selectedCard || selectedSubjectId == null) {
        setDiagnosticResult(null);
        return;
      }

      setDiagnosticLoading(true);
      try {
        const result = await fetchConsolidatedSubjectDiagnosticAnalytics(
          selectedCard.gradeLevelId,
          selectedSubjectId,
          selectedCard.examId,
          selectedCard.title,
          consolidatedSectionFilter,
        );
        if (!mounted) return;
        setDiagnosticResult(result);
      } finally {
        if (mounted) setDiagnosticLoading(false);
      }
    };
    void loadDiagnostic();
    return () => {
      mounted = false;
    };
  }, [consolidatedSectionFilter, isConsolidatedSubjectView, selectedCard, selectedSubjectId]);

  useEffect(() => {
    let mounted = true;
    const loadSummary = async () => {
      if (!selectedCard) {
        setSummary(null);
        setConsolidatedSectionCount(0);
        return;
      }

      setSummaryLoading(true);
      try {
        if (isConsolidatedSubjectView) {
          const consolidated = await fetchConsolidatedSubjectAnalytics(
            selectedCard.gradeLevelId,
            selectedSubjectId ?? 0,
            null,
            consolidatedSectionFilter,
          );
          if (!mounted) return;
          setSummary(consolidated.summary);
          setConsolidatedSectionCount(consolidated.sectionCount);
        } else {
          const savedSummary = await fetchSavedExamDetailsSummary(
            selectedCard.examId,
            selectedCard.sectionId,
          );
          if (!mounted) return;
          setSummary(savedSummary);
          setConsolidatedSectionCount(0);
        }
      } finally {
        if (mounted) setSummaryLoading(false);
      }
    };
    void loadSummary();
    return () => {
      mounted = false;
    };
  }, [consolidatedSectionFilter, isConsolidatedSubjectView, selectedCard, selectedSubjectId]);

  useEffect(() => {
    let mounted = true;
    const loadProficiencyRows = async () => {
      if (!selectedCard) {
        setProficiencyRows([]);
        return;
      }
      if ((!selectedSubject || !selectedCard.isFinalized) && !isConsolidatedSubjectView) {
        setProficiencyRows([]);
        return;
      }

      setProficiencyLoading(true);
      try {
        const rows = isConsolidatedSubjectView
          ? (
              await fetchConsolidatedSubjectAnalytics(
                selectedCard.gradeLevelId,
                selectedSubjectId ?? 0,
                null,
                consolidatedSectionFilter,
              )
            ).proficiencyRows
          : await fetchSavedProficiencyRows(selectedCard.examId, selectedCard.sectionId);
        if (!mounted) return;
        setProficiencyRows(rows);
      } finally {
        if (mounted) setProficiencyLoading(false);
      }
    };

    void loadProficiencyRows();
    return () => {
      mounted = false;
    };
  }, [consolidatedSectionFilter, isConsolidatedSubjectView, selectedCard, selectedSubject, selectedSubjectId]);

  useEffect(() => {
    let mounted = true;
    const loadItemAnalysis = async () => {
      if (!selectedCard) {
        setItemAnalysis({ rows: [], topMostLearned: [], topLeastLearned: [] });
        return;
      }
      if ((!selectedSubject || !selectedCard.isFinalized) && !isConsolidatedSubjectView) {
        setItemAnalysis({ rows: [], topMostLearned: [], topLeastLearned: [] });
        return;
      }
      setItemAnalysisLoading(true);
      try {
        const summary = isConsolidatedSubjectView
          ? (
              await fetchConsolidatedSubjectAnalytics(
                selectedCard.gradeLevelId,
                selectedSubjectId ?? 0,
                null,
                consolidatedSectionFilter,
              )
            ).itemAnalysis
          : await fetchSavedItemAnalysisSummary(selectedCard.examId, selectedCard.sectionId);
        if (!mounted) return;
        setItemAnalysis(summary);
      } finally {
        if (mounted) setItemAnalysisLoading(false);
      }
    };
    void loadItemAnalysis();
    return () => {
      mounted = false;
    };
  }, [consolidatedSectionFilter, isConsolidatedSubjectView, selectedCard, selectedSubject, selectedSubjectId]);


  if (routeAccessCheckPending || routeAccessDenied) return null;

  const selectedGradeLabel = (() => {
    if (selectedGradeId == null) return "Grade";
    const hit = gradeOptions.find((option) => Number(option.value) === selectedGradeId);
    return hit?.label ?? "Grade";
  })();
  const selectedSectionLabel = (() => {
    if (mode === "subject" && selectedSectionId == null) {
      return selectedConsolidated ? "Consolidated" : "";
    }
    if (selectedSectionId == null) return "Section";
    const hit = flatSectionItems.find(
      (option) => Number(option.value) === selectedSectionId,
    );
    return hit?.label ?? "Section";
  })();
  const needsSelection =
    mode === "subject"
      ? selectedSectionId == null && !selectedConsolidated
      : !selectedSubject;
  const analyticsShellLoading = loading || reportScope.scopeLoading;
  const selectionPrompt =
    mode === "subject"
      ? "Select Section"
      : "Select Subject";
  const individualDownloadHref =
    !isConsolidatedSubjectView && selectedCard?.isFinalized && selectedSubject
      ? `/api/reports/exam-result-download?examId=${selectedCard.examId}&sectionId=${selectedCard.sectionId}`
      : null;
  const consolidatedDownloadHref =
    isConsolidatedSubjectView &&
    selectedConsolidated &&
    selectedCard &&
    selectedGradeId != null &&
    selectedSubjectId != null &&
    (diagnosticResult?.finalizedSectionCount ?? 0) > 0
      ? `/api/reports/consolidated-exam-download?gradeLevelId=${selectedGradeId}&subjectId=${selectedSubjectId}&examId=${selectedCard.examId}${
          consolidatedSectionFilter && consolidatedSectionFilter.length > 0
            ? `&sections=${consolidatedSectionFilter.join(",")}`
            : ""
        }`
      : null;

  return (
    <div className="space-y-5 min-w-0">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold mb-4 text-[#597D37]">{pageTitle}</h1>
        <BackButton
          onClick={() => fromParam === "exam" && Number.isFinite(examParam)
            ? router.push(`/exam/${examParam}/scan`)
            : router.back()
          }
          size="sm"
          mb="md"
        >
          {fromParam === "exam" ? "Back to Exam" : "Back to Reports"}
        </BackButton>
        <Text size="lg" fw={700} c="black">
          {mode === "subject" && subjectOverview
            ? selectedSectionId == null && !selectedConsolidated
              ? `${selectedGradeLabel} • ${subjectOverview.subjectName}`
              : `${selectedGradeLabel} • ${subjectOverview.subjectName} • ${selectedSectionLabel}`
            : selectedSubject
              ? `${selectedGradeLabel} • ${selectedSectionLabel} • ${selectedSubject}`
              : `${selectedGradeLabel} • ${selectedSectionLabel}`}
        </Text>
      </div>

      <Group mb="md" align="flex-end" gap="sm">
        {fromParam !== "exam" && <Select
          placeholder={mode === "subject" ? "Select Section" : "Select Subject"}
          data={mode === "subject" ? sectionOptions : sectionSubjectOptions}
          value={
            mode === "subject"
              ? selectedSectionId == null
                ? selectedConsolidated
                  ? "all"
                  : null
                : String(selectedSectionId)
              : selectedSubject
          }
          onChange={(value) => {
            if (mode === "subject") {
              if (!value) {
                setSelectedConsolidated(false);
                setSelectedSectionId(null);
                setSelectedKey(null);
                return;
              }
              if (value === "all") {
                setSelectedConsolidated(true);
                setSelectedSectionId(null);
                setSelectedKey(null);
                return;
              }
              setSelectedConsolidated(false);
              setSelectedSectionId(value && value !== "all" ? Number(value) : null);
              setSelectedKey(null);
              return;
            }
            if (!value) {
              setSelectedSubject(null);
              setSubjectClearedByUser(true);
              setSubjectHydrated(true);
              return;
            }
            setSelectedSubject(value);
            setSubjectClearedByUser(false);
            setSubjectHydrated(true);
          }}
          renderOption={({ option }) => {
            const isDisabled = "disabled" in option && option.disabled;
            const status = "status" in option ? (option as { status?: string }).status : undefined;
            const tooltipLabel = (() => {
              if (!isDisabled) return "";
              if (option.value === "all")
                return "All sections must have a finalized exam before viewing consolidated results.";
              if (status === "No exam yet")
                return "Not Started: no report has been created for this section yet.";
              if (status === "Not Finalized")
                return "Ongoing: this section's report has not been finalized yet.";
              // subject-mode section items
              return "This section's exam has not been finalized yet.";
            })();
            const statusColor = (() => {
              if (status === "No exam yet") return "#9ca3af";
              if (status === "Not Finalized") return "#f59e0b";
              return "#4EAE4A";
            })();
            return (
              <Tooltip
                label={tooltipLabel}
                disabled={!isDisabled}
                position="right"
                withArrow
                multiline
                maw={220}
                withinPortal
              >
                <div
                  style={{
                    alignItems: "center",
                    display: "flex",
                    gap: 8,
                    opacity: isDisabled ? 0.55 : 1,
                    width: "100%",
                  }}
                >
                  <span>{option.label}</span>
                  {status && (
                    <span
                      aria-hidden="true"
                      style={{
                        backgroundColor: statusColor,
                        borderRadius: "50%",
                        flexShrink: 0,
                        height: 8,
                        width: 8,
                      }}
                    />
                  )}
                </div>
              </Tooltip>
            );
          }}
          leftSection={mode === "subject" ? <IconUsersGroup size={16} /> : <IconBook size={16} />}
          style={{ flex: isMobile ? 1 : undefined }}
          w={{ base: "100%", sm: 260 }}
          disabled={
            analyticsShellLoading ||
            (mode === "subject" ? sectionOptions.length === 0 : sectionSubjectOptions.length === 0)
          }
          clearable
          nothingFoundMessage="-"
        />}
        {(individualDownloadHref || consolidatedDownloadHref) && (
          isMobile ? (
            <Tooltip label="Download Excel" withArrow position="bottom">
              <ActionIcon
                component="a"
                href={(individualDownloadHref ?? consolidatedDownloadHref)!}
                color="#4EAE4A"
                variant="filled"
                radius="sm"
                size="lg"
              >
                <IconDownload size={18} />
              </ActionIcon>
            </Tooltip>
          ) : (
            <>
              {individualDownloadHref && (
                <Button
                  component="a"
                  href={individualDownloadHref}
                  leftSection={<IconDownload size={16} />}
                  color="#4EAE4A"
                  variant="filled"
                  radius="sm"
                  size="sm"
                >
                  Download Excel
                </Button>
              )}
              {consolidatedDownloadHref && (
                <Button
                  component="a"
                  href={consolidatedDownloadHref}
                  leftSection={<IconDownload size={16} />}
                  color="#4EAE4A"
                  variant="filled"
                  radius="sm"
                  size="sm"
                >
                  Download Excel
                </Button>
              )}
            </>
          )
        )}
      </Group>

      {analyticsShellLoading ? (
        <Stack gap="sm">
          <Skeleton height={42} radius="md" />
          <Skeleton height={180} radius="md" />
          <Skeleton height={120} radius="md" />
        </Stack>
      ) : needsSelection ? (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, backgroundColor: "#ffffff", width: "100%" }}>
          <SectionEmptyState message={selectionPrompt} />
        </div>
      ) : (
      <div className="space-y-3 min-w-0">
        <div className="sticky top-0 z-20 w-full bg-white/95 pb-1 backdrop-blur">
          <SegmentedControl
            fullWidth
            value={activeTab}
            onChange={(value) => {
              setActiveTab(value as typeof activeTab);
              scrollReportShellToTop();
            }}
            color="#4EAE4A"
            radius="lg"
            size="sm"
            transitionDuration={180}
            data={[
              { value: "exam_results", label: "Exam Results" },
              { value: "item_analysis", label: "Item Analysis" },
              { value: "proficiency_mpl", label: "Proficiency" },
            ]}
            styles={{
              root: {
                backgroundColor: "#ffffff",
                border: "1px solid #D6D9E0",
                padding: 6,
                width: "100%",
                minWidth: 0,
              },
              label: {
                fontWeight: 700,
                fontSize: "clamp(10px, 2.9vw, 15px)",
                padding: "6px 4px",
                whiteSpace: "nowrap",
              },
              indicator: {
                border: "1px solid #4EAE4A",
              },
            }}
          />
        </div>

        <Accordion
          multiple
          value={openCollapsibles}
          onChange={setOpenCollapsibles}
          chevronPosition="right"
          chevron={<IconChevronDown size={22} />}
          styles={ACCORDION_STYLES}
          className="rounded-b-2xl rounded-tr-xl p-2 sm:p-4 bg-white -mt-[1px] [&_td]:text-[12px] [&_td]:sm:text-sm"
        >
        {activeTab === "exam_results" && (
          <>
            <Accordion.Item value="details">
              <Accordion.Control>
                <SectionTitle>{isConsolidatedSubjectView ? "Diagnostic Test" : "Details"}</SectionTitle>
              </Accordion.Control>
              <Accordion.Panel>
                {isConsolidatedSubjectView ? (
                  <Stack gap="xs">
                    <SectionSubtitle>
                      Diagnostic Test summarizes the finalized section results for the selected examination.
                    </SectionSubtitle>
                    {diagnosticLoading ? (
                      <Stack gap="xs">
                        <Skeleton height={42} radius="sm" />
                        <Skeleton height={220} radius="sm" />
                      </Stack>
                    ) : !diagnosticResult ? (
                      <SectionEmptyState message="-" />
                    ) : diagnosticResult.finalizedSectionCount === 0 ? (
                      <SectionEmptyState message="-" />
                    ) : (
                      <DiagnosticResultsTable result={diagnosticResult} />
                    )}
                  </Stack>
                ) : (
                <>
                  <SectionSubtitle>An examination summary shows the key result metrics for the selected grade, section, and examination.</SectionSubtitle>
                  {summaryLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {Array.from({ length: 8 }).map((_, idx) => (
                    <Skeleton key={idx} height={82} radius="sm" />
                  ))}
                </div>
              ) : !selectedCard ? (
                <SectionEmptyState message="-" />
              ) : !selectedSubject ? (
                <SectionEmptyState message="Select a subject to view proficiency results." />
              ) : !selectedCard.isFinalized ? (
                <SectionEmptyState message="This examination is not finalized yet. Proficiency results will appear after Proceed to Reports." />
              ) : !summary ? (
                <SectionEmptyState message="-" />
              ) : (
                <Stack gap="xs">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <DetailCard
                      label="No. of Items"
                      value={formatSummaryValue("int", summary.totalItems)}
                    />
                    <DetailCard
                      label="Number of Cases"
                      value={formatSummaryValue("int", summary.numberOfCases)}
                    />
                    <DetailCard
                      label="Total Score"
                      value={formatSummaryValue("int", summary.totalScore)}
                    />
                    <DetailCard label="Mean" value={formatSummaryValue("mean", summary.mean)} />
                    <DetailCard label="Performance Level (PL)" value={formatSummaryValue("pl", summary.pl)} />
                    <DetailCard
                      label="Highest Score"
                      value={formatSummaryValue("int", summary.highestScore)}
                    />
                    <DetailCard
                      label="Lowest Score"
                      value={formatSummaryValue("int", summary.lowestScore)}
                    />
                    <DetailCard
                      label="Standard Deviation (SD)"
                      value={Math.sqrt(summary.mean).toFixed(2)}
                    />
                  </div>
                  {summary.numberOfCases === 0 && (
                    <Text size="sm" c="dimmed">
                      No scored cases yet for this examination.
                    </Text>
                  )}
                </Stack>
                  )}
                </>
                )}
              </Accordion.Panel>
            </Accordion.Item>

            <Accordion.Item value="mpl">
              <Accordion.Control>
                <SectionTitle>MPL Results</SectionTitle>
              </Accordion.Control>
              <Accordion.Panel>
                <SectionSubtitle>An MPL summary shows the minimum proficiency level results for the selected grade, section, and subject.</SectionSubtitle>
                {isConsolidatedSubjectView ? (
                  diagnosticLoading ? (
                    <Stack gap="xs">
                      <Skeleton height={38} radius="sm" />
                      <Skeleton height={180} radius="sm" />
                    </Stack>
                  ) : !diagnosticResult ? (
                    <SectionEmptyState message="-" />
                  ) : (
                    <ConsolidatedMplResults result={diagnosticResult} />
                  )
                ) : !selectedSubject ? (
                  <SectionEmptyState message="Select a subject to view proficiency results." />
                ) : !selectedCard ? (
                  <SectionEmptyState message="-" />
                ) : !selectedCard.isFinalized ? (
                  <SectionEmptyState message="This examination is not finalized yet. Proficiency results will appear after Proceed to Reports." />
                ) : proficiencyLoading ? (
                  <Stack gap="xs">
                    <Skeleton height={38} radius="sm" />
                    <Skeleton height={130} radius="sm" />
                  </Stack>
                ) : proficiencyRows.length === 0 ? (
                  <SectionEmptyState message="-" />
                ) : (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    <div>
                      <Text size="xl" fw={700} mb={10} c="#111827">Achieved/Exceeded 60% MPL</Text>
                      <ReportTableShell minWidth={330}>
                          <TableThead>
                            <TableTr style={{ backgroundColor: "#4EAE4A" }}>
                              <TableColumnHeader w={WIDTH.mplGroup} ta="center" >Group</TableColumnHeader>
                              <TableColumnHeader w={WIDTH.mplMetric} ta="center" >Test Taker</TableColumnHeader>
                              <TableColumnHeader w={WIDTH.mplMetric} ta="center" >Achieved</TableColumnHeader>
                              <TableColumnHeader w={WIDTH.mplPercent} ta="center" >Percentage</TableColumnHeader>
                            </TableTr>
                          </TableThead>
                          <TableTbody>
                            {mplSummaryRows.map((row) => (
                              <TableTr key={`ach-${row.label}`}>
                                <TableTd ta="center" fw={700}>{row.label}</TableTd>
                                <TableTd ta="center">{row.testTakers}</TableTd>
                                <TableTd ta="center">{row.achieved}</TableTd>
                                <TableTd ta="center">{row.achievedPercentage}</TableTd>
                              </TableTr>
                            ))}
                          </TableTbody>
                      </ReportTableShell>
                    </div>
                    <div>
                      <Text size="xl" fw={700} mb={10} c="#111827">Failed 30% MPL</Text>
                      <ReportTableShell minWidth={330}>
                          <TableThead>
                            <TableTr style={{ backgroundColor: "#4EAE4A" }}>
                              <TableColumnHeader w={WIDTH.mplGroup} ta="center" >Group</TableColumnHeader>
                              <TableColumnHeader w={WIDTH.mplMetric} ta="center" >Test Taker</TableColumnHeader>
                              <TableColumnHeader w={WIDTH.mplMetric} ta="center" >Failed</TableColumnHeader>
                              <TableColumnHeader w={WIDTH.mplPercent} ta="center" >Percentage</TableColumnHeader>
                            </TableTr>
                          </TableThead>
                          <TableTbody>
                            {mplSummaryRows.map((row) => (
                              <TableTr key={`fail-${row.label}`}>
                                <TableTd ta="center" fw={700}>{row.label}</TableTd>
                                <TableTd ta="center">{row.testTakers}</TableTd>
                                <TableTd ta="center">{row.failed}</TableTd>
                                <TableTd ta="center">{row.failedPercentage}</TableTd>
                              </TableTr>
                            ))}
                          </TableTbody>
                      </ReportTableShell>
                    </div>
                  </div>
                )}
              </Accordion.Panel>
            </Accordion.Item>

            {!isConsolidatedSubjectView && <Accordion.Item value="proficiency">
              <Accordion.Control>
                <SectionTitle>Proficiency Level Obtained</SectionTitle>
              </Accordion.Control>
              <Accordion.Panel>
                <SectionSubtitle>A proficiency summary shows the level distribution for the selected grade, section, and subject.</SectionSubtitle>
                {!selectedSubject ? (
                  <SectionEmptyState message="Select a subject to view proficiency results." />
                ) : !selectedCard ? (
                  <SectionEmptyState message="-" />
                ) : !selectedCard.isFinalized ? (
                  <SectionEmptyState message="This examination is not finalized yet. Proficiency results will appear after Proceed to Reports." />
                ) : proficiencyLoading ? (
                  <Stack gap="xs">
                    <Skeleton height={38} radius="sm" />
                    {Array.from({ length: 4 }).map((_, idx) => (
                      <Skeleton key={idx} height={34} radius="sm" />
                    ))}
                  </Stack>
                ) : proficiencyRows.length === 0 ? (
                  <SectionEmptyState message="-" />
                ) : (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    <div className="min-w-0">
                      <ReportTableShell minWidth={520}>
                          <TableThead>
                            <TableTr style={{ backgroundColor: "#4EAE4A" }}>
                              <TableColumnHeader w={WIDTH.profNo} ta="center" >No.</TableColumnHeader>
                              <TableColumnHeader >Name</TableColumnHeader>
                              <TableColumnHeader w={WIDTH.profScore} ta="center" >Score</TableColumnHeader>
                              <TableColumnHeader w={WIDTH.profMpl} ta="center" >MPL</TableColumnHeader>
                              <TableColumnHeader w={WIDTH.profLevel} ta="center" >
                                <span className="sm:hidden">Level</span>
                                <span className="hidden sm:inline">Proficiency Level Obtained</span>
                              </TableColumnHeader>
                            </TableTr>
                          </TableThead>
                          <TableTbody>
                            {maleProficiencyRows.length > 0 && (
                              <TableTr>
                                <TableTd colSpan={5} fw={700} fz="sm" ta="center" style={{ backgroundColor: "var(--mantine-color-gray-1)" }}>
                                  Male ({maleProficiencyRows.length})
                                </TableTd>
                              </TableTr>
                            )}
                            {maleProficiencyRows.map((row, idx) => (
                              <TableTr key={`male-${row.enrollmentId}`}>
                                <TableTd ta="center">{idx + 1}</TableTd>
                                <TableTd>{row.pupilName}</TableTd>
                                <TableTd ta="center" style={getScoreCellStyle(row.testScore, row.totalItems)}>{row.testScore}</TableTd>
                                <TableTd ta="center" style={getMplCellStyle(row.mpl)}>{`${row.mpl.toFixed(1)}%`}</TableTd>
                                <TableTd ta="center">{row.proficiencyLevel}</TableTd>
                              </TableTr>
                            ))}
                            {femaleProficiencyRows.length > 0 && (
                              <TableTr>
                                <TableTd colSpan={5} fw={700} fz="sm" ta="center" style={{ backgroundColor: "var(--mantine-color-gray-1)" }}>
                                  Female ({femaleProficiencyRows.length})
                                </TableTd>
                              </TableTr>
                            )}
                            {femaleProficiencyRows.map((row, idx) => (
                              <TableTr key={`female-${row.enrollmentId}`}>
                                <TableTd ta="center">{idx + 1}</TableTd>
                                <TableTd>{row.pupilName}</TableTd>
                                <TableTd ta="center" style={getScoreCellStyle(row.testScore, row.totalItems)}>{row.testScore}</TableTd>
                                <TableTd ta="center" style={getMplCellStyle(row.mpl)}>{`${row.mpl.toFixed(1)}%`}</TableTd>
                                <TableTd ta="center">{row.proficiencyLevel}</TableTd>
                              </TableTr>
                            ))}
                          </TableTbody>
                      </ReportTableShell>
                    </div>
                  </div>
                )}
              </Accordion.Panel>
            </Accordion.Item>}
          </>
        )}

        {activeTab === "item_analysis" && (
          <>
            <Accordion.Item value="itemRanking">
              <Accordion.Control>
                <SectionTitle>Item Ranking</SectionTitle>
              </Accordion.Control>
              <Accordion.Panel>
                <SectionSubtitle>An item ranking summary shows the strongest and least mastered items for the selected grade, section, and subject.</SectionSubtitle>
                {isConsolidatedSubjectView ? (
                  diagnosticLoading ? (
                    <Stack gap="xs">
                      <Skeleton height={38} radius="sm" />
                      <Skeleton height={180} radius="sm" />
                    </Stack>
                  ) : !diagnosticResult ? (
                    <SectionEmptyState message="-" />
                  ) : (
                    <ConsolidatedItemRankingTables result={diagnosticResult} />
                  )
                ) : !selectedSubject ? (
                  <SectionEmptyState message="Select a subject to view proficiency results." />
                ) : !selectedCard ? (
                  <SectionEmptyState message="-" />
                ) : !selectedCard.isFinalized ? (
                  <SectionEmptyState message="This examination is not finalized yet. Proficiency results will appear after Proceed to Reports." />
                ) : itemAnalysis.rows.length === 0 ? (
                  <SectionEmptyState message="-" />
                ) : (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 w-full">
                    <div className="min-w-0">
                      <Text size="xl" fw={700} mb={10} c="#111827">Top 10 Most Learned</Text>
                      <ReportTableShell minWidth={300}>
                          <TableThead>
                            <TableTr>
                              <TableColumnHeader w={WIDTH.rankingRank} ta="center" style={{ backgroundColor: CORRECT_HIGHLIGHT_STYLE.backgroundColor, color: CORRECT_HIGHLIGHT_STYLE.color }}>Rank</TableColumnHeader>
                              <TableColumnHeader w={WIDTH.rankingItem} ta="center" style={{ backgroundColor: CORRECT_HIGHLIGHT_STYLE.backgroundColor, color: CORRECT_HIGHLIGHT_STYLE.color }}>Item</TableColumnHeader>
                              <TableColumnHeader style={{ backgroundColor: CORRECT_HIGHLIGHT_STYLE.backgroundColor, color: CORRECT_HIGHLIGHT_STYLE.color }}>Objectives</TableColumnHeader>
                            </TableTr>
                          </TableThead>
                          <TableTbody>
                            {itemAnalysisLoading ? (
                              <TableTr><TableTd colSpan={3}><Skeleton height={28} radius="sm" /></TableTd></TableTr>
                            ) : (
                              Array.from({ length: 10 }).map((_, index) => {
                                const row = itemAnalysis.topMostLearned[index] ?? null;
                                return (
                                  <TableTr key={`most-${index + 1}`}>
                                    <TableTd ta="center">{row?.rank ?? "-"}</TableTd>
                                    <TableTd ta="center">{row?.itemNo ?? "-"}</TableTd>
                                    <TableTd>{row ? <EllipsisTooltipText text={row.objective} /> : "-"}</TableTd>
                                  </TableTr>
                                );
                              })
                            )}
                          </TableTbody>
                      </ReportTableShell>
                    </div>
                    <div className="min-w-0">
                      <Text size="xl" fw={700} mb={10} c="#111827">Top 10 Least Learned</Text>
                      <ReportTableShell minWidth={300}>
                          <TableThead>
                            <TableTr>
                              <TableColumnHeader w={WIDTH.rankingRank} ta="center" style={{ backgroundColor: WRONG_HIGHLIGHT_STYLE.backgroundColor, color: WRONG_HIGHLIGHT_STYLE.color }}>Rank</TableColumnHeader>
                              <TableColumnHeader w={WIDTH.rankingItem} ta="center" style={{ backgroundColor: WRONG_HIGHLIGHT_STYLE.backgroundColor, color: WRONG_HIGHLIGHT_STYLE.color }}>Item</TableColumnHeader>
                              <TableColumnHeader style={{ backgroundColor: WRONG_HIGHLIGHT_STYLE.backgroundColor, color: WRONG_HIGHLIGHT_STYLE.color }}>Objectives</TableColumnHeader>
                            </TableTr>
                          </TableThead>
                          <TableTbody>
                            {itemAnalysisLoading ? (
                              <TableTr><TableTd colSpan={3}><Skeleton height={28} radius="sm" /></TableTd></TableTr>
                            ) : (
                              Array.from({ length: 10 }).map((_, index) => {
                                const row = itemAnalysis.topLeastLearned[index] ?? null;
                                return (
                                  <TableTr key={`least-${index + 1}`}>
                                    <TableTd ta="center">{row?.rank ?? "-"}</TableTd>
                                    <TableTd ta="center">{row?.itemNo ?? "-"}</TableTd>
                                    <TableTd>{row ? <EllipsisTooltipText text={row.objective} /> : "-"}</TableTd>
                                  </TableTr>
                                );
                              })
                            )}
                          </TableTbody>
                      </ReportTableShell>
                    </div>
                  </div>
                )}
              </Accordion.Panel>
            </Accordion.Item>

            <Accordion.Item value="itemAnalysis">
              <Accordion.Control>
                <SectionTitle>Item Analysis</SectionTitle>
              </Accordion.Control>
              <Accordion.Panel>
                <SectionSubtitle>An item analysis summary shows the most learned and least learned items for the selected grade, section, and subject.</SectionSubtitle>
                {isConsolidatedSubjectView ? (
                  diagnosticLoading ? (
                    <Stack gap="xs">
                      <Skeleton height={38} radius="sm" />
                      <Skeleton height={260} radius="sm" />
                    </Stack>
                  ) : !diagnosticResult ? (
                    <SectionEmptyState message="-" />
                  ) : (
                    <ConsolidatedItemAnalysisTables result={diagnosticResult} />
                  )
                ) : !selectedSubject ? (
                  <SectionEmptyState message="Select a subject to view proficiency results." />
                ) : !selectedCard ? (
                  <SectionEmptyState message="-" />
                ) : !selectedCard.isFinalized ? (
                  <SectionEmptyState message="This examination is not finalized yet. Proficiency results will appear after Proceed to Reports." />
                ) : (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    <div className="min-w-0">
                      <ReportTableShell minWidth={300}>
                          <TableThead>
                            <TableTr style={{ backgroundColor: "#4EAE4A" }}>
                              <TableColumnHeader w={WIDTH.itemAnalysisItem} ta="center" >Item</TableColumnHeader>
                              <TableColumnHeader w={WIDTH.itemAnalysisCorrect} ta="center" >
                                <span className="sm:hidden">Correct</span>
                                <span className="hidden sm:inline">Correct Responses</span>
                              </TableColumnHeader>
                              <TableColumnHeader w={WIDTH.itemAnalysisRank} ta="center" >Rank</TableColumnHeader>
                            </TableTr>
                          </TableThead>
                          <TableTbody>
                            {itemAnalysisLoading ? (
                              <TableTr><TableTd colSpan={3}><Skeleton height={28} radius="sm" /></TableTd></TableTr>
                            ) : itemAnalysis.rows.length === 0 ? (
                              <TableTr><TableTd colSpan={3} ta="center"><Text size="sm" c="dimmed">-</Text></TableTd></TableTr>
                            ) : (
                              itemAnalysis.rows.map((row) => {
                                const total = itemAnalysis.rows.length || selectedCard.totalItems;
                                const isMost = row.rank >= 1 && row.rank <= 10;
                                const isLeast = row.rank >= total - 9 && row.rank <= total;
                                const rankStyle = isMost ? CORRECT_HIGHLIGHT_STYLE : isLeast ? WRONG_HIGHLIGHT_STYLE : undefined;
                                return (
                                  <TableTr key={`row-${row.itemNo}`}>
                                    <TableTd ta="center">{row.itemNo}</TableTd>
                                    <TableTd ta="center">{row.correctResponses}</TableTd>
                                    <TableTd ta="center" style={rankStyle}>{row.rank}</TableTd>
                                  </TableTr>
                                );
                              })
                            )}
                          </TableTbody>
                      </ReportTableShell>
                    </div>
                  </div>
                )}
              </Accordion.Panel>
            </Accordion.Item>




          </>
        )}

        {activeTab === "proficiency_mpl" && (
          <>
            <Accordion.Item value="proficiencyLevel">
              <Accordion.Control>
                <SectionTitle>Proficiency Level</SectionTitle>
              </Accordion.Control>
              <Accordion.Panel>
                <SectionSubtitle>This section shows the proficiency level matrix.</SectionSubtitle>
                {isConsolidatedSubjectView ? (
                  diagnosticLoading ? (
                    <Stack gap="xs">
                      <Skeleton height={38} radius="sm" />
                      <Skeleton height={180} radius="sm" />
                    </Stack>
                  ) : !diagnosticResult ? (
                    <SectionEmptyState message="-" />
                  ) : (
                    <ConsolidatedProficiencyTable result={diagnosticResult} />
                  )
                ) : !selectedSubject ? (
                  <SectionEmptyState message="Select a subject to view proficiency results." />
                ) : !selectedCard ? (
                  <SectionEmptyState message="-" />
                ) : !selectedCard.isFinalized ? (
                  <SectionEmptyState message="This examination is not finalized yet. Proficiency results will appear after Proceed to Reports." />
                ) : proficiencyLoading ? (
                  <Stack gap="xs">
                    <Skeleton height={38} radius="sm" />
                    <Skeleton height={74} radius="sm" />
                  </Stack>
                ) : proficiencyRows.length === 0 ? (
                  <SectionEmptyState message="-" />
                ) : (
                  <ReportTableShell minWidth={920} containerStyle={TABLE_CONTAINER_STYLE}>
                      <TableThead>
                        <TableTr style={{ backgroundColor: "#4EAE4A" }}>
                          <MatrixHeader colSpan={3} ta="center">Number of Highly Proficient Learners</MatrixHeader>
                          <MatrixHeader colSpan={3} ta="center">Number of Proficient Learners</MatrixHeader>
                          <MatrixHeader colSpan={3} ta="center">Number of Nearly Proficient Learners</MatrixHeader>
                          <MatrixHeader colSpan={3} ta="center">Number of Low Proficient Learners</MatrixHeader>
                          <MatrixHeader colSpan={3} ta="center">Number of Not Proficient Learners</MatrixHeader>
                          <MatrixHeader rowSpan={2} ta="center">OVER ALL</MatrixHeader>
                        </TableTr>
                        <TableTr style={{ backgroundColor: "#4EAE4A" }}>
                          {Array.from({ length: 5 }).flatMap((_, i) => [
                            <MatrixHeader key={`m-${i}`} ta="center">Male</MatrixHeader>,
                            <MatrixHeader key={`f-${i}`} ta="center">Female</MatrixHeader>,
                            <MatrixHeader key={`t-${i}`} ta="center">Total</MatrixHeader>,
                          ])}
                        </TableTr>
                      </TableThead>
                      <TableTbody>
                        <TableTr>
                          {proficiencyMatrix.flatMap((row) => [
                            <MatrixCell key={`${row.level}-male`} ta="center">{row.male}</MatrixCell>,
                            <MatrixCell key={`${row.level}-female`} ta="center">{row.female}</MatrixCell>,
                            <MatrixCell key={`${row.level}-total`} ta="center">{row.total}</MatrixCell>,
                          ])}
                          <MatrixCell ta="center" fw={700}>
                            {proficiencyRows.length}
                          </MatrixCell>
                        </TableTr>
                      </TableTbody>
                  </ReportTableShell>
                )}
              </Accordion.Panel>
            </Accordion.Item>

            <Accordion.Item value="laempl">
              <Accordion.Control>
                <SectionTitle>Learners Who Attained or Exceeded the Minimum Proficiency Level</SectionTitle>
              </Accordion.Control>
              <Accordion.Panel>
                <SectionSubtitle>This section shows the LAEMPL matrix.</SectionSubtitle>
                {isConsolidatedSubjectView ? (
                  diagnosticLoading ? (
                    <Stack gap="xs">
                      <Skeleton height={38} radius="sm" />
                      <Skeleton height={180} radius="sm" />
                    </Stack>
                  ) : !diagnosticResult ? (
                    <SectionEmptyState message="-" />
                  ) : (
                    <ConsolidatedLaemplTable result={diagnosticResult} />
                  )
                ) : !selectedSubject ? (
                  <SectionEmptyState message="Select a subject to view proficiency results." />
                ) : !selectedCard ? (
                  <SectionEmptyState message="-" />
                ) : !selectedCard.isFinalized ? (
                  <SectionEmptyState message="This examination is not finalized yet. Proficiency results will appear after Proceed to Reports." />
                ) : proficiencyLoading ? (
                  <Stack gap="xs">
                    <Skeleton height={38} radius="sm" />
                    <Skeleton height={74} radius="sm" />
                  </Stack>
                ) : proficiencyRows.length === 0 ? (
                  <SectionEmptyState message="-" />
                ) : (
                  <ReportTableShell minWidth={920} containerStyle={TABLE_CONTAINER_STYLE}>
                      <TableThead>
                        <TableTr style={{ backgroundColor: "#4EAE4A" }}>
                          <MatrixHeader colSpan={3} ta="center">Number of Enrolled Learners</MatrixHeader>
                          <MatrixHeader colSpan={3} ta="center">Number of Test Takers</MatrixHeader>
                          <MatrixHeader colSpan={3} ta="center">Number of Learners who attained or exceeded the Minimum Proficiency Level (60%)</MatrixHeader>
                          <MatrixHeader colSpan={3} ta="center">Percentage of LAEMPL</MatrixHeader>
                          <MatrixHeader rowSpan={2} ta="center">MEAN</MatrixHeader>
                          <MatrixHeader rowSpan={2} ta="center">MPS</MatrixHeader>
                        </TableTr>
                        <TableTr style={{ backgroundColor: "#4EAE4A" }}>
                          {Array.from({ length: 4 }).flatMap((_, i) => [
                            <MatrixHeader key={`laempl-m-${i}`} ta="center">Male</MatrixHeader>,
                            <MatrixHeader key={`laempl-f-${i}`} ta="center">Female</MatrixHeader>,
                            <MatrixHeader key={`laempl-t-${i}`} ta="center">Total</MatrixHeader>,
                          ])}
                        </TableTr>
                      </TableThead>
                      <TableTbody>
                        <TableTr>
                          <MatrixCell ta="center">{laemplSummary.enrolled.male}</MatrixCell>
                          <MatrixCell ta="center">{laemplSummary.enrolled.female}</MatrixCell>
                          <MatrixCell ta="center">{laemplSummary.enrolled.total}</MatrixCell>
                          <MatrixCell ta="center">{laemplSummary.testTakers.male}</MatrixCell>
                          <MatrixCell ta="center">{laemplSummary.testTakers.female}</MatrixCell>
                          <MatrixCell ta="center">{laemplSummary.testTakers.total}</MatrixCell>
                          <MatrixCell ta="center">{laemplSummary.achieved.male}</MatrixCell>
                          <MatrixCell ta="center">{laemplSummary.achieved.female}</MatrixCell>
                          <MatrixCell ta="center">{laemplSummary.achieved.total}</MatrixCell>
                          <MatrixCell ta="center">{laemplSummary.achievedPercentage.male}</MatrixCell>
                          <MatrixCell ta="center">{laemplSummary.achievedPercentage.female}</MatrixCell>
                          <MatrixCell ta="center">{laemplSummary.achievedPercentage.total}</MatrixCell>
                          <MatrixCell ta="center">{laemplSummary.mean.toFixed(2)}</MatrixCell>
                          <MatrixCell ta="center">{`${laemplSummary.mps.toFixed(2)}%`}</MatrixCell>
                        </TableTr>
                      </TableTbody>
                  </ReportTableShell>
                )}
              </Accordion.Panel>
            </Accordion.Item>
          </>
        )}
        </Accordion>
      </div>
      )}
    </div>
  );
}

function SectionEmptyState({ message }: { message: string }) {
  const title = message === "-" ? "No report data available." : message;
  const description =
    message === "-"
      ? "Report data will appear here after reports are finalized."
      : "Report data will appear here once the required report status is available.";

  return (
    <div className="min-h-[180px] flex flex-col items-center justify-center px-4 py-8 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#EEF0F4]">
        <IconReportOff size={24} color="#6B7280" stroke={1.8} />
      </div>
      <Text size="sm" c="#111827" ta="center">
        {title}
      </Text>
      <Text size="sm" c="dimmed" ta="center" mt={4}>
        {description}
      </Text>
    </div>
  );
}
