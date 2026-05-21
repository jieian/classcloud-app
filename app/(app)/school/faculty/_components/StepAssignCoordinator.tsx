"use client";

import {
  Alert,
  Box,
  Collapse,
  Group,
  Paper,
  Text,
  ThemeIcon,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { useEffect, useMemo, useState } from "react";
import { useMediaQuery } from "@mantine/hooks";
import {
  IconChevronDown,
  IconChevronUp,
  IconInfoCircle,
  IconUser,
} from "@tabler/icons-react";
import type { UseFormReturnType } from "@mantine/form";
import type {
  AddFacultyForm,
  SubjectCoordinatorGroup,
} from "../_lib/teachingLoadService";
import SubjectBadge from "./SubjectBadge";

interface StepAssignCoordinatorProps {
  form: UseFormReturnType<AddFacultyForm>;
  coordinatorGroups: SubjectCoordinatorGroup[];
  facultyUid: string;
}

interface GroupCardProps {
  group: SubjectCoordinatorGroup;
  isSelected: boolean;
  isTakenByOther: boolean;
  onSelect: () => void;
}

function GroupCard({ group, isSelected, isTakenByOther, onSelect }: GroupCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const isMobile = useMediaQuery("(max-width: 768px)");

  const showSubjects = isSelected || expanded;

  return (
    <Paper
      withBorder
      radius="md"
      mb="xs"
      style={{
        overflow: "hidden",
        borderColor: isSelected ? "#4EAE4A" : isTakenByOther ? "#e9ecef" : undefined,
        borderWidth: isSelected ? 2 : 1,
        backgroundColor: isSelected ? "#f6fbf6" : isTakenByOther ? "#f8f9fa" : undefined,
        transition: "border-color 150ms ease, background-color 150ms ease",
      }}
    >
      {/* Header row */}
      <UnstyledButton
        component="div"
        onClick={isTakenByOther ? undefined : onSelect}
        style={{
          width: "100%",
          padding: "12px 16px",
          cursor: isTakenByOther ? "not-allowed" : "pointer",
        }}
      >
        <Group justify="space-between" wrap="nowrap" align="center">
          <Group gap="sm" wrap="nowrap" align="center" style={{ flex: 1, minWidth: 0 }}>
            {/* Custom radio indicator */}
            <Box
              style={{
                width: 18,
                height: 18,
                borderRadius: "50%",
                border: `2px solid ${isSelected ? "#4EAE4A" : "#ced4da"}`,
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
                    backgroundColor: "#4EAE4A",
                  }}
                />
              )}
            </Box>

            <Box style={{ flex: 1, minWidth: 0 }}>
              <Group gap="xs" wrap="nowrap" align="center">
                <Text
                  fw={isSelected ? 700 : 500}
                  size="sm"
                  c={isTakenByOther ? "#adb5bd" : isSelected ? "#298925" : "inherit"}
                >
                  {group.name}
                </Text>
                {isTakenByOther && (
                  <Text
                    size="xs"
                    fw={500}
                    style={{
                      backgroundColor: "#e9ecef",
                      color: "#868e96",
                      padding: "1px 6px",
                      borderRadius: 4,
                      flexShrink: 0,
                    }}
                  >
                    Assigned
                  </Text>
                )}
                {isTakenByOther && group.coordinator && (
                  <Tooltip
                    label={`Coordinator: ${group.coordinator.first_name} ${group.coordinator.last_name}`}
                    position="right"
                    withArrow
                    opened={isMobile ? tooltipOpen : undefined}
                  >
                    <IconUser
                      size={14}
                      color="#adb5bd"
                      style={{ cursor: isMobile ? "pointer" : "help" }}
                      onClick={isMobile ? (e) => {
                        e.stopPropagation();
                        setTooltipOpen((v) => !v);
                      } : undefined}
                    />
                  </Tooltip>
                )}
              </Group>
              {group.description && (
                <Text size="xs" c={isTakenByOther ? "#ced4da" : "dimmed"} mt={2}>
                  {group.description}
                </Text>
              )}
            </Box>
          </Group>

          {group.members.length > 0 && (
            <UnstyledButton
              onClick={(e) => {
                e.stopPropagation();
                setExpanded((v) => !v);
              }}
              style={{ flexShrink: 0, padding: "2px 4px" }}
              aria-label={expanded ? "Hide subjects" : "Show subjects"}
            >
              {showSubjects ? (
                <IconChevronUp size={14} color="#808898" />
              ) : (
                <IconChevronDown size={14} color="#808898" />
              )}
            </UnstyledButton>
          )}
        </Group>
      </UnstyledButton>

      {/* Subject badges */}
      <Collapse in={showSubjects && group.members.length > 0}>
        <div style={{ borderTop: "1px solid #e9ecef", padding: "10px 16px" }}>
          <Group gap={4} wrap="wrap">
            {group.members.map((m) => (
              <SubjectBadge
                key={m.curriculum_subject_id}
                code={m.code}
                subject_type={m.subject_type}
                subjectName={m.name}
                palette="coordinator"
              />
            ))}
          </Group>
        </div>
      </Collapse>
    </Paper>
  );
}

export default function StepAssignCoordinator({
  form,
  coordinatorGroups,
  facultyUid,
}: StepAssignCoordinatorProps) {
  const selectedGroupId = form.values.subject_group_id;

  const sortedGroups = useMemo(
    () => [...coordinatorGroups].sort((a, b) => a.name.localeCompare(b.name)),
    [coordinatorGroups],
  );

  const allTaken = useMemo(
    () =>
      sortedGroups.length > 0 &&
      sortedGroups.every(
        (g) => g.coordinator !== null && g.coordinator.uid !== facultyUid,
      ),
    [sortedGroups, facultyUid],
  );

  // Auto-select "none" when all groups are taken
  useEffect(() => {
    if (allTaken) {
      form.setFieldValue("subject_group_id", null);
    }
  }, [allTaken]);

  const handleSelect = (groupId: number | null) => {
    form.setFieldValue("subject_group_id", groupId);
  };

  const noneSelected = selectedGroupId === null;

  return (
    <Box>
      <Text size="xl" fw={700} mb="md" c="#298925">
        Subject Coordinator
      </Text>

      <Box p="lg" style={{ border: "1px solid #B8B8B8", borderRadius: "8px" }}>
        <Text size="lg" fw={700} mb="xs" c="#298925">
          Subject Coordinator
        </Text>
        <Text size="sm" mb="lg" c="dimmed">
          <Text span fw={700} size="sm">
            Optional.
          </Text>{" "}
          Subject coordinators oversee a specific subject group across all grade
          levels, ensuring teachers submit their academic reports on time.
        </Text>

        {coordinatorGroups.length === 0 ? (
          <Text size="sm" c="dimmed">
            No subject groups have been configured for the active curriculum.
            You can skip this step.
          </Text>
        ) : (
          <>
            {/* "None" option */}
            <UnstyledButton
              onClick={allTaken ? undefined : () => handleSelect(null)}
              mb="md"
              style={{
                display: "block",
                width: "100%",
                padding: "10px 14px",
                borderRadius: 8,
                border: `2px solid ${noneSelected ? "#adb5bd" : "#dee2e6"}`,
                backgroundColor: "#f1f3f5",
                cursor: allTaken ? "default" : "pointer",
                transition: "border-color 150ms ease",
              }}
            >
              <Group gap="sm" align="center">
                <Box
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    border: `2px solid ${noneSelected ? "#adb5bd" : "#ced4da"}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    transition: "border-color 150ms ease",
                  }}
                >
                  {noneSelected && (
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
                <Text
                  fw={noneSelected ? 600 : 500}
                  size="sm"
                  c={noneSelected ? "#495057" : "#868e96"}
                >
                  No Subject Coordinator Role
                </Text>
              </Group>
            </UnstyledButton>

            {allTaken ? (
              <Alert
                variant="filled"
                color="blue"
                radius="md"
                styles={{
                  icon: { alignSelf: "center", marginTop: 0 },
                }}
                icon={
                  <ThemeIcon color="white" variant="transparent" size="md">
                    <IconInfoCircle size={20} />
                  </ThemeIcon>
                }
              >
                <Text fw={700} size="sm">
                  All Subject Groups Are Already Assigned
                </Text>
                <Text size="sm" fs="italic">
                  Every subject group already has a coordinator. This faculty
                  will not be assigned a subject coordinator role.
                </Text>
              </Alert>
            ) : (
              sortedGroups.map((group) => {
                const isTakenByOther =
                  group.coordinator !== null &&
                  group.coordinator.uid !== facultyUid;
                const isSelected = selectedGroupId === group.subject_group_id;

                return (
                  <GroupCard
                    key={group.subject_group_id}
                    group={group}
                    isSelected={isSelected}
                    isTakenByOther={isTakenByOther}
                    onSelect={() => handleSelect(group.subject_group_id)}
                  />
                );
              })
            )}
          </>
        )}
      </Box>
    </Box>
  );
}
