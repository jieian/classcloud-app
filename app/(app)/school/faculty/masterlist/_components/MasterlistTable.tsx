"use client";

import {
  ActionIcon,
  Badge,
  Box,
  Collapse,
  Divider,
  Group,
  Table,
  TableScrollContainer,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
  Text,
  Tooltip,
} from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { IconChevronRight, IconInfoCircle, IconPencil, IconPlus, IconX } from "@tabler/icons-react";
import { useState } from "react";
import type {
  MasterlistSection,
  MasterlistSubject,
  MasterlistTeacherLoad,
} from "../../_lib/masterlistService";
import MasterlistAssignmentModal from "./MasterlistAssignmentModal";

interface MasterlistTableProps {
  sections: MasterlistSection[];
  subjects: MasterlistSubject[];
  getCellValue: (key: string) => string | null;
  isCellDirty: (key: string) => boolean;
  facultyNames: Map<string, string>;
  assignedAdviserUids: Set<string>;
  teachingLoadByTeacher: Map<string, MasterlistTeacherLoad[]>;
  onCellChange: (key: string, value: string | null) => void;
  showValidation: boolean;
}

const DIRTY_BG = "#FFE6B8";
const ERROR_BG = "#FECACA";

function resolveCellBg(empty: boolean, dirty: boolean, showValidation: boolean): string | undefined {
  if (showValidation && empty) return ERROR_BG;
  if (dirty) return DIRTY_BG;
  return undefined;
}

interface AssignmentTriggerProps {
  value: string | null;
  displayName: string | null;
  bg: string | undefined;
  onOpen: () => void;
  onClear: () => void;
}

function AssignmentTrigger({
  value,
  displayName,
  bg,
  onOpen,
  onClear,
}: AssignmentTriggerProps) {
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

function SectionTypeBadge({ type }: { type: string }) {
  if (type !== "SSES") return null;
  return (
    <Badge
      size="xs"
      radius="xl"
      variant="filled"
      style={{ backgroundColor: "#70A2FF", color: "#FFFFFF", textTransform: "none" }}
    >
      SSES
    </Badge>
  );
}

function SectionMobileAssignmentRow({
  section,
  subjects,
  getCellValue,
  isCellDirty,
  facultyNames,
  showValidation,
  onOpenPicker,
  onClear,
}: {
  section: MasterlistSection;
  subjects: MasterlistSubject[];
  getCellValue: (key: string) => string | null;
  isCellDirty: (key: string) => boolean;
  facultyNames: Map<string, string>;
  showValidation: boolean;
  onOpenPicker: (key: string, mode: "adviser" | "subject", assignedUid: string | null, currentAssignedName: string | null, assignmentLabel: string) => void;
  onClear: (content: React.ReactNode, key: string) => void;
}) {
  const [opened, { toggle }] = useDisclosure(false);
  const adviserKey = `adviser:${section.section_id}`;
  const adviserValue = getCellValue(adviserKey);
  const adviserBg = resolveCellBg(!adviserValue, isCellDirty(adviserKey), showValidation);

  const applicableSubjects = subjects.filter(
    (sub) => sub.subject_type === "BOTH" || section.section_type === "SSES",
  );

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
          <Text
            fw={500}
            fz="md"
            style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {section.name}
          </Text>
        </Group>
      </div>

      <Collapse in={opened}>
        <Box pb="md" pl={28} pr={4}>
          <Text size="xs" c="dimmed" fw={600} tt="uppercase" mb={4} style={{ letterSpacing: "0.04em" }}>
            Adviser
          </Text>
          <Box mb="sm">
            <AssignmentTrigger
              value={adviserValue}
              displayName={adviserValue ? (facultyNames.get(adviserValue) ?? null) : null}
              bg={adviserBg}
              onOpen={() =>
                onOpenPicker(
                  adviserKey,
                  "adviser",
                  adviserValue,
                  adviserValue ? (facultyNames.get(adviserValue) ?? "Assigned faculty") : null,
                  `Class: ${section.name}`,
                )
              }
              onClear={() =>
                onClear(
                  <>
                    Are you sure you want to remove the assigned adviser for{" "}
                    <Text span fw={700}>{section.name}</Text>?
                  </>,
                  adviserKey,
                )
              }
            />
          </Box>

          {applicableSubjects.map((sub) => {
            const subKey = `subject:${section.section_id}:${sub.curriculum_subject_id}`;
            const subValue = getCellValue(subKey);
            const subBg = resolveCellBg(!subValue, isCellDirty(subKey), showValidation);
            return (
              <div key={sub.curriculum_subject_id}>
                <Group gap={4} wrap="nowrap" align="center" mb={4}>
                  <Text size="xs" c="dimmed" fw={600} tt="uppercase" style={{ letterSpacing: "0.04em" }}>
                    {sub.code}
                  </Text>
                  <Tooltip label={sub.name} withArrow multiline maw={220} events={{ hover: false, focus: false, touch: true }}>
                    <IconInfoCircle size={13} color="#808898" style={{ cursor: "pointer", flexShrink: 0 }} />
                  </Tooltip>
                  <SectionTypeBadge type={sub.subject_type} />
                </Group>
                <Box mb="sm">
                  <AssignmentTrigger
                    value={subValue}
                    displayName={subValue ? (facultyNames.get(subValue) ?? null) : null}
                    bg={subBg}
                    onOpen={() =>
                      onOpenPicker(
                        subKey,
                        "subject",
                        subValue,
                        subValue ? (facultyNames.get(subValue) ?? "Assigned faculty") : null,
                        `Class: ${section.name} - Subject: ${sub.code}`,
                      )
                    }
                    onClear={() =>
                      onClear(
                        <>
                          Are you sure you want to remove the assigned subject teacher for{" "}
                          <Text span fw={700}>{section.name} - {sub.name} ({sub.code})</Text>?
                        </>,
                        subKey,
                      )
                    }
                  />
                </Box>
              </div>
            );
          })}
        </Box>
      </Collapse>
      <Divider />
    </>
  );
}

export default function MasterlistTable({
  sections,
  subjects,
  getCellValue,
  isCellDirty,
  facultyNames,
  assignedAdviserUids,
  teachingLoadByTeacher,
  onCellChange,
  showValidation,
}: MasterlistTableProps) {
  const [pickerState, setPickerState] = useState<{
    key: string;
    mode: "adviser" | "subject";
    assignedUid: string | null;
    currentAssignedName: string | null;
    assignmentLabel: string;
  } | null>(null);
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

  function confirmClearAssignment(content: React.ReactNode, key: string) {
    modals.openConfirmModal({
      title: "Remove assignment?",
      children: <Text size="sm">{content}</Text>,
      labels: { confirm: "Remove assignment", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: () => onCellChange(key, null),
      ...confirmModalProps,
    });
  }

  if (sections.length === 0) {
    return (
      <Text c="dimmed" ta="center" py="xl" size="sm">
        No classes for this grade level.
      </Text>
    );
  }

  function openPicker(
    key: string,
    mode: "adviser" | "subject",
    assignedUid: string | null,
    currentAssignedName: string | null,
    assignmentLabel: string,
  ) {
    setPickerState({ key, mode, assignedUid, currentAssignedName, assignmentLabel });
  }

  return (
    <>
      {/* Desktop table */}
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
              <TableTh style={{ minWidth: 160, fontSize: "0.875rem" }}>Class</TableTh>
              <TableTh style={{ minWidth: 200, fontSize: "0.875rem" }}>Adviser</TableTh>
              {subjects.map((subject) => (
                <TableTh
                  key={subject.curriculum_subject_id}
                  style={{ minWidth: 200, fontSize: "0.875rem" }}
                >
                  <Group gap={4} wrap="nowrap" align="center">
                    <Text size="sm" fw={600} span>
                      {subject.code}
                    </Text>
                    <Tooltip label={subject.name} withArrow multiline maw={220}>
                      <IconInfoCircle
                        size={14}
                        color="#808898"
                        style={{ cursor: "help", flexShrink: 0 }}
                      />
                    </Tooltip>
                    <SectionTypeBadge type={subject.subject_type} />
                  </Group>
                </TableTh>
              ))}
            </TableTr>
          </TableThead>
          <TableTbody>
            {sections.map((section) => {
              const adviserKey = `adviser:${section.section_id}`;
              const adviserDirty = isCellDirty(adviserKey);
              const adviserValue = getCellValue(adviserKey);
              const adviserBg = resolveCellBg(!adviserValue, adviserDirty, showValidation);

              return (
                <TableTr key={section.section_id}>
                  <TableTd>
                    <Text size="sm" fw={500} style={{ whiteSpace: "nowrap" }}>
                      {section.name}
                    </Text>
                  </TableTd>

                  <TableTd>
                    <AssignmentTrigger
                      value={adviserValue}
                      displayName={adviserValue ? (facultyNames.get(adviserValue) ?? null) : null}
                      bg={adviserBg}
                      onOpen={() =>
                        openPicker(
                          adviserKey, "adviser", adviserValue,
                          adviserValue ? (facultyNames.get(adviserValue) ?? "Assigned faculty") : null,
                          `Class: ${section.name}`,
                        )
                      }
                      onClear={() =>
                        confirmClearAssignment(
                          <>
                            Are you sure you want to remove the assigned adviser for{" "}
                            <Text span fw={700}>{section.name}</Text>?
                          </>,
                          adviserKey,
                        )
                      }
                    />
                  </TableTd>

                  {subjects.map((subject) => {
                    const isApplicable =
                      subject.subject_type === "BOTH" || section.section_type === "SSES";

                    if (!isApplicable) {
                      return <TableTd key={subject.curriculum_subject_id} />;
                    }

                    const subjectKey = `subject:${section.section_id}:${subject.curriculum_subject_id}`;
                    const subjectDirty = isCellDirty(subjectKey);
                    const subjectValue = getCellValue(subjectKey);
                    const subjectBg = resolveCellBg(!subjectValue, subjectDirty, showValidation);

                    return (
                      <TableTd key={subject.curriculum_subject_id}>
                        <AssignmentTrigger
                          value={subjectValue}
                          displayName={subjectValue ? (facultyNames.get(subjectValue) ?? null) : null}
                          bg={subjectBg}
                          onOpen={() =>
                            openPicker(
                              subjectKey, "subject", subjectValue,
                              subjectValue ? (facultyNames.get(subjectValue) ?? "Assigned faculty") : null,
                              `Class: ${section.name} - Subject: ${subject.code}`,
                            )
                          }
                          onClear={() =>
                            confirmClearAssignment(
                              <>
                                Are you sure you want to remove the assigned subject teacher for{" "}
                                <Text span fw={700}>
                                  {section.name} - {subject.name} ({subject.code})
                                </Text>?
                              </>,
                              subjectKey,
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

      {/* Mobile accordion list */}
      <div className="sm:hidden">
        <Divider />
        {sections.map((section) => (
          <SectionMobileAssignmentRow
            key={section.section_id}
            section={section}
            subjects={subjects}
            getCellValue={getCellValue}
            isCellDirty={isCellDirty}
            facultyNames={facultyNames}
            showValidation={showValidation}
            onOpenPicker={openPicker}
            onClear={confirmClearAssignment}
          />
        ))}
      </div>

      <MasterlistAssignmentModal
        opened={pickerState !== null}
        mode={pickerState?.mode ?? "adviser"}
        currentAssignedUid={pickerState?.assignedUid ?? null}
        currentAssignedName={pickerState?.currentAssignedName ?? null}
        assignmentLabel={pickerState?.assignmentLabel ?? ""}
        assignedAdviserUids={assignedAdviserUids}
        teachingLoadByTeacher={teachingLoadByTeacher}
        onClose={() => setPickerState(null)}
        onAssign={(uid, _name) => {
          if (!pickerState) return;
          onCellChange(pickerState.key, uid);
          setPickerState(null);
        }}
      />
    </>
  );
}
