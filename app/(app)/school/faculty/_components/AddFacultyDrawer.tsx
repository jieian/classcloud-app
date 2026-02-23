"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Drawer,
  Group,
  Pagination,
  Table,
  TableScrollContainer,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
  Text,
  Tooltip,
  VisuallyHidden,
} from "@mantine/core";
import { IconRefresh } from "@tabler/icons-react";
import { SearchBar } from "@/components/searchBar/SearchBar";
import {
  fetchActiveUsersWithRoles,
  type UserWithRoles,
} from "@/app/(app)/user-roles/users/_lib";
import AddFacultyDrawerActions from "./AddFacultyDrawerActions";

interface AddFacultyDrawerProps {
  opened: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const PAGE_SIZE = 5;

export default function AddFacultyDrawer({
  opened,
  onClose,
  onSuccess: _onSuccess,
}: AddFacultyDrawerProps) {
  const router = useRouter();
  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (opened) {
      loadUsers();
      setSearch("");
      setPage(1);
    }
  }, [opened]);

  async function loadUsers() {
    try {
      setLoading(true);
      setError(null);
      const all = await fetchActiveUsersWithRoles();
      // Only users with no is_faculty role
      const nonFaculty = all.filter(
        (u) => !u.roles.some((r) => r.is_faculty === true),
      );
      setUsers(nonFaculty);
    } catch {
      setError("Failed to load users. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.toLowerCase().trim();
    return users.filter((u) => {
      const full = `${u.first_name} ${u.last_name}`.toLowerCase();
      return (
        full.includes(q) ||
        u.first_name.toLowerCase().includes(q) ||
        u.last_name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q)
      );
    });
  }, [users, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.currentTarget.value);
    setPage(1);
  };

  const handleAddFaculty = (uid: string) => {
    onClose();
    router.push(`/school/faculty/create?uid=${encodeURIComponent(uid)}`);
  };

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      title="Add Faculty"
      position="bottom"
      size="lg"
      overlayProps={{ backgroundOpacity: 0.5, blur: 4 }}
    >
      <Text size="sm" c="dimmed" mb="md">
        Promote an existing user to a faculty role to begin assigning academic
        loads.
      </Text>

      <Group mb="md" wrap="nowrap" align="flex-end" gap="sm">
        <SearchBar
          id="search-add-faculty"
          placeholder="Search users..."
          ariaLabel="Search users"
          style={{ flex: 1, minWidth: 0 }}
          maw={700}
          value={search}
          onChange={handleSearchChange}
        />
        <Tooltip label="Refresh" position="bottom" withArrow>
          <ActionIcon
            variant="outline"
            color="#808898"
            size="lg"
            radius="xl"
            aria-label="Refresh users"
            loading={loading}
            onClick={loadUsers}
          >
            <IconRefresh size={18} stroke={1.5} />
          </ActionIcon>
        </Tooltip>
      </Group>

      {error && (
        <Alert color="red" title="Error" mb="md">
          {error}
        </Alert>
      )}

      {!error && filtered.length === 0 && !loading && (
        <Text c="dimmed" ta="center" py="xl">
          No users found
        </Text>
      )}

      {!error && filtered.length > 0 && (
        <>
          <TableScrollContainer minWidth={400}>
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
              <TableTbody>
                {paginated.map((user) => {
                  const fullName = `${user.first_name} ${user.last_name}`;
                  return (
                    <TableTr key={user.uid}>
                      <TableTd>
                        <Text fz="sm" fw={500}>
                          {fullName}
                        </Text>
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
                        <AddFacultyDrawerActions
                          user={user}
                          onAdd={handleAddFaculty}
                        />
                      </TableTd>
                    </TableTr>
                  );
                })}
              </TableTbody>
            </Table>
          </TableScrollContainer>

          {totalPages > 1 && (
            <Group justify="center" mt="md">
              <Pagination
                value={page}
                onChange={setPage}
                total={totalPages}
                size="sm"
              />
            </Group>
          )}
        </>
      )}
    </Drawer>
  );
}
