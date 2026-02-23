"use client";

import { ActionIcon, Tooltip } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import type { UserWithRoles } from "@/app/(app)/user-roles/users/_lib";

interface AddFacultyDrawerActionsProps {
  user: UserWithRoles;
  onAdd: (uid: string) => void;
}

export default function AddFacultyDrawerActions({
  user,
  onAdd,
}: AddFacultyDrawerActionsProps) {
  return (
    <Tooltip label="Add as faculty">
      <ActionIcon
        variant="filled"
        color="#4EAE4A"
        aria-label="Add as faculty"
        style={{ backgroundColor: "#4EAE4A", color: "#FFFFFF" }}
        onClick={() => onAdd(user.uid)}
      >
        <IconPlus size={16} stroke={1.8} color="#FFFFFF" />
      </ActionIcon>
    </Tooltip>
  );
}
