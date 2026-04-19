"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ActionIcon, Group, Select, Tooltip, Button } from "@mantine/core";
import { IconRefresh, IconList } from "@tabler/icons-react";
import { SearchBar } from "@/components/searchBar/SearchBar";
import RolesTableWrapper, {
  type RolesTableWrapperRef,
  type RoleFacultyFilter,
} from "./RolesTableWrapper";
import type { RoleWithPermissions } from "../../users/_lib";

interface RolesSectionProps {
  initialRoles: RoleWithPermissions[];
}

const FILTER_OPTIONS = [
  { value: "all", label: "All Roles" },
  { value: "faculty", label: "Faculty" },
  { value: "non-faculty", label: "Non-Faculty" },
];

export function RolesSection({ initialRoles }: RolesSectionProps) {
  const [roleCount, setRoleCount] = useState<number | null>(
    initialRoles.length,
  );
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<RoleFacultyFilter>("all");
  const tableRef = useRef<RolesTableWrapperRef>(null);

  return (
    <>
      <Group justify="space-between">
        <h1 className="mb-3 text-2xl font-bold">
          Roles{" "}
          {roleCount !== null && (
            <span className="text-[#808898]">({roleCount})</span>
          )}
        </h1>
        <Button
          color="#4EAE4A"
          radius="md"
          mr="md"
          component={Link}
          href="/user-roles/roles/create"
        >
          Create Role
        </Button>
      </Group>
      <p className="mb-3 text-sm text-[#808898]">
        Roles group permissions to control what each user can access and do
        within ClassCloud.
      </p>
      <Group mb="xs" wrap="nowrap" align="flex-end" gap="sm">
        <SearchBar
          id="search-roles"
          placeholder="Search roles..."
          ariaLabel="Search roles"
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
            aria-label="Refresh roles data"
            onClick={() => tableRef.current?.refresh()}
          >
            <IconRefresh size={18} stroke={1.5} />
          </ActionIcon>
        </Tooltip>
      </Group>
      <Group mb="md" gap="sm">
        <Select
          placeholder="All Roles"
          data={FILTER_OPTIONS}
          value={filter}
          onChange={(val) => setFilter((val as RoleFacultyFilter) ?? "all")}
          leftSection={<IconList size={16} />}
          w={160}
          clearable={false}
        />
      </Group>
      <RolesTableWrapper
        ref={tableRef}
        search={search}
        filter={filter}
        onCountChange={setRoleCount}
        initialRoles={initialRoles}
      />
    </>
  );
}
