"use client";

import { useState, useEffect } from "react";
import {
  ActionIcon,
  Button,
  Checkbox,
  Group,
  Modal,
  Skeleton,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { IconCheck, IconX } from "@tabler/icons-react";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import type { PendingUser } from "../_lib";
import { activateUser, rejectPendingUser, fetchAllRoles } from "../_lib";

interface PendingTableActionsProps {
  user: PendingUser;
  onUpdate: () => void;
}

export default function PendingTableActions({
  user,
  onUpdate,
}: PendingTableActionsProps) {
  const [approveOpened, { open: openApprove, close: closeApprove }] =
    useDisclosure(false);
  const [rejectOpened, { open: openReject, close: closeReject }] =
    useDisclosure(false);

  // Approve modal state
  const [availableRoles, setAvailableRoles] = useState<
    Array<{ role_id: number; name: string }>
  >([]);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [approving, setApproving] = useState(false);

  // Reject modal state
  const [confirmText, setConfirmText] = useState("");
  const [rejecting, setRejecting] = useState(false);

  const fullName = [user.first_name, user.middle_name, user.last_name]
    .filter(Boolean)
    .join(" ");

  // Load roles when approve modal opens
  useEffect(() => {
    if (approveOpened) {
      loadRoles();
      setSelectedRoles([]);
    }
  }, [approveOpened]);

  async function loadRoles() {
    try {
      setLoadingRoles(true);
      const roles = await fetchAllRoles();
      setAvailableRoles(roles);
    } catch {
      notifications.show({
        title: "Error",
        message: "Failed to load roles. Please try again.",
        color: "red",
      });
    } finally {
      setLoadingRoles(false);
    }
  }

  const handleApprove = async () => {
    try {
      setApproving(true);
      const roleIds = selectedRoles.map((id) => parseInt(id));
      await activateUser(user.uid, roleIds);
      notifications.show({
        title: "User Approved",
        message: `${fullName} has been activated successfully.`,
        color: "green",
      });
      closeApprove();
      onUpdate();
    } catch (err) {
      notifications.show({
        title: "Error",
        message: err instanceof Error ? err.message : "Failed to approve user.",
        color: "red",
      });
    } finally {
      setApproving(false);
    }
  };

  const handleCloseReject = () => {
    setConfirmText("");
    closeReject();
  };

  const handleReject = async () => {
    try {
      setRejecting(true);
      await rejectPendingUser(user.uid);
      notifications.show({
        title: "User Rejected",
        message: `${fullName} has been removed from the system.`,
        color: "green",
      });
      handleCloseReject();
      onUpdate();
    } catch (err) {
      notifications.show({
        title: "Error",
        message: err instanceof Error ? err.message : "Failed to reject user.",
        color: "red",
      });
    } finally {
      setRejecting(false);
    }
  };

  return (
    <>
      <Group gap={0} justify="flex-end">
        <Tooltip label="Approve" position="top" withArrow>
          <ActionIcon
            variant="subtle"
            color="green"
            aria-label="Approve user"
            onClick={openApprove}
          >
            <IconCheck size={16} stroke={1.5} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Reject" position="top" withArrow>
          <ActionIcon
            variant="subtle"
            color="red"
            aria-label="Reject user"
            onClick={openReject}
          >
            <IconX size={16} stroke={1.5} />
          </ActionIcon>
        </Tooltip>
      </Group>

      {/* Approve Modal */}
      <Modal
        opened={approveOpened}
        onClose={closeApprove}
        title="Approve User"
        centered
      >
        <Text size="sm" mb="md">
          Assign at least one role to <strong>{fullName}</strong> to activate
          their account.
        </Text>

        <Text size="sm" fw={600} mb="xs">
          Roles
        </Text>
        {loadingRoles ? (
          <>
            <Skeleton height={24} mb="sm" />
            <Skeleton height={24} mb="sm" />
            <Skeleton height={24} mb="sm" />
          </>
        ) : (
          <Checkbox.Group value={selectedRoles} onChange={setSelectedRoles}>
            {availableRoles.map((role) => (
              <Checkbox
                key={role.role_id}
                value={role.role_id.toString()}
                label={role.name}
                mb="sm"
              />
            ))}
          </Checkbox.Group>
        )}

        <Group justify="flex-end" mt="lg">
          <Button variant="default" onClick={closeApprove}>
            Cancel
          </Button>
          <Button
            color="green"
            disabled={selectedRoles.length === 0}
            loading={approving}
            onClick={handleApprove}
          >
            Approve
          </Button>
        </Group>
      </Modal>

      {/* Reject Modal */}
      <Modal
        opened={rejectOpened}
        onClose={handleCloseReject}
        title="Reject User"
        centered
      >
        <Text size="sm" mb="md">
          Are you sure you want to reject <strong>{fullName}</strong>? This will
          permanently delete their pending account and cannot be undone.
        </Text>
        <Text size="sm" mb="xs" c="dimmed">
          Type{" "}
          <Text span fw={700} c="var(--mantine-color-text)">
            reject
          </Text>{" "}
          to confirm.
        </Text>
        <TextInput
          placeholder="Type reject to confirm"
          value={confirmText}
          onChange={(e) => setConfirmText(e.currentTarget.value)}
          mb="lg"
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={handleCloseReject}>
            Cancel
          </Button>
          <Button
            color="red"
            disabled={confirmText.toLowerCase() !== "reject"}
            loading={rejecting}
            onClick={handleReject}
          >
            Reject
          </Button>
        </Group>
      </Modal>
    </>
  );
}
