"use client";

import { useState } from "react";
import {
  ActionIcon,
  Button,
  Group,
  Modal,
  Text,
  TextInput,
} from "@mantine/core";
import { IconPencil, IconTrash } from "@tabler/icons-react";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import type { RoleWithPermissions } from "../../users/_lib";
import { deleteRole, isRoleAttached } from "../../users/_lib";
import EditRoleDrawer from "./EditRoleDrawer";

interface RolesTableActionsProps {
  role: RoleWithPermissions;
  onUpdate: () => void;
}

export default function RolesTableActions({
  role,
  onUpdate,
}: RolesTableActionsProps) {
  const [drawerOpened, { open: openDrawer, close: closeDrawer }] =
    useDisclosure(false);
  const [deleteOpened, { open: openDelete, close: closeDelete }] =
    useDisclosure(false);
  const [attachedOpened, { open: openAttached, close: closeAttached }] =
    useDisclosure(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [checking, setChecking] = useState(false);
  const isAdmin = role.role_id === 1;

  const handleSuccess = () => {
    onUpdate();
  };

  const handleTrashClick = async () => {
    try {
      setChecking(true);
      const attached = await isRoleAttached(role.role_id);
      if (attached) {
        openAttached();
      } else {
        openDelete();
      }
    } catch {
      notifications.show({
        title: "Error",
        message: "Failed to check role status. Please try again.",
        color: "red",
      });
    } finally {
      setChecking(false);
    }
  };

  const handleCloseDelete = () => {
    setConfirmText("");
    closeDelete();
  };

  const handleDelete = async () => {
    try {
      setDeleting(true);
      await deleteRole(role.role_id);
      handleCloseDelete();
      onUpdate();
      notifications.show({
        title: "Role Deleted",
        message: `${role.name} has been deleted successfully.`,
        color: "green",
      });
    } catch (err) {
      const message =
        err instanceof Error && err.message.includes("assigned to users")
          ? "Cannot delete role because it is currently assigned to one or more users. Please unassign the role from all users before deleting."
          : "An error occurred while deleting the role. Please try again.";
      notifications.show({
        title: "Error",
        message,
        color: "red",
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Group gap={0} justify="flex-end">
        <ActionIcon
          variant="subtle"
          color="gray"
          aria-label={`Edit ${role.name}`}
          onClick={openDrawer}
          disabled={isAdmin}
        >
          <IconPencil size={16} stroke={1.5} />
        </ActionIcon>
        <ActionIcon
          variant="subtle"
          color="red"
          aria-label={`Delete ${role.name}`}
          onClick={handleTrashClick}
          loading={checking}
          disabled={isAdmin}
        >
          <IconTrash size={16} stroke={1.5} />
        </ActionIcon>
      </Group>

      <EditRoleDrawer
        opened={drawerOpened}
        onClose={closeDrawer}
        role={role}
        onSuccess={handleSuccess}
      />

      <Modal
        opened={deleteOpened}
        onClose={handleCloseDelete}
        title="Delete Role"
        centered
      >
        <Text size="sm" mb="md">
          Are you sure you want to delete <strong>{role.name}</strong>? This
          action cannot be undone.
        </Text>
        <Text size="sm" mb="md" c="dimmed">
          Type{" "}
          <Text span fw={700} c="var(--mantine-color-text)">
            delete
          </Text>{" "}
          to confirm.
        </Text>
        <TextInput
          placeholder="Type delete to confirm"
          value={confirmText}
          onChange={(e) => setConfirmText(e.currentTarget.value)}
          mb="lg"
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={handleCloseDelete}>
            Cancel
          </Button>
          <Button
            color="red"
            disabled={confirmText.toLowerCase() !== "delete"}
            loading={deleting}
            onClick={handleDelete}
          >
            Delete
          </Button>
        </Group>
      </Modal>

      <Modal
        opened={attachedOpened}
        onClose={closeAttached}
        title="Cannot Delete Role"
        centered
      >
        <Text size="sm" mb="lg">
          <strong>{role.name}</strong> is currently assigned to one or more
          users. Please unassign this role from all users before deleting it.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={closeAttached}>
            Close
          </Button>
        </Group>
      </Modal>
    </>
  );
}
