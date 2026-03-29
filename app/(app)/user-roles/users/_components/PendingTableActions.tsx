"use client";

import { useState, useEffect } from "react";
import {
  ActionIcon,
  Box,
  Button,
  Checkbox,
  Drawer,
  Group,
  Modal,
  Pagination,
  Radio,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { IconCheck, IconX } from "@tabler/icons-react";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { modals } from "@mantine/modals";
import type { PendingUser } from "../_lib";
import { activateUser, rejectPendingUser } from "../_lib";
import type { Role } from "../_lib";

const ROLES_PER_PAGE = 3;
const PROTECTED_ROLE_NAMES = [
  "class adviser",
  "subject teacher",
  "grade level coordinator",
  "subject coordinator",
  "principal",
];

interface PendingTableActionsProps {
  user: PendingUser;
  roles: Role[];
  onUpdate: () => void;
}

export default function PendingTableActions({
  user,
  roles,
  onUpdate,
}: PendingTableActionsProps) {
  const isMobile = useMediaQuery("(max-width: 768px)");

  const [approveOpened, { open: openApprove, close: closeApprove }] =
    useDisclosure(false);
  const [confirmOpened, { open: openConfirm, close: closeConfirm }] =
    useDisclosure(false);
  const [rejectOpened, { open: openReject, close: closeReject }] =
    useDisclosure(false);

  // Approve modal state
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [rolePage, setRolePage] = useState(1);
  const [approving, setApproving] = useState(false);

  const sortedRoles = [
    ...roles.filter((r) =>
      PROTECTED_ROLE_NAMES.includes(r.name.trim().toLowerCase()),
    ),
    ...roles.filter(
      (r) => !PROTECTED_ROLE_NAMES.includes(r.name.trim().toLowerCase()),
    ),
  ];

  // Reject modal state
  const [rejectReason, setRejectReason] = useState("");
  const [otherReason, setOtherReason] = useState("");
  const [rejecting, setRejecting] = useState(false);

  const fullName = [user.first_name, user.middle_name, user.last_name]
    .filter(Boolean)
    .join(" ");

  // Seed form + load roles when approve modal opens
  useEffect(() => {
    if (approveOpened) {
      setFirstName(user.first_name);
      setMiddleName(user.middle_name ?? "");
      setLastName(user.last_name);
      setSelectedRoles((user.requested_role_ids ?? []).map(String));
      setRolePage(1);
    }
  }, [approveOpened]);

  const handleRevert = () => {
    setFirstName(user.first_name);
    setMiddleName(user.middle_name ?? "");
    setLastName(user.last_name);
    setSelectedRoles((user.requested_role_ids ?? []).map(String));
  };

  const isDirty =
    firstName.trim() !== user.first_name ||
    middleName.trim() !== (user.middle_name ?? "") ||
    lastName.trim() !== user.last_name ||
    JSON.stringify([...selectedRoles].sort()) !==
      JSON.stringify([...(user.requested_role_ids ?? []).map(String)].sort());

  const submitApprove = async () => {
    try {
      setApproving(true);
      const roleIds = selectedRoles.map((id) => parseInt(id));
      await activateUser(
        user.uid,
        firstName.trim(),
        middleName.trim(),
        lastName.trim(),
        roleIds,
      );
      notifications.show({
        title: "User Approved",
        message: `${firstName.trim()} ${lastName.trim()} has been activated successfully.`,
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

  const handleApprove = () => {
    if (isMobile) {
      openConfirm();
    } else {
      modals.openConfirmModal({
        title: "Approve Registration?",
        children: (
          <Text size="sm">
            This will activate{" "}
            <strong>
              {firstName.trim()} {lastName.trim()}
            </strong>
            's account with {selectedRoles.length} role(s).
          </Text>
        ),
        labels: { confirm: "Approve", cancel: "Cancel" },
        confirmProps: { style: { backgroundColor: "#4EAE4A" } },
        onConfirm: submitApprove,
      });
    }
  };

  const handleCloseReject = () => {
    setRejectReason("");
    setOtherReason("");
    closeReject();
  };

  const finalReason =
    rejectReason === "others" ? otherReason.trim() : rejectReason;

  const handleReject = async () => {
    try {
      setRejecting(true);
      await rejectPendingUser(user.uid, finalReason);
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
        title="Approve Registration"
        centered
        size="md"
      >
        <Stack gap="xs">
          <div>
            <Text size="sm" fw={600} mb="xs">
              Demographic Profile
            </Text>
            <Stack gap="xs">
              <TextInput
                label="Email"
                value={user.email}
                readOnly
                styles={{
                  input: { backgroundColor: "#f5f5f5", cursor: "default" },
                }}
              />
              <SimpleGrid cols={2}>
                <TextInput
                  label="First Name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.currentTarget.value)}
                  required
                />
                <TextInput
                  label="Middle Name"
                  value={middleName}
                  onChange={(e) => setMiddleName(e.currentTarget.value)}
                  placeholder="Optional"
                />
              </SimpleGrid>
              <TextInput
                label="Last Name"
                value={lastName}
                onChange={(e) => setLastName(e.currentTarget.value)}
                required
              />
            </Stack>
          </div>

          <div>
            <Text size="sm" fw={600} mb="xs">
              Roles{" "}
              <Text span c="red" inherit>
                *
              </Text>
            </Text>
            <>
              <Box
                p="md"
                style={{
                  border: "1px solid #d3e9d0",
                  borderRadius: "var(--mantine-radius-md)",
                  backgroundColor: "#f0f7ee",
                }}
              >
                <Checkbox.Group
                  value={selectedRoles}
                  onChange={setSelectedRoles}
                >
                  <Stack gap={4} style={{ minHeight: 95 }}>
                    {sortedRoles
                      .slice(
                        (rolePage - 1) * ROLES_PER_PAGE,
                        rolePage * ROLES_PER_PAGE,
                      )
                      .map((role) => {
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

                {sortedRoles.length > ROLES_PER_PAGE && (
                  <Group justify="center" mt="sm">
                    <Pagination
                      value={rolePage}
                      onChange={setRolePage}
                      total={Math.ceil(sortedRoles.length / ROLES_PER_PAGE)}
                      size="xs"
                      color="#4EAE4A"
                    />
                  </Group>
                )}
              </Box>

              {(() => {
                const selectedRoleNames = selectedRoles
                  .map(
                    (id) =>
                      roles.find((r) => r.role_id.toString() === id)?.name,
                  )
                  .filter((n): n is string => Boolean(n));
                const CHAR_BUDGET = 55;
                const displayed: string[] = [];
                let used = 0;
                for (const name of selectedRoleNames) {
                  const cost = used > 0 ? name.length + 2 : name.length;
                  if (used > 0 && used + cost > CHAR_BUDGET) break;
                  displayed.push(name);
                  used += cost;
                }
                const hidden = selectedRoleNames.length - displayed.length;
                if (selectedRoleNames.length === 0) return null;
                return (
                  <Text size="xs" c="#808898" mt={6}>
                    <Text span fw={600} c="#45903B">
                      Selected Roles ({selectedRoleNames.length}):{" "}
                    </Text>
                    {displayed.length === 2 && hidden === 0
                      ? `${displayed[0]} and ${displayed[1]}`
                      : displayed.join(", ")}
                    {hidden > 0 && (
                      <Text span fw={500} c="#4EAE4A">
                        {" "}
                        +{hidden} more
                      </Text>
                    )}
                  </Text>
                );
              })()}
            </>
          </div>
        </Stack>

        <Group justify="flex-end" mt="lg">
          <Button variant="default" onClick={closeApprove}>
            Cancel
          </Button>
          <Button variant="outline" disabled={!isDirty} onClick={handleRevert}>
            Revert Changes
          </Button>
          <Button
            color="green"
            disabled={
              selectedRoles.length === 0 ||
              !firstName.trim() ||
              !lastName.trim()
            }
            loading={approving}
            onClick={handleApprove}
          >
            Approve
          </Button>
        </Group>
      </Modal>

      {/* Approve Confirmation Drawer */}
      <Drawer
        opened={confirmOpened}
        onClose={closeConfirm}
        position="bottom"
        title="Approve Registration?"
        size="20vh"
      >
        <Text size="sm" mb="lg">
          This will activate{" "}
          <strong>
            {firstName.trim()} {lastName.trim()}
          </strong>
          's account with {selectedRoles.length} role(s).
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={closeConfirm}>
            Cancel
          </Button>
          <Button
            style={{ backgroundColor: "#4EAE4A" }}
            loading={approving}
            onClick={() => {
              closeConfirm();
              submitApprove();
            }}
          >
            Approve
          </Button>
        </Group>
      </Drawer>

      {/* Reject Modal */}
      <Modal
        opened={rejectOpened}
        onClose={handleCloseReject}
        title="Reject Registration"
        centered
      >
        <Text size="sm" c="#808898" mb="md">
          Select a reason for rejecting{" "}
          <strong style={{ color: "#333" }}>{fullName}</strong>'s registration.
          They will be notified via email.
        </Text>

        <Radio.Group value={rejectReason} onChange={setRejectReason}>
          <Stack gap="xs">
            <Radio
              value="Not an employee of Baliwag North Central School"
              label="Not an employee of Baliwag North Central School"
              color="red"
            />
            <Radio value="others" label="Others" color="red" />
          </Stack>
        </Radio.Group>

        {rejectReason === "others" && (
          <Textarea
            mt="sm"
            placeholder="Specify the reason..."
            value={otherReason}
            onChange={(e) => setOtherReason(e.currentTarget.value)}
            minRows={3}
            autosize
          />
        )}

        <Group justify="flex-end" mt="lg">
          <Button variant="default" onClick={handleCloseReject}>
            Cancel
          </Button>
          <Button
            color="red"
            disabled={
              !rejectReason ||
              (rejectReason === "others" && !otherReason.trim())
            }
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
