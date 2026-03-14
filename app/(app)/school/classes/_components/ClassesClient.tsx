"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import CreateClassModal from "./CreateClassModal";
import Link from "next/link";
import {
  Accordion,
  Alert,
  Badge,
  Box,
  Button,
  Group,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
} from "@mantine/core";
import {
  IconInfoCircle,
  IconSchool,
  IconArrowsTransferUp,
} from "@tabler/icons-react";
import { useAuth } from "@/context/AuthContext";
import type {
  GradeLevelRow,
  SchoolYearOption,
  SectionCard,
} from "../_lib/classService";
import { fetchPendingTransferCount } from "../_lib/classService";
import ClassCard from "./ClassCard";
import UtilitiesSection from "./UtilitiesSection";

export default function ClassesClient() {
  const { user, roles, permissions } = useAuth();

  // Derived directly from AuthContext — no extra DB round-trips
  const hasCreatePermission = permissions.includes("access_classes_management");
  const isClassAdviser = roles.some(
    (r) => r.name.trim().toLowerCase() === "class adviser",
  );
  const isPartialAccess =
    permissions.includes("partial_access_student_management") &&
    !permissions.includes("access_classes_management") &&
    !permissions.includes("full_access_student_management");

  const canViewTransferRequests =
    permissions.includes("partial_access_student_management") ||
    permissions.includes("full_access_student_management");

  const [schoolYears, setSchoolYears] = useState<SchoolYearOption[]>([]);
  const [gradeLevels, setGradeLevels] = useState<GradeLevelRow[]>([]);
  const [sections, setSections] = useState<SectionCard[]>([]);
  const [assignedSectionIds, setAssignedSectionIds] = useState<Set<number>>(
    new Set(),
  );
  const [selectedSyId, setSelectedSyId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [gradeLevelFilter, setGradeLevelFilter] = useState<number | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [loadingClasses, setLoadingClasses] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingTransferCount, setPendingTransferCount] = useState(0);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const loadClasses = useCallback(async (syId: number) => {
    setLoadingClasses(true);
    setError(null);
    try {
      const res = await fetch(`/api/classes/sections?syId=${syId}`);
      const json = (await res.json()) as {
        sections: SectionCard[];
        assignedSectionIds: number[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Failed to load classes.");
      setSections(json.sections);
      setAssignedSectionIds(new Set(json.assignedSectionIds));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load classes.");
    } finally {
      setLoadingClasses(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;

    async function init() {
      try {
        const [initRes] = await Promise.all([
          fetch("/api/classes/init"),
          // Fetch pending transfer count in parallel (non-blocking)
          canViewTransferRequests
            ? fetchPendingTransferCount()
                .then(setPendingTransferCount)
                .catch(() => {})
            : Promise.resolve(),
        ]);

        const json = (await initRes.json()) as {
          schoolYears: SchoolYearOption[];
          gradeLevels: GradeLevelRow[];
          sections: SectionCard[];
          defaultSyId: number | null;
          assignedSectionIds: number[];
          error?: string;
        };
        if (!initRes.ok) throw new Error(json.error ?? "Failed to initialize.");
        setSchoolYears(json.schoolYears);
        setGradeLevels(json.gradeLevels);
        setSections(json.sections);
        setAssignedSectionIds(new Set(json.assignedSectionIds));
        if (json.defaultSyId) setSelectedSyId(json.defaultSyId);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to initialize.");
      } finally {
        setInitializing(false);
      }
    }

    void init();
  }, [user, canViewTransferRequests]);

  const handleSyChange = useCallback(
    async (syId: number) => {
      setSelectedSyId(syId);
      setGradeLevelFilter(null);
      await loadClasses(syId);
    },
    [loadClasses],
  );

  const handleRefresh = useCallback(() => {
    if (selectedSyId) loadClasses(selectedSyId);
  }, [selectedSyId, loadClasses]);

  const activeSyId = useMemo(
    () => schoolYears.find((y) => y.is_active)?.sy_id ?? null,
    [schoolYears],
  );

  const handleCreateSuccess = useCallback(() => {
    if (activeSyId) {
      setSelectedSyId(activeSyId);
      setGradeLevelFilter(null);
      loadClasses(activeSyId);
    }
  }, [activeSyId, loadClasses]);

  // Client-side filtering
  const filteredSections = useMemo(() => {
    const query = search.toLowerCase().trim();
    return sections.filter((s) => {
      const matchesSearch = !query || s.name.toLowerCase().includes(query);
      const matchesGl =
        !gradeLevelFilter || s.grade_level_id === gradeLevelFilter;
      // Partial-access users only see sections they teach or advise
      const matchesAccess =
        !isPartialAccess ||
        assignedSectionIds.has(s.section_id) ||
        (user && s.adviser_id === user.id);
      return matchesSearch && matchesGl && matchesAccess;
    });
  }, [
    sections,
    search,
    gradeLevelFilter,
    isPartialAccess,
    assignedSectionIds,
    user,
  ]);

  // Current user's advisory section (only relevant if class adviser)
  const advisorySection = useMemo(
    () =>
      isClassAdviser && user
        ? (sections.find((s) => s.adviser_id === user.id) ?? null)
        : null,
    [sections, isClassAdviser, user],
  );

  // Group filtered sections by grade level, SSES first, skip empty groups
  const groupedSections = useMemo(
    () =>
      gradeLevels
        .map((gl) => ({
          ...gl,
          sections: filteredSections
            .filter((s) => s.grade_level_id === gl.grade_level_id)
            .sort((a, b) =>
              a.section_type === b.section_type
                ? 0
                : a.section_type === "SSES"
                  ? -1
                  : 1,
            ),
        }))
        .filter((g) => g.sections.length > 0),
    [gradeLevels, filteredSections],
  );

  return (
    <>
      <Group justify="space-between">
        <h1 className="mb-3 text-2xl font-bold">Classes</h1>
        <Group gap="xs">
          {canViewTransferRequests && (
            <Button
              component={Link}
              href="/school/classes/transfer-requests"
              variant="outline"
              color="#4EAE4A"
              radius="md"
              size="sm"
              leftSection={<IconArrowsTransferUp size={15} />}
              rightSection={
                pendingTransferCount > 0 ? (
                  <Badge size="xs" color="red" variant="filled" circle>
                    {pendingTransferCount > 99 ? "99+" : pendingTransferCount}
                  </Badge>
                ) : undefined
              }
            >
              Transfer Requests
            </Button>
          )}
          {hasCreatePermission && (
            <Button color="#4EAE4A" radius="md" onClick={() => setCreateModalOpen(true)}>
              Create a Class
            </Button>
          )}
        </Group>
      </Group>
      <p className="mb-3 text-sm text-[#808898]">
        A class, or section, is a distinct group of students within a specific
        grade level, organized under a dedicated Class Adviser.
      </p>
      <CreateClassModal
          opened={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          onSuccess={handleCreateSuccess}
          gradeLevels={gradeLevels}
          activeSyId={activeSyId}
        />
        <UtilitiesSection
          schoolYears={schoolYears}
          selectedSyId={selectedSyId}
          onSyChange={handleSyChange}
          gradeLevels={gradeLevels}
          gradeLevelFilter={gradeLevelFilter}
          onGradeLevelChange={setGradeLevelFilter}
          search={search}
          onSearchChange={setSearch}
          onRefresh={handleRefresh}
          loading={loadingClasses}
        />

        {error && (
          <Alert color="red" icon={<IconInfoCircle size={16} />} mb="md">
            {error}
          </Alert>
        )}

        {initializing ? (
          <Stack gap="md">
            <Skeleton height={220} radius="md" />
            <Skeleton height={220} radius="md" />
          </Stack>
        ) : schoolYears.length === 0 ? (
          <Text c="dimmed" ta="center" py="xl">
            No school years found. Please create a school year first.
          </Text>
        ) : (
          <>
            {/* Advisory Class — only visible to users with the Class Adviser role */}
            {isClassAdviser && (
              <Accordion
                multiple
                defaultValue={["advisory"]}
                mb="md"
                variant="separated"
                styles={{
                  control: { backgroundColor: "#f0f7ee" },
                  item: { border: "1px solid #d3e9d0" },
                }}
              >
                <Accordion.Item value="advisory">
                  <Accordion.Control>
                    <Text fw={700} size="md">
                      Advisory Class
                    </Text>
                  </Accordion.Control>
                  <Accordion.Panel>
                    {loadingClasses ? (
                      <SimpleGrid
                        cols={{ base: 1, sm: 2, md: 3, xl: 4 }}
                        p="xs"
                      >
                        <Skeleton height={170} radius="md" />
                      </SimpleGrid>
                    ) : advisorySection ? (
                      <Box p="xs" maw={320}>
                        <ClassCard section={advisorySection} />
                      </Box>
                    ) : (
                      <Stack align="center" py="lg" gap="xs">
                        <IconSchool size={36} color="#c1c2c5" />
                        <Text fw={500} c="dimmed" ta="center">
                          No advisory class assigned
                        </Text>
                        <Text size="sm" c="dimmed" ta="center" maw={380}>
                          You have not been assigned as a class adviser for the
                          selected school year yet.
                        </Text>
                      </Stack>
                    )}
                  </Accordion.Panel>
                </Accordion.Item>
              </Accordion>
            )}

            {/* Grade level groups */}
            {loadingClasses ? (
              <Stack gap="md">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} height={220} radius="md" />
                ))}
              </Stack>
            ) : groupedSections.length === 0 ? (
              <Text c="dimmed" ta="center" py="xl">
                {sections.length === 0
                  ? "No classes found for this school year."
                  : "No classes match your filters."}
              </Text>
            ) : (
              <Accordion
                key={selectedSyId ?? 0}
                multiple
                defaultValue={groupedSections.map((g) =>
                  String(g.grade_level_id),
                )}
                variant="separated"
                styles={{
                  control: { backgroundColor: "#f0f7ee" },
                  item: { border: "1px solid #d3e9d0" },
                }}
              >
                {groupedSections.map((group) => (
                  <Accordion.Item
                    key={group.grade_level_id}
                    value={String(group.grade_level_id)}
                  >
                    <Accordion.Control>
                      <Group gap="xs">
                        <Text fw={700} size="md">
                          {group.display_name}
                        </Text>
                        <Text span size="sm" c="dimmed" fw={500}>
                          ({group.sections.length})
                        </Text>
                      </Group>
                    </Accordion.Control>
                    <Accordion.Panel>
                      <SimpleGrid
                        cols={{ base: 1, sm: 2, md: 3, xl: 4 }}
                        p="xs"
                      >
                        {group.sections.map((section) => (
                          <ClassCard
                            key={section.section_id}
                            section={section}
                          />
                        ))}
                      </SimpleGrid>
                    </Accordion.Panel>
                  </Accordion.Item>
                ))}
              </Accordion>
            )}
          </>
        )}
    </>
  );
}
