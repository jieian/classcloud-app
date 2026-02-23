"use client";

import { ActionIcon } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import type { UserWithRoles } from "@/app/(app)/user-roles/users/_lib";

interface AddFacultyDrawerActionsProps {
  user: UserWithRoles;
  onUpdate: () => void;
}

export default function AddFacultyDrawerActions({
  user: _user,
  onUpdate: _onUpdate,
}: AddFacultyDrawerActionsProps) {
  return (
    <ActionIcon variant="subtle" color="#4EAE4A" aria-label="Add as faculty">
      <IconPlus size={16} stroke={1.5} />
    </ActionIcon>
  );
}
