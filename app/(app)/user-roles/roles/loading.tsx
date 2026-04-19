"use client";

import Link from "next/link";
import { ActionIcon, Group, Select, Tooltip, Button } from "@mantine/core";
import { IconRefresh, IconList } from "@tabler/icons-react";
import { SearchBar } from "@/components/searchBar/SearchBar";
import RolesTableSkeleton from "./_components/RolesTableSkeleton";

export default function RolesLoading() {
  return (
    <>
      <h1 className="text-3xl font-bold mb-6 text-[#597D37]">
        Roles Management
      </h1>
      <Group justify="space-between">
        <h1 className="mb-3 text-2xl font-bold">Roles</h1>
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
        within ClassCloud. Assign roles to users to grant them specific access.
      </p>
      <Group mb="xs" wrap="nowrap" align="flex-end" gap="sm">
        <SearchBar
          id="search-roles"
          placeholder="Search roles..."
          ariaLabel="Search roles"
          style={{ flex: 1, minWidth: 0 }}
          maw={700}
          value=""
          onChange={() => {}}
        />
        <Tooltip label="Refresh" position="bottom" withArrow>
          <ActionIcon
            variant="outline"
            color="#808898"
            size="lg"
            radius="xl"
            aria-label="Refresh roles data"
            disabled
          >
            <IconRefresh size={18} stroke={1.5} />
          </ActionIcon>
        </Tooltip>
      </Group>
      <Group mb="md" gap="sm">
        <Select
          placeholder="All Roles"
          data={[]}
          value="all"
          leftSection={<IconList size={16} />}
          w={160}
          disabled
        />
      </Group>
      <RolesTableSkeleton />
    </>
  );
}
