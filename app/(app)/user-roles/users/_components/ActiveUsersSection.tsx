"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Select,
  Text,
  ThemeIcon,
  Tooltip,
} from "@mantine/core";
import { IconRefresh, IconList, IconAlertTriangle, IconUserX } from "@tabler/icons-react";
import { SearchBar } from "@/components/searchBar/SearchBar";
import UsersTableWrapper, {
  type UsersTableWrapperRef,
  type FacultyFilter,
} from "./UsersTableWrapper";

const FILTER_OPTIONS = [
  { value: "all", label: "All Staff" },
  { value: "faculty", label: "Faculty" },
  { value: "non-faculty", label: "Non-Faculty" },
];

export function ActiveUsersSection() {
  const [userCount, setUserCount] = useState<number | null>(null);
  const [principalCount, setPrincipalCount] = useState(0);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FacultyFilter>("all");
  const [deletionPending, setDeletionPending] = useState(0);
  const tableRef = useRef<UsersTableWrapperRef>(null);

  // Pending deletion-request count for the badge — fetched once on load (not a global
  // per-navigation poll); admins are also alerted in-app when a request comes in.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/users/deletion-requests")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && j) setDeletionPending(j.pendingCount ?? 0);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <Group justify="space-between" align="flex-end" mb="sm">
        <h1 className="mb-0 text-2xl font-bold leading-tight">
          Users{" "}
          {userCount !== null && (
            <span className="text-[#808898]">({userCount})</span>
          )}
        </h1>
        <Group gap="sm" wrap="nowrap" mr="md">
          <Button
            color="#4EAE4A"
            radius="md"
            component={Link}
            href="/user-roles/users/create"
          >
            Create User
          </Button>
          <Button
            variant="outline"
            color="#4EAE4A"
            radius="md"
            component={Link}
            href="/user-roles/users/deletion-requests"
            leftSection={<IconUserX size={15} />}
            rightSection={
              deletionPending > 0 ? (
                <Badge size="xs" color="red" variant="filled" circle>
                  {deletionPending > 99 ? "99+" : deletionPending}
                </Badge>
              ) : undefined
            }
          >
            Deletion Requests
          </Button>
        </Group>
      </Group>
      <p className="mb-3 text-sm text-[#808898]">
        A user is an identity within an account that has long-term credentials
        and is used to access ClassCloud.
      </p>
      <Group mb="xs" wrap="nowrap" align="flex-end" gap="sm">
        <SearchBar
          id="search-active-users"
          placeholder="Search active users..."
          ariaLabel="Search active users"
          style={{ flex: 1, minWidth: 0 }}
          maw={700}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
        <Tooltip label="Refresh" position="bottom" withArrow>
          <ActionIcon
            variant="outline"
            color="#808898"
            size="lg"
            radius="xl"
            aria-label="Refresh active users data"
            onClick={() => tableRef.current?.refresh()}
          >
            <IconRefresh size={18} stroke={1.5} />
          </ActionIcon>
        </Tooltip>
      </Group>
      <Group mb="md" gap="sm">
        <Select
          placeholder="All Staff"
          data={FILTER_OPTIONS}
          value={filter}
          onChange={(val) => setFilter((val as FacultyFilter) ?? "all")}
          leftSection={<IconList size={16} />}
          w={160}
          clearable={false}
        />
      </Group>
      {principalCount > 1 && (
        <Alert
          variant="filled"
          radius="md"
          mb="md"
          styles={{
            root: { backgroundColor: "#fae173" },
            icon: { alignSelf: "center", marginTop: 0 },
          }}
          icon={
            <ThemeIcon color="#2A2A2A" variant="transparent" size="md">
              <IconAlertTriangle size={20} />
            </ThemeIcon>
          }
        >
          <Text fw={700} size="sm" c="#2A2A2A">
            Multiple Principals Detected
          </Text>
          <Text size="sm" fs="italic" c="#2A2A2A">
            There are currently <strong>{principalCount} users</strong> with the{" "}
            <strong>Principal</strong> role. Only one Principal is expected.
          </Text>
        </Alert>
      )}
      <UsersTableWrapper
        ref={tableRef}
        search={search}
        filter={filter}
        onCountChange={setUserCount}
        onPrincipalCountChange={setPrincipalCount}
      />
    </>
  );
}
