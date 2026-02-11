"use client";

import { useRef, useState } from "react";
import { ActionIcon, Button, Group, Tooltip } from "@mantine/core";
import { IconRefresh } from "@tabler/icons-react";
import { SearchBar } from "./SearchBar";
import UsersTableWrapper, {
  type UsersTableWrapperRef,
} from "./UsersTableWrapper";

export function ActiveUsersSection() {
  const [userCount, setUserCount] = useState<number | null>(null);
  const [search, setSearch] = useState("");
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
        <Button color="#4EAE4A" radius="md" mr="md">
          Create User
        </Button>
      </Group>
      <p className="mb-3 text-sm text-[#808898]">
        A user is an identity within an account that has long-term credentials
        and is used to access ClassCloud.
      </p>
      <Group mb="md" wrap="nowrap" align="flex-end" gap="sm">
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
      <UsersTableWrapper
        ref={tableRef}
        search={search}
        onCountChange={setUserCount}
      />
    </>
  );
}
