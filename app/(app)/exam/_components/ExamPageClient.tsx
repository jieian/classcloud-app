"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Title,
  Text,
  Card,
  Select,
  Button,
  Badge,
  Group,
  Tooltip,
  Stack,
  SimpleGrid,
  Accordion,
  ActionIcon,
  Menu,
  Skeleton,
  Alert,
  Divider,
  Modal,
  TextInput,
  Pagination,
} from "@mantine/core";
import {
  IconPlus,
  IconFileText,
  IconDownload,
  IconTrash,
  IconAlertCircle,
  IconRefreshDot,
  IconRefresh,
  IconSchool,
  IconSettings,
  IconUsers,
  IconBook,
  IconKey,
  IconBinoculars,
} from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import CreateAnswerKeyModal from "@/components/CreateAnswerKeyModal";

import { generateAnswerSheetPdf } from "@/lib/services/examPdfService";
import {
  fetchExamsWithRelations,
  setExamLocked,
  deleteExamWithAssignments,
} from "@/lib/services/examService";
import type { ExamWithRelations } from "@/lib/exam-supabase";
import { useAuth } from "@/context/AuthContext";
import { fetchTeacherClassAssignments, fetchSchoolYears } from "@/lib/services/classService";
import { fetchActiveQuarters } from "@/lib/services/quarterService";
import { SearchBar } from "@/components/searchBar/SearchBar";
import NoActivePeriodBanner from "@/components/NoActivePeriodBanner";

export default function ExamPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, permissions, loading: authLoading, firstName, lastName } =
    useAuth();
  const [exams, setExams] = useState<ExamWithRelations[]>([]);
  const [filteredExams, setFilteredExams] = useState<ExamWithRelations[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGradeLevel, setSelectedGradeLevel] = useState<string | null>(
    null,
  );
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [isAnswerKeyModalOpen, setIsAnswerKeyModalOpen] = useState(false);
  const [selectedExam, setSelectedExam] = useState<ExamWithRelations | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<number | null>(null);
  const [deleteOpened, setDeleteOpened] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [examToDelete, setExamToDelete] = useState<ExamWithRelations | null>(
    null,
  );

  /** Exam ID to highlight after creation flow completes */
  const [newlyCreatedExamIds, setNewlyCreatedExamIds] = useState<Set<number>>(
    new Set(),
  );
  const [highlightExpiring, setHighlightExpiring] = useState(false);
  const [pageMap, setPageMap] = useState<Map<string, number>>(new Map());
  const PAGE_SIZE = 3;
  const [openMenuExamId, setOpenMenuExamId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<"admin" | "faculty">(() => {
    if (typeof window === "undefined") return "admin";
    return localStorage.getItem("examViewMode") === "faculty" ? "faculty" : "admin";
  });
  const fetchSectionIdsRef = useRef<number[] | undefined>(undefined);

  // Handle ?newExamIds= short-lived highlight persisted in localStorage
  useEffect(() => {
    const HIGHLIGHT_MS = 20 * 1000;
    const FADE_BEFORE_MS = 8 * 1000;
    const STORAGE_KEY = "examHighlight";

    // If new exams were just created, record all IDs with an expiry timestamp
    const newIds = searchParams.get("newExamIds");
    if (newIds) {
      const examIds = newIds.split(",").map(Number).filter((n) => !isNaN(n));
      if (examIds.length > 0) {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ examIds, expiresAt: Date.now() + HIGHLIGHT_MS }),
        );
      }
      const url = new URL(window.location.href);
      url.searchParams.delete("newExamIds");
      window.history.replaceState({}, "", url.toString());
    }

    // Restore highlight from storage (covers page reload / navigation back)
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const { examIds, expiresAt } = JSON.parse(raw) as {
        examIds: number[];
        expiresAt: number;
      };
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) {
        localStorage.removeItem(STORAGE_KEY);
        return;
      }

      setNewlyCreatedExamIds(new Set(examIds));
      setHighlightExpiring(remaining <= FADE_BEFORE_MS);

      const fadeDelay = remaining - FADE_BEFORE_MS;
      const fadeTimer =
        fadeDelay > 0
          ? setTimeout(() => setHighlightExpiring(true), fadeDelay)
          : null;

      const clearTimer = setTimeout(() => {
        setNewlyCreatedExamIds(new Set());
        setHighlightExpiring(false);
        localStorage.removeItem(STORAGE_KEY);
      }, remaining);

      return () => {
        if (fadeTimer) clearTimeout(fadeTimer);
        clearTimeout(clearTimer);
      };
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasFullAccess = permissions.includes("exams.full_access");

  // Allowed section/subject IDs for teachers with partial access (null = no filter)
  const [allowedSectionIds, setAllowedSectionIds] =
    useState<Set<number> | null>(null);
  const [allowedCurriculumSubjectIds, setAllowedCurriculumSubjectIds] =
    useState<Set<number> | null>(null);
  const [assignedSectionSubjectPairs, setAssignedSectionSubjectPairs] =
    useState<Set<string>>(new Set());

  // Admin with teaching load can switch between views; others stay in their natural view.
  // effectiveFullAccess is false when an admin opts into Faculty View.
  const showViewToggle =
    hasFullAccess && allowedSectionIds !== null && allowedSectionIds.size > 0;
  const effectiveFullAccess = hasFullAccess && viewMode === "admin";

  // In admin view: no section/subject filter (see all). In faculty view: restrict to assigned.
  const effectiveAllowedSectionIds = effectiveFullAccess ? null : allowedSectionIds;
  const effectiveAllowedCurriculumSubjectIds = effectiveFullAccess
    ? null
    : allowedCurriculumSubjectIds;

  const [hasActiveSchoolYear, setHasActiveSchoolYear] = useState(false);
  const [hasActiveTerm, setHasActiveTerm] = useState(false);

  const fetchExams = async (sectionIds?: number[]) => {
    fetchSectionIdsRef.current = sectionIds;
    setLoading(true);
    setDbError(null);
    try {
      const data = await fetchExamsWithRelations(sectionIds);
      setExams(data);
    } catch (error: unknown) {
      setDbError(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const refetchExams = () => fetchExams(fetchSectionIdsRef.current);

  useEffect(() => {
    if (authLoading) return;

    const isEffectiveFullAccess =
      permissions.includes("exams.full_access") && viewMode === "admin";

    setLoading(true);
    setDbError(null);

    const init = async () => {
      const [years, quarters, assignments] = await Promise.all([
        fetchSchoolYears(),
        fetchActiveQuarters(),
        user?.id ? fetchTeacherClassAssignments(user.id) : Promise.resolve([]),
      ]);

      setHasActiveSchoolYear(years.some((y) => y.is_active));
      setHasActiveTerm(quarters.some((q) => q.is_active));

      if (user?.id) {
        const sectionSet = new Set(assignments.map((a) => a.section_id));
        setAllowedSectionIds(sectionSet);
        setAllowedCurriculumSubjectIds(
          new Set(assignments.map((a) => a.curriculum_subject_id)),
        );
        setAssignedSectionSubjectPairs(
          new Set(
            assignments.map((a) => `${a.section_id}-${a.curriculum_subject_id}`),
          ),
        );
        const sectionIds = isEffectiveFullAccess
          ? undefined
          : Array.from(sectionSet);
        fetchExams(sectionIds);
      } else {
        setAllowedSectionIds(null);
        setAllowedCurriculumSubjectIds(null);
        setAssignedSectionSubjectPairs(new Set());
        fetchExams(isEffectiveFullAccess ? undefined : []);
      }
    };

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user?.id, hasFullAccess, viewMode]);

  // Persist view mode so navigation away and back keeps the faculty view active.
  useEffect(() => {
    localStorage.setItem("examViewMode", viewMode);
  }, [viewMode]);

  // Reset to admin view if the user no longer has a teaching load (e.g. load removed mid-session).
  // Guard: allowedSectionIds === null means assignments haven't loaded yet — skip to avoid
  // prematurely resetting a faculty view that was restored from localStorage.
  useEffect(() => {
    if (allowedSectionIds === null) return;
    if (!showViewToggle && viewMode === "faculty") {
      setViewMode("admin");
      localStorage.setItem("examViewMode", "admin");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showViewToggle, allowedSectionIds]);

  const gradeLevelOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const exam of exams) {
      for (const a of exam.exam_assignments ?? []) {
        const sectionId = a.sections?.section_id;
        if (
          effectiveAllowedSectionIds &&
          (sectionId == null || !effectiveAllowedSectionIds.has(sectionId))
        )
          continue;
        const name = a.sections?.grade_levels?.display_name;
        if (name) seen.add(name);
      }
    }
    return Array.from(seen)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
      .map((name) => ({ value: name, label: name }));
  }, [exams, effectiveAllowedSectionIds]);

  const sectionOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const exam of exams) {
      for (const a of exam.exam_assignments ?? []) {
        const sectionId = a.sections?.section_id;
        if (
          effectiveAllowedSectionIds &&
          (sectionId == null || !effectiveAllowedSectionIds.has(sectionId))
        )
          continue;
        if (
          selectedGradeLevel &&
          a.sections?.grade_levels?.display_name !== selectedGradeLevel
        )
          continue;
        const name = a.sections?.name;
        if (name) seen.add(name);
      }
    }
    return Array.from(seen)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
      .map((name) => ({ value: name, label: name }));
  }, [exams, selectedGradeLevel, effectiveAllowedSectionIds]);

  const canDeleteExam = (exam: ExamWithRelations): boolean => {
    if (!exam.curriculum_subject_id) return false;
    if (effectiveFullAccess) return true;
    // Creator can always delete their own exam (covers copies assigned to SSES/cross-type sections)
    if (user?.id && exam.creator_teacher_id === user.id) return true;
    if (assignedSectionSubjectPairs.size === 0) return false;

    const assignmentPairs = new Set(
      (exam.exam_assignments ?? [])
        .map((a) => a.sections?.section_id)
        .filter(
          (sectionId): sectionId is number => typeof sectionId === "number",
        )
        .map((sectionId) => `${sectionId}-${exam.curriculum_subject_id}`),
    );

    for (const pair of assignmentPairs) {
      if (assignedSectionSubjectPairs.has(pair)) return true;
    }
    return false;
  };

  // sectionId → grade level display name (derived from exam assignments already loaded)
  const sectionGradeLevelMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const exam of exams) {
      for (const a of exam.exam_assignments ?? []) {
        const sid = a.sections?.section_id;
        const gl = a.sections?.grade_levels?.display_name;
        if (sid != null && gl) map.set(sid, gl);
      }
    }
    return map;
  }, [exams]);

  // "sectionId-curriculumSubjectId-quarterId" already taken by an existing exam
  const occupiedCombinations = useMemo(() => {
    const set = new Set<string>();
    for (const exam of exams) {
      if (!exam.curriculum_subject_id || !exam.quarter_id) continue;
      for (const a of exam.exam_assignments ?? []) {
        const sid = a.sections?.section_id;
        if (sid != null) set.add(`${sid}-${exam.curriculum_subject_id}-${exam.quarter_id}`);
      }
    }
    return set;
  }, [exams]);

  const isCopyBlocked = (exam: ExamWithRelations): boolean => {
    if (effectiveFullAccess) return false;
    if (!effectiveAllowedSectionIds || effectiveAllowedSectionIds.size === 0) return true;
    const examGradeLevel = exam.exam_assignments?.[0]?.sections?.grade_levels?.display_name;
    if (!examGradeLevel) return false;
    const sourceSectionIds = new Set(
      (exam.exam_assignments ?? [])
        .map((a) => a.sections?.section_id)
        .filter((id): id is number => id != null),
    );
    for (const sid of effectiveAllowedSectionIds) {
      if (sourceSectionIds.has(sid)) continue;
      const gl = sectionGradeLevelMap.get(sid);
      // Unknown grade level → can't confirm blocked, allow copy flow to handle it
      if (!gl) return false;
      if (gl !== examGradeLevel) continue;
      const key = `${sid}-${exam.curriculum_subject_id}-${exam.quarter_id}`;
      if (!occupiedCombinations.has(key)) return false; // at least one eligible section
    }
    return true; // no eligible destination section found
  };

  const subjectOptions = useMemo(() => {
    let filtered = exams;
    if (selectedGradeLevel) {
      filtered = filtered.filter((e) =>
        (e.exam_assignments ?? []).some(
          (a) => a.sections?.grade_levels?.display_name === selectedGradeLevel,
        ),
      );
    }
    return Array.from(
      new Set(
        filtered
          .filter(
            (e) =>
              !effectiveAllowedCurriculumSubjectIds ||
              effectiveAllowedCurriculumSubjectIds.has(e.curriculum_subject_id),
          )
          .map((e) => e.curriculum_subjects?.subjects?.name)
          .filter(Boolean) as string[],
      ),
    )
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
      .map((name) => ({ value: name, label: name }));
  }, [exams, selectedGradeLevel, effectiveAllowedCurriculumSubjectIds]);

  useEffect(() => {
    setSelectedSection(null);
    setSelectedSubject(null);
  }, [selectedGradeLevel]);

  useEffect(() => {
    setSelectedSubject(null);
  }, [selectedSection]);

  useEffect(() => {
    let filtered = [...exams];
    if (searchQuery) {
      filtered = filtered.filter((e) =>
        e.title.toLowerCase().includes(searchQuery.toLowerCase()),
      );
    }
    if (selectedGradeLevel) {
      filtered = filtered.filter((e) =>
        (e.exam_assignments ?? []).some(
          (a) => a.sections?.grade_levels?.display_name === selectedGradeLevel,
        ),
      );
    }
    if (selectedSection) {
      filtered = filtered.filter((e) =>
        (e.exam_assignments ?? []).some(
          (a) => a.sections?.name === selectedSection,
        ),
      );
    }
    if (selectedSubject) {
      filtered = filtered.filter(
        (e) => e.curriculum_subjects?.subjects?.name === selectedSubject,
      );
    }
    setFilteredExams(filtered);
  }, [
    exams,
    searchQuery,
    selectedGradeLevel,
    selectedSection,
    selectedSubject,
  ]);

  const groupedExams = useMemo(() => {
    const groups = new Map<
      string,
      { gradeLabel: string; exams: ExamWithRelations[] }
    >();
    for (const exam of filteredExams) {
      const gl = exam.exam_assignments?.[0]?.sections?.grade_levels;
      const key = gl?.display_name ?? "Unknown";
      if (!groups.has(key)) {
        groups.set(key, {
          gradeLabel: gl?.display_name ?? "Unknown",
          exams: [],
        });
      }
      groups.get(key)!.exams.push(exam);
    }
    return Array.from(groups.values()).sort((a, b) =>
      a.gradeLabel.localeCompare(b.gradeLabel, undefined, {
        sensitivity: "base",
      }),
    );
  }, [filteredExams]);

  const handleStatusChange = async (
    exam: ExamWithRelations,
    newStatus: "active" | "inactive",
  ) => {
    setUpdatingStatus(exam.exam_id);
    const isLocked = newStatus === "inactive";
    const success = await setExamLocked(exam.exam_id, isLocked);
    if (success) {
      setExams((prev) =>
        prev.map((e) =>
          e.exam_id === exam.exam_id ? { ...e, is_locked: isLocked } : e,
        ),
      );
      notifications.show({
        title: "Status updated",
        message: `Exam is now ${newStatus}`,
        color: "green",
      });
    } else {
      notifications.show({
        title: "Status update failed",
        message: "Could not save exam status. Check permissions and try again.",
        color: "red",
      });
      await refetchExams();
    }
    setUpdatingStatus(null);
  };

  const handleDownloadAnswerSheet = async (exam: ExamWithRelations) => {
    const sectionNames = (exam.exam_assignments ?? [])
      .map((a) => a.sections?.name)
      .filter(Boolean)
      .join(", ");
    const generatedBy =
      `${firstName ?? ""} ${lastName ?? ""}`.trim() ||
      user?.email ||
      "Unknown User";
    const pdf = await generateAnswerSheetPdf({
      exam,
      sectionName: sectionNames,
      generatedBy,
    });
    pdf.save(`${exam.title}_AnswerSheet.pdf`);
    notifications.show({
      title: "Downloaded",
      message: "Answer sheet saved to downloads",
      color: "blue",
    });
  };

  const handleOpenDeleteModal = (exam: ExamWithRelations) => {
    setExamToDelete(exam);
    setConfirmText("");
    setDeleteOpened(true);
  };

  const handleCloseDeleteModal = () => {
    if (deleting) return;
    setDeleteOpened(false);
    setExamToDelete(null);
    setConfirmText("");
  };

  const handleDeleteExam = async () => {
    if (!examToDelete) return;
    setDeleting(true);
    const success = await deleteExamWithAssignments(examToDelete.exam_id);
    if (success) {
      notifications.show({
        title: "Examination Deleted",
        message: `${examToDelete.title} has been deleted successfully.`,
        color: "green",
      });
      handleCloseDeleteModal();
      await refetchExams();
    } else {
      notifications.show({
        title: "Delete Failed",
        message: "Unable to delete examination. Please try again.",
        color: "red",
      });
    }
    setDeleting(false);
  };

  return (
    <>
      <div>
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
          <h1 className="mb-3 text-2xl font-bold">
            Examinations{" "}
            {!loading && hasActiveSchoolYear && (
              <span className="text-[#808898]">({filteredExams.length})</span>
            )}
          </h1>
          <Stack gap="xs" align="flex-end">
            {loading ? (
              <Stack gap={4} style={{ alignItems: "flex-end" }}>
                <Text size="xs" c="dimmed">
                  Create Exam
                </Text>
                <Skeleton height={40} width={140} radius="md" />
              </Stack>
            ) : hasActiveSchoolYear && hasActiveTerm ? (
              <Tooltip
                label={
                  "You need to be assigned to at least one class before you can create exams."
                }
                disabled={
                  effectiveFullAccess ||
                  !effectiveAllowedSectionIds ||
                  effectiveAllowedSectionIds.size > 0
                }
                withArrow
                multiline
                w={240}
              >
                <div style={{ display: "inline-block" }}>
                  <Button
                    color="#4EAE4A"
                    radius="md"
                    onClick={() => router.push("/exam/create")}
                    disabled={
                      !effectiveFullAccess &&
                      !!effectiveAllowedSectionIds &&
                      effectiveAllowedSectionIds.size === 0
                    }
                  >
                    Create Exam
                  </Button>
                </div>
              </Tooltip>
            ) : null}
          </Stack>
        </Group>
        <p className="mb-3 text-sm text-[#808898]">
          Manage and track all examinations
        </p>
      </div>

      {/* Error */}
      {dbError && (
        <Alert
          icon={<IconAlertCircle size={16} />}
          title="Database Error"
          color="red"
        >
          {dbError}
          <Button
            size="xs"
            variant="light"
            color="red"
            mt="sm"
            onClick={refetchExams}
          >
            <IconRefreshDot size={14} /> Retry
          </Button>
        </Alert>
      )}

      {!loading && !dbError && (!hasActiveSchoolYear || !hasActiveTerm) ? (
        <NoActivePeriodBanner />
      ) : (
        <>
      {/* Filters */}
	      <div>
	        <Group mb="md" wrap="wrap" align="flex-end" gap="sm">
	          <SearchBar
            id="search-exams"
            placeholder="Search examinations..."
            ariaLabel="Search examinations"
	            style={{ flex: "1 1 260px", minWidth: 0 }}
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
              onClick={refetchExams}
              loading={loading}
              aria-label="Refresh examinations"
            >
              <IconRefresh size={18} stroke={1.5} />
            </ActionIcon>
          </Tooltip>
        </Group>
	        <Group mb="md" gap="sm" wrap="wrap">
	          <Select
            placeholder="Grade Level"
            data={gradeLevelOptions}
            value={selectedGradeLevel}
            onChange={setSelectedGradeLevel}
            leftSection={<IconSchool size={16} />}
	            w={{ base: "100%", sm: 200 }}
            clearable
          />
          <Select
            placeholder="Section"
            data={sectionOptions}
            value={selectedSection}
            onChange={setSelectedSection}
            leftSection={<IconUsers size={16} />}
	            w={{ base: "100%", sm: 200 }}
            clearable
            disabled={sectionOptions.length === 0}
          />
          <Select
            placeholder="Subject"
            data={subjectOptions}
            value={selectedSubject}
            onChange={setSelectedSubject}
            leftSection={<IconBook size={16} />}
	            w={{ base: "100%", sm: 200 }}
            clearable
            disabled={subjectOptions.length === 0}
          />
        </Group>
      </div>

      {/* Content */}
      {loading ? (
        <Stack gap="md">
          {[1, 2].map((i) => (
            <Skeleton key={i} height={180} radius="md" />
          ))}
        </Stack>
      ) : dbError ? null : filteredExams.length === 0 ? (
        <Card padding={60} radius="md" withBorder>
          <Stack align="center">
            <IconFileText size={64} color="gray" stroke={1} />
            <Title order={3} c="dimmed">
              No examinations found
            </Title>
            <Text c="dimmed" size="sm">
              Create your first examination to get started.
            </Text>
          </Stack>
        </Card>
      ) : (
        <Accordion
          multiple
          defaultValue={groupedExams.map((g) => g.gradeLabel)}
          variant="separated"
          styles={{
            control: { backgroundColor: "#f0f7ee" },
            item: { border: "1px solid #d3e9d0" },
          }}
        >
          {groupedExams.map((group) => (
            <Accordion.Item key={group.gradeLabel} value={group.gradeLabel}>
              <Accordion.Control>
                <Group gap="xs">
                  <Text fw={700} size="md">
                    {group.gradeLabel}
                  </Text>
                  <Text span size="sm" c="dimmed" fw={500}>
                    ({group.exams.length})
                  </Text>
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
	                <SimpleGrid cols={{ base: 1, sm: 2, md: 3, xl: 4 }} p={{ base: 0, sm: "xs" }} spacing={{ base: "sm", sm: "md" }}>
                  {group.exams
                    .slice(
                      ((pageMap.get(group.gradeLabel) ?? 1) - 1) * PAGE_SIZE,
                      (pageMap.get(group.gradeLabel) ?? 1) * PAGE_SIZE,
                    )
                    .map((exam) => {
                      const subjectName =
                        exam.curriculum_subjects?.subjects?.name ?? "";
                      const sectionNames = (exam.exam_assignments ?? [])
                        .map((a) => a.sections?.name)
                        .filter(Boolean)
                        .join(", ");
                      const isNew = newlyCreatedExamIds.has(exam.exam_id);
                      return (
                        <Card
                          key={exam.exam_id}
                          shadow="sm"
                          padding="lg"
                          radius="md"
                          withBorder
                          onClick={() => router.push(`/exam/${exam.exam_id}/scan`)}
                          style={{
                            transition:
                              "box-shadow 1.2s ease, border-color 1.2s ease",
                            boxShadow:
                              isNew && !highlightExpiring
                                ? "0 0 0 3px #4EAE4A, 0 8px 24px rgba(70,109,29,0.25)"
                                : undefined,
                            borderColor:
                              isNew && !highlightExpiring
                                ? "#4EAE4A"
                                : undefined,
                            display: "flex",
                            flexDirection: "column",
                            height: "100%",
                            cursor: "pointer",
                          }}
                        >
	                          <Group justify="space-between" mt="md" mb="xs" align="flex-start" wrap="nowrap">
                            <Text
                              fw={550}
                              size="lg"
                              lineClamp={2}
	                              style={{ flex: 1, minWidth: 0 }}
                            >
                              {exam.title}
                            </Text>
                            <Group
                              gap={4}
                              style={{ flexShrink: 0 }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Badge
                                color={exam.is_locked ? "red" : "green"}
                                variant="light"
                              >
                                {exam.is_locked ? "Inactive" : "Active"}
                              </Badge>
                              <Menu
                                shadow="md"
                                width={230}
                                position="bottom-end"
                                withinPortal
                                opened={openMenuExamId === exam.exam_id}
                                onChange={(o) =>
                                  setOpenMenuExamId(o ? exam.exam_id : null)
                                }
                              >
                                <Menu.Target>
                                  <ActionIcon
                                    variant="subtle"
                                    color="gray"
                                    radius="xl"
                                    aria-label="Exam actions"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setOpenMenuExamId(
                                        openMenuExamId === exam.exam_id
                                          ? null
                                          : exam.exam_id,
                                      );
                                    }}
                                  >
                                    <IconSettings size={15} />
                                  </ActionIcon>
                                </Menu.Target>
                                <Menu.Dropdown>
                                  {effectiveFullAccess && (
                                    <>
                                      <Menu.Label>Status</Menu.Label>
                                      <Menu.Item
                                        leftSection={
                                          <IconRefreshDot size={14} />
                                        }
                                        disabled={
                                          updatingStatus === exam.exam_id
                                        }
                                        onClick={() =>
                                          handleStatusChange(
                                            exam,
                                            exam.is_locked
                                              ? "active"
                                              : "inactive",
                                          )
                                        }
                                      >
                                        {exam.is_locked
                                          ? "Set Active"
                                          : "Set Inactive"}
                                      </Menu.Item>
                                      <Menu.Divider />
                                    </>
                                  )}
                                  <Menu.Label>Actions</Menu.Label>
                                  <Menu.Item
                                    leftSection={<IconDownload size={14} />}
                                    onClick={() =>
                                      handleDownloadAnswerSheet(exam)
                                    }
                                  >
                                    Download Answer Sheet
                                  </Menu.Item>
                                  <Menu.Item
                                    leftSection={<IconKey size={14} />}
                                    onClick={() => {
                                      setSelectedExam(exam);
                                      setIsAnswerKeyModalOpen(true);
                                    }}
                                  >
                                    Edit Answer Key
                                  </Menu.Item>
                                  {(() => {
                                    const copyBlocked = isCopyBlocked(exam);
                                    return (
                                      <Tooltip
                                        label="All your sections already have this exam for this term"
                                        disabled={!copyBlocked}
                                        withArrow
                                        multiline
                                        w={220}
                                        position="left"
                                      >
                                        <div>
                                          <Menu.Item
                                            leftSection={<IconPlus size={14} />}
                                            disabled={copyBlocked}
                                            onClick={() => router.push(`/exam/copy/${exam.exam_id}`)}
                                          >
                                            Copy Exam
                                          </Menu.Item>
                                        </div>
                                      </Tooltip>
                                    );
                                  })()}
                                  {canDeleteExam(exam) && (
                                    <>
                                      <Menu.Divider />
                                      <Menu.Item
                                        leftSection={<IconTrash size={14} />}
                                        color="red"
                                        onClick={() =>
                                          handleOpenDeleteModal(exam)
                                        }
                                      >
                                        Delete
                                      </Menu.Item>
                                    </>
                                  )}
                                </Menu.Dropdown>
                              </Menu>
                            </Group>
                          </Group>

                          <Divider my="sm" mb="lg" />

                          <Text c="#969696" fw={550} mb="sm">
                            About
                          </Text>
                          {subjectName && (
                            <Group mb="xs" gap="xs">
                              <IconBook size={16} color="gray" />
                              <Text size="sm">{subjectName}</Text>
                            </Group>
                          )}
                          {sectionNames && (
                            <Group mb="xs" gap="xs">
                              <IconUsers size={16} color="gray" />
                              <Text size="sm">{sectionNames}</Text>
                            </Group>
                          )}
                        </Card>
                      );
                    })}
                </SimpleGrid>
                {group.exams.length > PAGE_SIZE && (
                  <Group justify="center" mt="sm">
                    <Pagination
                      total={Math.ceil(group.exams.length / PAGE_SIZE)}
                      value={pageMap.get(group.gradeLabel) ?? 1}
                      onChange={(page) =>
                        setPageMap((prev) =>
                          new Map(prev).set(group.gradeLabel, page),
                        )
                      }
                      size="sm"
                    />
                  </Group>
                )}
              </Accordion.Panel>
            </Accordion.Item>
          ))}
        </Accordion>
      )}
        </>
      )}

      {isAnswerKeyModalOpen && selectedExam && (
        <CreateAnswerKeyModal
          exam={selectedExam}
          onClose={() => {
            setIsAnswerKeyModalOpen(false);
            setSelectedExam(null);
          }}
          onSuccess={fetchExams}
        />
      )}

      <Modal
        opened={deleteOpened}
        onClose={handleCloseDeleteModal}
        title="Delete Examination"
        centered
        closeOnClickOutside={!deleting}
        closeOnEscape={!deleting}
        withCloseButton={!deleting}
        overlayProps={{ backgroundOpacity: 0.5, blur: 4 }}
      >
        <Text size="sm" mb="md">
          Are you sure you want to delete{" "}
          <Text span fw={700}>
            {examToDelete?.title ?? "this examination"}
          </Text>
          ? This action cannot be undone.
        </Text>
        <Text size="sm" mb="md" c="dimmed">
          Type{" "}
          <Text span fw={700} c="var(--mantine-color-text)">
            delete
          </Text>{" "}
          to confirm.
        </Text>
        <TextInput
          placeholder="Type delete to confirm"
          value={confirmText}
          onChange={(e) => setConfirmText(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              confirmText.toLowerCase() === "delete" &&
              !deleting
            )
              handleDeleteExam();
          }}
          mb="lg"
          disabled={deleting}
        />
        <Group justify="flex-end" wrap="wrap">
          <Button
            variant="default"
            onClick={handleCloseDeleteModal}
            disabled={deleting}
            fullWidth={false}
          >
            Cancel
          </Button>
          <Button
            color="red"
            disabled={confirmText.toLowerCase() !== "delete"}
            loading={deleting}
            onClick={handleDeleteExam}
            fullWidth={false}
          >
            Delete
          </Button>
        </Group>
      </Modal>

      {hasFullAccess &&
        typeof document !== "undefined" &&
        (() => {
          const el = document.getElementById("exam-header-actions");
          if (!el) return null;
          if (authLoading || loading) {
            return createPortal(
              <Skeleton height={36} width={180} radius="md" />,
              el,
            );
          }
          if (!showViewToggle) return null;
          return createPortal(
            <Button
              variant="filled"
              color="#4A72AE"
              radius="md"
              leftSection={<IconBinoculars size={16} stroke={1.5} />}
              onClick={() =>
                setViewMode(viewMode === "admin" ? "faculty" : "admin")
              }
            >
              {viewMode === "admin"
                ? "Switch to Faculty View"
                : "Switch to Admin View"}
            </Button>,
            el,
          );
        })()}
    </>
  );
}
