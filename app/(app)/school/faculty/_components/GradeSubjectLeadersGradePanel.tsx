"use client";

import { useState } from "react";
import {
  Collapse,
  Group,
  Paper,
  Text,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconAlertTriangle,
  IconChevronDown,
  IconChevronUp,
} from "@tabler/icons-react";
import type { GradeSubjectLeaderRow, SubjectLeaderEntry } from "../_lib/facultyService";
import GradeSubjectLeadersTable from "./GradeSubjectLeadersTable";
import EditGradeSubjectLeaderModal from "./EditGradeSubjectLeaderModal";

interface GradeSubjectLeadersGradePanelProps {
  row: GradeSubjectLeaderRow;
  assignedLeaderUids: Set<string>;
  onRefresh: () => void;
}

export default function GradeSubjectLeadersGradePanel({
  row,
  assignedLeaderUids,
  onRefresh,
}: GradeSubjectLeadersGradePanelProps) {
  const [opened, { toggle }] = useDisclosure(false);
  const [editingEntry, setEditingEntry] = useState<SubjectLeaderEntry | null>(null);

  const hasIncomplete = row.subjects.some((s) => s.leader === null);

  return (
    <Paper withBorder radius="md" style={{ overflow: "hidden", marginBottom: 8 }}>
      <UnstyledButton
        onClick={toggle}
        style={{ width: "100%", padding: "12px 16px" }}
      >
        <Group justify="space-between" align="center" wrap="nowrap">
          <Group gap={6} align="center" wrap="nowrap">
            <Text fw={700} size="sm">
              {row.display_name}
            </Text>
            <Text c="#808898" size="sm">
              ({row.subjects.length})
            </Text>
            {hasIncomplete && (
              <Tooltip label={`Missing grade subject leader in ${row.display_name}`}>
                <IconAlertTriangle
                  size={16}
                  color="#c4a827"
                  style={{ flexShrink: 0 }}
                />
              </Tooltip>
            )}
          </Group>
          {opened ? (
            <IconChevronUp size={16} color="#808898" />
          ) : (
            <IconChevronDown size={16} color="#808898" />
          )}
        </Group>
      </UnstyledButton>

      <Collapse in={opened}>
        <div style={{ borderTop: "1px solid #ced4da", padding: "16px 20px" }}>
          <GradeSubjectLeadersTable
            subjects={row.subjects}
            onEdit={setEditingEntry}
            editingOpen={editingEntry !== null}
          />
        </div>
      </Collapse>

      <EditGradeSubjectLeaderModal
        opened={editingEntry !== null}
        entry={editingEntry}
        assignedLeaderUids={assignedLeaderUids}
        onClose={() => setEditingEntry(null)}
        onAssigned={async () => {
          setEditingEntry(null);
          onRefresh();
        }}
      />
    </Paper>
  );
}
