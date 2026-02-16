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
  Tooltip,
  VisuallyHidden,
} from "@mantine/core";
import type { RoleWithPermissions } from "../../users/_lib";
import RolesTableActions from "./RolesTableActions";

const MAX_VISIBLE_BADGES = 3;

type RolesTableProps = {
  roles: RoleWithPermissions[];
  onUpdate: () => void;
};

export default function RolesTable({ roles, onUpdate }: RolesTableProps) {
  if (roles.length === 0) {
    return (
      <Text c="dimmed" ta="center" py="xl">
        No roles found
      </Text>
    );
  }

  const rows = roles.map((role) => {
    const visible = role.permissions.slice(0, MAX_VISIBLE_BADGES);
    const remaining = role.permissions.length - MAX_VISIBLE_BADGES;

    return (
      <TableTr key={role.role_id}>
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
                  {perm.name}
                </Badge>
              ))}
              {remaining > 0 && (
                <Tooltip
                  label={role.permissions
                    .slice(MAX_VISIBLE_BADGES)
                    .map((p) => p.name)
                    .join(", ")}
                  multiline
                  maw={300}
                  withArrow
                >
                  <Badge
                    variant="light"
                    color="gray"
                    style={{ cursor: "default" }}
                  >
                    +{remaining} more
                  </Badge>
                </Tooltip>
              )}
            </Group>
          ) : (
            <Text c="dimmed" size="sm">
              No permissions assigned
            </Text>
          )}
        </TableTd>
        <TableTd>
          <RolesTableActions role={role} onUpdate={onUpdate} />
        </TableTd>
      </TableTr>
    );
  });

  return (
    <TableScrollContainer minWidth={600}>
      <Table verticalSpacing="sm">
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
  );
}
