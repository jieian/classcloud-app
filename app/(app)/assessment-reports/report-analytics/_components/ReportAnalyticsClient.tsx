"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Card,
  Collapse,
  Divider,
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
  UnstyledButton,
} from "@mantine/core";
import { IconBook, IconChevronDown } from "@tabler/icons-react";
import { useSearchParams } from "next/navigation";
import BackButton from "@/components/BackButton";
import {
  computeExamDetailsSummary,
  fetchLatestScoresForAssignments,
  fetchItemAnalysisSummary,
  fetchProficiencyRowsForAssignments,
  fetchReportExamCards,
  fetchReportSectionOverview,
  type ExamDetailsSummary,
  type ItemAnalysisSummary,
  type ProficiencyRow,
  type ReportExamCard,
} from "@/lib/services/reportsAnalysisService";

interface ReportAnalyticsClientProps {
  initialGradeLevelId?: number | null;
  initialSectionId?: number | null;
  initialExamId?: number | null;
}

function ReportsCollapsible({
  title,
  subtitle,
  children,
  opened,
  onToggle,
}: {
  title: string;
  subtitle: string;
  children?: ReactNode;
  opened: boolean;
  onToggle: () => void;
}) {
  return (
    <div>
      <Divider mb="xs" />
      <UnstyledButton onClick={onToggle} w="100%">
        <Group justify="space-between" align="center">
          <h2 className="text-2xl font-bold leading-tight">{title}</h2>
          <IconChevronDown
            size={22}
            style={{
              transform: opened ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 200ms ease",
              color: "#808898",
            }}
          />
        </Group>
      </UnstyledButton>
      <Collapse in={opened}>
        <p className="mb-2 text-sm text-[#808898]">{subtitle}</p>
        {children ?? (
          <Text size="sm" c="dimmed">
            No Data available.
          </Text>
        )}
      </Collapse>
      <Divider mt="xs" />
    </div>
  );
}

function DetailCard({ label, value }: { label: string; value: string }) {
  return (
    <Card
      withBorder
      radius="md"
      p="xs"
      style={{
        borderColor: "#D6D9E0",
        backgroundColor: "#FFFFFF",
        minHeight: 70,
        width: 150,
      }}
    >
      <Stack gap={2} align="center" justify="center" h="100%">
        <Text size="xs" fw={700} c="#111827" ta="center">
          {label}
        </Text>
        <Text size="lg" fw={800} c="#111827" ta="center" lh={1.2}>
          {value}
        </Text>
      </Stack>
    </Card>
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

export default function ReportAnalyticsClient({
  initialGradeLevelId = null,
  initialSectionId = null,
  initialExamId = null,
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
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [subjectHydrated, setSubjectHydrated] = useState(false);
  const [subjectClearedByUser, setSubjectClearedByUser] = useState(false);
  const isFirstSectionLoadRef = useRef(true);
  const [sectionSubjectOptions, setSectionSubjectOptions] = useState<
    { value: string; label: string }[]
  >([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    "exam_results" | "item_analysis" | "proficiency_mpl"
  >("exam_results");
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summary, setSummary] = useState<ExamDetailsSummary | null>(null);
  const [proficiencyLoading, setProficiencyLoading] = useState(false);
  const [proficiencyRows, setProficiencyRows] = useState<ProficiencyRow[]>([]);
  const [itemAnalysisLoading, setItemAnalysisLoading] = useState(false);
  const [itemAnalysis, setItemAnalysis] = useState<ItemAnalysisSummary>({
    rows: [],
    topMostLearned: [],
    topLeastLearned: [],
  });
  // All start closed to avoid flash before sessionStorage is read (same as exam accordion).
  const [detailsOpened, setDetailsOpened] = useState(false);
  const [itemAnalysisOpened, setItemAnalysisOpened] = useState(false);
  const [proficiencyOpened, setProficiencyOpened] = useState(false);
  const [proficiencyLevelTableOpened, setProficiencyLevelTableOpened] = useState(false);
  const [laemplTableOpened, setLaemplTableOpened] = useState(false);
  const [mplOpened, setMplOpened] = useState(false);
  const [collapsibleStateReady, setCollapsibleStateReady] = useState(false);
  const [collapsibleInitialized, setCollapsibleInitialized] = useState(false);
  const SUBJECT_CLEARED_SENTINEL = "__CLEARED__";
  const subjectStorageKey = useMemo(
    () =>
      selectedSectionId != null
        ? `assessment-reports:selected-subject:section:${selectedSectionId}`
        : null,
    [selectedSectionId],
  );
  const collapsibleStorageKey = useMemo(
    () =>
      selectedSectionId != null
        ? `assessment-reports:collapsible-state:section:${selectedSectionId}`
        : null,
    [selectedSectionId],
  );
  const maleProficiencyRows = useMemo(
    () => proficiencyRows.filter((row) => row.sex === "Male"),
    [proficiencyRows],
  );
  const femaleProficiencyRows = useMemo(
    () => proficiencyRows.filter((row) => row.sex === "Female"),
    [proficiencyRows],
  );

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

  const sectionOptions = useMemo(() => {
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
  }, [cards, selectedGradeId]);

  useEffect(() => {
    if (sectionOptions.length === 0) {
      setSelectedSectionId(null);
      return;
    }
    const hasCurrent =
      selectedSectionId != null &&
      sectionOptions.some((option) => Number(option.value) === selectedSectionId);
    if (hasCurrent) return;

    const queryMatch =
      Number.isFinite(sectionParam) &&
      sectionOptions.some((option) => Number(option.value) === sectionParam)
        ? sectionParam
        : null;
    setSelectedSectionId(queryMatch ?? Number(sectionOptions[0].value));
  }, [sectionOptions, selectedSectionId, sectionParam]);

  useEffect(() => {
    let mounted = true;
    const loadSubjects = async () => {
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
  }, [selectedSectionId]);

  const availableExamCards = useMemo(() => {
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
  }, [cards, examParam, selectedGradeId, selectedSectionId, selectedSubject]);

  useEffect(() => {
    setSubjectHydrated(false);
    setSubjectClearedByUser(false);
    setSelectedSubject(null);
  }, [selectedSectionId]);

  useEffect(() => {
    if (
      selectedSubject &&
      !sectionSubjectOptions.some((option) => option.value === selectedSubject)
    ) {
      setSelectedSubject(null);
    }
  }, [selectedSubject, sectionSubjectOptions]);

  useEffect(() => {
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

    if (subjectStorageKey && typeof window !== "undefined" && !isFirstSectionLoadRef.current) {
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
    isFirstSectionLoadRef.current = false;

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

  // Phase 1: restore from sessionStorage when section changes (resets to closed first).
  useEffect(() => {
    setCollapsibleStateReady(false);
    setCollapsibleInitialized(false);
    setDetailsOpened(false);
    setProficiencyOpened(false);
    setMplOpened(false);
    setItemAnalysisOpened(false);
    setProficiencyLevelTableOpened(false);
    setLaemplTableOpened(false);

    if (!collapsibleStorageKey || typeof window === "undefined") {
      setCollapsibleStateReady(true);
      return;
    }
    try {
      const raw = window.sessionStorage.getItem(collapsibleStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, string>;
        setDetailsOpened(parsed.details === "1");
        setProficiencyOpened(parsed.proficiency === "1");
        setMplOpened(parsed.mpl === "1");
        setItemAnalysisOpened(parsed.itemAnalysis === "1");
        setProficiencyLevelTableOpened(parsed.proficiencyLevel === "1");
        setLaemplTableOpened(parsed.laempl === "1");
      }
    } catch { /* ignore malformed */ }
    setCollapsibleStateReady(true);
  }, [collapsibleStorageKey]);

  // Phase 2: open all on first visit (no stored state for this section).
  useEffect(() => {
    if (!collapsibleStateReady || collapsibleInitialized) return;
    const hasStored =
      collapsibleStorageKey != null &&
      typeof window !== "undefined" &&
      window.sessionStorage.getItem(collapsibleStorageKey) !== null;
    if (!hasStored) {
      setDetailsOpened(true);
      setProficiencyOpened(true);
      setMplOpened(true);
      setItemAnalysisOpened(true);
      setProficiencyLevelTableOpened(true);
      setLaemplTableOpened(true);
    }
    setCollapsibleInitialized(true);
  }, [collapsibleStateReady, collapsibleInitialized, collapsibleStorageKey]);

  // Save all states to sessionStorage after initialization.
  useEffect(() => {
    if (!collapsibleInitialized || !collapsibleStorageKey || typeof window === "undefined") return;
    window.sessionStorage.setItem(
      collapsibleStorageKey,
      JSON.stringify({
        details: detailsOpened ? "1" : "0",
        proficiency: proficiencyOpened ? "1" : "0",
        mpl: mplOpened ? "1" : "0",
        itemAnalysis: itemAnalysisOpened ? "1" : "0",
        proficiencyLevel: proficiencyLevelTableOpened ? "1" : "0",
        laempl: laemplTableOpened ? "1" : "0",
      }),
    );
  }, [
    collapsibleInitialized,
    collapsibleStorageKey,
    detailsOpened,
    proficiencyOpened,
    mplOpened,
    itemAnalysisOpened,
    proficiencyLevelTableOpened,
    laemplTableOpened,
  ]);

  const examOptions = useMemo(() => {
    return availableExamCards.map((card) => ({
      value: `${card.examId}-${card.sectionId}`,
      label: card.title,
    }));
  }, [availableExamCards]);

  useEffect(() => {
    if (examOptions.length === 0) {
      setSelectedKey(null);
      return;
    }
    const hasCurrent =
      selectedKey != null && examOptions.some((option) => option.value === selectedKey);
    if (hasCurrent) return;

    const queryMatch =
      Number.isFinite(examParam) &&
      Number.isFinite(sectionParam) &&
      examOptions.some((option) => option.value === `${examParam}-${sectionParam}`)
        ? `${examParam}-${sectionParam}`
        : null;

    setSelectedKey(queryMatch ?? examOptions[0].value);
  }, [examOptions, selectedKey, examParam, sectionParam]);

  const selectedCard = useMemo(() => {
    if (!selectedKey) return null;
    return (
      availableExamCards.find(
        (card) => `${card.examId}-${card.sectionId}` === selectedKey,
      ) ?? null
    );
  }, [availableExamCards, selectedKey]);

  useEffect(() => {
    let mounted = true;
    const loadSummary = async () => {
      if (!selectedCard) {
        setSummary(null);
        return;
      }

      setSummaryLoading(true);
      try {
        const latestScores = await fetchLatestScoresForAssignments(selectedCard.assignmentIds);
        if (!mounted) return;
        setSummary(computeExamDetailsSummary(selectedCard.totalItems, latestScores));
      } finally {
        if (mounted) setSummaryLoading(false);
      }
    };
    void loadSummary();
    return () => {
      mounted = false;
    };
  }, [selectedCard]);

  useEffect(() => {
    let mounted = true;
    const loadProficiencyRows = async () => {
      if (!selectedCard || !selectedSubject || !selectedCard.isFinalized) {
        setProficiencyRows([]);
        return;
      }

      setProficiencyLoading(true);
      try {
        const rows = await fetchProficiencyRowsForAssignments(
          selectedCard.assignmentIds,
          selectedCard.totalItems,
        );
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
  }, [selectedCard, selectedSubject]);

  useEffect(() => {
    let mounted = true;
    const loadItemAnalysis = async () => {
      if (!selectedCard || !selectedSubject || !selectedCard.isFinalized) {
        setItemAnalysis({ rows: [], topMostLearned: [], topLeastLearned: [] });
        return;
      }
      setItemAnalysisLoading(true);
      try {
        const summary = await fetchItemAnalysisSummary(
          selectedCard.examId,
          selectedCard.assignmentIds,
          selectedCard.totalItems,
        );
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
  }, [selectedCard, selectedSubject]);

  useEffect(() => {
    if (activeTab === "item_analysis") {
      setItemAnalysisOpened(true);
    }
  }, [activeTab]);

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
    if (selectedSectionId == null) return "Section";
    const hit = sectionOptions.find(
      (option) => Number(option.value) === selectedSectionId,
    );
    return hit?.label ?? "Section";
  })();
  const detailHref =
    Number.isFinite(initialGradeLevelId) && Number.isFinite(initialSectionId)
      ? `/assessment-reports/report-details/${initialGradeLevelId}/${initialSectionId}`
      : "/assessment-reports";
  const backLabel =
    detailHref === "/assessment-reports"
      ? "Back to Assessment Reports"
      : "Back to Report Details";
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-bold mb-4 text-[#597D37]">Report Analytics</h1>
        <BackButton href={detailHref} size="sm" mb="md">
          {backLabel}
        </BackButton>
        <Text size="lg" fw={700} c="black">
          {selectedGradeLabel} - {selectedSectionLabel}
        </Text>
      </div>

      <Group mb="md" align="flex-end" gap="sm">
        <Select
          placeholder="Select subjects"
          data={sectionSubjectOptions}
          value={selectedSubject}
          onChange={(value) => {
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
          disabled={sectionSubjectOptions.length === 0}
          clearable
          nothingFoundMessage="No Data available"
        />
      </Group>

      <div className="space-y-3">
        <SegmentedControl
          fullWidth
          value={activeTab}
          onChange={(value) => setActiveTab(value as typeof activeTab)}
          color="#4EAE4A"
          radius="lg"
          size="md"
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
            },
            label: {
              fontWeight: 700,
              fontSize: 15,
              paddingTop: 8,
              paddingBottom: 8,
            },
            indicator: {
              border: "1px solid #4EAE4A",
            },
          }}
        />

        {activeTab === "exam_results" && (
          <div className="space-y-5 rounded-b-2xl rounded-tr-xl p-4 bg-white -mt-[1px]">
            <ReportsCollapsible
              title="Details"
              subtitle="An examination summary shows the key result metrics for the selected grade, section, and examination."
              opened={detailsOpened}
              onToggle={() => setDetailsOpened((prev) => !prev)}
            >
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
                  <div className="flex flex-wrap gap-3">
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
                  </div>
                  <div className="flex flex-wrap gap-3">
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
            </ReportsCollapsible>

            <ReportsCollapsible
              title="Proficiency Level Obtained"
              subtitle="A proficiency summary shows the level distribution for the selected grade, section, and subject."
              opened={proficiencyOpened}
              onToggle={() => setProficiencyOpened((prev) => !prev)}
            >
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
                <TableScrollContainer minWidth={640} type="native">
                  <Table
                    verticalSpacing="sm"
                    striped={false}
                    highlightOnHover
                    style={{ width: "max-content", minWidth: 640 }}
                  >
                    <TableThead>
                      <TableTr style={{ backgroundColor: "#4EAE4A" }}>
                        <TableTh w={80} ta="center" style={{ color: "#ffffff" }}>
                          No.
                        </TableTh>
                        <TableTh style={{ color: "#ffffff" }}>Name</TableTh>
                        <TableTh w={140} ta="center" style={{ color: "#ffffff" }}>
                          Test Score
                        </TableTh>
                        <TableTh w={120} ta="center" style={{ color: "#ffffff" }}>
                          MPL
                        </TableTh>
                        <TableTh w={240} ta="center" style={{ color: "#ffffff" }}>
                          Proficiency Level Obtained
                        </TableTh>
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
                          <TableTd ta="center">{`${row.testScore}/${row.totalItems}`}</TableTd>
                          <TableTd ta="center">{`${row.mpl.toFixed(2)}%`}</TableTd>
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
                          <TableTd ta="center">{`${row.testScore}/${row.totalItems}`}</TableTd>
                          <TableTd ta="center">{`${row.mpl.toFixed(2)}%`}</TableTd>
                          <TableTd ta="center">{row.proficiencyLevel}</TableTd>
                        </TableTr>
                      ))}

                    </TableTbody>
                  </Table>
                </TableScrollContainer>
              )}
            </ReportsCollapsible>

            <ReportsCollapsible
              title="MPL Results"
              subtitle="An MPL summary shows the minimum proficiency level results for the selected grade, section, and subject."
              opened={mplOpened}
              onToggle={() => setMplOpened((prev) => !prev)}
            >
              {!selectedSubject ? (
                <SectionEmptyState message="Select a subject to view proficiency results." />
              ) : !selectedCard ? (
                <SectionEmptyState message="No Data available." />
              ) : !selectedCard.isFinalized ? (
                <SectionEmptyState message="This examination is not finalized yet. Proficiency results will appear after Proceed to Reports." />
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div>
                    <Text size="xl" fw={700} mb={10} c="#111827">
                      Exceeded MPL (60%)
                    </Text>
                    <TableScrollContainer minWidth={520} type="native">
                    <Table
                      verticalSpacing="sm"
                      striped={false}
                        highlightOnHover
                        style={{ width: "max-content", minWidth: 520 }}
                      >
                        <TableThead>
                          <TableTr style={{ backgroundColor: "#4EAE4A" }}>
                            <TableTh w={120} ta="center" style={{ color: "#ffffff" }}>
                              Group
                            </TableTh>
                            <TableTh w={140} ta="center" style={{ color: "#ffffff" }}>
                              Test Taker
                            </TableTh>
                            <TableTh w={140} ta="center" style={{ color: "#ffffff" }}>
                              Achieved
                            </TableTh>
                            <TableTh w={140} ta="center" style={{ color: "#ffffff" }}>
                              Percentage
                            </TableTh>
                          </TableTr>
                        </TableThead>
                        <TableTbody>
                          {["Male", "Female", "Total"].map((group) => (
                            <TableTr key={`ach-${group}`}>
                              <TableTd ta="center" fw={700}>
                                {group}
                              </TableTd>
                              <TableTd ta="center">No Data available</TableTd>
                              <TableTd ta="center">No Data available</TableTd>
                              <TableTd ta="center">No Data available</TableTd>
                            </TableTr>
                          ))}
                        </TableTbody>
                      </Table>
                    </TableScrollContainer>
                  </div>

                  <div>
                    <Text size="xl" fw={700} mb={10} c="#111827">
                      Failed MPL (30%)
                    </Text>
                    <TableScrollContainer minWidth={520} type="native">
                      <Table
                        verticalSpacing="sm"
                        striped={false}
                        highlightOnHover
                        style={{ width: "max-content", minWidth: 520 }}
                      >
                        <TableThead>
                          <TableTr style={{ backgroundColor: "#4EAE4A" }}>
                            <TableTh w={120} ta="center" style={{ color: "#ffffff" }}>
                              Group
                            </TableTh>
                            <TableTh w={140} ta="center" style={{ color: "#ffffff" }}>
                              Test Taker
                            </TableTh>
                            <TableTh w={140} ta="center" style={{ color: "#ffffff" }}>
                              Failed
                            </TableTh>
                            <TableTh w={140} ta="center" style={{ color: "#ffffff" }}>
                              Percentage
                            </TableTh>
                          </TableTr>
                        </TableThead>
                        <TableTbody>
                          {["Male", "Female", "Total"].map((group) => (
                            <TableTr key={`fail-${group}`}>
                              <TableTd ta="center" fw={700}>
                                {group}
                              </TableTd>
                              <TableTd ta="center">No Data available</TableTd>
                              <TableTd ta="center">No Data available</TableTd>
                              <TableTd ta="center">No Data available</TableTd>
                            </TableTr>
                          ))}
                        </TableTbody>
                      </Table>
                    </TableScrollContainer>
                  </div>
                </div>
              )}
            </ReportsCollapsible>
          </div>
        )}

        {activeTab === "item_analysis" && (
          <div className="rounded-b-2xl rounded-tr-xl p-4 bg-white -mt-[1px]">
            <ReportsCollapsible
              title="Item Analysis"
              subtitle="An item analysis summary shows the most learned and least learned items for the selected grade, section, and subject."
              opened={itemAnalysisOpened}
              onToggle={() => setItemAnalysisOpened((prev) => !prev)}
            >
              {!selectedSubject ? (
                <SectionEmptyState message="Select a subject to view proficiency results." />
              ) : !selectedCard ? (
                <SectionEmptyState message="No Data available." />
              ) : !selectedCard.isFinalized ? (
                <SectionEmptyState message="This examination is not finalized yet. Proficiency results will appear after Proceed to Reports." />
              ) : (
                <Stack gap="md">
                  <TableScrollContainer minWidth={640} type="native">
                    <Table
                      verticalSpacing="sm"
                      striped={false}
                      highlightOnHover
                      style={{ width: "max-content", minWidth: 640 }}
                    >
                      <TableThead>
                        <TableTr style={{ backgroundColor: "#4EAE4A" }}>
                          <TableTh w={120} ta="center" style={{ color: "#ffffff" }}>
                            Item No.
                          </TableTh>
                          <TableTh w={220} ta="center" style={{ color: "#ffffff" }}>
                            Correct Responses
                          </TableTh>
                          <TableTh w={120} ta="center" style={{ color: "#ffffff" }}>
                            Rank
                          </TableTh>
                        </TableTr>
                      </TableThead>
                      <TableTbody>
                        {itemAnalysisLoading ? (
                          <TableTr>
                            <TableTd colSpan={3}>
                              <Skeleton height={28} radius="sm" />
                            </TableTd>
                          </TableTr>
                        ) : itemAnalysis.rows.length === 0 ? (
                          <TableTr>
                            <TableTd colSpan={3} ta="center">
                              <Text size="sm" c="dimmed">
                                No Data available.
                              </Text>
                            </TableTd>
                          </TableTr>
                        ) : (
                          itemAnalysis.rows.map((row) => (
                            <TableTr key={`row-${row.itemNo}`}>
                              <TableTd ta="center">{row.itemNo}</TableTd>
                              <TableTd ta="center">{row.correctResponses}</TableTd>
                              <TableTd ta="center">{row.rank}</TableTd>
                            </TableTr>
                          ))
                        )}
                      </TableTbody>
                    </Table>
                  </TableScrollContainer>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div>
                      <Text size="sm" fw={700} mb={6}>
                        Top 5 Most Learned
                      </Text>
                      <TableScrollContainer minWidth={420} type="native">
                      <Table
                        verticalSpacing="sm"
                        striped={false}
                        highlightOnHover
                        style={{ width: "max-content", minWidth: 420 }}
                      >
                        <TableThead>
                          <TableTr style={{ backgroundColor: "#4EAE4A" }}>
                            <TableTh w={90} ta="center" style={{ color: "#ffffff" }}>
                              Rank
                            </TableTh>
                            <TableTh w={120} ta="center" style={{ color: "#ffffff" }}>
                              Item No.
                            </TableTh>
                            <TableTh style={{ color: "#ffffff" }}>Objectives</TableTh>
                          </TableTr>
                        </TableThead>
                        <TableTbody>
                          {itemAnalysisLoading ? (
                            <TableTr>
                              <TableTd colSpan={3}>
                                <Skeleton height={28} radius="sm" />
                              </TableTd>
                            </TableTr>
                          ) : itemAnalysis.topMostLearned.length === 0 ? (
                            <TableTr>
                              <TableTd colSpan={3} ta="center">
                                <Text size="sm" c="dimmed">
                                  No Data available.
                                </Text>
                              </TableTd>
                            </TableTr>
                          ) : (
                            itemAnalysis.topMostLearned.map((row) => (
                              <TableTr key={`most-${row.itemNo}`}>
                                <TableTd ta="center">{row.rank}</TableTd>
                                <TableTd ta="center">{row.itemNo}</TableTd>
                                <TableTd>{row.objective}</TableTd>
                              </TableTr>
                            ))
                          )}
                        </TableTbody>
                      </Table>
                      </TableScrollContainer>
                    </div>

                    <div>
                      <Text size="sm" fw={700} mb={6}>
                        Top 5 Least Learned
                      </Text>
                      <TableScrollContainer minWidth={420} type="native">
                      <Table
                        verticalSpacing="sm"
                        striped={false}
                        highlightOnHover
                        style={{ width: "max-content", minWidth: 420 }}
                      >
                        <TableThead>
                          <TableTr style={{ backgroundColor: "#4EAE4A" }}>
                            <TableTh w={90} ta="center" style={{ color: "#ffffff" }}>
                              Rank
                            </TableTh>
                            <TableTh w={120} ta="center" style={{ color: "#ffffff" }}>
                              Item No.
                            </TableTh>
                            <TableTh style={{ color: "#ffffff" }}>Objectives</TableTh>
                          </TableTr>
                        </TableThead>
                        <TableTbody>
                          {itemAnalysisLoading ? (
                            <TableTr>
                              <TableTd colSpan={3}>
                                <Skeleton height={28} radius="sm" />
                              </TableTd>
                            </TableTr>
                          ) : itemAnalysis.topLeastLearned.length === 0 ? (
                            <TableTr>
                              <TableTd colSpan={3} ta="center">
                                <Text size="sm" c="dimmed">
                                  No Data available.
                                </Text>
                              </TableTd>
                            </TableTr>
                          ) : (
                            itemAnalysis.topLeastLearned.map((row) => (
                              <TableTr key={`least-${row.itemNo}`}>
                                <TableTd ta="center">{row.rank}</TableTd>
                                <TableTd ta="center">{row.itemNo}</TableTd>
                                <TableTd>{row.objective}</TableTd>
                              </TableTr>
                            ))
                          )}
                        </TableTbody>
                      </Table>
                      </TableScrollContainer>
                    </div>
                  </div>
                </Stack>
              )}
            </ReportsCollapsible>
          </div>
        )}

        {activeTab === "proficiency_mpl" && (
          <div className="rounded-b-2xl rounded-tr-xl p-4 bg-white -mt-[1px] space-y-6">
            <ReportsCollapsible
              title="Proficiency Level"
              subtitle="This section shows the proficiency level matrix."
              opened={proficiencyLevelTableOpened}
              onToggle={() => setProficiencyLevelTableOpened((prev) => !prev)}
            >
              {!selectedSubject ? (
                <SectionEmptyState message="Select a subject to view proficiency results." />
              ) : !selectedCard ? (
                <SectionEmptyState message="No Data available." />
              ) : !selectedCard.isFinalized ? (
                <SectionEmptyState message="This examination is not finalized yet. Proficiency results will appear after Proceed to Reports." />
              ) : (
                <TableScrollContainer minWidth={920} type="native">
                  <Table
                    verticalSpacing={0}
                    striped={false}
                    style={{ width: "100%", minWidth: 920, borderCollapse: "collapse" }}
                  >
                    <TableThead>
                      <TableTr style={{ backgroundColor: "#E8E7CE" }}>
                        <TableTh colSpan={3} ta="center" style={{ border: "1px solid #b5b8be" }}>
                          Number of Highly Proficient Learners
                        </TableTh>
                        <TableTh colSpan={3} ta="center" style={{ border: "1px solid #b5b8be" }}>
                          Number of Proficient Learners
                        </TableTh>
                        <TableTh colSpan={3} ta="center" style={{ border: "1px solid #b5b8be" }}>
                          Number of Nearly Proficient Learners
                        </TableTh>
                        <TableTh colSpan={3} ta="center" style={{ border: "1px solid #b5b8be" }}>
                          Number of Low Proficient Learners
                        </TableTh>
                        <TableTh colSpan={3} ta="center" style={{ border: "1px solid #b5b8be" }}>
                          Number of Not Proficient Learners
                        </TableTh>
                        <TableTh rowSpan={2} ta="center" style={{ border: "1px solid #b5b8be" }}>
                          OVER ALL
                        </TableTh>
                      </TableTr>
                      <TableTr style={{ backgroundColor: "#F2F2F2" }}>
                        {Array.from({ length: 5 }).flatMap((_, i) => [
                          <TableTh key={`m-${i}`} ta="center" style={{ border: "1px solid #b5b8be" }}>
                            Male
                          </TableTh>,
                          <TableTh key={`f-${i}`} ta="center" style={{ border: "1px solid #b5b8be" }}>
                            Female
                          </TableTh>,
                          <TableTh key={`t-${i}`} ta="center" style={{ border: "1px solid #b5b8be" }}>
                            Total
                          </TableTh>,
                        ])}
                      </TableTr>
                    </TableThead>
                    <TableTbody>
                      <TableTr>
                        <TableTd
                          colSpan={16}
                          ta="center"
                          style={{ border: "1px solid #b5b8be", color: "#6B7280", padding: "10px 8px" }}
                        >
                          No Data available
                        </TableTd>
                      </TableTr>
                    </TableTbody>
                  </Table>
                </TableScrollContainer>
              )}
            </ReportsCollapsible>

            <ReportsCollapsible
              title="Learners Who Attained or Exceeded"
              subtitle="This section shows the LAEMPL matrix."
              opened={laemplTableOpened}
              onToggle={() => setLaemplTableOpened((prev) => !prev)}
            >
              {!selectedSubject ? (
                <SectionEmptyState message="Select a subject to view proficiency results." />
              ) : !selectedCard ? (
                <SectionEmptyState message="No Data available." />
              ) : !selectedCard.isFinalized ? (
                <SectionEmptyState message="This examination is not finalized yet. Proficiency results will appear after Proceed to Reports." />
              ) : (
                <TableScrollContainer minWidth={920} type="native">
                  <Table
                    verticalSpacing={0}
                    striped={false}
                    style={{ width: "100%", minWidth: 920, borderCollapse: "collapse" }}
                  >
                    <TableThead>
                      <TableTr style={{ backgroundColor: "#E8E7CE" }}>
                        <TableTh colSpan={3} ta="center" style={{ border: "1px solid #b5b8be" }}>
                          Number of Enrolled Learners
                        </TableTh>
                        <TableTh colSpan={3} ta="center" style={{ border: "1px solid #b5b8be" }}>
                          Number of Test Takers
                        </TableTh>
                        <TableTh colSpan={3} ta="center" style={{ border: "1px solid #b5b8be" }}>
                          Number of Learners who attained or exceeded the Minimum Proficiency
                          Level (60%)
                        </TableTh>
                        <TableTh colSpan={3} ta="center" style={{ border: "1px solid #b5b8be" }}>
                          Percentage of LAEMPL
                        </TableTh>
                        <TableTh rowSpan={2} ta="center" style={{ border: "1px solid #b5b8be" }}>
                          MEAN
                        </TableTh>
                        <TableTh rowSpan={2} ta="center" style={{ border: "1px solid #b5b8be" }}>
                          MPS
                        </TableTh>
                      </TableTr>
                      <TableTr style={{ backgroundColor: "#F2F2F2" }}>
                        {Array.from({ length: 4 }).flatMap((_, i) => [
                          <TableTh key={`laempl-m-${i}`} ta="center" style={{ border: "1px solid #b5b8be" }}>
                            Male
                          </TableTh>,
                          <TableTh key={`laempl-f-${i}`} ta="center" style={{ border: "1px solid #b5b8be" }}>
                            Female
                          </TableTh>,
                          <TableTh key={`laempl-t-${i}`} ta="center" style={{ border: "1px solid #b5b8be" }}>
                            Total
                          </TableTh>,
                        ])}
                      </TableTr>
                    </TableThead>
                    <TableTbody>
                      <TableTr>
                        <TableTd
                          colSpan={14}
                          ta="center"
                          style={{ border: "1px solid #b5b8be", color: "#6B7280", padding: "10px 8px" }}
                        >
                          No Data available
                        </TableTd>
                      </TableTr>
                    </TableTbody>
                  </Table>
                </TableScrollContainer>
              )}
            </ReportsCollapsible>
          </div>
        )}
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
