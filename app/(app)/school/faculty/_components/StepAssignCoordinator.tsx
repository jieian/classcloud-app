"use client";

import {
  Box,
  Collapse,
  Group,
  Radio,
  Text,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { useState } from "react";
import { IconChevronDown, IconUser } from "@tabler/icons-react";
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
}

function GroupCard({ group, isSelected, isTakenByOther }: GroupCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Box
      mb="xs"
      style={{
        border: `1px solid ${isSelected ? "#4EAE4A" : "#e9ecef"}`,
        borderRadius: 8,
        backgroundColor: isSelected ? "#f0faf0" : "#fafafa",
        transition: "all 150ms ease",
        overflow: "hidden",
      }}
    >
      <Box px="md" py="xs">
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <Group
            wrap="nowrap"
            align="flex-start"
            gap="xs"
            style={{ flex: 1, minWidth: 0 }}
          >
            <Radio
              value={group.subject_group_id.toString()}
              disabled={isTakenByOther}
              mt={2}
            />
            <Box style={{ flex: 1, minWidth: 0 }}>
              <Group gap="xs" wrap="nowrap" align="center">
                <Text size="sm" fw={600}>
                  {group.name}
                </Text>
                {isTakenByOther && group.coordinator && (
                  <Tooltip
                    label={`Coordinator: ${group.coordinator.first_name} ${group.coordinator.last_name}`}
                    position="right"
                    withArrow
                  >
                    <IconUser
                      size={14}
                      color="#aaa"
                      style={{ cursor: "help" }}
                    />
                  </Tooltip>
                )}
              </Group>
              {group.description && (
                <Text size="xs" c="dimmed" mt={2}>
                  {group.description}
                </Text>
              )}
            </Box>
          </Group>

          {group.members.length > 0 && (
            <UnstyledButton
              onClick={() => setExpanded((v) => !v)}
              style={{ flexShrink: 0 }}
              aria-label={expanded ? "Hide subjects" : "Show subjects"}
            >
              <IconChevronDown
                size={14}
                color="#888"
                style={{
                  transform: expanded ? "rotate(180deg)" : undefined,
                  transition: "transform 200ms ease",
                }}
              />
            </UnstyledButton>
          )}
        </Group>

        {/* Subject badges — always visible when selected, expandable otherwise */}
        {(isSelected || expanded) && group.members.length > 0 && (
          <Group gap={4} mt="xs" wrap="wrap" pl={28}>
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
        )}

        <Collapse in={!isSelected && expanded && group.members.length === 0}>
          <Text size="xs" c="dimmed" pl={28} mt="xs">
            No subjects in this group.
          </Text>
        </Collapse>
      </Box>
    </Box>
  );
}

export default function StepAssignCoordinator({
  form,
  coordinatorGroups,
  facultyUid,
}: StepAssignCoordinatorProps) {
  const selectedValue =
    form.values.subject_group_id !== null
      ? form.values.subject_group_id.toString()
      : "none";

  const handleChange = (value: string) => {
    form.setFieldValue(
      "subject_group_id",
      value === "none" ? null : parseInt(value, 10),
    );
  };

  return (
    <Box>
      <Text size="lg" fw={700} mb="xs" c="#4EAE4A">
        Subject Coordinator Role
      </Text>
      <Text size="sm" c="dimmed" mb="lg">
        Subject Coordinator assignment is optional. They oversee a specific
        subject across all grade levels, ensuring all teachers in the group
        submit their academic reports on time.
      </Text>

      <Box p="lg" style={{ border: "1px solid #e0e0e0", borderRadius: "8px" }}>
        {coordinatorGroups.length === 0 ? (
          <Text size="sm" c="dimmed">
            No subject groups have been configured for the active curriculum.
            You can skip this step.
          </Text>
        ) : (
          <Radio.Group value={selectedValue} onChange={handleChange}>
            <Radio value="none" label="No Subject Coordinator Role" mb="md" />

            {coordinatorGroups.map((group) => {
              const isTakenByOther =
                group.coordinator !== null &&
                group.coordinator.uid !== facultyUid;
              const isSelected =
                form.values.subject_group_id === group.subject_group_id;

              return (
                <GroupCard
                  key={group.subject_group_id}
                  group={group}
                  isSelected={isSelected}
                  isTakenByOther={isTakenByOther}
                />
              );
            })}
          </Radio.Group>
        )}
      </Box>
    </Box>
  );
}
