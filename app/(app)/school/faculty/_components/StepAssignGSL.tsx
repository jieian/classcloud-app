"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Box,
  Collapse,
  Group,
  Paper,
  Text,
  ThemeIcon,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import {
  IconChevronDown,
  IconChevronUp,
  IconInfoCircle,
  IconUser,
} from "@tabler/icons-react";
import type { UseFormReturnType } from "@mantine/form";
import type {
  AddFacultyForm,
  WizardGSLGrade,
  WizardGSLSlot,
} from "../_lib/teachingLoadService";

interface StepAssignGSLProps {
  form: UseFormReturnType<AddFacultyForm>;
  gslData: WizardGSLGrade[];
  facultyUid: string;
}

// ── "No Role" option ───────────────────────────────────────────────────────────

function NoneOption({
  selected,
  disabled,
  onSelect,
}: {
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <UnstyledButton
      onClick={disabled ? undefined : onSelect}
      mb="md"
      style={{
        display: "block",
        width: "100%",
        padding: "10px 14px",
        borderRadius: 8,
        border: `2px solid ${selected ? "#adb5bd" : "#dee2e6"}`,
        backgroundColor: "#f1f3f5",
        cursor: disabled ? "default" : "pointer",
        transition: "border-color 150ms ease",
      }}
    >
      <Group gap="sm" align="center">
        <Box
          style={{
            width: 18,
            height: 18,
            borderRadius: "50%",
            border: `2px solid ${selected ? "#adb5bd" : "#ced4da"}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            transition: "border-color 150ms ease",
          }}
        >
          {selected && (
            <Box
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                backgroundColor: "#adb5bd",
              }}
            />
          )}
        </Box>
        <Text fw={selected ? 600 : 500} size="sm" c={selected ? "#495057" : "#868e96"}>
          No Grade Subject Leader Role
        </Text>
      </Group>
    </UnstyledButton>
  );
}

// ── Subject row ────────────────────────────────────────────────────────────────

function SubjectRow({
  slot,
  isSelected,
  isTaken,
  isMobile,
  tooltipOpen,
  onSelect,
  onTooltipToggle,
}: {
  slot: WizardGSLSlot;
  isSelected: boolean;
  isTaken: boolean;
  isMobile: boolean;
  tooltipOpen: boolean;
  onSelect: () => void;
  onTooltipToggle: () => void;
}) {
  return (
    <UnstyledButton
      component="div"
      onClick={isTaken ? undefined : onSelect}
      style={{
        display: "block",
        width: "100%",
        padding: "8px 4px",
        cursor: isTaken ? "not-allowed" : "pointer",
      }}
    >
      <Group gap="sm" wrap="nowrap" align="center">
        <Box
          style={{
            width: 18,
            height: 18,
            borderRadius: "50%",
            border: `2px solid ${isSelected ? "#4A72AE" : "#ced4da"}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            transition: "border-color 150ms ease",
          }}
        >
          {isSelected && (
            <Box
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                backgroundColor: "#4A72AE",
              }}
            />
          )}
        </Box>

        <Group gap={6} wrap="nowrap" align="center" style={{ flex: 1, minWidth: 0 }}>
          <Text
            fw={isSelected ? 600 : 500}
            size="sm"
            c={isTaken ? "#adb5bd" : "inherit"}
            style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {slot.subject_name}
          </Text>
          {slot.subject_type === "SSES" && (
            <Badge
              size="xs"
              variant="filled"
              radius="xl"
              style={{ backgroundColor: "#70A2FF", color: "#fff", flexShrink: 0 }}
            >
              SSES
            </Badge>
          )}
          {isTaken && (
            <Tooltip
              label={`Assigned to: ${slot.leader_name ?? "another faculty"}`}
              position="right"
              withArrow
              opened={isMobile ? tooltipOpen : undefined}
            >
              <IconUser
                size={14}
                color="#aaa"
                style={{ cursor: isMobile ? "pointer" : "help", flexShrink: 0 }}
                onClick={
                  isMobile
                    ? (e) => {
                        e.stopPropagation();
                        onTooltipToggle();
                      }
                    : undefined
                }
              />
            </Tooltip>
          )}
        </Group>
      </Group>
    </UnstyledButton>
  );
}

// ── Grade level collapsible ────────────────────────────────────────────────────

function GradePanel({
  grade,
  selectedCsId,
  selectedGlId,
  facultyUid,
  isMobile,
  openTooltipKey,
  onSelect,
  onTooltipToggle,
}: {
  grade: WizardGSLGrade;
  selectedCsId: number | null;
  selectedGlId: number | null;
  facultyUid: string;
  isMobile: boolean;
  openTooltipKey: string | null;
  onSelect: (slot: WizardGSLSlot) => void;
  onTooltipToggle: (key: string) => void;
}) {
  const [opened, { toggle }] = useDisclosure(false);

  const sortedSubjects = useMemo(() => {
    return [...grade.subjects].sort((a, b) => {
      const aAvail = a.leader_uid === null || a.leader_uid === facultyUid ? 0 : 1;
      const bAvail = b.leader_uid === null || b.leader_uid === facultyUid ? 0 : 1;
      if (aAvail !== bAvail) return aAvail - bAvail;
      const aSses = a.subject_type === "SSES" ? 0 : 1;
      const bSses = b.subject_type === "SSES" ? 0 : 1;
      if (aSses !== bSses) return aSses - bSses;
      return a.subject_name.localeCompare(b.subject_name);
    });
  }, [grade.subjects, facultyUid]);

  return (
    <Paper withBorder radius="md" style={{ overflow: "hidden", marginBottom: 8 }}>
      <UnstyledButton onClick={toggle} style={{ width: "100%", padding: "12px 16px" }}>
        <Group justify="space-between" align="center" wrap="nowrap">
          <Text fw={700} size="sm">{grade.display_name}</Text>
          {opened ? (
            <IconChevronUp size={16} color="#808898" />
          ) : (
            <IconChevronDown size={16} color="#808898" />
          )}
        </Group>
      </UnstyledButton>

      <Collapse in={opened}>
        <div style={{ borderTop: "1px solid #ced4da", padding: "12px 16px" }}>
          {sortedSubjects.map((slot) => {
            const isTaken = slot.leader_uid !== null && slot.leader_uid !== facultyUid;
            const isSelected =
              selectedCsId === slot.curriculum_subject_id &&
              selectedGlId === slot.grade_level_id;
            const tooltipKey = String(slot.curriculum_subject_id);
            return (
              <SubjectRow
                key={slot.curriculum_subject_id}
                slot={slot}
                isSelected={isSelected}
                isTaken={isTaken}
                isMobile={isMobile}
                tooltipOpen={openTooltipKey === tooltipKey}
                onSelect={() => onSelect(slot)}
                onTooltipToggle={() => onTooltipToggle(tooltipKey)}
              />
            );
          })}
        </div>
      </Collapse>
    </Paper>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function StepAssignGSL({
  form,
  gslData,
  facultyUid,
}: StepAssignGSLProps) {
  const isMobile = useMediaQuery("(max-width: 768px)");
  const [openTooltipKey, setOpenTooltipKey] = useState<string | null>(null);

  const noneSelected = form.values.gsl_curriculum_subject_id === null;

  const allTaken = useMemo(
    () =>
      gslData.length > 0 &&
      gslData.every((g) =>
        g.subjects.every(
          (s) => s.leader_uid !== null && s.leader_uid !== facultyUid,
        ),
      ),
    [gslData, facultyUid],
  );

  useEffect(() => {
    if (allTaken) {
      form.setFieldValue("gsl_curriculum_subject_id", null);
      form.setFieldValue("gsl_grade_level_id", null);
    }
  }, [allTaken]);

  const handleSelectNone = () => {
    form.setFieldValue("gsl_curriculum_subject_id", null);
    form.setFieldValue("gsl_grade_level_id", null);
  };

  const handleSelectSlot = (slot: WizardGSLSlot) => {
    form.setFieldValue("gsl_curriculum_subject_id", slot.curriculum_subject_id);
    form.setFieldValue("gsl_grade_level_id", slot.grade_level_id);
  };

  const handleTooltipToggle = (key: string) => {
    setOpenTooltipKey((k) => (k === key ? null : key));
  };

  return (
    <Box>
      <Text size="xl" fw={700} mb="md" c="#298925">
        Grade Subject Leader
      </Text>

      <Box p="lg" style={{ border: "1px solid #B8B8B8", borderRadius: "8px" }}>
        <Text size="lg" fw={700} mb="xs" c="#298925">
          Grade Subject Leader
        </Text>
        <Text size="sm" mb="lg" c="dimmed">
          <Text span fw={700} size="sm">
            Optional.
          </Text>{" "}
          Grade Subject Leaders monitor a specific subject within a single grade
          level across all sections, ensuring teachers of that subject submit
          their academic reports.
        </Text>

        {gslData.length === 0 ? (
          <Text size="sm" c="dimmed">
            No subjects have been configured for the active curriculum. You can
            skip this step.
          </Text>
        ) : (
          <>
            <NoneOption
              selected={noneSelected}
              disabled={allTaken}
              onSelect={handleSelectNone}
            />

            {allTaken ? (
              <Alert
                variant="filled"
                color="blue"
                radius="md"
                styles={{ icon: { alignSelf: "center", marginTop: 0 } }}
                icon={
                  <ThemeIcon color="white" variant="transparent" size="md">
                    <IconInfoCircle size={20} />
                  </ThemeIcon>
                }
              >
                <Text fw={700} size="sm">
                  All Grade Subject Leader Slots Are Filled
                </Text>
                <Text size="sm" fs="italic">
                  Every subject in every grade level already has a Grade Subject
                  Leader assigned. This faculty will not be assigned a grade
                  subject leader role.
                </Text>
              </Alert>
            ) : (
              gslData.map((grade) => (
                <GradePanel
                  key={grade.grade_level_id}
                  grade={grade}
                  selectedCsId={form.values.gsl_curriculum_subject_id}
                  selectedGlId={form.values.gsl_grade_level_id}
                  facultyUid={facultyUid}
                  isMobile={isMobile ?? false}
                  openTooltipKey={openTooltipKey}
                  onSelect={handleSelectSlot}
                  onTooltipToggle={handleTooltipToggle}
                />
              ))
            )}
          </>
        )}
      </Box>
    </Box>
  );
}
