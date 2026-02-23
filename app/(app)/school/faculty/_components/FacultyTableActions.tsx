"use client";

import { ActionIcon, Group } from "@mantine/core";
import { IconPencil, IconTrash } from "@tabler/icons-react";
import type { FacultyMember } from "../_lib/facultyService";

interface FacultyTableActionsProps {
  faculty: FacultyMember;
  onUpdate: () => void;
}

export default function FacultyTableActions({
  faculty: _faculty,
  onUpdate: _onUpdate,
}: FacultyTableActionsProps) {
  return (
    <Group gap={0} justify="flex-end">
      <ActionIcon
        variant="subtle"
        color="gray"
        aria-label="Edit faculty"
      >
        <IconPencil size={16} stroke={1.5} />
      </ActionIcon>
      <ActionIcon
        variant="subtle"
        color="red"
        aria-label="Delete faculty"
      >
        <IconTrash size={16} stroke={1.5} />
      </ActionIcon>
    </Group>
  );
}
