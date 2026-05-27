"use client";

import { useRef, useState } from "react";
import {
  Alert,
  Collapse,
  Group,
  Text,
  ThemeIcon,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconAlertTriangle, IconChevronDown } from "@tabler/icons-react";
import GradeSubjectLeadersContent, {
  type GradeSubjectLeadersContentRef,
} from "./GradeSubjectLeadersContent";

export default function GradeSubjectLeadersSection() {
  const [opened, { toggle }] = useDisclosure(false);
  const [assignedCount, setAssignedCount] = useState<number | null>(null);
  const [hasIncompleteAssignments, setHasIncompleteAssignments] = useState(false);
  const contentRef = useRef<GradeSubjectLeadersContentRef>(null);

  return (
    <div>
      <UnstyledButton onClick={toggle} w="100%">
        <Group justify="space-between" align="center">
          <h2
            className="mb-3 text-2xl font-bold"
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            Grade Subject Leaders{" "}
            {assignedCount !== null && (
              <span className="text-[#808898]">({assignedCount})</span>
            )}
            {hasIncompleteAssignments && (
              <span
                style={{
                  display: "inline-block",
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  backgroundColor: "#fa5252",
                  flexShrink: 0,
                  marginBottom: 2,
                }}
              />
            )}
          </h2>
          <IconChevronDown
            size={22}
            style={{
              transform: opened ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 200ms ease",
              color: "#808898",
              marginBottom: 12,
            }}
          />
        </Group>
      </UnstyledButton>

      <Collapse in={opened}>
        <p className="mb-3 text-sm text-[#808898]">
          Leads who monitor a specific subject within a single grade level across
          all sections. They ensure all teachers teaching that subject in their
          assigned grade complete and submit their academic reports.
        </p>

        {hasIncompleteAssignments && (
          <Alert
            variant="filled"
            radius="md"
            mb="md"
            styles={{
              root: {
                backgroundColor: "#fae173",
              },
              icon: {
                alignSelf: "center",
                marginTop: 0,
              },
            }}
            icon={
              <ThemeIcon color="#2A2A2A" variant="transparent" size="md">
                <IconAlertTriangle size={20} />
              </ThemeIcon>
            }
          >
            <Text fw={700} size="sm" c="#2A2A2A">
              Incomplete Grade Subject Leader Assignments
            </Text>
            <Text size="sm" fs="italic" c="#2A2A2A">
              One or more subjects in one or more grade levels currently have no
              assigned grade subject leader.
            </Text>
          </Alert>
        )}

        <GradeSubjectLeadersContent
          ref={contentRef}
          onCountChange={setAssignedCount}
          onIncompleteChange={setHasIncompleteAssignments}
        />
      </Collapse>
    </div>
  );
}
