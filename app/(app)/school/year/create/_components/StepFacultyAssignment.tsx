"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ActionIcon,
  Alert,
  Box,
  Button,
  Collapse,
  Divider,
  Group,
  Stack,
  Table,
  TableScrollContainer,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
  Text,
  ThemeIcon,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconChalkboardTeacher,
  IconChevronDown,
  IconChevronRight,
  IconInfoCircle,
  IconPencil,
  IconPlus,
  IconX,
} from "@tabler/icons-react";
import type { UseFormReturnType } from "@mantine/form";
import MasterlistAssignmentModal from "@/app/(app)/school/faculty/masterlist/_components/MasterlistAssignmentModal";
import type { MasterlistTeacherLoad } from "@/app/(app)/school/faculty/_lib/masterlistService";
import type {
  CreateSchoolYearForm,
  FacultyCellKey,
  PreviousSySnapshot,
  WizardCurriculumDetail,
  WizardFacultyOption,
  WizardSection,
} from "../_lib/types";
import { replicateFacultyDraft } from "../_lib/replicateService";

function EnterToConfirm({ onEnter }: { onEnter: () => void }) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Enter") onEnter();
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

const DIRTY_BG = "#FFE6B8";
const ERROR_BG = "#FECACA";
const BORDER_COLOR = "var(--mantine-color-gray-3)";

function buildValidationMessage(missingAdvisers: number, missingSubjects: number): string {
  const hasA = missingAdvisers > 0;
  const hasS = missingSubjects > 0;
  if (hasA && hasS) return "Some subjects and classes currently have no assigned teacher or adviser.";
  if (hasA) return missingAdvisers === 1 ? "A class currently has no assigned adviser." : "Some classes currently have no assigned adviser.";
  return missingSubjects === 1 ? "A subject currently has no assigned teacher." : "Some subjects currently have no assigned teacher.";
}

interface StepFacultyAssignmentProps {
  form: UseFormReturnType<CreateSchoolYearForm>;
  curriculumDetail: WizardCurriculumDetail;
  faculty: WizardFacultyOption[];
  prevSy: {
    sy_id: number;
    start_year: number;
    curriculum_id: number | null;
  } | null;
  snapshot: PreviousSySnapshot | null;
  snapshotLoading: boolean;
  onSnapshotNeeded: () => Promise<void>;
  facultyDraft: Map<FacultyCellKey, string | null>;
  setFacultyDraft: React.Dispatch<
    React.SetStateAction<Map<FacultyCellKey, string | null>>
  >;
  teachingLoadByTeacher: Map<
    string,
    {
      curriculum_subject_id: number;
      code: string;
      name: string;
      subject_type: "BOTH" | "SSES";
    }[]
  >;
  assignedAdviserUids: Set<string>;
}

export default function StepFacultyAssignment({
  form,
  curriculumDetail,
  faculty,
  prevSy,
  snapshot,
  snapshotLoading,
  onSnapshotNeeded,
  facultyDraft,
  setFacultyDraft,
  teachingLoadByTeacher,
  assignedAdviserUids,
}: StepFacultyAssignmentProps) {
  const hasPrevSy = prevSy !== null;
  const mode = form.values.step4Mode;

  if (hasPrevSy && mode === null) {
    return (
      <ModePicker
        onSelect={async (selected) => {
          if (selected === "replicate") {
            await onSnapshotNeeded();
          }
          form.setFieldValue("step4Mode", selected);
          if (selected === "replicate" && snapshot) {
            const draft = replicateFacultyDraft(
              form.values.sections,
              snapshot,
              curriculumDetail,
            );
            setFacultyDraft(draft);
          } else if (selected === "scratch") {
            setFacultyDraft(new Map());
          }
        }}
        snapshotLoading={snapshotLoading}
      />
    );
  }

  return (
    <FacultyGrid
      form={form}
      curriculumDetail={curriculumDetail}
      faculty={faculty}
      facultyDraft={facultyDraft}
      setFacultyDraft={setFacultyDraft}
      teachingLoadByTeacher={teachingLoadByTeacher}
      assignedAdviserUids={assignedAdviserUids}
      hasPrevSy={hasPrevSy}
      mode={form.values.step4Mode ?? "scratch"}
      snapshot={snapshot}
      onResetMode={() => {
        form.setFieldValue("step4Mode", null);
        setFacultyDraft(new Map());
      }}
    />
  );
}

// ── Mode picker ────────────────────────────────────────────────────────────────

function ModePicker({
  onSelect,
  snapshotLoading,
}: {
  onSelect: (mode: "scratch" | "replicate") => Promise<void>;
  snapshotLoading: boolean;
}) {
  const [loading, setLoading] = useState<"scratch" | "replicate" | null>(null);

  async function handleSelect(mode: "scratch" | "replicate") {
    setLoading(mode);
    try {
      await onSelect(mode);
    } finally {
      setLoading(null);
    }
  }

  return (
    <Box>
      <Text size="xl" fw={700} mb="md" c="#298925">
        Define Advisory and Faculty Assignment
      </Text>

      <Box
        p="lg"
        style={{
          border: "1px solid #B8B8B8",
          borderRadius: "8px",
        }}
      >
        <Stack gap="lg" align="center" py="xl">
          <ThemeIcon size={64} radius="xl" variant="light" color="gray">
            <IconChalkboardTeacher size={36} />
          </ThemeIcon>
          <Text fw={600} size="lg" ta="center" mb="md">
            How would you like to define faculty assignments?
          </Text>

          <Group gap="sm" justify="center" wrap="wrap">
            <Button
              variant="outline"
              color="#4EAE4A"
              loading={loading === "scratch"}
              disabled={loading !== null}
              onClick={() => handleSelect("scratch")}
            >
              Start from Scratch
            </Button>
            <Button
              variant="filled"
              color="#4EAE4A"
              loading={loading === "replicate" || snapshotLoading}
              disabled={loading !== null}
              onClick={() => handleSelect("replicate")}
            >
              Replicate Previous School Year
            </Button>
          </Group>
        </Stack>
      </Box>
    </Box>
  );
}

// ── Faculty grid ───────────────────────────────────────────────────────────────

interface FacultyGridProps {
  form: UseFormReturnType<CreateSchoolYearForm>;
  curriculumDetail: WizardCurriculumDetail;
  faculty: WizardFacultyOption[];
  facultyDraft: Map<FacultyCellKey, string | null>;
  setFacultyDraft: React.Dispatch<
    React.SetStateAction<Map<FacultyCellKey, string | null>>
  >;
  teachingLoadByTeacher: Map<
    string,
    {
      curriculum_subject_id: number;
      code: string;
      name: string;
      subject_type: "BOTH" | "SSES";
    }[]
  >;
  assignedAdviserUids: Set<string>;
  hasPrevSy: boolean;
  mode: "scratch" | "replicate";
  snapshot: PreviousSySnapshot | null;
  onResetMode: () => void;
}

function FacultyGrid({
  form,
  curriculumDetail,
  faculty,
  facultyDraft,
  setFacultyDraft,
  teachingLoadByTeacher,
  assignedAdviserUids,
  hasPrevSy,
  mode,
  snapshot,
  onResetMode,
}: FacultyGridProps) {
  const isMobile = useMediaQuery("(max-width: 768px)");
  const confirmModalProps = isMobile
    ? {
        styles: {
          inner: { alignItems: "flex-end", paddingBottom: "20px" },
          content: {
            width: "100%",
            maxWidth: "100%",
            borderRadius: "12px 12px 0 0",
          },
        },
      }
    : {};

  const [pickerState, setPickerState] = useState<{
    key: FacultyCellKey;
    mode: "adviser" | "subject";
    assignedUid: string | null;
    currentAssignedName: string | null;
    assignmentLabel: string;
  } | null>(null);

  const facultyNames = useMemo(
    () =>
      new Map(faculty.map((f) => [f.uid, `${f.first_name} ${f.last_name}`])),
    [faculty],
  );

  const masterlistTeachingLoad = useMemo(() => {
    const result = new Map<string, MasterlistTeacherLoad[]>();
    for (const [uid, subjects] of teachingLoadByTeacher.entries()) {
      result.set(
        uid,
        subjects.map((s) => ({
          curriculum_subject_id: s.curriculum_subject_id,
          code: s.code,
          name: s.name,
          subject_type: s.subject_type,
          isPending: true,
          sections: [],
        })),
      );
    }
    return result;
  }, [teachingLoadByTeacher]);

  // Stable baseline for replicate mode — computed once from snapshot, never changes during step 4
  const originalDraft = useMemo(() => {
    if (mode !== "replicate" || !snapshot) return new Map<FacultyCellKey, string | null>();
    return replicateFacultyDraft(form.values.sections, snapshot, curriculumDetail);
  }, [mode, snapshot]); // eslint-disable-line react-hooks/exhaustive-deps

  function getCellValue(key: FacultyCellKey): string | null {
    return facultyDraft.get(key) ?? null;
  }

  function isCellDirty(key: FacultyCellKey): boolean {
    if (mode !== "replicate") return false;
    return (facultyDraft.get(key) ?? null) !== (originalDraft.get(key) ?? null);
  }

  function handleCellChange(key: FacultyCellKey, value: string | null) {
    setFacultyDraft((prev) => {
      const next = new Map(prev);
      if (!value) {
        next.delete(key);
      } else {
        next.set(key, value);
      }
      return next;
    });
  }

  function confirmClearAssignment(
    content: React.ReactNode,
    key: FacultyCellKey,
  ) {
    let modalId!: string;
    modalId = modals.openConfirmModal({
      title: "Remove assignment?",
      children: (
        <>
          <EnterToConfirm
            onEnter={() => {
              handleCellChange(key, null);
              modals.close(modalId);
            }}
          />
          <Text size="sm">{content}</Text>
        </>
      ),
      labels: { confirm: "Remove assignment", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: () => handleCellChange(key, null),
      ...confirmModalProps,
    });
  }

  const { missingAdvisers, missingSubjects, panelHasErrors } = useMemo(() => {
    let missingAdvisers = 0;
    let missingSubjects = 0;
    const errors = new Map<number, boolean>();
    for (const gl of curriculumDetail.grade_levels) {
      let glHasError = false;
      const glSections = form.values.sections.filter(
        (s) => s.grade_level_id === gl.grade_level_id,
      );
      for (const section of glSections) {
        const adviserKey = `adviser:${section.tempId}`;
        if (!getCellValue(adviserKey)) {
          missingAdvisers++;
          glHasError = true;
        }
        for (const sub of gl.subjects) {
          if (sub.subject_type === "SSES" && section.section_type !== "SSES")
            continue;
          const subKey = `subject:${section.tempId}:${sub.curriculum_subject_id}`;
          if (!getCellValue(subKey)) {
            missingSubjects++;
            glHasError = true;
          }
        }
      }
      errors.set(gl.grade_level_id, glHasError);
    }
    return { missingAdvisers, missingSubjects, panelHasErrors: errors };
  }, [facultyDraft, form.values.sections, curriculumDetail]); // eslint-disable-line react-hooks/exhaustive-deps

  if (faculty.length === 0) {
    return (
      <Alert color="orange" title="No Faculty Found">
        No active faculty members found.{" "}
        <Text
          component="a"
          href="/school/faculty"
          c="orange"
          td="underline"
          size="sm"
        >
          Go to Faculty Management →
        </Text>
      </Alert>
    );
  }

  return (
    <Box>
      <Text size="xl" fw={700} mb="md" c="#298925">
        Define Advisory and Faculty Assignment
      </Text>

      <Box
        p="lg"
        style={{
          border: "1px solid #B8B8B8",
          borderRadius: "8px",
        }}
      >
        <Text size="lg" fw={700} mb="xs" c="#298925">
          Advisory and Faculty Assignment
        </Text>
        <Text size="sm" mb="lg" c="dimmed">
          Define the advisory and faculty assignments for this school year.
        </Text>

        <Text size="sm" fw={700} c="gray.7" mb="sm">
          Advisory and Faculty Assignment{" "}
          <Text span c="red">
            *
          </Text>
        </Text>
        <Box
          mt="md"
          mb="lg"
          p="md"
          style={{
            border: "1px solid #e0e0e0",
            borderRadius: "8px",
            backgroundColor: "#f9f9f9",
          }}
        >
          <Stack gap="sm">
            {(missingAdvisers > 0 || missingSubjects > 0) && (
              <Alert
                variant="filled"
                radius="md"
                styles={{
                  root: { backgroundColor: "#FF6666" },
                  icon: { alignSelf: "center", marginTop: 0 },
                }}
                icon={
                  <ThemeIcon color="white" variant="transparent" size="md">
                    <IconAlertTriangle size={20} />
                  </ThemeIcon>
                }
              >
                <Text fw={700} size="sm">
                  Incomplete Faculty Assignments
                </Text>
                <Text size="sm" fs="italic">
                  {buildValidationMessage(missingAdvisers, missingSubjects)}
                </Text>
              </Alert>
            )}
            {curriculumDetail.grade_levels.map((gl) => {
              const glSections = form.values.sections.filter(
                (s) => s.grade_level_id === gl.grade_level_id,
              );
              if (glSections.length === 0) return null;

              const hasErrors = panelHasErrors.get(gl.grade_level_id) ?? false;
              const isDirty = glSections.some((s) => {
                if (isCellDirty(`adviser:${s.tempId}`)) return true;
                return gl.subjects.some((sub) => {
                  if (sub.subject_type === "SSES" && s.section_type !== "SSES")
                    return false;
                  return isCellDirty(
                    `subject:${s.tempId}:${sub.curriculum_subject_id}`,
                  );
                });
              });

              return (
                <GradeLevelPanel
                  key={gl.grade_level_id}
                  displayName={gl.display_name}
                  isDirty={isDirty}
                  hasPanelErrors={hasErrors}
                >
                  {/* Desktop */}
                  <div className="hidden sm:block">
                    <TableScrollContainer minWidth={600} type="native">
                      <Table
                        verticalSpacing="sm"
                        horizontalSpacing="md"
                        highlightOnHover
                        style={{ tableLayout: "auto" }}
                      >
                        <TableThead>
                          <TableTr>
                            <TableTh
                              style={{ minWidth: 160, fontSize: "0.875rem" }}
                            >
                              Class
                            </TableTh>
                            <TableTh
                              style={{ minWidth: 200, fontSize: "0.875rem" }}
                            >
                              Adviser
                            </TableTh>
                            {gl.subjects.map((sub) => (
                              <TableTh
                                key={sub.curriculum_subject_id}
                                style={{ minWidth: 200, fontSize: "0.875rem" }}
                              >
                                <Group gap={4} wrap="nowrap" align="center">
                                  <Text size="sm" fw={600} span>
                                    {sub.code}
                                  </Text>
                                  <Tooltip
                                    label={
                                      sub.subject_type === "SSES" ? (
                                        <Box>
                                          <Text size="sm">{sub.name}</Text>
                                          <Text size="sm" fs="italic">
                                            SSES-exclusive
                                          </Text>
                                        </Box>
                                      ) : (
                                        sub.name
                                      )
                                    }
                                    withArrow
                                    maw={220}
                                  >
                                    <IconInfoCircle
                                      size={14}
                                      color="#808898"
                                      style={{ cursor: "help", flexShrink: 0 }}
                                    />
                                  </Tooltip>
                                </Group>
                              </TableTh>
                            ))}
                          </TableTr>
                        </TableThead>
                        <TableTbody>
                          {glSections.map((section) => {
                            const adviserKey: FacultyCellKey = `adviser:${section.tempId}`;
                            const adviserValue = getCellValue(adviserKey);
                            const adviserBg = resolveCellBg(
                              !adviserValue,
                              isCellDirty(adviserKey),
                            );

                            return (
                              <TableTr key={section.tempId}>
                                <TableTd>
                                  <Group gap={6} wrap="nowrap" align="center">
                                    <Text
                                      size="sm"
                                      fw={500}
                                      style={{ whiteSpace: "nowrap" }}
                                    >
                                      {section.name}
                                    </Text>
                                    <SectionTypeBadge
                                      type={section.section_type}
                                    />
                                  </Group>
                                </TableTd>

                                <TableTd>
                                  <AssignmentTrigger
                                    value={adviserValue}
                                    displayName={
                                      adviserValue
                                        ? (facultyNames.get(adviserValue) ?? null)
                                        : null
                                    }
                                    bg={adviserBg}
                                    onOpen={() =>
                                      setPickerState({
                                        key: adviserKey,
                                        mode: "adviser",
                                        assignedUid: adviserValue,
                                        currentAssignedName: adviserValue
                                          ? (facultyNames.get(adviserValue) ??
                                            "Assigned faculty")
                                          : null,
                                        assignmentLabel: `Class: ${section.name}`,
                                      })
                                    }
                                    onClear={() =>
                                      confirmClearAssignment(
                                        <>
                                          Are you sure you want to remove the
                                          assigned adviser for{" "}
                                          <Text span fw={700}>
                                            {section.name}
                                          </Text>
                                          ?
                                        </>,
                                        adviserKey,
                                      )
                                    }
                                  />
                                </TableTd>

                                {gl.subjects.map((sub) => {
                                  const applicable =
                                    sub.subject_type === "BOTH" ||
                                    section.section_type === "SSES";

                                  if (!applicable) {
                                    return (
                                      <TableTd key={sub.curriculum_subject_id} />
                                    );
                                  }

                                  const subKey: FacultyCellKey = `subject:${section.tempId}:${sub.curriculum_subject_id}`;
                                  const subValue = getCellValue(subKey);
                                  const subBg = resolveCellBg(
                                    !subValue,
                                    isCellDirty(subKey),
                                  );

                                  return (
                                    <TableTd key={sub.curriculum_subject_id}>
                                      <AssignmentTrigger
                                        value={subValue}
                                        displayName={
                                          subValue
                                            ? (facultyNames.get(subValue) ?? null)
                                            : null
                                        }
                                        bg={subBg}
                                        onOpen={() =>
                                          setPickerState({
                                            key: subKey,
                                            mode: "subject",
                                            assignedUid: subValue,
                                            currentAssignedName: subValue
                                              ? (facultyNames.get(subValue) ??
                                                "Assigned faculty")
                                              : null,
                                            assignmentLabel: `Class: ${section.name} - Subject: ${sub.code}`,
                                          })
                                        }
                                        onClear={() =>
                                          confirmClearAssignment(
                                            <>
                                              Are you sure you want to remove the
                                              assigned subject teacher for{" "}
                                              <Text span fw={700}>
                                                {section.name} - {sub.name} (
                                                {sub.code})
                                              </Text>
                                              ?
                                            </>,
                                            subKey,
                                          )
                                        }
                                      />
                                    </TableTd>
                                  );
                                })}
                              </TableTr>
                            );
                          })}
                        </TableTbody>
                      </Table>
                    </TableScrollContainer>
                  </div>

                  {/* Mobile */}
                  <div className="sm:hidden">
                    {glSections.map((section) => {
                      const mAdviserKey: FacultyCellKey = `adviser:${section.tempId}`;
                      const mAdviserValue = getCellValue(mAdviserKey);
                      return (
                        <SectionMobileAssignmentRow
                          key={section.tempId}
                          section={section}
                          adviserValue={mAdviserValue}
                          adviserDisplayName={
                            mAdviserValue
                              ? (facultyNames.get(mAdviserValue) ?? null)
                              : null
                          }
                          adviserBg={resolveCellBg(
                            !mAdviserValue,
                            isCellDirty(mAdviserKey),
                          )}
                          onOpenAdviser={() =>
                            setPickerState({
                              key: mAdviserKey,
                              mode: "adviser",
                              assignedUid: mAdviserValue,
                              currentAssignedName: mAdviserValue
                                ? (facultyNames.get(mAdviserValue) ??
                                  "Assigned faculty")
                                : null,
                              assignmentLabel: `Class: ${section.name}`,
                            })
                          }
                          onClearAdviser={() =>
                            confirmClearAssignment(
                              <>
                                Are you sure you want to remove the assigned
                                adviser for{" "}
                                <Text span fw={700}>
                                  {section.name}
                                </Text>
                                ?
                              </>,
                              mAdviserKey,
                            )
                          }
                          subjectAssignments={gl.subjects
                            .filter(
                              (sub) =>
                                sub.subject_type === "BOTH" ||
                                section.section_type === "SSES",
                            )
                            .map((sub) => {
                              const mSubKey: FacultyCellKey = `subject:${section.tempId}:${sub.curriculum_subject_id}`;
                              const mSubValue = getCellValue(mSubKey);
                              return {
                                code: sub.code,
                                name: sub.name,
                                curriculum_subject_id:
                                  sub.curriculum_subject_id,
                                value: mSubValue,
                                displayName: mSubValue
                                  ? (facultyNames.get(mSubValue) ?? null)
                                  : null,
                                bg: resolveCellBg(
                                  !mSubValue,
                                  isCellDirty(mSubKey),
                                ),
                                onOpen: () =>
                                  setPickerState({
                                    key: mSubKey,
                                    mode: "subject",
                                    assignedUid: mSubValue,
                                    currentAssignedName: mSubValue
                                      ? (facultyNames.get(mSubValue) ??
                                        "Assigned faculty")
                                      : null,
                                    assignmentLabel: `Class: ${section.name} - Subject: ${sub.code}`,
                                  }),
                                onClear: () =>
                                  confirmClearAssignment(
                                    <>
                                      Are you sure you want to remove the
                                      assigned subject teacher for{" "}
                                      <Text span fw={700}>
                                        {section.name} - {sub.name} ({sub.code})
                                      </Text>
                                      ?
                                    </>,
                                    mSubKey,
                                  ),
                              };
                            })}
                        />
                      );
                    })}
                  </div>
                </GradeLevelPanel>
              );
            })}
          </Stack>
        </Box>
        {hasPrevSy && (
          <Button
            onClick={() => {
              let resetId!: string;
              resetId = modals.openConfirmModal({
                title: "Change setup mode?",
                children: (
                  <>
                    <EnterToConfirm
                      onEnter={() => {
                        onResetMode();
                        modals.close(resetId);
                      }}
                    />
                    <Text size="sm">
                      Going back will discard all faculty assignments you have
                      configured so far. This cannot be undone.
                    </Text>
                  </>
                ),
                labels: { confirm: "Yes, go back", cancel: "Keep editing" },
                confirmProps: { color: "red" },
                onConfirm: onResetMode,
                ...confirmModalProps,
              });
            }}
            variant="default"
            radius="md"
            leftSection={<IconArrowLeft size={16} />}
          >
            Back to mode selection
          </Button>
        )}
      </Box>
      <Stack gap="md">
        <Group justify="space-between" align="flex-end"></Group>

        <MasterlistAssignmentModal
          opened={pickerState !== null}
          mode={pickerState?.mode ?? "adviser"}
          currentAssignedUid={pickerState?.assignedUid ?? null}
          currentAssignedName={pickerState?.currentAssignedName ?? null}
          assignmentLabel={pickerState?.assignmentLabel ?? ""}
          assignedAdviserUids={assignedAdviserUids}
          teachingLoadByTeacher={masterlistTeachingLoad}
          onClose={() => setPickerState(null)}
          onAssign={(uid) => {
            if (!pickerState) return;
            handleCellChange(pickerState.key, uid);
            setPickerState(null);
          }}
        />
      </Stack>
    </Box>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function resolveCellBg(empty: boolean, dirty: boolean): string | undefined {
  if (empty) return ERROR_BG;
  if (dirty) return DIRTY_BG;
  return undefined;
}

// ── Grade level panel ─────────────────────────────────────────────────────────

function GradeLevelPanel({
  displayName,
  isDirty,
  hasPanelErrors,
  children,
}: {
  displayName: string;
  isDirty: boolean;
  hasPanelErrors: boolean;
  children: React.ReactNode;
}) {
  const [opened, setOpened] = useState(false);
  const headerBg = isDirty ? DIRTY_BG : "#ffffff";

  return (
    <Box
      style={{
        border: `1px solid ${BORDER_COLOR}`,
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <UnstyledButton
        onClick={() => setOpened((o) => !o)}
        style={{
          width: "100%",
          backgroundColor: headerBg,
          transition: "background-color 200ms ease",
        }}
        px="md"
        py={12}
      >
        <Group justify="space-between" align="center">
          <Group gap={6} wrap="nowrap" align="center">
            <Text fw={700} size="sm">
              {displayName}
            </Text>
            {hasPanelErrors && (
              <Tooltip
                label="This grade level has incomplete faculty assignments."
                withArrow
                position="top"
              >
                <IconAlertTriangle
                  size={16}
                  color="#EF4444"
                  style={{ flexShrink: 0 }}
                />
              </Tooltip>
            )}
          </Group>
          <IconChevronDown
            size={16}
            color="#555"
            style={{
              transform: opened ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 200ms ease",
            }}
          />
        </Group>
      </UnstyledButton>

      <Collapse in={opened}>{opened && children}</Collapse>
    </Box>
  );
}

// ── Section type badge ────────────────────────────────────────────────────────

function SectionTypeBadge({ type }: { type: WizardSection["section_type"] }) {
  const isSses = type === "SSES";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: "0.7rem",
        fontWeight: 600,
        backgroundColor: isSses ? "#70A2FF" : "#B3B4B4",
        color: "#fff",
        flexShrink: 0,
        whiteSpace: "nowrap",
      }}
    >
      {isSses ? "SSES" : "Regular"}
    </span>
  );
}

// ── Section mobile assignment row ─────────────────────────────────────────────

function SectionMobileAssignmentRow({
  section,
  adviserValue,
  adviserDisplayName,
  adviserBg,
  onOpenAdviser,
  onClearAdviser,
  subjectAssignments,
}: {
  section: WizardSection;
  adviserValue: string | null;
  adviserDisplayName: string | null;
  adviserBg: string | undefined;
  onOpenAdviser: () => void;
  onClearAdviser: () => void;
  subjectAssignments: {
    code: string;
    name: string;
    curriculum_subject_id: number;
    value: string | null;
    displayName: string | null;
    bg: string | undefined;
    onOpen: () => void;
    onClear: () => void;
  }[];
}) {
  const [opened, { toggle }] = useDisclosure(false);
  return (
    <>
      <div onClick={toggle} style={{ cursor: "pointer", padding: "12px 4px" }}>
        <Group gap="xs" wrap="nowrap">
          <IconChevronRight
            size={16}
            style={{
              transform: opened ? "rotate(90deg)" : "rotate(0deg)",
              transition: "transform 200ms ease",
              flexShrink: 0,
              color: "#808898",
            }}
          />
          <Group
            gap={6}
            wrap="nowrap"
            align="center"
            style={{ flex: 1, minWidth: 0 }}
          >
            <Text
              fw={500}
              fz="md"
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {section.name}
            </Text>
            <SectionTypeBadge type={section.section_type} />
          </Group>
        </Group>
      </div>
      <Collapse in={opened}>
        <Box pb="md" pl={28} pr={4}>
          <Text
            size="sm"
            c="#298925"
            fw={700}
            tt="uppercase"
            mb={4}
            style={{ letterSpacing: "0.04em" }}
          >
            Adviser
          </Text>
          <Box mb="sm">
            <AssignmentTrigger
              value={adviserValue}
              displayName={adviserDisplayName}
              bg={adviserBg}
              onOpen={onOpenAdviser}
              onClear={onClearAdviser}
            />
          </Box>
          {subjectAssignments.map((sub) => (
            <div key={sub.curriculum_subject_id}>
              <Text
                size="sm"
                c="#298925"
                fw={700}
                tt="uppercase"
                mb={4}
                style={{ letterSpacing: "0.04em" }}
              >
                {sub.code}
              </Text>
              <Box mb="sm">
                <AssignmentTrigger
                  value={sub.value}
                  displayName={sub.displayName}
                  bg={sub.bg}
                  onOpen={sub.onOpen}
                  onClear={sub.onClear}
                />
              </Box>
            </div>
          ))}
        </Box>
      </Collapse>
      <Divider />
    </>
  );
}

// ── Assignment trigger ────────────────────────────────────────────────────────

function AssignmentTrigger({
  value,
  displayName,
  bg,
  onOpen,
  onClear,
}: {
  value: string | null;
  displayName: string | null;
  bg: string | undefined;
  onOpen: () => void;
  onClear: () => void;
}) {
  return (
    <Box
      style={{
        minHeight: 36,
        border: "1px solid var(--mantine-color-gray-4)",
        borderRadius: 8,
        backgroundColor: bg ?? "#FFFFFF",
        padding: "6px 8px",
      }}
    >
      {value ? (
        <Group justify="space-between" wrap="nowrap" gap="xs">
          <Text
            size="sm"
            fw={500}
            onClick={onOpen}
            style={{
              cursor: "pointer",
              flex: 1,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {displayName ?? "Assigned faculty"}
          </Text>
          <Group gap={4} wrap="nowrap">
            <Tooltip label="Change assignment" withArrow position="top">
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                aria-label="Change assignment"
                onClick={onOpen}
              >
                <IconPencil size={14} stroke={1.8} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Remove assignment" withArrow position="top">
              <ActionIcon
                variant="subtle"
                color="red"
                size="sm"
                aria-label="Remove assignment"
                onClick={onClear}
              >
                <IconX size={14} stroke={1.8} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      ) : (
        <Group justify="center">
          <Tooltip label="Assign faculty" withArrow position="top">
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              aria-label="Assign faculty"
              onClick={onOpen}
            >
              <IconPlus size={16} stroke={1.8} />
            </ActionIcon>
          </Tooltip>
        </Group>
      )}
    </Box>
  );
}
