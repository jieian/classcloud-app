// app/(app)/user-roles/users/_components/UsersTable.tsx
"use client";

import { useState } from "react";
import { useClickOutside } from "@mantine/hooks";
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
import { useAuth } from "@/context/AuthContext";
import type { UserWithRoles } from "../_lib";
import UserTableActions from "./UserTableActions";
import EditUserDrawer from "./EditUserDrawer";

type UsersTableProps = {
  users: UserWithRoles[];
  onUpdate: () => void;
};

export default function UsersTable({ users, onUpdate }: UsersTableProps) {
  const { user } = useAuth();
  const currentUid = user?.id ?? null;

  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [editUser, setEditUser] = useState<UserWithRoles | null>(null);
  const tableRef = useClickOutside(() => setSelectedUid(null));

  function handleRowClick(u: UserWithRoles) {
    if (selectedUid === u.uid) {
      setEditUser(u);
    } else {
      setSelectedUid(u.uid);
    }
  }

  function handleDrawerClose() {
    setEditUser(null);
    setSelectedUid(null);
  }

  if (users.length === 0) {
    return (
      <Text c="dimmed" ta="center" py="xl">
        No users found
      </Text>
    );
  }

  const rows = users.map((u) => {
    const fullName = `${u.first_name} ${u.last_name}`;
    const isSelected = selectedUid === u.uid;

    return (
      <TableTr
        key={u.uid}
        onClick={(e) => { e.stopPropagation(); handleRowClick(u); }}
        style={{
          cursor: "pointer",
          backgroundColor: isSelected ? "#f0f7ee" : undefined,
          transition: "background-color 0.15s ease",
        }}
      >
        <TableTd>
          <Group gap="sm">
            <Text fz="sm" fw={500}>
              {fullName}
            </Text>
          </Group>
        </TableTd>
        <TableTd>
          {u.roles.length > 0 ? (
            <Group gap="xs">
              {u.roles.map((role) => (
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
            {u.email}
          </Anchor>
        </TableTd>
        <TableTd onClick={(e) => e.stopPropagation()}>
          <UserTableActions
            user={u}
            onUpdate={onUpdate}
            onEdit={() => setEditUser(u)}
            currentUid={currentUid}
          />
        </TableTd>
      </TableTr>
    );
  });

  return (
    <>
      <TableScrollContainer minWidth={800} ref={tableRef}>
        <Table verticalSpacing="sm" highlightOnHover>
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

      {editUser && (
        <EditUserDrawer
          opened={!!editUser}
          onClose={handleDrawerClose}
          user={editUser}
          onSuccess={() => { onUpdate(); handleDrawerClose(); }}
        />
      )}
    </>
  );
}
