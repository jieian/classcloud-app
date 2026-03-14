// app/(app)/user-roles/users/_components/UsersTable.tsx
"use client";

import {
  Anchor,
  Badge,
  Group,
  Table,
  TableScrollContainer,
  TableThead,
  TableTbody,
  TableTr,
  TableTh,
  TableTd,
  Text,
  VisuallyHidden,
} from "@mantine/core";
import { useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import type { UserWithRoles } from "../_lib";
import UserTableActions from "./UserTableActions";

type UsersTableProps = {
  users: UserWithRoles[];
  onUpdate: () => void;
};

export default function UsersTable({ users, onUpdate }: UsersTableProps) {
  const { user } = useAuth();
  const currentUid = user?.id ?? null;

  const sorted = useMemo(
    () =>
      [...users].sort(
        (a, b) =>
          a.first_name.localeCompare(b.first_name) ||
          a.last_name.localeCompare(b.last_name)
      ),
    [users]
  );

  if (sorted.length === 0) {
    return (
      <Text c="dimmed" ta="center" py="xl">
        No users found
      </Text>
    );
  }

  const rows = sorted.map((user) => {
    const fullName = `${user.first_name} ${user.last_name}`;

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
          {user.roles.length > 0 ? (
            <Group gap="xs">
              {user.roles.map((role) => (
                <Badge key={role.role_id} variant="light">
                  {role.name}
                </Badge>
              ))}
            </Group>
          ) : (
            <Text c="dimmed" size="sm">
              No role assigned
            </Text>
          )}
        </TableTd>
        <TableTd>
          <Anchor component="button" size="sm">
            {user.email}
          </Anchor>
        </TableTd>
        <TableTd>
          <UserTableActions user={user} onUpdate={onUpdate} currentUid={currentUid} />
        </TableTd>
      </TableTr>
    );
  });

  return (
    <TableScrollContainer minWidth={800}>
      <Table verticalSpacing="sm">
        <TableThead>
          <TableTr>
            <TableTh>Employee</TableTh>
            <TableTh>Roles</TableTh>
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
