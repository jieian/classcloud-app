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
  VisuallyHidden,
} from "@mantine/core";
import type { PendingUser } from "../_lib";
import PendingTableActions from "./PendingTableActions";

interface PendingUsersTableProps {
  users: PendingUser[];
  onUpdate: () => void;
}

export default function PendingUsersTable({
  users,
  onUpdate,
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

    return (
      <TableTr key={user.uid}>
        <TableTd>
          <Group gap="sm">
            <Text fz="sm" fw={500}>
              {fullName}
            </Text>
          </Group>
        </TableTd>
        <TableTd>
          <Text fz="sm">{user.email}</Text>
        </TableTd>
        <TableTd>
          <PendingTableActions user={user} onUpdate={onUpdate} />
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
