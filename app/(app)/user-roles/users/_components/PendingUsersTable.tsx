"use client";

import { useDisclosure } from "@mantine/hooks";
import {
  Badge,
  Box,
  Collapse,
  Divider,
  Group,
  Table,
  TableScrollContainer,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
  Text,
  VisuallyHidden,
} from "@mantine/core";
import { IconChevronRight } from "@tabler/icons-react";
import type { PendingUser, Role } from "../_lib";
import PendingTableActions from "./PendingTableActions";
import AdminInviteTableActions from "./AdminInviteTableActions";

interface PendingUsersTableProps {
  users: PendingUser[];
  roles: Role[];
  onUpdate: () => void;
  unreadMap: Map<string, string>;
  onMarkRead: (uid: string) => void;
}

// ── Mobile accordion row ──────────────────────────────────────────────────────

function PendingMobileRow({
  user,
  roles,
  onUpdate,
  isUnread,
  isSectionBoundary,
  onMarkRead,
}: {
  user: PendingUser;
  roles: Role[];
  onUpdate: () => void;
  isUnread: boolean;
  isSectionBoundary: boolean;
  onMarkRead: (uid: string) => void;
}) {
  const [opened, { toggle }] = useDisclosure(false);

  const fullName = [user.first_name, user.middle_name, user.last_name]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <div
        onClick={() => {
          toggle();
          if (isUnread) onMarkRead(user.uid);
        }}
        style={{ cursor: "pointer", padding: "12px 4px" }}
      >
        <Group justify="space-between" wrap="nowrap" align="center">
          <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
            <IconChevronRight
              size={16}
              style={{
                transform: opened ? "rotate(90deg)" : "rotate(0deg)",
                transition: "transform 200ms ease",
                flexShrink: 0,
                color: "#808898",
              }}
            />
            <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
              <Text
                fw={500}
                fz="sm"
                style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              >
                {fullName}
              </Text>
              {isUnread && (
                <Badge size="xs" color="red" variant="filled" style={{ flexShrink: 0 }}>
                  New
                </Badge>
              )}
              {user.requested_role_ids.length === 0 && (
                <Badge size="xs" color="yellow" variant="filled" style={{ flexShrink: 0 }}>
                  No roles
                </Badge>
              )}
            </Group>
          </Group>
          <div onClick={(e) => e.stopPropagation()}>
            {user.source === "admin_invite" ? (
              <AdminInviteTableActions user={user} roles={roles} onUpdate={onUpdate} />
            ) : (
              <PendingTableActions user={user} roles={roles} onUpdate={onUpdate} onMarkRead={onMarkRead} />
            )}
          </div>
        </Group>
      </div>

      <Collapse in={opened}>
        <Box pb="md" pl={28} pr={4}>
          <Text size="xs" c="dimmed" fw={600} tt="uppercase" mb={2} style={{ letterSpacing: "0.04em" }}>
            Email
          </Text>
          <Text fz="sm">{user.email}</Text>
        </Box>
      </Collapse>

      <Divider color={isSectionBoundary ? "#b0b8c1" : undefined} size={isSectionBoundary ? 2 : 1} />
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PendingUsersTable({
  users,
  roles,
  onUpdate,
  unreadMap,
  onMarkRead,
}: PendingUsersTableProps) {
  const hasBothSources =
    users.some((u) => u.source === "self_register") &&
    users.some((u) => u.source === "admin_invite");
  const lastSelfRegIndex = hasBothSources
    ? users.map((u) => u.source).lastIndexOf("self_register")
    : -1;

  const tableRows = users.map((user, index) => {
    const fullName = [user.first_name, user.middle_name, user.last_name]
      .filter(Boolean)
      .join(" ");

    const isUnread = user.source === "self_register" && unreadMap.has(user.uid);
    const isSectionBoundary = index === lastSelfRegIndex;

    return (
      <TableTr
        key={user.uid}
        onClick={() => { if (isUnread) onMarkRead(user.uid); }}
        style={{
          ...(isUnread ? { cursor: "pointer" } : {}),
          ...(isSectionBoundary ? { borderBottom: "2px solid #b0b8c1" } : {}),
        }}
      >
        <TableTd>
          <Group gap="sm">
            <Text fz="sm" fw={500}>
              {fullName}
            </Text>
            {isUnread && (
              <Badge size="xs" color="red" variant="filled">
                New
              </Badge>
            )}
            {user.requested_role_ids.length === 0 && (
              <Badge size="xs" color="yellow" variant="filled">
                No roles
              </Badge>
            )}
          </Group>
        </TableTd>
        <TableTd>
          <Text fz="sm">{user.email}</Text>
        </TableTd>
        <TableTd>
          {user.source === "admin_invite" ? (
            <AdminInviteTableActions user={user} roles={roles} onUpdate={onUpdate} />
          ) : (
            <PendingTableActions user={user} roles={roles} onUpdate={onUpdate} onMarkRead={onMarkRead} />
          )}
        </TableTd>
      </TableTr>
    );
  });

  return (
    <>
      {/* Desktop table */}
      <div className="hidden sm:block">
        <TableScrollContainer minWidth={600}>
          <Table verticalSpacing="sm">
            <TableThead>
              <TableTr>
                <TableTh>Full Name</TableTh>
                <TableTh>Email</TableTh>
                <TableTh>
                  <VisuallyHidden>Actions</VisuallyHidden>
                </TableTh>
              </TableTr>
            </TableThead>
            <TableTbody>{tableRows}</TableTbody>
          </Table>
        </TableScrollContainer>
      </div>

      {/* Mobile accordion list */}
      <div className="sm:hidden">
        <Divider />
        {users.map((user, index) => {
          const isUnread = user.source === "self_register" && unreadMap.has(user.uid);
          const isSectionBoundary = index === lastSelfRegIndex;
          return (
            <PendingMobileRow
              key={user.uid}
              user={user}
              roles={roles}
              onUpdate={onUpdate}
              isUnread={isUnread}
              isSectionBoundary={isSectionBoundary}
              onMarkRead={onMarkRead}
            />
          );
        })}
      </div>
    </>
  );
}
