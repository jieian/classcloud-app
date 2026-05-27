"use client";

import { useState } from "react";
import { notify } from "@/components/notificationIcon/notificationIcon";
import { useClickOutside, useDisclosure } from "@mantine/hooks";
import {
  Badge,
  Box,
  Collapse,
  Divider,
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
import { IconChevronRight } from "@tabler/icons-react";
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

// ── Mobile accordion row ──────────────────────────────────────────────────────

function RoleMobileRow({
  role,
  onEdit,
  onUpdate,
}: {
  role: RoleWithPermissions;
  onEdit: () => void;
  onUpdate: () => void;
}) {
  const [opened, { toggle }] = useDisclosure(false);

  return (
    <>
      <div onClick={toggle} style={{ cursor: "pointer", padding: "12px 4px" }}>
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
            <Text
              fw={500}
              fz="sm"
              style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {role.name}
            </Text>
          </Group>
          <div onClick={(e) => e.stopPropagation()}>
            <RolesTableActions
              role={role}
              onUpdate={onUpdate}
              onEdit={onEdit}
            />
          </div>
        </Group>
      </div>

      <Collapse in={opened}>
        <Box pb="md" pl={28} pr={4}>
          <Text size="xs" c="dimmed" fw={600} tt="uppercase" mb={6} style={{ letterSpacing: "0.04em" }}>
            Permissions
          </Text>
          {role.permissions.length === 0 ? (
            <Text fz="sm" c="dimmed" fs="italic">No permissions assigned</Text>
          ) : (
            <Group gap={6} wrap="wrap">
              {role.permissions.map((perm) => (
                <Badge key={perm.permission_id} variant="light">
                  {PERM_DISPLAY_MAP[perm.name] ?? perm.name}
                </Badge>
              ))}
            </Group>
          )}
        </Box>
      </Collapse>
      <Divider />
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function RolesTable({ roles, onUpdate }: RolesTableProps) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editRole, setEditRole] = useState<RoleWithPermissions | null>(null);
  const tableRef = useClickOutside(() => setSelectedId(null));

  function handleRowClick(role: RoleWithPermissions) {
    if (role.is_protected) {
      if (selectedId === role.role_id) {
        notify({
          type: "info",
          title: "Protected Role",
          message: "This role is protected and cannot be edited.",
        });
      } else {
        setSelectedId(role.role_id);
      }
      return;
    }
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

  const rows = roles.map((role) => {
    const visible = role.permissions.slice(0, MAX_VISIBLE_BADGES);
    const remaining = role.permissions.slice(MAX_VISIBLE_BADGES);
    const isSelected = selectedId === role.role_id;

    return (
      <TableTr
        key={role.role_id}
        onClick={(e) => { e.stopPropagation(); handleRowClick(role); }}
        style={{
          cursor: "pointer",
          backgroundColor: isSelected ? "#f0f7ee" : undefined,
          transition: "background-color 0.15s ease",
        }}
      >
        <TableTd>
          <Text fz="sm" fw={500}>{role.name}</Text>
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
            <Text c="dimmed" size="sm">No permissions assigned</Text>
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
      {/* Desktop table */}
      <div className="hidden sm:block">
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
      </div>

      {/* Mobile accordion list */}
      <div className="sm:hidden">
        <Divider />
        {roles.map((role) => (
          <RoleMobileRow
            key={role.role_id}
            role={role}
            onEdit={() => { if (!role.is_protected) setEditRole(role); }}
            onUpdate={onUpdate}
          />
        ))}
      </div>

      {editRole && (
        <EditRoleDrawer
          opened={!!editRole}
          onClose={handleDrawerClose}
          role={editRole}
          onSuccess={() => { onUpdate(); handleDrawerClose(); }}
          isProtectedRole={editRole.is_protected}
        />
      )}
    </>
  );
}
