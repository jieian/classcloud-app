"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Accordion,
  ActionIcon,
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

type GradeGroup = {
  gradeLevelId: number;
  gradeLabel: string;
  levelNumber: number;
  cards: ReportSectionCard[];
  accordionValue: string;
};

interface AssessmentReportsBrowserProps {
  initialGradeLevelId?: number | null;
}

export default function AssessmentReportsBrowser({
  initialGradeLevelId = null,
}: AssessmentReportsBrowserProps) {
  const OPEN_GROUPS_STORAGE_KEY = "assessment-reports:open-grade-groups";
  const GRADE_FILTER_STORAGE_KEY = "assessment-reports:grade-filter";
  const SEARCH_STORAGE_KEY = "assessment-reports:search-query";
  const LAST_GRADE_FOCUS_STORAGE_KEY = "assessment-reports:last-grade-focus";
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryGrade = Number(searchParams.get("gradeLevelId"));
  const gradeQuery = Number.isFinite(initialGradeLevelId)
    ? Number(initialGradeLevelId)
    : queryGrade;

  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState<ReportSectionCard[]>([]);
  const [gradeLevels, setGradeLevels] = useState<GradeLevel[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [gradeLevelFilter, setGradeLevelFilter] = useState<number | null>(null);
  const [openGradeGroups, setOpenGradeGroups] = useState<string[]>([]);
  const [restoredFromSession, setRestoredFromSession] = useState(false);
  const [hasStoredOpenGroups, setHasStoredOpenGroups] = useState(false);

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
    void loadData();
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
            setHasStoredOpenGroups(true);
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
    if (!restoredFromSession) return;
    if (hasStoredOpenGroups) return;
    if (groupedCards.length === 0) return;
    if (openGradeGroups.length > 0) return;
    setOpenGradeGroups(groupedCards.map((group) => group.accordionValue));
  }, [groupedCards, hasStoredOpenGroups, openGradeGroups.length, restoredFromSession]);

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

  useEffect(() => {
    if (typeof window === "undefined" || !restoredFromSession) return;
    if (openGradeGroups.length === 0) return;
    const lastOpened = openGradeGroups[openGradeGroups.length - 1];
    if (lastOpened) {
      window.sessionStorage.setItem(LAST_GRADE_FOCUS_STORAGE_KEY, lastOpened);
    }
  }, [openGradeGroups, restoredFromSession]);

  useEffect(() => {
    if (typeof window === "undefined" || !restoredFromSession) return;
    if (groupedCards.length === 0) return;
    const lastGradeValue = window.sessionStorage.getItem(LAST_GRADE_FOCUS_STORAGE_KEY);
    if (!lastGradeValue) return;

    const exists = groupedCards.some((group) => group.accordionValue === lastGradeValue);
    if (!exists) {
      return;
    }

    setOpenGradeGroups((prev) =>
      prev.includes(lastGradeValue) ? prev : [...prev, lastGradeValue],
    );
  }, [groupedCards, restoredFromSession]);

  const totalVisibleCards = groupedCards.reduce((sum, group) => sum + group.cards.length, 0);

  if (loading) {
    return (
      <Stack gap="md">
        <Skeleton height={26} width={240} radius="sm" />
        <Skeleton height={18} width={260} radius="sm" />
        <Skeleton height={40} radius="sm" />
        <Skeleton height={180} radius="sm" />
      </Stack>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="mb-3 text-2xl font-bold">
          Assessment Reports <span className="text-[#808898]">({totalVisibleCards})</span>
        </h1>
        <p className="mb-3 text-sm text-[#808898]">Manage and track all examinations</p>
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
                          if (typeof window !== "undefined") {
                            window.sessionStorage.setItem(
                              LAST_GRADE_FOCUS_STORAGE_KEY,
                              group.accordionValue,
                            );
                          }
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
