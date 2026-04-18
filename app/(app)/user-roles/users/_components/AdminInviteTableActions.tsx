"use client";

import { useState, useEffect } from "react";
import {
  ActionIcon,
  Box,
  Button,
  Checkbox,
  Group,
  Menu,
  Modal,
  Pagination,
  PasswordInput,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { IconDots, IconPencil, IconSend, IconX } from "@tabler/icons-react";
import type { PendingUser, Role } from "../_lib";
import { cancelInvite, resendInvite, editInvite } from "../_lib";
import { toTitleCase } from "../_lib/utils";
import { sortRoles } from "@/lib/roleUtils";

const ROLES_PER_PAGE = 5;

interface AdminInviteTableActionsProps {
  user: PendingUser;
  roles: Role[];
  onUpdate: () => void;
}

export default function AdminInviteTableActions({
  user,
  roles,
  onUpdate,
}: AdminInviteTableActionsProps) {
  const [editOpened, { open: openEdit, close: closeEdit }] =
    useDisclosure(false);

  // Edit form state
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [rolePage, setRolePage] = useState(1);
  const [saving, setSaving] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [resending, setResending] = useState(false);

  const sortedRoles = sortRoles(roles);
  const totalRolePages = Math.max(
    1,
    Math.ceil(sortedRoles.length / ROLES_PER_PAGE),
  );
  const displayedRoles = sortedRoles.slice(
    (rolePage - 1) * ROLES_PER_PAGE,
    rolePage * ROLES_PER_PAGE,
  );

  // Seed form when modal opens
  useEffect(() => {
    if (editOpened) {
      setEmail(user.email);
      setFirstName(user.first_name);
      setMiddleName(user.middle_name ?? "");
      setLastName(user.last_name);
      setPassword("");
      setSelectedRoles((user.requested_role_ids ?? []).map(String));
      setRolePage(1);
    }
  }, [editOpened]);

  const isDirty =
    email.trim() !== user.email ||
    firstName.trim() !== user.first_name ||
    middleName.trim() !== (user.middle_name ?? "") ||
    lastName.trim() !== user.last_name ||
    password !== "" ||
    JSON.stringify([...selectedRoles].sort()) !==
      JSON.stringify([...(user.requested_role_ids ?? []).map(String)].sort());

  const canSave =
    email.trim() !== "" &&
    firstName.trim() !== "" &&
    lastName.trim() !== "" &&
    selectedRoles.length > 0;

  const handleSave = async () => {
    try {
      setSaving(true);
      await editInvite({
        uid: user.uid,
        email: email.trim(),
        first_name: toTitleCase(firstName.trim()),
        middle_name: middleName.trim()
          ? toTitleCase(middleName.trim())
          : undefined,
        last_name: toTitleCase(lastName.trim()),
        password: password || undefined,
        role_ids: selectedRoles.map(Number),
      });
      notifications.show({
        title: "Invitation Updated",
        message: "A new invitation link has been sent to the updated email.",
        color: "green",
      });
      closeEdit();
      onUpdate();
    } catch (err) {
      notifications.show({
        title: "Error",
        message:
          err instanceof Error ? err.message : "Failed to update invitation.",
        color: "red",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleResend = () => {
    modals.openConfirmModal({
      title: "Resend Invitation?",
      children: (
        <Text size="sm">
          This will invalidate the previous link and send a new invitation email
          to <strong>{user.email}</strong>.
        </Text>
      ),
      labels: { confirm: "Resend", cancel: "Cancel" },
      confirmProps: { style: { backgroundColor: "#4EAE4A" } },
      onConfirm: async () => {
        try {
          setResending(true);
          await resendInvite(user.uid);
          notifications.show({
            title: "Invitation Resent",
            message: `A new invitation has been sent to ${user.email}.`,
            color: "green",
          });
          onUpdate();
        } catch (err) {
          notifications.show({
            title: "Error",
            message:
              err instanceof Error
                ? err.message
                : "Failed to resend invitation.",
            color: "red",
          });
        } finally {
          setResending(false);
        }
      },
    });
  };

  const handleCancel = () => {
    const fullName = [user.first_name, user.middle_name, user.last_name]
      .filter(Boolean)
      .join(" ");
    modals.openConfirmModal({
      title: "Cancel Invitation?",
      children: (
        <Text size="sm">
          This will permanently delete the invitation for{" "}
          <strong>{fullName}</strong>. Their account and all associated data
          will be removed. This action cannot be undone.
        </Text>
      ),
      labels: { confirm: "Cancel Invitation", cancel: "Keep" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          setCancelling(true);
          await cancelInvite(user.uid);
          notifications.show({
            title: "Invitation Cancelled",
            message: `The invitation for ${fullName} has been cancelled.`,
            color: "green",
          });
          onUpdate();
        } catch (err) {
          notifications.show({
            title: "Error",
            message:
              err instanceof Error
                ? err.message
                : "Failed to cancel invitation.",
            color: "red",
          });
        } finally {
          setCancelling(false);
        }
      },
    });
  };

  // Selected role names for summary label
  const selectedRoleNames = selectedRoles
    .map((id) => roles.find((r) => r.role_id.toString() === id)?.name)
    .filter((n): n is string => Boolean(n));

  return (
    <>
      <Group gap={0} justify="flex-end">
        <Menu withinPortal position="bottom-end" shadow="sm">
          <Menu.Target>
            <ActionIcon
              variant="subtle"
              color="gray"
              loading={cancelling || resending}
              aria-label="Invitation actions"
            >
              <IconDots size={16} stroke={1.5} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              leftSection={<IconPencil size={14} />}
              onClick={openEdit}
            >
              Edit
            </Menu.Item>
            <Menu.Item
              leftSection={<IconSend size={14} />}
              onClick={handleResend}
            >
              Resend Invite
            </Menu.Item>
            <Menu.Divider />
            <Menu.Item
              leftSection={<IconX size={14} />}
              color="red"
              onClick={handleCancel}
            >
              Cancel Invite
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>

      {/* Edit Invite Modal */}
      <Modal
        opened={editOpened}
        onClose={closeEdit}
        title="Edit Invitation"
        centered
        size="md"
      >
        <Stack gap="xs">
          <TextInput
            label="Email"
            placeholder="your@deped.gov.ph"
            required
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
          />

          <Text size="sm" fw={600} mt="xs">
            Demographic Profile
          </Text>

          <Group grow gap="xs">
            <TextInput
              label="First Name"
              required
              value={firstName}
              onChange={(e) => setFirstName(e.currentTarget.value)}
              onBlur={(e) => {
                if (e.target.value.trim())
                  setFirstName(toTitleCase(e.target.value));
              }}
            />
            <TextInput
              label="Middle Name"
              placeholder="Optional"
              value={middleName}
              onChange={(e) => setMiddleName(e.currentTarget.value)}
              onBlur={(e) => {
                if (e.target.value.trim())
                  setMiddleName(toTitleCase(e.target.value));
              }}
            />
          </Group>

          <TextInput
            label="Last Name"
            required
            value={lastName}
            onChange={(e) => setLastName(e.currentTarget.value)}
            onBlur={(e) => {
              if (e.target.value.trim())
                setLastName(toTitleCase(e.target.value));
            }}
          />

          <PasswordInput
            label="New Password"
            placeholder="Leave blank to keep existing password"
            description="If provided, the user's password will be updated and a new invitation link will be sent."
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
          />

          <div>
            <Text size="sm" fw={600} mb="xs">
              Roles{" "}
              <Text span c="red" inherit>
                *
              </Text>
            </Text>

            <Box
              p="md"
              style={{
                border: "1px solid #d3e9d0",
                borderRadius: "var(--mantine-radius-md)",
                backgroundColor: "#f0f7ee",
              }}
            >
              <Checkbox.Group value={selectedRoles} onChange={setSelectedRoles}>
                <Stack gap={4} style={{ minHeight: 95 }}>
                  {displayedRoles.map((role) => {
                    const isSelected = selectedRoles.includes(
                      role.role_id.toString(),
                    );
                    return (
                      <Box
                        key={role.role_id}
                        px="xs"
                        py={6}
                        style={{
                          borderRadius: "var(--mantine-radius-sm)",
                          backgroundColor: isSelected
                            ? "#d3e9d0"
                            : "transparent",
                          transition: "background-color 0.15s",
                        }}
                      >
                        <Checkbox
                          value={role.role_id.toString()}
                          color="#4EAE4A"
                          label={<Text size="sm">{role.name}</Text>}
                        />
                      </Box>
                    );
                  })}
                </Stack>
              </Checkbox.Group>

              {totalRolePages > 1 && (
                <Group justify="center" mt="sm">
                  <Pagination
                    value={rolePage}
                    onChange={setRolePage}
                    total={totalRolePages}
                    size="xs"
                    color="#4EAE4A"
                  />
                </Group>
              )}
            </Box>

            {selectedRoleNames.length > 0 && (
              <Text size="xs" c="#808898" mt={6}>
                <Text span fw={600} c="#45903B">
                  Selected Roles ({selectedRoleNames.length}):{" "}
                </Text>
                {selectedRoleNames.length === 2
                  ? `${selectedRoleNames[0]} and ${selectedRoleNames[1]}`
                  : selectedRoleNames.join(", ")}
              </Text>
            )}
          </div>
        </Stack>

        <Group justify="flex-end" mt="lg">
          <Button variant="default" onClick={closeEdit}>
            Cancel
          </Button>
          <Button
            style={
              canSave && isDirty ? { backgroundColor: "#4EAE4A" } : undefined
            }
            disabled={!canSave || !isDirty}
            loading={saving}
            onClick={handleSave}
          >
            Save &amp; Resend
          </Button>
        </Group>
      </Modal>
    </>
  );
}
