"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Accordion,
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
import { IconBook, IconChevronDown } from "@tabler/icons-react";
import { useSearchParams } from "next/navigation";
import BackButton from "@/components/BackButton";
import {
  fetchReportExamCards,
  fetchReportSectionOverview,
  fetchReportSubjectOverview,
  fetchConsolidatedSubjectAnalytics,
  fetchSavedExamDetailsSummary,
  fetchSavedItemAnalysisSummary,
  fetchSavedProficiencyRows,
  type ExamDetailsSummary,
  type ItemAnalysisSummary,
  type ProficiencyRow,
  type ReportExamCard,
  type ReportSubjectOverview,
} from "@/lib/services/reportsAnalysisService";

interface ReportAnalyticsClientProps {
  initialGradeLevelId?: number | null;
  initialSectionId?: number | null;
  initialExamId?: number | null;
  initialSubjectId?: number | null;
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
    <TableTh
      {...props}
      className={TABLE_HEADER_TEXT_SIZE}
      style={{ color: "#ffffff", ...style }}
    >
      {children}
    </TableTh>
  );
}

function MatrixHeader({
  children,
  style,
  ...props
}: React.ComponentProps<typeof TableTh>) {
  return (
    <TableColumnHeader
      {...props}
      style={{ border: `1px solid ${TABLE_BORDER_COLOR}`, ...style }}
    >
      {children}
    </TableColumnHeader>
  );
}

function MatrixCell({
  children,
  style,
  ...props
}: React.ComponentProps<typeof TableTd>) {
  return (
    <TableTd
      {...props}
      className={TABLE_TEXT_SIZE}
      style={{ border: `1px solid ${TABLE_BORDER_COLOR}`, padding: "10px 8px", ...style }}
    >
      {children}
    </TableTd>
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

export default function ReportAnalyticsClient({
  initialGradeLevelId = null,
  initialSectionId = null,
  initialExamId = null,
  initialSubjectId = null,
  mode = "section",
}: ReportAnalyticsClientProps) {
  const searchParams = useSearchParams();
  const queryGradeParam = Number(searchParams.get("gradeLevelId"));
  const querySectionParam = Number(searchParams.get("sectionId"));
  const queryExamParam = Number(searchParams.get("examId"));
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
  const [selectedGradeId, setSelectedGradeId] = useState<number | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<number | null>(null);
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(
    Number.isFinite(initialSubjectId) ? Number(initialSubjectId) : null,
  );
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [subjectOverview, setSubjectOverview] = useState<ReportSubjectOverview | null>(null);
  const [subjectHydrated, setSubjectHydrated] = useState(false);
  const [subjectClearedByUser, setSubjectClearedByUser] = useState(false);
  const [sectionSubjectOptions, setSectionSubjectOptions] = useState<
    { value: string; label: string }[]
  >([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    "exam_results" | "item_analysis" | "proficiency_mpl"
  >("exam_results");
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summary, setSummary] = useState<ExamDetailsSummary | null>(null);
  const [consolidatedSectionCount, setConsolidatedSectionCount] = useState(0);
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
        ? `assessment-reports:selected-subject:subject:${selectedSubjectId}`
        : selectedSectionId != null
        ? `assessment-reports:selected-subject:section:${selectedSectionId}`
        : null,
    [mode, selectedSectionId, selectedSubjectId],
  );
  const collapsibleStorageKey = useMemo(
    () =>
      mode === "subject" && selectedSubjectId != null
        ? `assessment-reports:analytics-open:subject:${selectedSubjectId}`
        : selectedSectionId != null
        ? `assessment-reports:analytics-open:section:${selectedSectionId}`
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
    for (const card of cards) {
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
  }, [cards]);

  useEffect(() => {
    if (cards.length === 0) {
      setSelectedGradeId(null);
      return;
    }
    const hasCurrent =
      selectedGradeId != null && cards.some((card) => card.gradeLevelId === selectedGradeId);
    if (hasCurrent) return;

    const queryMatch =
      Number.isFinite(gradeParam) &&
      cards.some((card) => card.gradeLevelId === gradeParam)
        ? gradeParam
        : null;
    setSelectedGradeId(queryMatch ?? cards[0].gradeLevelId);
  }, [cards, gradeParam, selectedGradeId]);

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

  const sectionOptions = useMemo(() => {
    if (mode === "subject") {
      return [
        { value: "all", label: "All" },
        ...(subjectOverview?.sections ?? []).map((section) => ({
          value: String(section.sectionId),
          label: section.sectionName,
        })),
      ];
    }

    const rows = cards.filter((card) =>
      selectedGradeId == null ? true : card.gradeLevelId === selectedGradeId,
    );
    const dedup = new Map<number, { value: string; label: string }>();
    for (const row of rows) {
      if (!dedup.has(row.sectionId)) {
        dedup.set(row.sectionId, { value: String(row.sectionId), label: row.sectionName });
      }
    }
    return Array.from(dedup.values()).sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
    );
  }, [cards, mode, selectedGradeId, subjectOverview]);

  useEffect(() => {
    if (mode === "subject") {
      if (initialSectionId != null && Number.isFinite(initialSectionId)) {
        const hasRouteSection = sectionOptions.some(
          (option) => option.value === String(initialSectionId),
        );
        setSelectedSectionId(hasRouteSection ? Number(initialSectionId) : null);
        return;
      }
      if (selectedSectionId != null) {
        const hasCurrent = sectionOptions.some(
          (option) => option.value === String(selectedSectionId),
        );
        if (hasCurrent) return;
      }
      setSelectedSectionId(null);
      return;
    }

    if (sectionOptions.length === 0) {
      setSelectedSectionId(null);
      return;
    }

    const hasCurrent =
      selectedSectionId != null &&
      sectionOptions.some((option) => Number(option.value) === selectedSectionId);
    if (hasCurrent) return;

    // Dynamic route section has highest priority in this page.
    const routeMatch =
      Number.isFinite(initialSectionId) &&
      sectionOptions.some((option) => Number(option.value) === Number(initialSectionId))
        ? Number(initialSectionId)
        : null;
    if (routeMatch != null) {
      setSelectedSectionId(routeMatch);
      return;
    }

    // URL param fallback.
    const queryMatch =
      Number.isFinite(sectionParam) &&
      sectionOptions.some((option) => Number(option.value) === sectionParam)
        ? sectionParam
        : null;
    if (queryMatch != null) {
      setSelectedSectionId(queryMatch);
      return;
    }

    // Last fallback: first available section under current grade scope.
    setSelectedSectionId(Number(sectionOptions[0]?.value ?? null));
  }, [initialSectionId, mode, sectionOptions, selectedSectionId, sectionParam]);

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
        .map((subject) => subject.subjectName)
        .filter((name) => name.trim().length > 0)
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
        .map((name) => ({ value: name, label: name }));

      setSectionSubjectOptions(options);
    };

    void loadSubjects();
    return () => {
      mounted = false;
    };
  }, [mode, selectedSectionId, subjectOverview]);

  const availableExamCards = useMemo(() => {
    if (mode === "subject") {
      return cards.filter((card) => {
        if (selectedGradeId != null && card.gradeLevelId !== selectedGradeId) return false;
        if (selectedSubjectId != null && card.subjectId !== selectedSubjectId) return false;
        if (selectedSectionId != null && card.sectionId !== selectedSectionId) return false;
        return true;
      });
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
  }, [cards, examParam, mode, selectedGradeId, selectedSectionId, selectedSubject, selectedSubjectId]);

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
      setSelectedKey(null);
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

    setSelectedKey(queryMatch ?? examOptions[0].value);
  }, [examOptions, selectedKey, examParam, mode, selectedSectionId, sectionParam]);

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
            selectedCard.examId,
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
  }, [isConsolidatedSubjectView, selectedCard, selectedSubjectId]);

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
                selectedCard.examId,
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
  }, [isConsolidatedSubjectView, selectedCard, selectedSubject, selectedSubjectId]);

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
                selectedCard.examId,
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
  }, [isConsolidatedSubjectView, selectedCard, selectedSubject, selectedSubjectId]);


  if (loading) {
    return (
      <Stack gap="md">
        <Skeleton height={26} width={260} radius="sm" />
        <Skeleton height={18} width={280} radius="sm" />
        <Skeleton height={40} radius="sm" />
        <Skeleton height={180} radius="sm" />
      </Stack>
    );
  }

  const selectedGradeLabel = (() => {
    if (selectedGradeId == null) return "Grade";
    const hit = gradeOptions.find((option) => Number(option.value) === selectedGradeId);
    return hit?.label ?? "Grade";
  })();
  const selectedSectionLabel = (() => {
    if (mode === "subject" && selectedSectionId == null) return "All Sections";
    if (selectedSectionId == null) return "Section";
    const hit = sectionOptions.find(
      (option) => Number(option.value) === selectedSectionId,
    );
    return hit?.label ?? "Section";
  })();
  const detailHref =
    mode === "subject" && Number.isFinite(initialGradeLevelId) && Number.isFinite(initialSubjectId)
      ? `/assessment-reports/subject-details/${initialGradeLevelId}/${initialSubjectId}`
      : 
    Number.isFinite(initialGradeLevelId) && Number.isFinite(initialSectionId)
      ? `/assessment-reports/grade-details/${initialGradeLevelId}/${initialSectionId}`
      : "/assessment-reports/grade";
  const backLabel =
    mode === "subject"
      ? "Back to Subject Report Details"
      : detailHref === "/assessment-reports/grade"
      ? "Back to Assessment Reports"
      : "Back to Report Details";
  return (
    <div className="space-y-5 min-w-0">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold mb-4 text-[#597D37]">Report Analytics</h1>
        <BackButton href={detailHref} size="sm" mb="md">
          {backLabel}
        </BackButton>
        <Text size="lg" fw={700} c="black">
          {mode === "subject" && subjectOverview
            ? `${selectedGradeLabel} - ${subjectOverview.subjectName} - ${selectedSectionLabel}`
            : `${selectedGradeLabel} - ${selectedSectionLabel}`}
        </Text>
      </div>

      <Group mb="md" align="flex-end" gap="sm">
        <Select
          placeholder={mode === "subject" ? "Select sections" : "Select subjects"}
          data={mode === "subject" ? sectionOptions : sectionSubjectOptions}
          value={
            mode === "subject"
              ? selectedSectionId == null
                ? "all"
                : String(selectedSectionId)
              : selectedSubject
          }
          onChange={(value) => {
            if (mode === "subject") {
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
          leftSection={<IconBook size={16} />}
          w={{ base: "100%", sm: 260 }}
          disabled={mode === "subject" ? sectionOptions.length === 0 : sectionSubjectOptions.length === 0}
          clearable={mode !== "subject"}
          nothingFoundMessage="No Data available"
        />
      </Group>

      {isConsolidatedSubjectView && consolidatedSectionCount > 0 && (
        <Text size="sm" c="dimmed">
          Consolidated from {consolidatedSectionCount} section{consolidatedSectionCount === 1 ? "" : "s"}.
        </Text>
      )}

      <div className="space-y-3 min-w-0">
        <div className="sticky top-0 z-20 w-full bg-white/95 pb-1 backdrop-blur">
          <SegmentedControl
            fullWidth
            value={activeTab}
            onChange={(value) => setActiveTab(value as typeof activeTab)}
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
                <SectionTitle>Details</SectionTitle>
              </Accordion.Control>
              <Accordion.Panel>
                <SectionSubtitle>An examination summary shows the key result metrics for the selected grade, section, and examination.</SectionSubtitle>
                {summaryLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {Array.from({ length: 8 }).map((_, idx) => (
                    <Skeleton key={idx} height={82} radius="sm" />
                  ))}
                </div>
              ) : !selectedCard ? (
                <SectionEmptyState message="No Data available." />
              ) : !selectedSubject ? (
                <SectionEmptyState message="Select a subject to view proficiency results." />
              ) : !selectedCard.isFinalized ? (
                <SectionEmptyState message="This examination is not finalized yet. Proficiency results will appear after Proceed to Reports." />
              ) : !summary ? (
                <SectionEmptyState message="No Data available." />
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
                    <DetailCard label="PL" value={formatSummaryValue("pl", summary.pl)} />
                    <DetailCard
                      label="Highest Score"
                      value={formatSummaryValue("int", summary.highestScore)}
                    />
                    <DetailCard
                      label="Lowest Score"
                      value={formatSummaryValue("int", summary.lowestScore)}
                    />
                    <DetailCard
                      label="Mean Percentage Score"
                      value={formatSummaryValue("mps", summary.mps)}
                    />
                  </div>
                  {summary.numberOfCases === 0 && (
                    <Text size="sm" c="dimmed">
                      No scored cases yet for this examination.
                    </Text>
                  )}
                </Stack>
              )}
              </Accordion.Panel>
            </Accordion.Item>

            <Accordion.Item value="mpl">
              <Accordion.Control>
                <SectionTitle>MPL Results</SectionTitle>
              </Accordion.Control>
              <Accordion.Panel>
                <SectionSubtitle>An MPL summary shows the minimum proficiency level results for the selected grade, section, and subject.</SectionSubtitle>
                {!selectedSubject ? (
                  <SectionEmptyState message="Select a subject to view proficiency results." />
                ) : !selectedCard ? (
                  <SectionEmptyState message="No Data available." />
                ) : !selectedCard.isFinalized ? (
                  <SectionEmptyState message="This examination is not finalized yet. Proficiency results will appear after Proceed to Reports." />
                ) : proficiencyLoading ? (
                  <Stack gap="xs">
                    <Skeleton height={38} radius="sm" />
                    <Skeleton height={130} radius="sm" />
                  </Stack>
                ) : proficiencyRows.length === 0 ? (
                  <SectionEmptyState message="No Data available." />
                ) : (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    <div>
                      <Text size="xl" fw={700} mb={10} c="#111827">Achieved/Exceeded 60% MPL</Text>
                      <TableScrollContainer minWidth={0} type="native" style={COLUMN_TABLE_CONTAINER_STYLE}>
                        <Table {...GRID_TABLE_PROPS} verticalSpacing="sm" striped={false} highlightOnHover style={{ width: "100%", minWidth: 330, tableLayout: "fixed" }}>
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
                        </Table>
                      </TableScrollContainer>
                    </div>
                    <div>
                      <Text size="xl" fw={700} mb={10} c="#111827">Failed 30% MPL</Text>
                      <TableScrollContainer minWidth={0} type="native" style={COLUMN_TABLE_CONTAINER_STYLE}>
                        <Table {...GRID_TABLE_PROPS} verticalSpacing="sm" striped={false} highlightOnHover style={{ width: "100%", minWidth: 330, tableLayout: "fixed" }}>
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
                        </Table>
                      </TableScrollContainer>
                    </div>
                  </div>
                )}
              </Accordion.Panel>
            </Accordion.Item>

            <Accordion.Item value="proficiency">
              <Accordion.Control>
                <SectionTitle>Proficiency Level Obtained</SectionTitle>
              </Accordion.Control>
              <Accordion.Panel>
                <SectionSubtitle>A proficiency summary shows the level distribution for the selected grade, section, and subject.</SectionSubtitle>
                {!selectedSubject ? (
                  <SectionEmptyState message="Select a subject to view proficiency results." />
                ) : !selectedCard ? (
                  <SectionEmptyState message="No Data available." />
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
                  <SectionEmptyState message="No Data available." />
                ) : (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    <div className="min-w-0">
                      <TableScrollContainer minWidth={0} type="native" style={COLUMN_TABLE_CONTAINER_STYLE}>
                        <Table {...GRID_TABLE_PROPS} verticalSpacing="sm" striped={false} highlightOnHover style={{ width: "100%", minWidth: 520, tableLayout: "fixed" }}>
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
                                <TableTd ta="center" style={getScoreCellStyle(row.testScore, row.totalItems)}>{`${row.testScore}/${row.totalItems}`}</TableTd>
                                <TableTd ta="center" style={getMplCellStyle(row.mpl)}>{`${row.mpl.toFixed(2)}%`}</TableTd>
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
                                <TableTd ta="center" style={getScoreCellStyle(row.testScore, row.totalItems)}>{`${row.testScore}/${row.totalItems}`}</TableTd>
                                <TableTd ta="center" style={getMplCellStyle(row.mpl)}>{`${row.mpl.toFixed(2)}%`}</TableTd>
                                <TableTd ta="center">{row.proficiencyLevel}</TableTd>
                              </TableTr>
                            ))}
                          </TableTbody>
                        </Table>
                      </TableScrollContainer>
                    </div>
                  </div>
                )}
              </Accordion.Panel>
            </Accordion.Item>
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
                {!selectedSubject ? (
                  <SectionEmptyState message="Select a subject to view proficiency results." />
                ) : !selectedCard ? (
                  <SectionEmptyState message="No Data available." />
                ) : !selectedCard.isFinalized ? (
                  <SectionEmptyState message="This examination is not finalized yet. Proficiency results will appear after Proceed to Reports." />
                ) : (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 w-full">
                    <div className="min-w-0">
                      <Text size="xl" fw={700} mb={10} c="#111827">Top 5 Most Learned</Text>
                      <TableScrollContainer minWidth={0} type="native" style={COLUMN_TABLE_CONTAINER_STYLE}>
                        <Table {...GRID_TABLE_PROPS} verticalSpacing="sm" striped={false} highlightOnHover style={{ width: "100%", minWidth: 300, tableLayout: "fixed" }}>
                          <TableThead>
                            <TableTr style={{ backgroundColor: "#4EAE4A" }}>
                              <TableColumnHeader w={WIDTH.rankingRank} ta="center" >Rank</TableColumnHeader>
                              <TableColumnHeader w={WIDTH.rankingItem} ta="center" >Item</TableColumnHeader>
                              <TableColumnHeader >Objectives</TableColumnHeader>
                            </TableTr>
                          </TableThead>
                          <TableTbody>
                            {itemAnalysisLoading ? (
                              <TableTr><TableTd colSpan={3}><Skeleton height={28} radius="sm" /></TableTd></TableTr>
                            ) : itemAnalysis.topMostLearned.length === 0 ? (
                              <TableTr><TableTd colSpan={3} ta="center"><Text size="sm" c="dimmed">No Data available.</Text></TableTd></TableTr>
                            ) : (
                              itemAnalysis.topMostLearned.map((row) => (
                                <TableTr key={`most-${row.itemNo}`}>
                                  <TableTd ta="center">{row.rank}</TableTd>
                                  <TableTd ta="center">{row.itemNo}</TableTd>
                                  <TableTd>
                                    <EllipsisTooltipText text={row.objective} />
                                  </TableTd>
                                </TableTr>
                              ))
                            )}
                          </TableTbody>
                        </Table>
                      </TableScrollContainer>
                    </div>
                    <div className="min-w-0">
                      <Text size="xl" fw={700} mb={10} c="#111827">Top 5 Least Learned</Text>
                      <TableScrollContainer minWidth={0} type="native" style={COLUMN_TABLE_CONTAINER_STYLE}>
                        <Table {...GRID_TABLE_PROPS} verticalSpacing="sm" striped={false} highlightOnHover style={{ width: "100%", minWidth: 300, tableLayout: "fixed" }}>
                          <TableThead>
                            <TableTr style={{ backgroundColor: "#4EAE4A" }}>
                              <TableColumnHeader w={WIDTH.rankingRank} ta="center" >Rank</TableColumnHeader>
                              <TableColumnHeader w={WIDTH.rankingItem} ta="center" >Item</TableColumnHeader>
                              <TableColumnHeader >Objectives</TableColumnHeader>
                            </TableTr>
                          </TableThead>
                          <TableTbody>
                            {itemAnalysisLoading ? (
                              <TableTr><TableTd colSpan={3}><Skeleton height={28} radius="sm" /></TableTd></TableTr>
                            ) : itemAnalysis.topLeastLearned.length === 0 ? (
                              <TableTr><TableTd colSpan={3} ta="center"><Text size="sm" c="dimmed">No Data available.</Text></TableTd></TableTr>
                            ) : (
                              itemAnalysis.topLeastLearned.map((row) => (
                                <TableTr key={`least-${row.itemNo}`}>
                                  <TableTd ta="center">{row.rank}</TableTd>
                                  <TableTd ta="center">{row.itemNo}</TableTd>
                                  <TableTd>
                                    <EllipsisTooltipText text={row.objective} />
                                  </TableTd>
                                </TableTr>
                              ))
                            )}
                          </TableTbody>
                        </Table>
                      </TableScrollContainer>
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
                {!selectedSubject ? (
                  <SectionEmptyState message="Select a subject to view proficiency results." />
                ) : !selectedCard ? (
                  <SectionEmptyState message="No Data available." />
                ) : !selectedCard.isFinalized ? (
                  <SectionEmptyState message="This examination is not finalized yet. Proficiency results will appear after Proceed to Reports." />
                ) : (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    <div className="min-w-0">
                      <TableScrollContainer minWidth={0} type="native" style={COLUMN_TABLE_CONTAINER_STYLE}>
                        <Table {...GRID_TABLE_PROPS} verticalSpacing="sm" striped={false} highlightOnHover style={{ width: "100%", minWidth: 300, tableLayout: "fixed" }}>
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
                              <TableTr><TableTd colSpan={3} ta="center"><Text size="sm" c="dimmed">No Data available.</Text></TableTd></TableTr>
                            ) : (
                              itemAnalysis.rows.map((row) => (
                                <TableTr key={`row-${row.itemNo}`}>
                                  <TableTd ta="center">{row.itemNo}</TableTd>
                                  <TableTd ta="center">{row.correctResponses}</TableTd>
                                  <TableTd ta="center" style={getRankCellStyle(row.rank, itemAnalysis.rows.length || selectedCard.totalItems)}>{row.rank}</TableTd>
                                </TableTr>
                              ))
                            )}
                          </TableTbody>
                        </Table>
                      </TableScrollContainer>
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
                {!selectedSubject ? (
                  <SectionEmptyState message="Select a subject to view proficiency results." />
                ) : !selectedCard ? (
                  <SectionEmptyState message="No Data available." />
                ) : !selectedCard.isFinalized ? (
                  <SectionEmptyState message="This examination is not finalized yet. Proficiency results will appear after Proceed to Reports." />
                ) : proficiencyLoading ? (
                  <Stack gap="xs">
                    <Skeleton height={38} radius="sm" />
                    <Skeleton height={74} radius="sm" />
                  </Stack>
                ) : proficiencyRows.length === 0 ? (
                  <SectionEmptyState message="No Data available." />
                ) : (
                  <TableScrollContainer minWidth={920} type="native" style={TABLE_CONTAINER_STYLE}>
                    <Table {...GRID_TABLE_PROPS} verticalSpacing={0} striped={false} highlightOnHover style={{ width: "100%", minWidth: 920, borderCollapse: "collapse" }}>
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
                    </Table>
                  </TableScrollContainer>
                )}
              </Accordion.Panel>
            </Accordion.Item>

            <Accordion.Item value="laempl">
              <Accordion.Control>
                <SectionTitle>Learners Who Attained or Exceeded the Minimum Proficiency Level</SectionTitle>
              </Accordion.Control>
              <Accordion.Panel>
                <SectionSubtitle>This section shows the LAEMPL matrix.</SectionSubtitle>
                {!selectedSubject ? (
                  <SectionEmptyState message="Select a subject to view proficiency results." />
                ) : !selectedCard ? (
                  <SectionEmptyState message="No Data available." />
                ) : !selectedCard.isFinalized ? (
                  <SectionEmptyState message="This examination is not finalized yet. Proficiency results will appear after Proceed to Reports." />
                ) : proficiencyLoading ? (
                  <Stack gap="xs">
                    <Skeleton height={38} radius="sm" />
                    <Skeleton height={74} radius="sm" />
                  </Stack>
                ) : proficiencyRows.length === 0 ? (
                  <SectionEmptyState message="No Data available." />
                ) : (
                  <TableScrollContainer minWidth={920} type="native" style={TABLE_CONTAINER_STYLE}>
                    <Table {...GRID_TABLE_PROPS} verticalSpacing={0} striped={false} highlightOnHover style={{ width: "100%", minWidth: 920, borderCollapse: "collapse" }}>
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
                    </Table>
                  </TableScrollContainer>
                )}
              </Accordion.Panel>
            </Accordion.Item>
          </>
        )}
        </Accordion>
      </div>
    </div>
  );
}

function SectionEmptyState({ message }: { message: string }) {
  return (
    <div className="min-h-[180px] flex items-center justify-center py-8">
      <Text size="sm" c="dimmed" ta="center">
        {message}
      </Text>
    </div>
  );
}
