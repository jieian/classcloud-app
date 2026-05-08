"use client";

import { useEffect, useState } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Collapse,
  Divider,
  Group,
  Paper,
  Stack,
  Table,
  Text,
  ThemeIcon,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconChevronDown,
  IconChevronUp,
  IconInfoCircle,
  IconLock,
  IconPencil,
  IconTrash,
  IconUsersGroup,
} from "@tabler/icons-react";
import { useMediaQuery } from "@mantine/hooks";
import type { UseFormReturnType } from "@mantine/form";
import type {
  CreateSchoolYearForm,
  PreviousSySnapshot,
  WizardCurriculumDetail,
  WizardSection,
} from "../_lib/types";
import { modals } from "@mantine/modals";
import { replicateSections } from "../_lib/replicateService";
import AddClassModal from "./AddClassModal";

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

function buildSsesSections(
  gradeLevels: WizardCurriculumDetail["grade_levels"],
): WizardSection[] {
  return gradeLevels.map((gl) => ({
    tempId: crypto.randomUUID(),
    name: `SSES`,
    grade_level_id: gl.grade_level_id,
    section_type: "SSES" as const,
  }));
}

const SSES_INFO_TOOLTIP = "Auto-generated — Curriculum includes SSES.";
const SSES_LOCK_TOOLTIP = "Auto-generated — cannot be edited or deleted.";

interface StepDefineClassesProps {
  form: UseFormReturnType<CreateSchoolYearForm>;
  curriculumDetail: WizardCurriculumDetail;
  prevSy: {
    sy_id: number;
    start_year: number;
    curriculum_id: number | null;
  } | null;
  snapshot: PreviousSySnapshot | null;
  snapshotLoading: boolean;
  onSnapshotNeeded: () => Promise<void>;
  onFacultyDraftReset: () => void;
}

export default function StepDefineClasses({
  form,
  curriculumDetail,
  prevSy,
  snapshot,
  snapshotLoading,
  onSnapshotNeeded,
  onFacultyDraftReset,
}: StepDefineClassesProps) {
  const hasPrevSy = prevSy !== null;
  const mode = form.values.step3Mode;
  const hasAnySses = curriculumDetail.grade_levels.some(
    (gl) => gl.hasSsesSubjects,
  );

  // Auto-seed SSES sections when there's no previous SY (no mode picker shown)
  useEffect(() => {
    if (hasPrevSy || !hasAnySses) return;
    const hasSsesSections = form.values.sections.some(
      (s) => s.section_type === "SSES",
    );
    if (!hasSsesSections) {
      form.setFieldValue("sections", [
        ...buildSsesSections(curriculumDetail.grade_levels),
        ...form.values.sections,
      ]);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mode picker (only shown if prevSy exists and no mode chosen yet) ─────────
  if (hasPrevSy && mode === null) {
    return (
      <ModePicker
        onSelect={async (selected) => {
          if (selected === "replicate") {
            await onSnapshotNeeded();
          }
          form.setFieldValue("step3Mode", selected);
          if (selected === "replicate" && snapshot) {
            const replicated = replicateSections(snapshot, curriculumDetail);
            const regularSections = replicated.filter(
              (s) => s.section_type !== "SSES",
            );
            const ssesSections = hasAnySses
              ? buildSsesSections(curriculumDetail.grade_levels)
              : [];
            form.setFieldValue("sections", [
              ...ssesSections,
              ...regularSections,
            ]);
            onFacultyDraftReset();
          } else if (selected === "scratch") {
            const ssesSections = hasAnySses
              ? buildSsesSections(curriculumDetail.grade_levels)
              : [];
            form.setFieldValue("sections", ssesSections);
            onFacultyDraftReset();
          }
        }}
        snapshotLoading={snapshotLoading}
      />
    );
  }

  return (
    <ClassEditor
      form={form}
      curriculumDetail={curriculumDetail}
      hasPrevSy={hasPrevSy}
      onResetMode={() => {
        form.setFieldValue("step3Mode", null);
        form.setFieldValue("sections", []);
        onFacultyDraftReset();
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
        Define Classes
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
            <IconUsersGroup size={36} />
          </ThemeIcon>
          <Text fw={600} size="lg" ta="center" mb="md">
            How would you like to set up the classes?
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

// ── Class editor ───────────────────────────────────────────────────────────────

interface ClassEditorProps {
  form: UseFormReturnType<CreateSchoolYearForm>;
  curriculumDetail: WizardCurriculumDetail;
  hasPrevSy: boolean;
  onResetMode: () => void;
}

function ClassEditor({
  form,
  curriculumDetail,
  hasPrevSy,
  onResetMode,
}: ClassEditorProps) {
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

  const [addModalState, setAddModalState] = useState<{
    grade_level_id: number;
    gradeDisplayName: string;
    editSection: WizardSection | null;
  } | null>(null);

  function openAddModal(grade_level_id: number, gradeDisplayName: string) {
    setAddModalState({ grade_level_id, gradeDisplayName, editSection: null });
  }

  function openEditModal(section: WizardSection, gradeDisplayName: string) {
    setAddModalState({
      grade_level_id: section.grade_level_id,
      gradeDisplayName,
      editSection: section,
    });
  }

  function handleAddSection(data: {
    name: string;
    section_type: "SSES" | "REGULAR";
  }) {
    if (!addModalState) return;
    const newSection: WizardSection = {
      tempId: crypto.randomUUID(),
      name: data.name,
      grade_level_id: addModalState.grade_level_id,
      section_type: data.section_type,
    };
    form.setFieldValue("sections", [...form.values.sections, newSection]);
  }

  function handleEditSection(data: {
    name: string;
    section_type: "SSES" | "REGULAR";
  }) {
    if (!addModalState?.editSection) return;
    const { tempId } = addModalState.editSection;
    form.setFieldValue(
      "sections",
      form.values.sections.map((s) =>
        s.tempId === tempId
          ? { ...s, name: data.name, section_type: data.section_type }
          : s,
      ),
    );
  }

  function handleDeleteSection(tempId: string) {
    form.setFieldValue(
      "sections",
      form.values.sections.filter((s) => s.tempId !== tempId),
    );
  }

  return (
    <Box>
      <Text size="xl" fw={700} mb="md" c="#298925">
        Define Classes
      </Text>

      <Box
        p="lg"
        style={{
          border: "1px solid #B8B8B8",
          borderRadius: "8px",
        }}
      >
        <Text size="lg" fw={700} mb="xs" c="#298925">
          Classes
        </Text>
        <Text size="sm" mb="lg" c="dimmed">
          Define the classes for this school year.
        </Text>

        <Text size="sm" fw={700} c="gray.7" mb="sm">
          Classes{" "}
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
          {(() => {
            const hasAnySses = curriculumDetail.grade_levels.some(
              (gl) => gl.hasSsesSubjects,
            );
            return (
              <Stack gap="sm">
                {curriculumDetail.grade_levels.map((gl) => {
                  const glSections = form.values.sections.filter(
                    (s) => s.grade_level_id === gl.grade_level_id,
                  );
                  const hasRegular = glSections.some(
                    (s) => s.section_type === "REGULAR",
                  );
                  const hasSses = glSections.some(
                    (s) => s.section_type === "SSES",
                  );
                  const missingRegular = !hasRegular;
                  const missingSSES = hasAnySses && !hasSses;
                  const hasError = missingRegular || missingSSES;

                  const errorTooltip =
                    missingRegular && missingSSES
                      ? "Missing regular and SSES section"
                      : missingRegular
                        ? "Missing regular section"
                        : missingSSES
                          ? "Missing SSES section"
                          : undefined;

                  return (
                    <GradeLevelSection
                      key={gl.grade_level_id}
                      title={gl.display_name}
                      count={glSections.length}
                      missingSSES={hasError}
                      needsSses={hasAnySses}
                      errorTooltip={errorTooltip}
                    >
                      <Stack gap="sm">
                        {missingRegular && (
                          <Alert
                            variant="filled"
                            radius="md"
                            styles={{
                              root: { backgroundColor: "#FF6666" },
                              icon: { alignSelf: "center", marginTop: 0 },
                            }}
                            icon={
                              <ThemeIcon
                                color="white"
                                variant="transparent"
                                size="md"
                              >
                                <IconAlertTriangle size={20} />
                              </ThemeIcon>
                            }
                          >
                            <Text fw={700} size="sm">
                              Regular Section Required
                            </Text>
                            <Text size="sm" fs="italic">
                              This grade level requires at least one regular
                              section.
                            </Text>
                          </Alert>
                        )}
                        {missingSSES && (
                          <Alert
                            variant="filled"
                            radius="md"
                            styles={{
                              root: { backgroundColor: "#FF6666" },
                              icon: { alignSelf: "center", marginTop: 0 },
                            }}
                            icon={
                              <ThemeIcon
                                color="white"
                                variant="transparent"
                                size="md"
                              >
                                <IconAlertTriangle size={20} />
                              </ThemeIcon>
                            }
                          >
                            <Text fw={700} size="sm">
                              SSES Section Required
                            </Text>
                            <Text size="sm" fs="italic">
                              This grade level requires at least one SSES
                              section.
                            </Text>
                          </Alert>
                        )}

                        {glSections.length > 0 && (
                          <>
                            {/* Desktop */}
                            <div className="hidden sm:block">
                              <Table
                                withColumnBorders
                                withTableBorder
                                fz="sm"
                                style={
                                  {
                                    "--table-border-color": "#ced4da",
                                  } as React.CSSProperties
                                }
                              >
                                <Table.Thead>
                                  <Table.Tr>
                                    <Table.Th style={sectionTh}>
                                      Class Name
                                    </Table.Th>
                                    <Table.Th
                                      style={{ ...sectionTh, width: 120 }}
                                    >
                                      Type
                                    </Table.Th>
                                    <Table.Th
                                      style={{ ...sectionTh, width: 80 }}
                                    >
                                      Actions
                                    </Table.Th>
                                  </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                  {glSections.map((s) => (
                                    <Table.Tr key={s.tempId}>
                                      <Table.Td>
                                        <Group gap={4} wrap="nowrap">
                                          <Text size="sm">{s.name}</Text>
                                          {s.section_type === "SSES" && (
                                            <Tooltip
                                              label={SSES_INFO_TOOLTIP}
                                              withArrow
                                              multiline
                                              w={260}
                                            >
                                              <IconInfoCircle
                                                size={14}
                                                color="#70A2FF"
                                                style={{
                                                  cursor: "pointer",
                                                  flexShrink: 0,
                                                }}
                                              />
                                            </Tooltip>
                                          )}
                                        </Group>
                                      </Table.Td>
                                      <Table.Td>
                                        <Badge
                                          color={
                                            s.section_type === "SSES"
                                              ? "#70A2FF"
                                              : "#B3B4B4"
                                          }
                                          variant="filled"
                                          size="sm"
                                          style={{ cursor: "default" }}
                                        >
                                          {s.section_type === "SSES"
                                            ? "SSES"
                                            : "Regular"}
                                        </Badge>
                                      </Table.Td>
                                      <Table.Td>
                                        {s.section_type === "SSES" ? (
                                          <Tooltip
                                            label={SSES_LOCK_TOOLTIP}
                                            withArrow
                                            multiline
                                            w={260}
                                          >
                                            <ActionIcon
                                              variant="subtle"
                                              color="gray"
                                              size="sm"
                                            >
                                              <IconLock size={14} />
                                            </ActionIcon>
                                          </Tooltip>
                                        ) : (
                                          <Group gap={4} wrap="nowrap">
                                            <ActionIcon
                                              variant="subtle"
                                              color="gray"
                                              size="sm"
                                              onClick={() =>
                                                openEditModal(
                                                  s,
                                                  gl.display_name,
                                                )
                                              }
                                            >
                                              <IconPencil size={14} />
                                            </ActionIcon>
                                            <ActionIcon
                                              variant="subtle"
                                              color="red"
                                              size="sm"
                                              onClick={() => {
                                                let delId!: string;
                                                delId = modals.openConfirmModal({
                                                  title: "Delete class?",
                                                  children: (
                                                    <>
                                                      <EnterToConfirm
                                                        onEnter={() => {
                                                          handleDeleteSection(s.tempId);
                                                          modals.close(delId);
                                                        }}
                                                      />
                                                      <Text size="sm">
                                                        Delete{" "}
                                                        <strong>{s.name}</strong>?
                                                        This cannot be undone.
                                                      </Text>
                                                    </>
                                                  ),
                                                  labels: {
                                                    confirm: "Delete",
                                                    cancel: "Cancel",
                                                  },
                                                  confirmProps: {
                                                    color: "red",
                                                  },
                                                  onConfirm: () =>
                                                    handleDeleteSection(s.tempId),
                                                  ...confirmModalProps,
                                                });
                                              }}
                                            >
                                              <IconTrash size={14} />
                                            </ActionIcon>
                                          </Group>
                                        )}
                                      </Table.Td>
                                    </Table.Tr>
                                  ))}
                                </Table.Tbody>
                              </Table>
                            </div>
                            {/* Mobile */}
                            <div className="sm:hidden">
                              {glSections.map((s) => (
                                <SectionMobileRow
                                  key={s.tempId}
                                  section={s}
                                  isAutoGenerated={s.section_type === "SSES"}
                                  onEdit={() =>
                                    openEditModal(s, gl.display_name)
                                  }
                                  onDelete={() => {
                                    let delId!: string;
                                    delId = modals.openConfirmModal({
                                      title: "Delete class?",
                                      children: (
                                        <>
                                          <EnterToConfirm
                                            onEnter={() => {
                                              handleDeleteSection(s.tempId);
                                              modals.close(delId);
                                            }}
                                          />
                                          <Text size="sm">
                                            Delete <strong>{s.name}</strong>? This
                                            cannot be undone.
                                          </Text>
                                        </>
                                      ),
                                      labels: {
                                        confirm: "Delete",
                                        cancel: "Cancel",
                                      },
                                      confirmProps: { color: "red" },
                                      onConfirm: () =>
                                        handleDeleteSection(s.tempId),
                                      ...confirmModalProps,
                                    });
                                  }}
                                />
                              ))}
                            </div>
                          </>
                        )}

                        <Box
                          style={{
                            border: "1px solid #4EAE4A",
                            borderRadius: "6px",
                          }}
                        >
                          <Button
                            variant="subtle"
                            color="#4EAE4A"
                            size="sm"
                            fullWidth
                            onClick={() =>
                              openAddModal(gl.grade_level_id, gl.display_name)
                            }
                          >
                            + Add a class
                          </Button>
                        </Box>
                      </Stack>
                    </GradeLevelSection>
                  );
                })}
              </Stack>
            );
          })()}
        </Box>

        {addModalState && (
          <AddClassModal
            opened={addModalState !== null}
            onClose={() => setAddModalState(null)}
            grade_level_id={addModalState.grade_level_id}
            gradeDisplayName={addModalState.gradeDisplayName}
            existingSections={form.values.sections}
            editSection={addModalState.editSection}
            onAddSection={
              addModalState.editSection ? handleEditSection : handleAddSection
            }
          />
        )}

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
                      Going back will discard all classes you have configured so
                      far. This cannot be undone.
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
    </Box>
  );
}

const sectionTh: React.CSSProperties = {
  backgroundColor: "#4EAE4A",
  color: "#fff",
  fontWeight: 600,
  padding: "8px 12px",
};

function GradeLevelSection({
  title,
  count,
  missingSSES,
  errorTooltip,
  children,
}: {
  title: string;
  count: number;
  missingSSES: boolean;
  needsSses: boolean;
  errorTooltip?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Paper withBorder radius="md" style={{ overflow: "hidden" }}>
      <UnstyledButton
        onClick={() => setOpen((v) => !v)}
        style={{ width: "100%", padding: "12px 16px" }}
      >
        <Group justify="space-between">
          <Group gap="xs">
            <Text fw={700} size="sm">
              {title}{" "}
              <Text span c="dimmed" fw={400}>
                ({count})
              </Text>
            </Text>
            {missingSSES && errorTooltip && (
              <Tooltip label={errorTooltip} withArrow position="right">
                <IconAlertTriangle size={16} color="red" />
              </Tooltip>
            )}
          </Group>
          {open ? (
            <IconChevronUp size={16} color="#808898" />
          ) : (
            <IconChevronDown size={16} color="#808898" />
          )}
        </Group>
      </UnstyledButton>
      <Collapse in={open}>
        <div style={{ borderTop: "1px solid #ced4da", padding: "16px 20px" }}>
          {children}
        </div>
      </Collapse>
    </Paper>
  );
}

function SectionMobileRow({
  section,
  isAutoGenerated,
  onEdit,
  onDelete,
}: {
  section: WizardSection;
  isAutoGenerated: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <>
      <div style={{ padding: "10px 4px" }}>
        <Group justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
            <Group gap={4} wrap="nowrap" style={{ minWidth: 0 }}>
              <Text
                fw={500}
                fz="sm"
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {section.name}
              </Text>
              {isAutoGenerated && (
                <Tooltip label={SSES_INFO_TOOLTIP} withArrow multiline w={240}>
                  <IconInfoCircle
                    size={14}
                    color="#70A2FF"
                    style={{ cursor: "pointer", flexShrink: 0 }}
                  />
                </Tooltip>
              )}
            </Group>
            <Badge
              color={section.section_type === "SSES" ? "#70A2FF" : "#B3B4B4"}
              variant="filled"
              size="sm"
              style={{ cursor: "default", flexShrink: 0 }}
            >
              {section.section_type === "SSES" ? "SSES" : "Regular"}
            </Badge>
          </Group>
          {isAutoGenerated ? (
            <Tooltip label={SSES_LOCK_TOOLTIP} withArrow multiline w={240}>
              <ActionIcon variant="subtle" color="gray" size="sm">
                <IconLock size={14} />
              </ActionIcon>
            </Tooltip>
          ) : (
            <Group gap={4} wrap="nowrap">
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                onClick={onEdit}
              >
                <IconPencil size={14} />
              </ActionIcon>
              <ActionIcon
                variant="subtle"
                color="red"
                size="sm"
                onClick={onDelete}
              >
                <IconTrash size={14} />
              </ActionIcon>
            </Group>
          )}
        </Group>
      </div>
      <Divider />
    </>
  );
}
