"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Accordion,
  ActionIcon,
  Badge,
  Box,
  Card,
  Divider,
  Group,
  Pagination,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconCheck, IconList, IconRefresh, IconUsers } from "@tabler/icons-react";
import { SearchBar } from "@/components/searchBar/SearchBar";
import EmptySearchState from "@/components/EmptySearchState";
import { fetchGradeLevels } from "@/lib/services/gradeLevelService";
import type { GradeLevel } from "@/lib/exam-supabase";
import {
  fetchReportSubjectCards,
  type ReportSubjectCard,
} from "@/lib/services/reportsAnalysisService";

type GradeGroup = {
  gradeLevelId: number;
  gradeLabel: string;
  cards: ReportSubjectCard[];
  accordionValue: string;
};

const CARDS_PAGE_SIZE = 4;
const SSES_COLOR = "#70A2FF";

function SubjectNameWithSsesDot({
  name,
  isSses,
}: {
  name: string;
  isSses: boolean;
}) {
  return (
    <Text fw={550} size="lg" lineClamp={2} style={{ minWidth: 0 }}>
      {name}
      {isSses && (
        <Box
          component="span"
          aria-label="SSES subject"
          style={{
            display: "inline-block",
            width: 9,
            height: 9,
            borderRadius: 999,
            backgroundColor: SSES_COLOR,
            marginLeft: 6,
            verticalAlign: "middle",
          }}
        />
      )}
    </Text>
  );
}

function StatusBadge({ isFinalized }: { isFinalized: boolean }) {
  return (
    <Badge color={isFinalized ? "green" : "red"} variant="light">
      {isFinalized ? "Finalized" : "Not Finalized"}
    </Badge>
  );
}

export default function SubjectReportsBrowser() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState<ReportSubjectCard[]>([]);
  const [gradeLevels, setGradeLevels] = useState<GradeLevel[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [gradeLevelFilter, setGradeLevelFilter] = useState<number | null>(null);
  const [openGradeGroups, setOpenGradeGroups] = useState<string[]>([]);
  const [pageMap, setPageMap] = useState<Map<string, number>>(new Map());

  const loadData = async () => {
    setLoading(true);
    try {
      const [nextCards, nextGradeLevels] = await Promise.all([
        fetchReportSubjectCards(),
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
      const haystack = `${card.subjectName} ${card.gradeDisplayName} ${card.sectionNames.join(
        " ",
      )} ${card.teacherNames.join(" ")}`.toLowerCase();
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
      cards: searchableCards.filter((card) => card.gradeLevelId === grade.grade_level_id),
      accordionValue: `grade-${grade.grade_level_id}`,
    }));
  }, [gradeLevels, searchableCards, gradeLevelFilter]);

  const visibleOpenGradeGroups = useMemo(() => {
    const valid = new Set(groupedCards.map((group) => group.accordionValue));
    return openGradeGroups.filter((value) => valid.has(value));
  }, [groupedCards, openGradeGroups]);

  useEffect(() => {
    setPageMap((prev) => {
      let changed = false;
      const next = new Map(prev);
      const validGroups = new Set(groupedCards.map((group) => group.accordionValue));

      for (const key of next.keys()) {
        if (!validGroups.has(key)) {
          next.delete(key);
          changed = true;
        }
      }

      for (const group of groupedCards) {
        const totalPages = Math.max(1, Math.ceil(group.cards.length / CARDS_PAGE_SIZE));
        const currentPage = next.get(group.accordionValue) ?? 1;
        if (currentPage > totalPages) {
          next.set(group.accordionValue, totalPages);
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [groupedCards]);

  const totalVisibleCards = groupedCards.reduce((sum, group) => sum + group.cards.length, 0);

  if (loading) {
    return (
      <Stack gap="md">
        {[3, 2].map((count, idx) => (
          <Box key={idx} style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
            <Box px="md" py="sm" style={{ backgroundColor: "#f3f4f6" }}>
              <Skeleton height={18} width={90} radius="sm" />
            </Box>
            <Box p="sm">
              <SimpleGrid cols={{ base: 1, sm: 2, md: 3, xl: 4 }} spacing="sm">
                {Array.from({ length: count }).map((_, i) => (
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
          Subject Reports{" "}
          <span className="text-[#808898] text-xl font-semibold">({totalVisibleCards})</span>
        </h1>
        <p className="mb-3 text-sm text-[#808898]">Monitor assessment reports by subject</p>
      </div>

      <Group mb="md" wrap="nowrap" align="flex-end" gap="sm">
        <SearchBar
          id="search-subject-reports"
          placeholder="Search subjects..."
          ariaLabel="Search subjects"
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
            aria-label="Refresh subject reports"
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
          onChange={(value) => setGradeLevelFilter(value ? Number(value) : null)}
          leftSection={<IconList size={16} />}
          w={220}
          clearable
        />
      </Group>

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
                <Text fw={700} size="md">{group.gradeLabel}</Text>
                <Text span size="sm" c="dimmed" fw={500}>({group.cards.length})</Text>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              {group.cards.length === 0 ? (
                <div className="px-1 py-1">
                  <EmptySearchState title="No subjects found." description="Try adjusting your search or filters." />
                </div>
              ) : (
                <>
                  <SimpleGrid cols={{ base: 1, sm: 2, md: 3, xl: 4 }} p={{ base: 0, sm: "xs" }} spacing={{ base: "sm", sm: "md" }}>
                    {group.cards
                      .slice(
                        ((pageMap.get(group.accordionValue) ?? 1) - 1) * CARDS_PAGE_SIZE,
                        (pageMap.get(group.accordionValue) ?? 1) * CARDS_PAGE_SIZE,
                      )
                      .map((card) => (
                        <Card
                          key={`${card.gradeLevelId}-${card.subjectId}`}
                          shadow="sm"
                          padding="lg"
                          radius="md"
                          withBorder
                          onClick={() => router.push(`/assessment-reports/subject-details/${card.gradeLevelId}/${card.subjectId}`)}
                          style={{ cursor: "pointer", display: "flex", flexDirection: "column" }}
                        >
                          <Group justify="space-between" mt="md" mb="xs" align="flex-start" wrap="nowrap">
                            <Box style={{ flex: 1, minWidth: 0 }}>
                              <SubjectNameWithSsesDot
                                name={card.subjectName}
                                isSses={card.subjectType === "SSES"}
                              />
                            </Box>
                            <StatusBadge isFinalized={card.isFinalized} />
                          </Group>
                          <Divider my="sm" mb="lg" />
                          <Text c="#969696" fw={550} mb="sm">About</Text>
                          <Group mb="xs" gap="xs">
                            <IconUsers size={16} color="gray" />
                            <Text size="sm">Sections: {card.sectionCount}</Text>
                          </Group>
                          <Group mb="xs" gap="xs">
                            <IconCheck size={16} color="gray" />
                            <Text size="sm">Finalized: {card.finalizedSections}/{card.sectionCount}</Text>
                          </Group>
                        </Card>
                      ))}
                  </SimpleGrid>
                  {group.cards.length > CARDS_PAGE_SIZE && (
                    <Group justify="center" mt="sm">
                      <Pagination
                        total={Math.ceil(group.cards.length / CARDS_PAGE_SIZE)}
                        value={pageMap.get(group.accordionValue) ?? 1}
                        onChange={(page) =>
                          setPageMap((prev) =>
                            new Map(prev).set(group.accordionValue, page),
                          )
                        }
                        size="sm"
                        color="#4EAE4A"
                      />
                    </Group>
                  )}
                </>
              )}
            </Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion>
    </div>
  );
}
