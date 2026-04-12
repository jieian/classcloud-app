"use client";

import { useState } from "react";
import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Modal,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { IconAlertTriangle, IconPencil, IconTrash } from "@tabler/icons-react";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import type { RoleWithPermissions } from "../../users/_lib";
import { deleteRole, isRoleAttachedToActiveUsers } from "../../users/_lib";
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

  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [isAttached, setIsAttached] = useState(false);

  const isAdmin = role.role_id === 1;
  const isProtectedRole = [
    "faculty",
    "grade level coordinator",
    "subject coordinator",
    "principal",
  ].includes(role.name.trim().toLowerCase());

  const handleTrashClick = async () => {
    if (isProtectedRole) return;
    try {
      setChecking(true);
      const attached = await isRoleAttachedToActiveUsers(role.role_id);
      setIsAttached(attached);
      openDelete();
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
    if (isProtectedRole) return;
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
      notifications.show({
        title: "Error",
        message:
          err instanceof Error
            ? err.message
            : "An error occurred while deleting the role. Please try again.",
        color: "red",
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Group gap={0} justify="flex-end">
        <Tooltip label="Edit Role">
          <ActionIcon
            variant="subtle"
            color="gray"
            aria-label={`Edit ${role.name}`}
            onClick={openDrawer}
            disabled={isAdmin}
          >
            <IconPencil size={16} stroke={1.5} />
          </ActionIcon>
        </Tooltip>
        <Tooltip
          label={
            isProtectedRole ? "This role cannot be deleted" : "Delete Role"
          }
        >
          <ActionIcon
            variant="subtle"
            color="red"
            aria-label={`Delete ${role.name}`}
            onClick={handleTrashClick}
            loading={checking}
            disabled={isAdmin || isProtectedRole}
          >
            <IconTrash size={16} stroke={1.5} />
          </ActionIcon>
        </Tooltip>
      </Group>

      <EditRoleDrawer
        opened={drawerOpened}
        onClose={closeDrawer}
        role={role}
        onSuccess={onUpdate}
        isProtectedRole={isProtectedRole}
      />

      <Modal
        opened={deleteOpened}
        onClose={handleCloseDelete}
        title="Delete Role"
        centered
        closeOnClickOutside={!deleting}
        closeOnEscape={!deleting}
        withCloseButton={!deleting}
      >
        {isAttached && (
          <Alert icon={<IconAlertTriangle size={16} />} color="orange" mb="md">
            This role is currently assigned to active users. Deleting it will
            remove it from all of them.
          </Alert>
        )}
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
          <Button
            variant="default"
            onClick={handleCloseDelete}
            disabled={deleting}
          >
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
    </>
  );
}
