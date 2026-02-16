"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ActionIcon, Group, Tooltip, Button } from "@mantine/core";
import { IconRefresh } from "@tabler/icons-react";
import { SearchBar } from "@/components/searchBar/SearchBar";
import RolesTableWrapper, {
  type RolesTableWrapperRef,
} from "./RolesTableWrapper";

export function RolesSection() {
  const [roleCount, setRoleCount] = useState<number | null>(null);
  const [search, setSearch] = useState("");
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
        A role defines a set of permissions that determine what actions a user
        can perform within ClassCloud.
      </p>
      <Group mb="md" wrap="nowrap" align="flex-end" gap="sm">
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
      <RolesTableWrapper
        ref={tableRef}
        search={search}
        onCountChange={setRoleCount}
      />
    </>
  );
}
