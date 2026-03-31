"use client";

import {
  Box,
  Collapse,
  Divider,
  Group,
  Skeleton,
  Text,
  Tooltip,
  UnstyledButton,
  Checkbox,
} from "@mantine/core";
import { IconChevronDown } from "@tabler/icons-react";
import { useState, useMemo } from "react";
import type { Permission } from "../../users/_lib/userRolesService";

// ---------------------------------------------------------------------------
// Static permission group structure
// ---------------------------------------------------------------------------

type PermOption = { permName: string; display: string };
type PermRow = { label: string; type: "radio" | "checkbox"; options: PermOption[] };
type PermGroup = { label: string; rows: PermRow[] };

const PERMISSION_GROUPS: PermGroup[] = [
  {
    label: "Users and Roles",
    rows: [
      {
        label: "User Management",
        type: "radio",
        options: [{ permName: "users.full_access", display: "Full Access" }],
      },
      {
        label: "Roles Management",
        type: "radio",
        options: [{ permName: "roles.full_access", display: "Full Access" }],
      },
    ],
  },
  {
    label: "School",
    rows: [
      {
        label: "School Year",
        type: "radio",
        options: [{ permName: "school_year.full_access", display: "Full Access" }],
      },
      {
        label: "Faculty",
        type: "radio",
        options: [{ permName: "faculty.full_access", display: "Full Access" }],
      },
      {
        label: "Curriculum",
        type: "radio",
        options: [
          { permName: "curriculum.full_access", display: "Full Access" },
          { permName: "curriculum.limited_access", display: "Limited Access" },
        ],
      },
      {
        label: "Classes",
        type: "radio",
        options: [{ permName: "classes.full_access", display: "Full Access" }],
      },
      {
        label: "Students",
        type: "radio",
        options: [
          { permName: "students.full_access", display: "Full Access" },
          { permName: "students.limited_access", display: "Limited Access" },
        ],
      },
    ],
  },
  {
    label: "Examinations",
    rows: [
      {
        label: "Examinations",
        type: "radio",
        options: [
          { permName: "exams.full_access", display: "Full Access" },
          { permName: "exams.limited_access", display: "Limited Access" },
        ],
      },
    ],
  },
  {
    label: "Reports",
    rows: [
      {
        label: "View",
        type: "radio",
        options: [
          { permName: "reports.view_all", display: "View All" },
          { permName: "reports.view_assigned", display: "View Assigned" },
        ],
      },
      {
        label: "Monitor",
        type: "checkbox",
        options: [
          { permName: "reports.monitor_grade_level", display: "Grade Level" },
          { permName: "reports.monitor_subjects", display: "Subjects" },
        ],
      },
      {
        label: "Approve",
        type: "checkbox",
        options: [{ permName: "reports.approve", display: "Approve Reports" }],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Friendly label map — permName → "Row Label — Display" for review screens
// Reports group uses the group label instead of the short row label ("View",
// "Monitor", "Approve") since those are ambiguous without context.
// ---------------------------------------------------------------------------

export const PERM_DISPLAY_MAP: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const group of PERMISSION_GROUPS) {
    for (const row of group.rows) {
      for (const opt of row.options) {
        const prefix =
          group.label === "Reports" ? group.label : row.label;
        map[opt.permName] = `${prefix} — ${opt.display}`;
      }
    }
  }
  return map;
})();

// ---------------------------------------------------------------------------
// GroupBlock — collapsible section header
// ---------------------------------------------------------------------------

function GroupBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const [opened, setOpened] = useState(false);

  return (
    <Box>
      <UnstyledButton
        onClick={() => setOpened((o) => !o)}
        style={{ width: "100%", padding: "8px 0" }}
      >
        <Group justify="space-between">
          <Text fw={700} size="sm">
            {label}
          </Text>
          <IconChevronDown
            size={14}
            color="#555"
            style={{
              transform: opened ? "rotate(180deg)" : undefined,
              transition: "transform 200ms ease",
            }}
          />
        </Group>
      </UnstyledButton>
      <Collapse in={opened}>{children}</Collapse>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// PermissionsPanel — the main exported component
// ---------------------------------------------------------------------------

interface PermissionsPanelProps {
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  availablePermissions: Permission[];
  loading?: boolean;
}

export function PermissionsPanel({
  selectedIds,
  onChange,
  availablePermissions,
  loading,
}: PermissionsPanelProps) {
  const permByName = useMemo(
    () => new Map(availablePermissions.map((p) => [p.name, p])),
    [availablePermissions],
  );

  const handleRadioClick = (permName: string, rowOptions: PermOption[]) => {
    const clicked = permByName.get(permName);
    if (!clicked) return;

    const rowIds = rowOptions
      .map((o) => permByName.get(o.permName)?.permission_id)
      .filter((id): id is number => id !== undefined);

    if (selectedIds.includes(clicked.permission_id)) {
      // Already selected — deselect
      onChange(selectedIds.filter((id) => !rowIds.includes(id)));
    } else {
      // Select this one, remove any other in the same row
      onChange([
        ...selectedIds.filter((id) => !rowIds.includes(id)),
        clicked.permission_id,
      ]);
    }
  };

  const handleCheckboxToggle = (permName: string) => {
    const perm = permByName.get(permName);
    if (!perm) return;
    if (selectedIds.includes(perm.permission_id)) {
      onChange(selectedIds.filter((id) => id !== perm.permission_id));
    } else {
      onChange([...selectedIds, perm.permission_id]);
    }
  };

  if (loading) {
    return (
      <Box p="lg" style={{ border: "1px solid #e0e0e0", borderRadius: 8 }}>
        {[...Array(6)].map((_, i) => (
          <Box key={i}>
            <Skeleton height={20} radius="sm" my="sm" />
            {i < 5 && <Divider />}
          </Box>
        ))}
      </Box>
    );
  }

  return (
    <Box p="lg" style={{ border: "1px solid #e0e0e0", borderRadius: 8 }}>
      <Text fw={600} mb="md" c="#808898" size="sm">
        Permissions
      </Text>

      {PERMISSION_GROUPS.map((group, gIdx) => (
        <Box key={group.label}>
          {gIdx > 0 && <Divider mb="xs" />}
          <GroupBlock label={group.label}>
            {group.rows.map((row, rIdx) => (
              <Box key={row.label}>
                <Group py="sm" gap={0} align="center" wrap="nowrap">
                  <Text size="sm" c="#555" style={{ minWidth: 130 }}>
                    {row.label}
                  </Text>
                  <Divider orientation="vertical" mx="sm" style={{ height: 18 }} />
                  <Group gap="lg">
                    {row.options.map((opt) => {
                      const perm = permByName.get(opt.permName);
                      const isSelected = perm
                        ? selectedIds.includes(perm.permission_id)
                        : false;

                      if (row.type === "radio") {
                        return (
                          <Tooltip
                            key={opt.permName}
                            label={perm?.description ?? ""}
                            withArrow
                            disabled={!perm?.description}
                            multiline
                            w={220}
                          >
                            <UnstyledButton
                              onClick={() =>
                                handleRadioClick(opt.permName, row.options)
                              }
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                              }}
                            >
                              <Box
                                style={{
                                  width: 16,
                                  height: 16,
                                  borderRadius: "50%",
                                  border: `2px solid ${isSelected ? "#4EAE4A" : "#adb5bd"}`,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  flexShrink: 0,
                                }}
                              >
                                {isSelected && (
                                  <Box
                                    style={{
                                      width: 7,
                                      height: 7,
                                      borderRadius: "50%",
                                      background: "#4EAE4A",
                                    }}
                                  />
                                )}
                              </Box>
                              <Text size="sm">{opt.display}</Text>
                            </UnstyledButton>
                          </Tooltip>
                        );
                      }

                      return (
                        <Tooltip
                          key={opt.permName}
                          label={perm?.description ?? ""}
                          withArrow
                          disabled={!perm?.description}
                          multiline
                          w={220}
                        >
                          <Checkbox
                            checked={isSelected}
                            onChange={() => handleCheckboxToggle(opt.permName)}
                            label={opt.display}
                            disabled={!perm}
                            color="#4EAE4A"
                          />
                        </Tooltip>
                      );
                    })}
                  </Group>
                </Group>
                {rIdx < group.rows.length - 1 && <Divider />}
              </Box>
            ))}
          </GroupBlock>
        </Box>
      ))}
    </Box>
  );
}
