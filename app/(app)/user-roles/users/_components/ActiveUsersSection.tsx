"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Select,
  Tooltip,
} from "@mantine/core";
import { IconRefresh, IconList, IconAlertTriangle } from "@tabler/icons-react";
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
  const tableRef = useRef<UsersTableWrapperRef>(null);

  return (
    <>
      <Group justify="space-between">
        <h1 className="mb-3 text-2xl font-bold">
          Users{" "}
          {userCount !== null && (
            <span className="text-[#808898]">({userCount})</span>
          )}
        </h1>
        <Button
          color="#4EAE4A"
          radius="md"
          mr="md"
          component={Link}
          href="/user-roles/users/create"
        >
          Create User
        </Button>
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
          icon={<IconAlertTriangle size={14} />}
          color="yellow"
          title="Multiple Principals Detected"
          mb="md"
          styles={{ title: { fontSize: "var(--mantine-font-size-sm)" }, message: { fontSize: "var(--mantine-font-size-xs)" } }}
        >
          There are currently <strong>{principalCount} users</strong> with the{" "}
          <strong>Principal</strong> role. Only one Principal is expected.
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
