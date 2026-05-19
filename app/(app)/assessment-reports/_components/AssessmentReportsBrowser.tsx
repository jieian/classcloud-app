"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Accordion,
  ActionIcon,
  Box,
  Card,
  Divider,
  Group,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  IconList,
  IconRefresh,
  IconSchool,
  IconUsers,
} from "@tabler/icons-react";
import { SearchBar } from "@/components/searchBar/SearchBar";
import EmptySearchState from "@/components/EmptySearchState";
import { fetchGradeLevels } from "@/lib/services/gradeLevelService";
import type { GradeLevel } from "@/lib/exam-supabase";
import {
  fetchReportSectionCards,
  type ReportSectionCard,
} from "@/lib/services/reportsAnalysisService";
import type { ReportInitData } from "@/app/(app)/assessment-reports/_lib/reportServerService";

type GradeGroup = {
  gradeLevelId: number;
  gradeLabel: string;
  levelNumber: number;
  cards: ReportSectionCard[];
  accordionValue: string;
};

interface AssessmentReportsBrowserProps {
  initialGradeLevelId?: number | null;
  initialData?: ReportInitData;
}

export default function AssessmentReportsBrowser({
  initialGradeLevelId = null,
  initialData,
}: AssessmentReportsBrowserProps) {
  const OPEN_GROUPS_STORAGE_KEY = "assessment-reports:open-grade-groups:v2";
  const GRADE_FILTER_STORAGE_KEY = "assessment-reports:grade-filter";
  const SEARCH_STORAGE_KEY = "assessment-reports:search-query";
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryGrade = Number(searchParams.get("gradeLevelId"));
  const gradeQuery = Number.isFinite(initialGradeLevelId)
    ? Number(initialGradeLevelId)
    : queryGrade;

  const [loading, setLoading] = useState(!initialData);
  const [cards, setCards] = useState<ReportSectionCard[]>(initialData?.sectionCards ?? []);
  const [gradeLevels, setGradeLevels] = useState<GradeLevel[]>(initialData?.gradeLevels ?? []);
  const [searchQuery, setSearchQuery] = useState("");
  const [gradeLevelFilter, setGradeLevelFilter] = useState<number | null>(null);
  const [openGradeGroups, setOpenGradeGroups] = useState<string[]>([]);
  const [restoredFromSession, setRestoredFromSession] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [nextCards, nextGradeLevels] = await Promise.all([
        fetchReportSectionCards(),
        fetchGradeLevels(),
      ]);
      setCards(nextCards);
      setGradeLevels(nextGradeLevels);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!initialData) void loadData();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || restoredFromSession) return;

    const storedSearch = window.sessionStorage.getItem(SEARCH_STORAGE_KEY);
    if (storedSearch != null) {
      setSearchQuery(storedSearch);
    }

    const storedGradeFilter = window.sessionStorage.getItem(GRADE_FILTER_STORAGE_KEY);
    if (
      storedGradeFilter &&
      storedGradeFilter !== "null" &&
      storedGradeFilter.trim() !== ""
    ) {
      const parsed = Number(storedGradeFilter);
      if (Number.isFinite(parsed) && parsed > 0) {
        setGradeLevelFilter(parsed);
      }
    } else if (Number.isFinite(gradeQuery)) {
      setGradeLevelFilter(gradeQuery);
    }

    const storedOpenGroups = window.sessionStorage.getItem(OPEN_GROUPS_STORAGE_KEY);
    if (storedOpenGroups) {
      try {
        const parsed = JSON.parse(storedOpenGroups) as unknown;
        if (Array.isArray(parsed)) {
          const values = parsed.filter(
            (value): value is string => typeof value === "string",
          );
          const hasNewFormat = values.some((value) => value.startsWith("grade-"));
          if (hasNewFormat) {
            setOpenGradeGroups(values);
          }
        }
      } catch {
        // Ignore malformed session storage data and continue with defaults.
      }
    }
    setRestoredFromSession(true);
  }, [gradeQuery, restoredFromSession]);

  useEffect(() => {
    if (!restoredFromSession) return;
    if (!Number.isFinite(gradeQuery)) return;
    if (gradeLevelFilter != null) return;
    if (gradeLevels.some((grade) => grade.grade_level_id === gradeQuery)) {
      setGradeLevelFilter(gradeQuery);
    }
  }, [gradeLevels, gradeQuery, gradeLevelFilter, restoredFromSession]);

  useEffect(() => {
    if (gradeLevelFilter == null) return;
    const isValid = gradeLevels.some(
      (grade) => grade.grade_level_id === gradeLevelFilter,
    );
    if (!isValid) {
      setGradeLevelFilter(null);
    }
  }, [gradeLevelFilter, gradeLevels]);

  const gradeOptions = useMemo(
    () =>
      gradeLevels.map((grade) => ({
        value: String(grade.grade_level_id),
        label: grade.display_name,
      })),
    [gradeLevels],
  );

  const searchableCards = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return cards;
    return cards.filter((card) => {
      const subjects = card.subjectNames.join(" ");
      const haystack = `${card.sectionName} ${card.gradeDisplayName} ${subjects}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [cards, searchQuery]);

  const groupedCards = useMemo<GradeGroup[]>(() => {
    const selectedGrades =
      gradeLevelFilter == null
        ? gradeLevels
        : gradeLevels.filter((grade) => grade.grade_level_id === gradeLevelFilter);

    return selectedGrades.map((grade) => ({
      gradeLevelId: grade.grade_level_id,
      gradeLabel: grade.display_name,
      levelNumber: grade.level_number,
      cards: searchableCards.filter((card) => card.gradeLevelId === grade.grade_level_id),
      accordionValue: `grade-${grade.grade_level_id}`,
    }));
  }, [gradeLevels, searchableCards, gradeLevelFilter]);

  const visibleOpenGradeGroups = useMemo(() => {
    const validGroupValues = new Set(groupedCards.map((group) => group.accordionValue));
    return openGradeGroups.filter((value) => validGroupValues.has(value));
  }, [groupedCards, openGradeGroups]);


  useEffect(() => {
    if (typeof window === "undefined" || !restoredFromSession) return;
    window.sessionStorage.setItem(SEARCH_STORAGE_KEY, searchQuery);
  }, [searchQuery, restoredFromSession]);

  useEffect(() => {
    if (typeof window === "undefined" || !restoredFromSession) return;
    if (gradeLevelFilter == null) {
      window.sessionStorage.setItem(GRADE_FILTER_STORAGE_KEY, "null");
      return;
    }
    window.sessionStorage.setItem(GRADE_FILTER_STORAGE_KEY, String(gradeLevelFilter));
  }, [gradeLevelFilter, restoredFromSession]);

  useEffect(() => {
    if (typeof window === "undefined" || !restoredFromSession) return;
    window.sessionStorage.setItem(OPEN_GROUPS_STORAGE_KEY, JSON.stringify(openGradeGroups));
  }, [openGradeGroups, restoredFromSession]);


  const totalVisibleCards = groupedCards.reduce((sum, group) => sum + group.cards.length, 0);

  if (loading) {
    return (
      <Stack gap="md">
        {[
          { widthLabel: 72, cards: 4 },
          { widthLabel: 56, cards: 2 },
        ].map((group, gi) => (
          <Box
            key={gi}
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            <Box px="md" py="sm" style={{ backgroundColor: "#f3f4f6" }}>
              <Group gap="xs">
                <Skeleton height={18} width={group.widthLabel} radius="sm" />
                <Skeleton height={14} width={28} radius="sm" />
              </Group>
            </Box>
            <Box p="sm">
              <SimpleGrid cols={{ base: 1, sm: 2, md: 3, xl: 4 }} spacing="sm">
                {Array.from({ length: group.cards }).map((_, i) => (
                  <Skeleton key={i} height={170} radius="md" />
                ))}
              </SimpleGrid>
            </Box>
          </Box>
        ))}
      </Stack>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-bold text-[#597D37]">
          Assessment Reports{" "}
          <span className="text-[#808898] text-xl font-semibold">({totalVisibleCards})</span>
        </h1>
        <p className="mb-3 text-sm text-[#808898]">Manage and track all assessment reports</p>
      </div>

      <div>
        <Group mb="md" wrap="nowrap" align="flex-end" gap="sm">
          <SearchBar
            id="search-item-analysis-sections"
            placeholder="Search sections..."
            ariaLabel="Search sections"
            style={{ flex: 1, minWidth: 0 }}
            maw={700}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.currentTarget.value)}
          />
          <Tooltip label="Refresh" position="bottom" withArrow>
            <ActionIcon
              variant="outline"
              color="#808898"
              size="lg"
              radius="xl"
              onClick={() => void loadData()}
              loading={loading}
              aria-label="Refresh reports sections"
            >
              <IconRefresh size={18} stroke={1.5} />
            </ActionIcon>
          </Tooltip>
        </Group>

        <Group mb="md" gap="sm">
          <Select
            placeholder="All Grade Levels"
            data={gradeOptions}
            value={gradeLevelFilter != null ? String(gradeLevelFilter) : null}
            onChange={(value) => {
              setGradeLevelFilter(value ? Number(value) : null);
            }}
            leftSection={<IconList size={16} />}
            w={220}
            clearable
          />
        </Group>
      </div>

      {groupedCards.length === 0 ? (
        <Text c="dimmed">No grade levels available yet.</Text>
      ) : (
        <Accordion
          multiple
          value={visibleOpenGradeGroups}
          onChange={setOpenGradeGroups}
          variant="separated"
          styles={{
            control: { backgroundColor: "#e2edff" },
            item: { border: "1px solid #e2edff" },
          }}
        >
          {groupedCards.map((group) => (
            <Accordion.Item key={group.gradeLevelId} value={group.accordionValue}>
              <Accordion.Control>
                <Group gap="xs">
                  <Text fw={700} size="md">
                    {group.gradeLabel}
                  </Text>
                  <Text span size="sm" c="dimmed" fw={500}>
                    ({group.cards.length})
                  </Text>
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                {group.cards.length === 0 ? (
                  <div className="px-1 py-1">
                    <EmptySearchState
                      title="No reports found."
                      description="Try adjusting your search or filters."
                    />
                  </div>
                ) : (
                  <SimpleGrid
                    cols={{ base: 1, sm: 2, md: 3, xl: 4 }}
                    p={{ base: 0, sm: "xs" }}
                    spacing={{ base: "sm", sm: "md" }}
                  >
                    {group.cards.map((card) => (
                      <Card
                        key={card.sectionId}
                        shadow="sm"
                        padding="lg"
                        radius="md"
                        withBorder
                        onClick={() => {
                          router.push(
                            `/assessment-reports/report-details/${card.gradeLevelId}/${card.sectionId}`,
                          );
                        }}
                        style={{ cursor: "pointer", display: "flex", flexDirection: "column" }}
                      >
                        <Group justify="space-between" mt="md" mb="xs" align="flex-start" wrap="nowrap">
                          <Text fw={550} size="lg" lineClamp={2} style={{ flex: 1, minWidth: 0 }}>
                            {card.sectionName}
                          </Text>
                        </Group>

                        <Divider my="sm" mb="lg" />

                        <Text c="#969696" fw={550} mb="sm">
                          About
                        </Text>
                        <Group mb="xs" gap="xs">
                          <IconUsers size={16} color="gray" />
                          <Text size="sm">Examinations: {card.totalExams}</Text>
                        </Group>
                        <Group mb="xs" gap="xs">
                          <IconSchool size={16} color="gray" />
                          <Text size="sm">
                            Finalized: {card.finalizedExams}/{card.totalExams}
                          </Text>
                        </Group>
                      </Card>
                    ))}
                  </SimpleGrid>
                )}
              </Accordion.Panel>
            </Accordion.Item>
          ))}
        </Accordion>
      )}
    </div>
  );
}
