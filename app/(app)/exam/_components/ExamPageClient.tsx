"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Container,
  Title,
  Text,
  Card,
  Select,
  Button,
  Badge,
  Group,
  Stack,
  Grid,
  ActionIcon,
  Menu,
  Skeleton,
  Alert,
  Paper,
  Divider,
  Box,
  Switch,
  Modal,
  TextInput,
} from "@mantine/core";
import {
  IconPlus,
  IconFileText,
  IconDownload,
  IconEdit,
  IconTrash,
  IconAlertCircle,
  IconRefreshDot,
  IconDots,
  IconEye,
  IconBookmark,
} from "@tabler/icons-react";
import Image from "next/image";
import { notifications } from "@mantine/notifications";
import CreateExamModal from "@/components/CreateExamModal";
import CreateAnswerKeyModal from "@/components/CreateAnswerKeyModal";
import ItemAnalysisModal from "@/components/ItemAnalysisModal";
import LearningObjectivesModal from "@/components/LearningObjectivesModal";
import { generateAnswerSheetPdf } from "@/lib/services/examPdfService";
import {
  fetchExamsWithRelations,
  fetchExamById,
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
  const { user, permissions, loading: authLoading } = useAuth();
  const [exams, setExams] = useState<ExamWithRelations[]>([]);
  const [filteredExams, setFilteredExams] = useState<ExamWithRelations[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSection, setSelectedSection] = useState<string | null>("All");
  const [selectedSubject, setSelectedSubject] = useState<string | null>("All");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isAnswerKeyModalOpen, setIsAnswerKeyModalOpen] = useState(false);
  const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);
  const [selectedExam, setSelectedExam] = useState<ExamWithRelations | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<number | null>(null);
  const [deleteOpened, setDeleteOpened] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [examToDelete, setExamToDelete] = useState<ExamWithRelations | null>(null);

  const [isObjectivesModalOpen, setIsObjectivesModalOpen] = useState(false);
  const [objectivesExam, setObjectivesExam] = useState<ExamWithRelations | null>(null);
  /** When true, objectives modal was opened from creation flow → show "Save & Set Answer Key" */
  const [objectivesFromCreation, setObjectivesFromCreation] = useState(false);
  /** When true, answer key was opened from creation flow → show "Back to Objectives" button */
  const [answerKeyFromCreation, setAnswerKeyFromCreation] = useState(false);
  /** Exam ID to highlight after creation flow completes */
  const [newlyCreatedExamId, setNewlyCreatedExamId] = useState<number | null>(null);

  const hasFullAccess = permissions.includes("full_access_examinations");

  // Allowed section/subject IDs for teachers with partial access (null = no filter)
  const [allowedSectionIds, setAllowedSectionIds] = useState<Set<number> | null>(null);
  const [allowedSubjectIds, setAllowedSubjectIds] = useState<Set<number> | null>(null);

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
    if (!hasFullAccess && user?.id) {
      fetchTeacherClassAssignments(user.id).then((assignments) => {
        setAllowedSectionIds(new Set(assignments.map((a) => a.section_id)));
        setAllowedSubjectIds(new Set(assignments.map((a) => a.subject_id)));
      });
    } else {
      setAllowedSectionIds(null);
      setAllowedSubjectIds(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user?.id, hasFullAccess]);

  const sectionOptions = [
    "All",
    ...Array.from(
      new Set(
        exams.flatMap(
          (e) =>
            (e.exam_assignments ?? [])
              .filter((a) => {
                const sectionId = a.sections?.section_id;
                return !allowedSectionIds || (sectionId != null && allowedSectionIds.has(sectionId));
              })
              .map((a) => a.sections?.name)
              .filter(Boolean) as string[],
        ),
      ),
    ),
  ];

  const subjectOptions = [
    "All",
    ...Array.from(
      new Set(
        exams
          .filter((e) => !allowedSubjectIds || allowedSubjectIds.has(e.subject_id!))
          .map((e) => e.subjects?.name)
          .filter(Boolean) as string[]
      ),
    ),
  ];

  useEffect(() => {
    let filtered = [...exams];
    if (searchQuery) {
      filtered = filtered.filter((e) =>
        e.title.toLowerCase().includes(searchQuery.toLowerCase()),
      );
    }
    if (selectedSection !== "All") {
      filtered = filtered.filter((e) =>
        (e.exam_assignments ?? []).some(
          (a) => a.sections?.name === selectedSection,
        ),
      );
    }
    if (selectedSubject !== "All") {
      filtered = filtered.filter((e) => e.subjects?.name === selectedSubject);
    }
    setFilteredExams(filtered);
  }, [exams, searchQuery, selectedSection, selectedSubject]);

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

  const handleExamCreated = async (examId: number) => {
    // Fetch the new exam by ID only — do NOT call fetchExams() yet so the plate
    // doesn't appear on the list until after the objectives flow completes.
    const exam = await fetchExamById(examId);
    if (exam) {
      setObjectivesExam(exam);
      setObjectivesFromCreation(true);
      setIsObjectivesModalOpen(true);
    }
  };

  const handleOpenObjectivesModal = (exam: ExamWithRelations) => {
    setObjectivesExam(exam);
    setObjectivesFromCreation(false);
    setIsObjectivesModalOpen(true);
  };

  const handleCloseObjectivesModal = () => {
    if (objectivesFromCreation) {
      // Now refresh the list so the newly-created exam plate appears
      fetchExams();
    }
    setIsObjectivesModalOpen(false);
    setObjectivesExam(null);
    setObjectivesFromCreation(false);
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

  const activeCount = exams.filter((e) => !e.is_locked).length;
  const inactiveCount = exams.filter((e) => e.is_locked).length;

  return (
    <>
      <p className="mb-3 text-sm text-[#808898]">
        Manage and track all examinations
      </p>
      <Container fluid px="md" py="md">
        <Stack gap="xl">
          {/* Stats */}
          <Grid gutter="md">
            <Grid.Col span={{ base: 12, sm: 6, md: 4 }}>
              <Paper
                p="lg"
                radius="md"
                style={{
                  background:
                    "linear-gradient(135deg, #1f8f3a 0%, #4EAE4A 100%)",
                  border: "1px solid #3f9f46",
                }}
              >
                <Group justify="space-between" mb={10}>
                  <Text size="xs" fw={700} c="white">
                    Active Examinations
                  </Text>
                  <Box
                    w={24}
                    h={24}
                    style={{
                      borderRadius: 999,
                      background: "rgba(255,255,255,0.2)",
                      color: "white",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    A
                  </Box>
                </Group>
                <Text size="2.25rem" fw={800} lh={1} c="white">
                  {activeCount}
                </Text>
                <Text size="xs" mt={6} c="rgba(255,255,255,0.9)">
                  Currently active exams
                </Text>
              </Paper>
            </Grid.Col>

            <Grid.Col span={{ base: 12, sm: 6, md: 4 }}>
              <Paper
                p="lg"
                radius="md"
                style={{
                  background:
                    "linear-gradient(135deg, #fff1f1 0%, #ffe3e3 100%)",
                  border: "1px solid #ffc9c9",
                }}
              >
                <Group justify="space-between" mb={10}>
                  <Text size="xs" fw={700} c="#c92a2a">
                    Inactive Examinations
                  </Text>
                  <Box
                    w={24}
                    h={24}
                    style={{
                      borderRadius: 999,
                      background: "#ffe3e3",
                      color: "#e03131",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    I
                  </Box>
                </Group>
                <Text size="2.25rem" fw={800} lh={1} c="#a61e4d">
                  {inactiveCount}
                </Text>
                <Text size="xs" mt={6} c="#c92a2a">
                  Exams currently locked
                </Text>
              </Paper>
            </Grid.Col>

            <Grid.Col span={{ base: 12, sm: 6, md: 4 }}>
              <Paper
                p="lg"
                radius="md"
                style={{
                  background:
                    "linear-gradient(135deg, #eef7ff 0%, #e7f5ff 100%)",
                  border: "1px solid #b6ddff",
                }}
              >
                <Group justify="space-between" mb={10}>
                  <Text size="xs" fw={700} c="#1864ab">
                    Total Examinations
                  </Text>
                  <Box
                    w={24}
                    h={24}
                    style={{
                      borderRadius: 999,
                      background: "#d0ebff",
                      color: "#1c7ed6",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <IconFileText size={14} />
                  </Box>
                </Group>
                <Text size="2.25rem" fw={800} lh={1} c="#1971c2">
                  {exams.length}
                </Text>
                <Text size="xs" mt={6} c="#1864ab">
                  Overall exam records
                </Text>
              </Paper>
            </Grid.Col>
          </Grid>

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
          <Card padding="lg" radius="md" withBorder>
            <Grid>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <SearchBar
                  placeholder="Search examinations..."
                  ariaLabel="Search examinations"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.currentTarget.value)}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 6, md: 2 }}>
                <Select
                  data={sectionOptions}
                  value={selectedSection}
                  onChange={setSelectedSection}
                  placeholder="Section"
                />
              </Grid.Col>
              <Grid.Col span={{ base: 6, md: 2 }}>
                <Select
                  data={subjectOptions}
                  value={selectedSubject}
                  onChange={setSelectedSubject}
                  placeholder="Subject"
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 2 }}>
                <Button
                  fullWidth
                  color="#4EAE4A"
                  radius="md"
                  leftSection={<IconPlus size={16} />}
                  onClick={() => setIsCreateModalOpen(true)}
                >
                  Create Exam
                </Button>
              </Grid.Col>
            </Grid>
          </Card>

          <Text size="sm" c="dimmed" fw={500}>
            Examinations ({filteredExams.length})
          </Text>

          {/* Content */}
          {loading ? (
            <Grid>
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Grid.Col key={`exam-skeleton-${i}`} span={{ base: 12, sm: 6, md: 4 }}>
                  <Card padding="lg" radius="md" withBorder style={{ height: "100%" }}>
                    <Stack gap="md">
                      <Group gap="sm">
                        <Skeleton height={40} width={40} radius="md" />
                        <Skeleton height={14} style={{ flex: 1 }} />
                      </Group>
                      <Skeleton height={68} radius="md" />
                      <Skeleton height={34} radius="md" />
                      <Skeleton height={1} />
                      <Stack gap={6}>
                        <Skeleton height={30} radius="md" />
                        <Skeleton height={30} radius="md" />
                        <Skeleton height={30} radius="md" />
                        <Skeleton height={30} radius="md" />
                      </Stack>
                    </Stack>
                  </Card>
                </Grid.Col>
              ))}
            </Grid>
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
            <Grid>
              {filteredExams.map((exam) => {
                const gradeLabel =
                  exam.exam_assignments?.[0]?.sections?.grade_levels
                    ?.display_name ?? "";
                const subjectName = exam.subjects?.name ?? "";
                const sectionNames = (exam.exam_assignments ?? [])
                  .map((a) => a.sections?.name)
                  .filter(Boolean)
                  .join(", ");
                const isNew = exam.exam_id === newlyCreatedExamId;
                return (
                  <Grid.Col
                    key={exam.exam_id}
                    span={{ base: 12, sm: 6, md: 4 }}
                  >
                    <Card
                      padding="lg"
                      radius="md"
                      withBorder
                      style={{
                        height: "100%",
                        transition: "box-shadow 0.4s ease, border-color 0.4s ease",
                        boxShadow: isNew ? "0 0 0 3px #4EAE4A, 0 8px 24px rgba(70,109,29,0.25)" : undefined,
                        borderColor: isNew ? "#4EAE4A" : undefined,
                      }}
                    >
                      <Stack gap="md">
                        {/* Header */}
                        <Group justify="space-between">
                          <Group gap="sm" style={{ flex: 1 }}>
                            <Box pos="relative" w={40} h={40}>
                              <Image
                                src="/logo.png"
                                alt="Logo"
                                fill
                                style={{ objectFit: "contain" }}
                              />
                            </Box>
                            <Text
                              fw={700}
                              size="sm"
                              lineClamp={2}
                              style={{ flex: 1 }}
                            >
                              {exam.title}
                            </Text>
                          </Group>
                          <Switch
                            checked={!exam.is_locked}
                            onChange={(e) =>
                              handleStatusChange(
                                exam,
                                e.currentTarget.checked ? "active" : "inactive",
                              )
                            }
                            disabled={updatingStatus === exam.exam_id}
                            color={!exam.is_locked ? "green" : "red"}
                            size="xl"
                            onLabel="Active"
                            offLabel="Inactive"
                            styles={{
                              track: {
                                backgroundColor: exam.is_locked
                                  ? "var(--mantine-color-red-6)"
                                  : "var(--mantine-color-green-6)",
                                borderColor: exam.is_locked
                                  ? "var(--mantine-color-red-6)"
                                  : "var(--mantine-color-green-6)",
                                color: "white",
                                "--switch-bg": exam.is_locked
                                  ? "var(--mantine-color-red-6)"
                                  : "var(--mantine-color-green-6)",
                              },
                            }}
                          />
                        </Group>

                        {/* Details */}
                        <Paper p="sm" bg="gray.0" radius="md">
                          <Stack gap={6}>
                            {gradeLabel && (
                              <Text size="xs">
                                <Text span fw={500}>
                                  Grade:
                                </Text>{" "}
                                {gradeLabel}
                              </Text>
                            )}
                            {subjectName && (
                              <Text size="xs">
                                <Text span fw={500}>
                                  Subject:
                                </Text>{" "}
                                {subjectName}
                              </Text>
                            )}
                            {sectionNames && (
                              <Text size="xs">
                                <Text span fw={500}>
                                  Section:
                                </Text>{" "}
                                {sectionNames}
                              </Text>
                            )}
                          </Stack>
                        </Paper>

                        {/* Download */}
                        <Button
                          variant="outline"
                          color="#4EAE4A"
                          radius="md"
                          fullWidth
                          leftSection={<IconDownload size={16} />}
                          onClick={() => handleDownloadAnswerSheet(exam)}
                        >
                          Download Answer Sheet
                        </Button>

                        {/* Actions */}
                        <div>
                          <Divider mb="sm" />
                          <Text
                            size="xs"
                            tt="uppercase"
                            fw={600}
                            c="dimmed"
                            mb="xs"
                          >
                            Actions
                          </Text>
                          <Stack gap={6}>
                            <Button
                              variant="light"
                              color="#4EAE4A"
                              fullWidth
                              size="sm"
                              radius="md"
                              leftSection={<IconEdit size={14} />}
                              onClick={() => {
                                setSelectedExam(exam);
                                setIsAnswerKeyModalOpen(true);
                              }}
                            >
                              Edit Answer Key
                            </Button>
                            <Button
                              variant="light"
                              color="violet"
                              fullWidth
                              size="sm"
                              radius="md"
                              leftSection={<IconBookmark size={14} />}
                              onClick={() => handleOpenObjectivesModal(exam)}
                            >
                              Edit Objectives
                            </Button>
                            <Button
                              variant="light"
                              color="blue"
                              fullWidth
                              size="sm"
                              radius="md"
                              leftSection={<IconFileText size={14} />}
                              disabled={!exam.answer_key}
                              onClick={() => router.push(`/exam/${exam.exam_id}/scan`)}
                            >
                              Scan Papers
                            </Button>
                            <Button
                              variant="light"
                              color="teal"
                              fullWidth
                              size="sm"
                              radius="md"
                              leftSection={<IconEye size={14} />}
                              disabled={!exam.answer_key || !examIdsWithScores.has(exam.exam_id)}
                              onClick={() => {
                                setSelectedExam(exam);
                                setIsAnalysisModalOpen(true);
                              }}
                            >
                              Review Papers
                            </Button>
                            <Button
                              variant="light"
                              color="red"
                              fullWidth
                              size="sm"
                              radius="md"
                              leftSection={<IconTrash size={14} />}
                              onClick={() => handleOpenDeleteModal(exam)}
                            >
                              Delete
                            </Button>
                          </Stack>
                        </div>
                      </Stack>
                    </Card>
                  </Grid.Col>
                );
              })}
            </Grid>
          )}
        </Stack>

        {isCreateModalOpen && (
          <CreateExamModal
            onClose={() => setIsCreateModalOpen(false)}
            onSuccess={fetchExams}
            onCreated={handleExamCreated}
          />
        )}

        {isObjectivesModalOpen && objectivesExam && (
          <LearningObjectivesModal
            exam={objectivesExam}
            onClose={handleCloseObjectivesModal}
            onSaved={fetchExams}
            onContinue={
              objectivesFromCreation
                ? async () => {
                    const freshExam = await fetchExamById(objectivesExam.exam_id);
                    // Close objectives without calling fetchExams — plate appears only after summary "Done"
                    setIsObjectivesModalOpen(false);
                    setObjectivesExam(null);
                    setObjectivesFromCreation(false);
                    setSelectedExam(freshExam ?? objectivesExam);
                    setAnswerKeyFromCreation(true);
                    setIsAnswerKeyModalOpen(true);
                  }
                : undefined
            }
          />
        )}
        {isAnswerKeyModalOpen && selectedExam && (
          <CreateAnswerKeyModal
            exam={selectedExam}
            onClose={() => {
              setIsAnswerKeyModalOpen(false);
              setAnswerKeyFromCreation(false);
              setSelectedExam(null);
            }}
            onSuccess={answerKeyFromCreation ? async () => {
              const examId = selectedExam.exam_id;
              await fetchExams();
              setNewlyCreatedExamId(examId);
              setTimeout(() => setNewlyCreatedExamId(null), 4000);
            } : fetchExams}
            onBack={answerKeyFromCreation ? () => {
              setIsAnswerKeyModalOpen(false);
              setAnswerKeyFromCreation(false);
              setObjectivesExam(selectedExam);
              setObjectivesFromCreation(true);
              setIsObjectivesModalOpen(true);
            } : undefined}
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
      </Container>
    </>
  );
}
