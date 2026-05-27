"use client";

import { useState } from "react";
import { useClickOutside, useDisclosure } from "@mantine/hooks";
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
import { useAuth } from "@/context/AuthContext";
import type { UserWithRoles } from "../_lib";
import UserTableActions from "./UserTableActions";
import EditUserDrawer from "./EditUserDrawer";

type UsersTableProps = {
  users: UserWithRoles[];
  onUpdate: () => void;
};

// ── Mobile accordion row ──────────────────────────────────────────────────────

function UserMobileRow({
  u,
  currentUid,
  onEdit,
  onUpdate,
}: {
  u: UserWithRoles;
  currentUid: string | null;
  onEdit: () => void;
  onUpdate: () => void;
}) {
  const [opened, { toggle }] = useDisclosure(false);
  const fullName = `${u.first_name} ${u.last_name}`;

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
              {fullName}
            </Text>
          </Group>
          <div onClick={(e) => e.stopPropagation()}>
            <UserTableActions
              user={u}
              onUpdate={onUpdate}
              onEdit={onEdit}
              currentUid={currentUid}
            />
          </div>
        </Group>
      </div>

      <Collapse in={opened}>
        <Box pb="md" pl={28} pr={4}>
          <Text size="xs" c="dimmed" fw={600} tt="uppercase" mb={2} style={{ letterSpacing: "0.04em" }}>
            Email
          </Text>
          <Text fz="sm" mb="sm">{u.email}</Text>

          <Text size="xs" c="dimmed" fw={600} tt="uppercase" mb={6} style={{ letterSpacing: "0.04em" }}>
            Roles
          </Text>
          {u.roles.length === 0 ? (
            <Text fz="sm" c="dimmed" fs="italic">No role assigned</Text>
          ) : (
            <Group gap={6} wrap="wrap">
              {u.roles.map((role) => (
                <Badge key={role.role_id} variant="light">{role.name}</Badge>
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

  if (users.length === 0) return null;

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
          <Text fz="sm" fw={500}>{fullName}</Text>
        </TableTd>
        <TableTd>
          {u.roles.length > 0 ? (
            <Group gap="xs">
              {u.roles.map((role) => (
                <Badge key={role.role_id} variant="light">{role.name}</Badge>
              ))}
            </Group>
          ) : (
            <Text c="dimmed" size="sm">No role assigned</Text>
          )}
        </TableTd>
        <TableTd>
          <Text fz="sm">{u.email}</Text>
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
      {/* Desktop table */}
      <div className="hidden sm:block">
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
      </div>

      {/* Mobile accordion list */}
      <div className="sm:hidden">
        <Divider />
        {users.map((u) => (
          <UserMobileRow
            key={u.uid}
            u={u}
            currentUid={currentUid}
            onEdit={() => setEditUser(u)}
            onUpdate={onUpdate}
          />
        ))}
      </div>

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
