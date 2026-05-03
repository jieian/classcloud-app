"use client";

import { useState } from "react";
import {
  Box,
  Collapse,
  Group,
  Text,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { IconAlertTriangle, IconChevronDown } from "@tabler/icons-react";
import MasterlistTable from "./MasterlistTable";
import type {
  MasterlistGradeLevel,
  MasterlistTeacherLoad,
} from "../../_lib/masterlistService";

interface GradeLevelPanelProps {
  gradeLevel: MasterlistGradeLevel;
  isDirty: boolean;
  hasPanelErrors: boolean;
  showValidation: boolean;
  getCellValue: (key: string) => string | null;
  isCellDirty: (key: string) => boolean;
  facultyNames: Map<string, string>;
  assignedAdviserUids: Set<string>;
  teachingLoadByTeacher: Map<string, MasterlistTeacherLoad[]>;
  onCellChange: (key: string, value: string | null) => void;
}

const CLEAN_BG = "#ffffff";
const DIRTY_BG = "#FFE6B8";
const BORDER_COLOR = "var(--mantine-color-gray-3)";

export default function GradeLevelPanel({
  gradeLevel,
  isDirty,
  hasPanelErrors,
  showValidation,
  getCellValue,
  isCellDirty,
  facultyNames,
  assignedAdviserUids,
  teachingLoadByTeacher,
  onCellChange,
}: GradeLevelPanelProps) {
  const [opened, setOpened] = useState(false);

  // Validation error overrides dirty, dirty overrides clean
  const headerBg = isDirty ? DIRTY_BG : CLEAN_BG;

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
              {gradeLevel.display_name}
            </Text>
            {showValidation && hasPanelErrors && (
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

      <Collapse in={opened}>
        {opened && (
          <MasterlistTable
            sections={gradeLevel.sections}
            subjects={gradeLevel.subjects}
            getCellValue={getCellValue}
            isCellDirty={isCellDirty}
            facultyNames={facultyNames}
            assignedAdviserUids={assignedAdviserUids}
            teachingLoadByTeacher={teachingLoadByTeacher}
            onCellChange={onCellChange}
            showValidation={showValidation}
          />
        )}
      </Collapse>
    </Box>
  );
}
