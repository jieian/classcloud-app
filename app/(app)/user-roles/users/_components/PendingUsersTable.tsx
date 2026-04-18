"use client";

import {
  Table,
  TableScrollContainer,
  TableThead,
  TableTbody,
  TableTr,
  TableTh,
  TableTd,
  Text,
  Group,
  Badge,
  VisuallyHidden,
} from "@mantine/core";
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

export default function PendingUsersTable({
  users,
  roles,
  onUpdate,
  unreadMap,
  onMarkRead,
}: PendingUsersTableProps) {
  if (users.length === 0) {
    return (
      <Text c="dimmed" ta="center" py="xl">
        No pending users
      </Text>
    );
  }

  const rows = users.map((user) => {
    const fullName = [user.first_name, user.middle_name, user.last_name]
      .filter(Boolean)
      .join(" ");

    const isUnread = user.source === "self_register" && unreadMap.has(user.uid);

    return (
      <TableTr
        key={user.uid}
        onClick={() => { if (isUnread) onMarkRead(user.uid); }}
        style={isUnread ? { cursor: "pointer" } : undefined}
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
          </Group>
        </TableTd>
        <TableTd>
          <Text fz="sm">{user.email}</Text>
        </TableTd>
        <TableTd>
          {user.source === "admin_invite" ? (
            <AdminInviteTableActions user={user} roles={roles} onUpdate={onUpdate} />
          ) : (
            <PendingTableActions user={user} roles={roles} onUpdate={onUpdate} />
          )}
        </TableTd>
      </TableTr>
    );
  });

  return (
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
        <TableTbody>{rows}</TableTbody>
      </Table>
    </TableScrollContainer>
  );
}
