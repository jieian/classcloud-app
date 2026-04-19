"use client";

import { useState } from "react";
import { useClickOutside } from "@mantine/hooks";
import {
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
import type { RoleWithPermissions } from "../../users/_lib";
import RolesTableActions from "./RolesTableActions";
import EditRoleDrawer from "./EditRoleDrawer";
import PermissionsHoverCard from "./PermissionsHoverCard";
import { PERM_DISPLAY_MAP } from "./PermissionsPanel";

const MAX_VISIBLE_BADGES = 3;

type RolesTableProps = {
  roles: RoleWithPermissions[];
  onUpdate: () => void;
};

export default function RolesTable({ roles, onUpdate }: RolesTableProps) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editRole, setEditRole] = useState<RoleWithPermissions | null>(null);
  const tableRef = useClickOutside(() => setSelectedId(null));

  function handleRowClick(role: RoleWithPermissions) {
    if (selectedId === role.role_id) {
      setEditRole(role);
    } else {
      setSelectedId(role.role_id);
    }
  }

  function handleDrawerClose() {
    setEditRole(null);
    setSelectedId(null);
  }

  if (roles.length === 0) {
    return (
      <Text c="dimmed" ta="center" py="xl">
        No roles found
      </Text>
    );
  }

  const rows = roles.map((role) => {
    const visible = role.permissions.slice(0, MAX_VISIBLE_BADGES);
    const remaining = role.permissions.slice(MAX_VISIBLE_BADGES);
    const isSelected = selectedId === role.role_id;

    return (
      <TableTr
        key={role.role_id}
        onClick={(e) => {
          e.stopPropagation();
          handleRowClick(role);
        }}
        style={{
          cursor: "pointer",
          backgroundColor: isSelected ? "#f0f7ee" : undefined,
          transition: "background-color 0.15s ease",
        }}
      >
        <TableTd>
          <Text fz="sm" fw={500}>
            {role.name}
          </Text>
        </TableTd>
        <TableTd>
          {role.permissions.length > 0 ? (
            <Group gap="xs" wrap="wrap">
              {visible.map((perm) => (
                <Badge key={perm.permission_id} variant="light">
                  {PERM_DISPLAY_MAP[perm.name] ?? perm.name}
                </Badge>
              ))}
              {remaining.length > 0 && (
                <PermissionsHoverCard permissions={remaining} />
              )}
            </Group>
          ) : (
            <Text c="dimmed" size="sm">
              No permissions assigned
            </Text>
          )}
        </TableTd>
        <TableTd onClick={(e) => e.stopPropagation()}>
          <RolesTableActions
            role={role}
            onUpdate={onUpdate}
            onEdit={() => setEditRole(role)}
          />
        </TableTd>
      </TableTr>
    );
  });

  return (
    <>
      <TableScrollContainer minWidth={600} ref={tableRef}>
        <Table verticalSpacing="sm" highlightOnHover>
          <TableThead>
            <TableTr>
              <TableTh>Role</TableTh>
              <TableTh>Permissions</TableTh>
              <TableTh>
                <VisuallyHidden>Actions</VisuallyHidden>
              </TableTh>
            </TableTr>
          </TableThead>
          <TableTbody>{rows}</TableTbody>
        </Table>
      </TableScrollContainer>

      {editRole && (
        <EditRoleDrawer
          opened={!!editRole}
          onClose={handleDrawerClose}
          role={editRole}
          onSuccess={() => {
            onUpdate();
            handleDrawerClose();
          }}
          isProtectedRole={editRole.is_protected}
        />
      )}
    </>
  );
}
