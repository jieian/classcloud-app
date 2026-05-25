"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useMediaQuery } from "@mantine/hooks";
import {
  Accordion,
  Alert,
  Badge,
  Box,
  Button,
  Center,
  Group,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  ThemeIcon,
} from "@mantine/core";
import {
  IconArrowsTransferUp,
  IconInfoCircle,
  IconSchool,
  IconShieldLock,
  IconUsersGroup,
} from "@tabler/icons-react";
import { useAuth } from "@/context/AuthContext";
import { notify } from "@/components/notificationIcon/notificationIcon";
import type {
  GradeLevelRow,
  SchoolYearOption,
  SectionCard,
} from "@/lib/services/classService";
import {
  fetchPendingTransferCount,
  fetchUnreadNotificationCount,
} from "@/lib/services/classService";
import EmptySearchState from "@/components/EmptySearchState";
import type { ClassesInitialData } from "../_lib/classesServerService";
import ClassCard from "./ClassCard";
import ClassesSkeleton from "./ClassesSkeleton";
import UtilitiesSection from "./UtilitiesSection";

interface Props {
  initialData?: ClassesInitialData | null;
}

function ClassesAccordionEmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Center py={28} px="md">
      <Stack gap={10} align="center">
        <ThemeIcon
          size={48}
          radius="xl"
          color="gray.2"
          variant="filled"
          mb="sm"
        >
          <IconUsersGroup size={28} stroke={1.5} color="#3D4147" />
        </ThemeIcon>
        <Stack gap={4} align="center">
          <Text size="md" fw={700} c="#111827">
            {title}
          </Text>
          <Text size="sm" c="dimmed" ta="center" maw={380}>
            {description}
          </Text>
        </Stack>
      </Stack>
    </Center>
  );
}

export default function ClassesClient({ initialData }: Props = {}) {
  const { user, permissions } = useAuth();
  const isMobile = useMediaQuery("(max-width: 768px)");

  const canViewTransferRequests =
    permissions.includes("students.limited_access") ||
    permissions.includes("students.full_access");
  const canSwitchView =
    permissions.includes("classes.full_access") ||
    permissions.includes("students.full_access");

  const [schoolYears, setSchoolYears] = useState<SchoolYearOption[]>(
    () => initialData?.schoolYears ?? [],
  );
  const [gradeLevels, setGradeLevels] = useState<GradeLevelRow[]>(
    () => initialData?.gradeLevels ?? [],
  );
  const [sections, setSections] = useState<SectionCard[]>(
    () => initialData?.sections ?? [],
  );
  const [assignedSectionIds, setAssignedSectionIds] = useState<Set<number>>(
    () => new Set(initialData?.assignedSectionIds ?? []),
  );
  const [selectedSyId, setSelectedSyId] = useState<number | null>(
    () => initialData?.defaultSyId ?? null,
  );
  const [search, setSearch] = useState("");
  const [gradeLevelFilter, setGradeLevelFilter] = useState<number | null>(null);
  const [initializing, setInitializing] = useState(() => !initialData);
  const [loadingClasses, setLoadingClasses] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingTransferCount, setPendingTransferCount] = useState(0);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [viewTransitioning, setViewTransitioning] = useState(false);
  const [viewMode, setViewMode] = useState<"admin" | "faculty">(() => {
    if (typeof window === "undefined") return "admin";
    return localStorage.getItem("classesViewMode") === "faculty"
      ? "faculty"
      : "admin";
  });
  const initDoneRef = useRef(!!initialData);
  const adminSelectedSyIdRef = useRef<number | null>(null);
  const hasSearchQuery = search.trim().length > 0;

  const isAdmin = permissions.includes("students.full_access");
  const isAdviser =
    permissions.includes("students.limited_access") &&
    !permissions.includes("students.full_access");
  const effectiveViewMode = canSwitchView ? viewMode : "faculty";
  const isAdminView = effectiveViewMode === "admin";

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

    if (isAdmin) {
      fetchPendingTransferCount()
        .then(setPendingTransferCount)
        .catch(() => {});
    }
    if (isAdviser) {
      fetchUnreadNotificationCount()
        .then(setUnreadNotifCount)
        .catch(() => {});
    }

    if (initDoneRef.current) return;
    initDoneRef.current = true;

    async function init() {
      try {
        const initRes = await fetch("/api/classes/init");
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
  }, [user, isAdmin, isAdviser]);

  useEffect(() => {
    if (!canSwitchView || typeof window === "undefined") return;
    localStorage.setItem("classesViewMode", viewMode);
  }, [canSwitchView, viewMode]);

  const handleSyChange = useCallback(
    async (syId: number) => {
      setSelectedSyId(syId);
      setGradeLevelFilter(null);
      await loadClasses(syId);
    },
    [loadClasses],
  );

  const handleRefresh = useCallback(() => {
    if (selectedSyId) {
      void loadClasses(selectedSyId);
    }
  }, [selectedSyId, loadClasses]);

  const activeSyId = useMemo(
    () => schoolYears.find((year) => year.is_active)?.sy_id ?? null,
    [schoolYears],
  );

  const facultySyId = activeSyId ?? initialData?.defaultSyId ?? selectedSyId;

  const handleViewChange = useCallback(
    async (nextViewMode: "admin" | "faculty") => {
      if (!canSwitchView || nextViewMode === effectiveViewMode) return;

      const switchingToFaculty = nextViewMode === "faculty";

      if (switchingToFaculty) {
        adminSelectedSyIdRef.current = selectedSyId;
      }

      setViewTransitioning(true);
      setViewMode(nextViewMode);
      setGradeLevelFilter(null);

      const nextSyId = switchingToFaculty
        ? facultySyId
        : (adminSelectedSyIdRef.current ?? selectedSyId ?? facultySyId);

      try {
        if (nextSyId && nextSyId !== selectedSyId) {
          setSelectedSyId(nextSyId);
          await loadClasses(nextSyId);
        }

        notify({
          mode: switchingToFaculty ? "facultyView" : "adminView",
        });
      } finally {
        setViewTransitioning(false);
      }
    },
    [
      canSwitchView,
      effectiveViewMode,
      facultySyId,
      loadClasses,
      selectedSyId,
    ],
  );

  const isClassAdviser = useMemo(
    () => !!user && sections.some((section) => section.adviser_id === user.id),
    [sections, user],
  );

  const advisorySection = useMemo(
    () =>
      user
        ? (sections.find((section) => section.adviser_id === user.id) ?? null)
        : null,
    [sections, user],
  );

  const assignedSections = useMemo(
    () =>
      sections.filter((section) => assignedSectionIds.has(section.section_id)),
    [assignedSectionIds, sections],
  );

  const visibleSections = useMemo(
    () => (isAdminView ? sections : assignedSections),
    [assignedSections, isAdminView, sections],
  );

  const visibleGradeLevels = useMemo(() => {
    if (isAdminView) return gradeLevels;

    const handledGradeLevelIds = new Set(
      assignedSections.map((section) => section.grade_level_id),
    );

    return gradeLevels.filter((gradeLevel) =>
      handledGradeLevelIds.has(gradeLevel.grade_level_id),
    );
  }, [assignedSections, gradeLevels, isAdminView]);

  const filteredSections = useMemo(() => {
    const query = search.toLowerCase().trim();
    return visibleSections.filter((section) => {
      const matchesSearch =
        !query || section.name.toLowerCase().includes(query);
      const matchesGradeLevel =
        !gradeLevelFilter || section.grade_level_id === gradeLevelFilter;
      return matchesSearch && matchesGradeLevel;
    });
  }, [gradeLevelFilter, search, visibleSections]);

  const gradeLevelsForAccordion = useMemo(() => {
    const gradeLevelsInScope = gradeLevelFilter
      ? visibleGradeLevels.filter(
          (gradeLevel) => gradeLevel.grade_level_id === gradeLevelFilter,
        )
      : visibleGradeLevels;

    if (!hasSearchQuery) return gradeLevelsInScope;

    const matchingGradeLevelIds = new Set(
      filteredSections.map((section) => section.grade_level_id),
    );

    return gradeLevelsInScope.filter((gradeLevel) =>
      matchingGradeLevelIds.has(gradeLevel.grade_level_id),
    );
  }, [filteredSections, gradeLevelFilter, hasSearchQuery, visibleGradeLevels]);

  const showGradeLevelFilter = isAdminView || visibleGradeLevels.length > 1;
  const isFiltering = hasSearchQuery || gradeLevelFilter !== null;

  useEffect(() => {
    if (!gradeLevelFilter) return;

    const gradeStillVisible = visibleGradeLevels.some(
      (gradeLevel) => gradeLevel.grade_level_id === gradeLevelFilter,
    );
    if (!gradeStillVisible) {
      setGradeLevelFilter(null);
    }
  }, [gradeLevelFilter, visibleGradeLevels]);

  const groupedSections = useMemo(
    () =>
      gradeLevelsForAccordion.map((gradeLevel) => ({
        ...gradeLevel,
        sections: filteredSections
          .filter(
            (section) => section.grade_level_id === gradeLevel.grade_level_id,
          )
          .sort((a, b) =>
            a.section_type === b.section_type
              ? 0
              : a.section_type === "SSES"
                ? -1
                : 1,
          ),
      })),
    [filteredSections, gradeLevelsForAccordion],
  );

  const openAccordionItems = useMemo(
    () => groupedSections.map((group) => String(group.grade_level_id)),
    [groupedSections],
  );

  const switchViewControl = canSwitchView ? (
    <Stack gap={6} w={isMobile ? "100%" : "auto"}>
      <Box
        role="tablist"
        aria-label="Classes view mode"
        style={{
          position: "relative",
          display: "flex",
          width: isMobile ? "100%" : 300,
          height: isMobile ? 42 : 46,
          fontFamily: "Arial, Helvetica, sans-serif",
          padding: 4,
          background: "#f1f3f5",
          border: "1px solid #e9ecef",
          borderRadius: 9999,
          boxShadow: "inset 0 1px 2px rgba(0,0,0,0.04)",
        }}
      >
        <Box
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 4,
            bottom: 4,
            width: "calc(50% - 4px)",
            left: isAdminView ? "calc(50% + 2px)" : "4px",
            borderRadius: 9999,
            zIndex: 1,
            background: isAdminView
              ? "linear-gradient(180deg, #5578b7 0%, #4A72AE 100%)"
              : "linear-gradient(180deg, #31982d 0%, #298925 100%)",
            boxShadow: isAdminView
              ? "0 2px 8px rgba(74, 114, 174, 0.22), 0 1px 2px rgba(0,0,0,0.05)"
              : "0 2px 8px rgba(41, 137, 37, 0.22), 0 1px 2px rgba(0,0,0,0.05)",
            transition: "all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
          }}
        />

        <button
          type="button"
          role="tab"
          aria-selected={!isAdminView}
          onClick={() => void handleViewChange("faculty")}
          disabled={!isAdminView || viewTransitioning}
          style={{
            position: "relative",
            zIndex: 2,
            flex: 1,
            border: "none",
            background: "transparent",
            fontSize: 13,
            fontWeight: isAdminView ? 600 : 700,
            letterSpacing: "0.2px",
            color: isAdminView ? "#868e96" : "#ffffff",
            cursor:
              !isAdminView || viewTransitioning ? "default" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            transition: "color 0.35s ease",
            borderRadius: 9999,
            textShadow: "none",
          }}
        >
          <IconSchool size={15} stroke={1.5} />
          <span>Faculty</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={isAdminView}
          onClick={() => void handleViewChange("admin")}
          disabled={isAdminView || viewTransitioning}
          style={{
            position: "relative",
            zIndex: 2,
            flex: 1,
            border: "none",
            background: "transparent",
            fontSize: 13,
            fontWeight: isAdminView ? 700 : 600,
            letterSpacing: "0.2px",
            color: isAdminView ? "#ffffff" : "#868e96",
            cursor: isAdminView || viewTransitioning ? "default" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            transition: "color 0.35s ease",
            borderRadius: 9999,
            textShadow: "none",
          }}
        >
          <IconShieldLock size={15} stroke={1.5} />
          <span>Admin</span>
        </button>
      </Box>
      {viewTransitioning && (
        <Group gap="xs" align="center">
          <Skeleton height={10} radius="xl" w={90} />
          <Text size="xs" c="dimmed">
            Updating class view...
          </Text>
        </Group>
      )}
    </Stack>
  ) : null;

  const transferRequestsButton = canViewTransferRequests ? (
    <Button
      component={Link}
      href="/school/classes/transfer-requests"
      variant="outline"
      color="#4EAE4A"
      radius="md"
      size={isMobile ? "sm" : "sm"}
      px={isMobile ? "md" : undefined}
      style={isMobile ? { flexShrink: 0 } : undefined}
      leftSection={<IconArrowsTransferUp size={15} />}
      rightSection={(() => {
        const count = isAdmin ? pendingTransferCount : unreadNotifCount;
        return count > 0 ? (
          <Badge size="xs" color="red" variant="filled" circle>
            {count > 99 ? "99+" : count}
          </Badge>
        ) : undefined;
      })()}
    >
      Transfer Requests
    </Button>
  ) : null;

  return (
    <>
      {isMobile ? (
        <>
          <Group justify="space-between" align="center" mb="xs" wrap="nowrap">
            <h1 className="text-2xl font-bold text-[#597D37] mb-0 leading-tight">
              Classes
            </h1>
            {transferRequestsButton}
          </Group>
          <p className="mb-3 text-sm text-[#808898]">
            A class, or section, is a distinct group of students within a
            specific grade level, organized under a dedicated Class Adviser.
          </p>
          {switchViewControl && <Box mb="md">{switchViewControl}</Box>}
        </>
      ) : (
        <Box className="relative mb-3">
          <div className="pr-60">
            <h1 className="text-2xl md:text-3xl font-bold text-[#597D37] mb-3">
              Classes
            </h1>
            <p className="text-sm text-[#808898]">
              A class, or section, is a distinct group of students within a
              specific grade level, organized under a dedicated Class Adviser.
            </p>
          </div>
          <Stack gap="md" align="flex-end" className="absolute right-0 top-0">
            {switchViewControl}
            {transferRequestsButton}
          </Stack>
        </Box>
      )}
      <UtilitiesSection
        schoolYears={schoolYears}
        selectedSyId={selectedSyId}
        onSyChange={handleSyChange}
        gradeLevels={visibleGradeLevels}
        gradeLevelFilter={gradeLevelFilter}
        onGradeLevelChange={setGradeLevelFilter}
        search={search}
        onSearchChange={setSearch}
        onRefresh={handleRefresh}
        loading={loadingClasses}
        showSchoolYearFilter={isAdminView}
        showGradeLevelFilter={showGradeLevelFilter}
      />

      {error && (
        <Alert color="red" icon={<IconInfoCircle size={16} />} mb="md">
          {error}
        </Alert>
      )}

      {viewTransitioning && !loadingClasses && (
        <Box mb="md">
          <Skeleton height={18} radius="xl" w={180} mb="xs" />
          <Skeleton height={84} radius="md" />
        </Box>
      )}

      {initializing ? (
        <ClassesSkeleton />
      ) : schoolYears.length === 0 ? (
        <Text c="dimmed" ta="center" py="xl">
          No school years found. Please create a school year first.
        </Text>
      ) : !isAdminView && visibleGradeLevels.length === 0 && !isClassAdviser ? (
        <ClassesAccordionEmptyState
          title="No classes found."
          description="There are no faculty-handled classes available for the active school year."
        />
      ) : (
        <>
          {!isAdminView &&
            isClassAdviser &&
            !hasSearchQuery &&
            (loadingClasses ? (
              <Box
                mb="md"
                style={{
                  border: "1px solid #d3e9d0",
                  borderRadius: 8,
                  overflow: "hidden",
                }}
              >
                <Box px="md" py="sm" style={{ backgroundColor: "#f0f7ee" }}>
                  <Text fw={700} size="md" c="#1f2937">
                    Advisory Class
                  </Text>
                </Box>
                <Box p="sm">
                  <SimpleGrid
                    cols={{ base: 1, sm: 2, md: 3, xl: 4 }}
                    spacing={{ base: "sm", sm: "md" }}
                  >
                    <Skeleton height={170} radius="md" maw={320} />
                  </SimpleGrid>
                </Box>
              </Box>
            ) : (
              <Accordion
                multiple
                defaultValue={["advisory"]}
                mb="md"
                variant="separated"
              styles={{
                control: {
                  backgroundColor: "#d8ebd4",
                  color: "#1f2937",
                  transition: "background-color 0.5s ease, color 0.3s ease",
                },
                item: {
                  border: "1px solid #bfd7b8",
                  transition: "border-color 0.5s ease",
                },
                chevron: { color: "#1f2937" },
              }}
              >
                <Accordion.Item value="advisory">
                  <Accordion.Control>
                    <Text fw={700} size="md" c="#1f2937">
                      Advisory Class
                    </Text>
                  </Accordion.Control>
                  <Accordion.Panel>
                    {advisorySection ? (
                      <Box p="xs" maw={320}>
                        <ClassCard section={advisorySection} />
                      </Box>
                    ) : (
                      <ClassesAccordionEmptyState
                        title="No advisory class assigned."
                        description="You have not been assigned as a class adviser for the selected school year yet."
                      />
                    )}
                  </Accordion.Panel>
                </Accordion.Item>
              </Accordion>
            ))}

          {loadingClasses ? (
            <ClassesSkeleton />
          ) : isFiltering && filteredSections.length === 0 ? (
            <EmptySearchState />
          ) : groupedSections.length === 0 ? (
            <ClassesAccordionEmptyState
              title="No classes found."
              description="There are no classes available for the selected view."
            />
          ) : (
            <Accordion
              key={`${effectiveViewMode}-${selectedSyId ?? 0}-${openAccordionItems.join("-")}`}
              multiple
              defaultValue={openAccordionItems}
              variant="separated"
              styles={{
                control: {
                  backgroundColor: isAdminView ? "#e2edff" : "#f0f7ee",
                  color: "#1f2937",
                  transition: "background-color 0.5s ease, color 0.3s ease",
                },
                item: {
                  border: isAdminView
                    ? "1px solid #e2edff"
                    : "1px solid #d3e9d0",
                  transition: "border-color 0.5s ease",
                },
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
                    {group.sections.length === 0 ? (
                      <ClassesAccordionEmptyState
                        title={`No classes in ${group.display_name}.`}
                        description="No classes are currently available for this grade level."
                      />
                    ) : (
                      <SimpleGrid
                        cols={{ base: 1, sm: 2, md: 3, xl: 4 }}
                        p={{ base: 0, sm: "xs" }}
                        spacing={{ base: "sm", sm: "md" }}
                      >
                        {group.sections.map((section) => (
                          <ClassCard
                            key={section.section_id}
                            section={section}
                          />
                        ))}
                      </SimpleGrid>
                    )}
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
