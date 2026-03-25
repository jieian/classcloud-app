"use client";

import { useState, useEffect, useMemo } from "react";
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
  IconEye,
  IconUsers,
  IconBook,
  IconKey,
  IconTargetArrow,
  IconScanEye,
} from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import CreateAnswerKeyModal from "@/components/CreateAnswerKeyModal";

import ItemAnalysisModal from "@/components/ItemAnalysisModal";
import LearningObjectivesModal from "@/components/LearningObjectivesModal";
import { generateAnswerSheetPdf } from "@/lib/services/examPdfService";
import {
  fetchExamsWithRelations,
  setExamLocked,
  deleteExamWithAssignments,
} from "@/lib/services/examService";
import { fetchExamIdsWithScores } from "@/lib/services/attemptService";
import type { ExamWithRelations } from "@/lib/exam-supabase";
import { useAuth } from "@/context/AuthContext";
import { fetchTeacherClassAssignments } from "@/app/(app)/school/classes/_lib/classService";
import { SearchBar } from "@/components/searchBar/SearchBar";

export default function ExamPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, permissions, loading: authLoading } = useAuth();
  const [exams, setExams] = useState<ExamWithRelations[]>([]);
  const [filteredExams, setFilteredExams] = useState<ExamWithRelations[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGradeLevel, setSelectedGradeLevel] = useState<string | null>(null);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [isAnswerKeyModalOpen, setIsAnswerKeyModalOpen] = useState(false);
  const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);
  const [selectedExam, setSelectedExam] = useState<ExamWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<number | null>(null);
  const [deleteOpened, setDeleteOpened] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [examToDelete, setExamToDelete] = useState<ExamWithRelations | null>(null);
  const [isObjectivesModalOpen, setIsObjectivesModalOpen] = useState(false);
  const [objectivesExam, setObjectivesExam] = useState<ExamWithRelations | null>(null);

  /** Exam ID to highlight after creation flow completes */
  const [newlyCreatedExamId, setNewlyCreatedExamId] = useState<number | null>(null);
  const [highlightExpiring, setHighlightExpiring] = useState(false);
  const [pageMap, setPageMap] = useState<Map<string, number>>(new Map());
  const PAGE_SIZE = 3;
  const [openMenuExamId, setOpenMenuExamId] = useState<number | null>(null);

  // Handle ?newExamId= highlight — persists for 5 minutes via localStorage
  useEffect(() => {
    const HIGHLIGHT_MS = 5 * 60 * 1000; // 5 minutes
    const FADE_BEFORE_MS = 10 * 1000;   // start fading 10 s before expiry
    const STORAGE_KEY = "examHighlight";

    // If a new exam was just created, record it with an expiry timestamp
    const newId = searchParams.get("newExamId");
    if (newId) {
      const examId = Number(newId);
      if (!isNaN(examId)) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ examId, expiresAt: Date.now() + HIGHLIGHT_MS }));
      }
      const url = new URL(window.location.href);
      url.searchParams.delete("newExamId");
      window.history.replaceState({}, "", url.toString());
    }

    // Restore highlight from storage (covers page reload / navigation back)
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const { examId, expiresAt } = JSON.parse(raw) as { examId: number; expiresAt: number };
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) { localStorage.removeItem(STORAGE_KEY); return; }

      setNewlyCreatedExamId(examId);
      setHighlightExpiring(remaining <= FADE_BEFORE_MS);

      // Start fade when 10 s remain
      const fadeDelay = remaining - FADE_BEFORE_MS;
      const fadeTimer = fadeDelay > 0 ? setTimeout(() => setHighlightExpiring(true), fadeDelay) : null;

      // Clear highlight when fully expired
      const clearTimer = setTimeout(() => {
        setNewlyCreatedExamId(null);
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
  const [allowedSectionIds, setAllowedSectionIds] = useState<Set<number> | null>(null);
  const [allowedSubjectIds, setAllowedSubjectIds] = useState<Set<number> | null>(null);
  const [assignedSectionSubjectPairs, setAssignedSectionSubjectPairs] = useState<Set<string>>(new Set());

  // Exam IDs that have at least one scanned/saved score
  const [examIdsWithScores, setExamIdsWithScores] = useState<Set<number>>(new Set());

  const fetchExams = async () => {
    setLoading(true);
    setDbError(null);
    try {
      const teacherId = hasFullAccess ? undefined : user?.id;
      const data = await fetchExamsWithRelations(teacherId);
      setExams(data);

      // Build assignmentId → examId map from the loaded data
      const assignmentIdToExamId = new Map<number, number>();
      for (const exam of data) {
        for (const a of exam.exam_assignments ?? []) {
          assignmentIdToExamId.set(a.id, exam.exam_id);
        }
      }
      const withScores = await fetchExamIdsWithScores(assignmentIdToExamId);
      setExamIdsWithScores(withScores);
    } catch (error: unknown) {
      setDbError(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    fetchExams();
    if (user?.id) {
      fetchTeacherClassAssignments(user.id).then((assignments) => {
        setAllowedSectionIds(new Set(assignments.map((a) => a.section_id)));
        setAllowedSubjectIds(new Set(assignments.map((a) => a.subject_id)));
        setAssignedSectionSubjectPairs(new Set(assignments.map((a) => `${a.section_id}-${a.subject_id}`)));
      });
    } else {
      setAllowedSectionIds(null);
      setAllowedSubjectIds(null);
      setAssignedSectionSubjectPairs(new Set());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user?.id, hasFullAccess]);

  const gradeLevelOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const exam of exams) {
      for (const a of exam.exam_assignments ?? []) {
        const sectionId = a.sections?.section_id;
        if (allowedSectionIds && (sectionId == null || !allowedSectionIds.has(sectionId))) continue;
        const name = a.sections?.grade_levels?.display_name;
        if (name) seen.add(name);
      }
    }
    return Array.from(seen)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
      .map((name) => ({ value: name, label: name }));
  }, [exams, allowedSectionIds]);

  const sectionOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const exam of exams) {
      for (const a of exam.exam_assignments ?? []) {
        const sectionId = a.sections?.section_id;
        if (allowedSectionIds && (sectionId == null || !allowedSectionIds.has(sectionId))) continue;
        if (selectedGradeLevel && a.sections?.grade_levels?.display_name !== selectedGradeLevel) continue;
        const name = a.sections?.name;
        if (name) seen.add(name);
      }
    }
    return Array.from(seen)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
      .map((name) => ({ value: name, label: name }));
  }, [exams, selectedGradeLevel, allowedSectionIds]);

  const canDeleteExam = (exam: ExamWithRelations): boolean => {
    if (!exam.subject_id) return false;
    if (hasFullAccess) return true;
    // Creator can always delete their own exam (covers copies assigned to SSES/cross-type sections)
    if (user?.id && exam.creator_teacher_id === user.id) return true;
    if (assignedSectionSubjectPairs.size === 0) return false;

    const assignmentPairs = new Set(
      (exam.exam_assignments ?? [])
        .map((a) => a.sections?.section_id)
        .filter((sectionId): sectionId is number => typeof sectionId === 'number')
        .map((sectionId) => `${sectionId}-${exam.subject_id}`),
    );

    for (const pair of assignmentPairs) {
      if (assignedSectionSubjectPairs.has(pair)) return true;
    }
    return false;
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
          .filter((e) => !allowedSubjectIds || allowedSubjectIds.has(e.subject_id!))
          .map((e) => e.subjects?.name)
          .filter(Boolean) as string[],
      ),
    )
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
      .map((name) => ({ value: name, label: name }));
  }, [exams, selectedGradeLevel, allowedSubjectIds]);

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
        (e.exam_assignments ?? []).some((a) => a.sections?.name === selectedSection),
      );
    }
    if (selectedSubject) {
      filtered = filtered.filter((e) => e.subjects?.name === selectedSubject);
    }
    setFilteredExams(filtered);
  }, [exams, searchQuery, selectedGradeLevel, selectedSection, selectedSubject]);

  const groupedExams = useMemo(() => {
    const groups = new Map<string, { gradeLabel: string; exams: ExamWithRelations[] }>();
    for (const exam of filteredExams) {
      const gl = exam.exam_assignments?.[0]?.sections?.grade_levels;
      const key = gl?.display_name ?? "Unknown";
      if (!groups.has(key)) {
        groups.set(key, { gradeLabel: gl?.display_name ?? "Unknown", exams: [] });
      }
      groups.get(key)!.exams.push(exam);
    }
    return Array.from(groups.values()).sort((a, b) =>
      a.gradeLabel.localeCompare(b.gradeLabel, undefined, { sensitivity: "base" }),
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
      await fetchExams();
    }
    setUpdatingStatus(null);
  };

  const handleDownloadAnswerSheet = async (exam: ExamWithRelations) => {
    const sectionNames = (exam.exam_assignments ?? [])
      .map((a) => a.sections?.name)
      .filter(Boolean)
      .join(", ");
    const pdf = await generateAnswerSheetPdf({
      exam,
      sectionName: sectionNames,
    });
    pdf.save(`${exam.title}_AnswerSheet.pdf`);
    notifications.show({
      title: "Downloaded",
      message: "Answer sheet saved to downloads",
      color: "blue",
    });
  };

  const handleOpenObjectivesModal = (exam: ExamWithRelations) => {
    setObjectivesExam(exam);
    setIsObjectivesModalOpen(true);
  };

  const handleCloseObjectivesModal = () => {
    setIsObjectivesModalOpen(false);
    setObjectivesExam(null);
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
      await fetchExams();
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
        <Group justify="space-between">
          <h1 className="mb-3 text-2xl font-bold">
            Examinations{" "}
            {!loading && (
              <span className="text-[#808898]">
                ({filteredExams.length})
              </span>
            )}
          </h1>
          {loading ? (
            <Stack gap={4} style={{ alignItems: "flex-end" }}>
              <Text size="xs" c="dimmed">Create Exam</Text>
              <Skeleton height={40} width={140} radius="md" />
            </Stack>
          ) : (
            <Button
              color="#4EAE4A"
              radius="md"
              leftSection={<IconPlus size={16} />}
              onClick={() => router.push('/exam/create')}
            >
              Create Exam
            </Button>
          )}
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
                onClick={fetchExams}
              >
                <IconRefreshDot size={14} /> Retry
              </Button>
            </Alert>
          )}

          {/* Filters */}
          <div>
            <Group mb="md" wrap="nowrap" align="flex-end" gap="sm">
              <SearchBar
                id="search-exams"
                placeholder="Search examinations..."
                ariaLabel="Search examinations"
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
                  onClick={fetchExams}
                  loading={loading}
                  aria-label="Refresh examinations"
                >
                  <IconRefresh size={18} stroke={1.5} />
                </ActionIcon>
              </Tooltip>
            </Group>
            <Group mb="md" gap="sm">
              <Select
                placeholder="Grade Level"
                data={gradeLevelOptions}
                value={selectedGradeLevel}
                onChange={setSelectedGradeLevel}
                leftSection={<IconSchool size={16} />}
                w={200}
                clearable
              />
              <Select
                placeholder="Section"
                data={sectionOptions}
                value={selectedSection}
                onChange={setSelectedSection}
                leftSection={<IconUsers size={16} />}
                w={200}
                clearable
                disabled={sectionOptions.length === 0}
              />
              <Select
                placeholder="Subject"
                data={subjectOptions}
                value={selectedSubject}
                onChange={setSelectedSubject}
                leftSection={<IconBook size={16} />}
                w={200}
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
                <Title order={3} c="dimmed">No examinations found</Title>
                <Text c="dimmed" size="sm">Create your first examination to get started.</Text>
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
                      <Text fw={700} size="md">{group.gradeLabel}</Text>
                      <Text span size="sm" c="dimmed" fw={500}>({group.exams.length})</Text>
                    </Group>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <SimpleGrid cols={{ base: 1, sm: 2, md: 3, xl: 4 }} p="xs">
                      {group.exams.slice(
                        ((pageMap.get(group.gradeLabel) ?? 1) - 1) * PAGE_SIZE,
                        (pageMap.get(group.gradeLabel) ?? 1) * PAGE_SIZE,
                      ).map((exam) => {
                        const subjectName = exam.subjects?.name ?? "";
                        const sectionNames = (exam.exam_assignments ?? [])
                          .map((a) => a.sections?.name)
                          .filter(Boolean)
                          .join(", ");
                        const isNew = exam.exam_id === newlyCreatedExamId;
                        return (
                          <Card
                            key={exam.exam_id}
                            shadow="sm"
                            padding="lg"
                            radius="md"
                            withBorder
                            onClick={() => setOpenMenuExamId(exam.exam_id)}
                            style={{
                              transition: "box-shadow 8s ease, border-color 8s ease",
                              boxShadow: isNew && !highlightExpiring ? "0 0 0 3px #4EAE4A, 0 8px 24px rgba(70,109,29,0.25)" : undefined,
                              borderColor: isNew && !highlightExpiring ? "#4EAE4A" : undefined,
                              display: "flex",
                              flexDirection: "column",
                              height: "100%",
                              cursor: "pointer",
                            }}
                          >
                            <Group justify="space-between" mt="md" mb="xs">
                              <Text fw={550} size="lg" lineClamp={2} style={{ flex: 1 }}>
                                {exam.title}
                              </Text>
                              <Group gap={4} style={{ flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                                <Badge color={exam.is_locked ? "red" : "green"} variant="light">
                                  {exam.is_locked ? "Inactive" : "Active"}
                                </Badge>
                                <Menu
                                  shadow="md"
                                  width={230}
                                  position="bottom-end"
                                  withinPortal
                                  opened={openMenuExamId === exam.exam_id}
                                  onChange={(o) => setOpenMenuExamId(o ? exam.exam_id : null)}
                                >
                                  <Menu.Target>
                                    <ActionIcon
                                      variant="subtle"
                                      color="gray"
                                      radius="xl"
                                      aria-label="Exam actions"
                                      onClick={(e) => { e.stopPropagation(); setOpenMenuExamId(openMenuExamId === exam.exam_id ? null : exam.exam_id); }}
                                    >
                                      <IconSettings size={15} />
                                    </ActionIcon>
                                  </Menu.Target>
                                  <Menu.Dropdown>
                                    {hasFullAccess && (
                                      <>
                                        <Menu.Label>Status</Menu.Label>
                                        <Menu.Item
                                          leftSection={<IconRefreshDot size={14} />}
                                          disabled={updatingStatus === exam.exam_id}
                                          onClick={() => handleStatusChange(exam, exam.is_locked ? "active" : "inactive")}
                                        >
                                          {exam.is_locked ? "Set Active" : "Set Inactive"}
                                        </Menu.Item>
                                        <Menu.Divider />
                                      </>
                                    )}
                                    <Menu.Label>Actions</Menu.Label>
                                    <Menu.Item leftSection={<IconDownload size={14} />} onClick={() => handleDownloadAnswerSheet(exam)}>
                                      Download Answer Sheet
                                    </Menu.Item>
                                    <Menu.Item leftSection={<IconKey size={14} />} onClick={() => { setSelectedExam(exam); setIsAnswerKeyModalOpen(true); }}>
                                      Edit Answer Key
                                    </Menu.Item>
                                    <Menu.Item leftSection={<IconTargetArrow size={14} />} onClick={() => handleOpenObjectivesModal(exam)}>
                                      Edit Objectives
                                    </Menu.Item>
                                    <Menu.Item leftSection={<IconScanEye size={14} />} disabled={!exam.answer_key} onClick={() => router.push(`/exam/${exam.exam_id}/scan`)}>
                                      Scan Papers
                                    </Menu.Item>
                                    <Menu.Item leftSection={<IconEye size={14} />} disabled={!exam.answer_key || !examIdsWithScores.has(exam.exam_id)} onClick={() => { setSelectedExam(exam); setIsAnalysisModalOpen(true); }}>
                                      Review Papers
                                    </Menu.Item>
                                    <Menu.Item leftSection={<IconPlus size={14} />} onClick={() => router.push(`/exam/copy/${exam.exam_id}`)}>
                                      Copy Exam
                                    </Menu.Item>
                                    {canDeleteExam(exam) && (
                                      <>
                                        <Menu.Divider />
                                        <Menu.Item leftSection={<IconTrash size={14} />} color="red" onClick={() => handleOpenDeleteModal(exam)}>
                                          Delete
                                        </Menu.Item>
                                      </>
                                    )}
                                  </Menu.Dropdown>
                                </Menu>
                              </Group>
                            </Group>

                            <Divider my="sm" mb="lg" />

                            <Text c="#969696" fw={550} mb="sm">About</Text>
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
                            setPageMap((prev) => new Map(prev).set(group.gradeLabel, page))
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


        {isObjectivesModalOpen && objectivesExam && (
          <LearningObjectivesModal
            exam={objectivesExam}
            onClose={handleCloseObjectivesModal}
            onSaved={fetchExams}
          />
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

        {isAnalysisModalOpen && selectedExam && (
          <ItemAnalysisModal
            exam={selectedExam}
            onClose={() => {
              setIsAnalysisModalOpen(false);
              setSelectedExam(null);
            }}
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
            onKeyDown={(e) => { if (e.key === "Enter" && confirmText.toLowerCase() === "delete" && !deleting) handleDeleteExam(); }}
            mb="lg"
            disabled={deleting}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={handleCloseDeleteModal} disabled={deleting}>
              Cancel
            </Button>
            <Button
              color="red"
              disabled={confirmText.toLowerCase() !== "delete"}
              loading={deleting}
              onClick={handleDeleteExam}
            >
              Delete
            </Button>
          </Group>
        </Modal>
    </>
  );
}
