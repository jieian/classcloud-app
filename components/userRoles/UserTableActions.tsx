"use client";

import { ActionIcon, Group } from "@mantine/core";
import { IconPencil, IconTrash } from "@tabler/icons-react";
import { useDisclosure } from "@mantine/hooks";
import type { UserWithRoles } from "@/lib/userRolesService";
import EditUserDrawer from "./EditUserDrawer";

interface UserTableActionsProps {
  user: UserWithRoles;
  onUpdate: () => void;
}

export default function UserTableActions({
  user,
  onUpdate,
}: UserTableActionsProps) {
  const [drawerOpened, { open: openDrawer, close: closeDrawer }] =
    useDisclosure(false);

  const handleSuccess = () => {
    onUpdate();
  };

  const handleDelete = () => {
    // TODO: Implement delete functionality
    console.log("Delete user:", user.user_id);
  };

  return (
    <>
      <Group gap={0} justify="flex-end">
        <ActionIcon
          variant="subtle"
          color="gray"
          aria-label="Edit user"
          onClick={openDrawer}
        >
          <IconPencil size={16} stroke={1.5} />
        </ActionIcon>
        <ActionIcon
          variant="subtle"
          color="red"
          aria-label="Delete user"
          onClick={handleDelete}
        >
          <IconTrash size={16} stroke={1.5} />
        </ActionIcon>
      </Group>

      <EditUserDrawer
        opened={drawerOpened}
        onClose={closeDrawer}
        user={user}
        onSuccess={handleSuccess}
      />
    </>
  );
}
