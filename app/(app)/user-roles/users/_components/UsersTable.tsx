// app/(app)/user-roles/_components/UsersTable.tsx
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
import type { UserWithRoles } from "../_lib";
import UserTableActions from "./UserTableActions";

type UsersTableProps = {
  users: UserWithRoles[];
  onUpdate: () => void;
};

export default function UsersTable({ users, onUpdate }: UsersTableProps) {
  if (users.length === 0) {
    return (
      <Text c="dimmed" ta="center" py="xl">
        No users found
      </Text>
    );
  }

  const rows = users.map((user) => {
    const fullName = `${user.first_name} ${user.last_name}`;

    return (
      <TableTr key={user.user_id}>
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
          <UserTableActions user={user} onUpdate={onUpdate} />
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
