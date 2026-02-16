// app/(app)/user-roles/_components/PendingSection.tsx
"use client";

import { useRef, useState } from "react";
import {
  Group,
  Collapse,
  ActionIcon,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconRefresh, IconChevronDown } from "@tabler/icons-react";
import { SearchBar } from "../../../../../components/searchBar/SearchBar";
import PendingUsersTableWrapper, {
  type PendingUsersTableWrapperRef,
} from "./PendingUsersTableWrapper";

export function PendingSection() {
  const [opened, { toggle }] = useDisclosure(false);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const tableRef = useRef<PendingUsersTableWrapperRef>(null);

  return (
    <div className="mb-6">
      <UnstyledButton onClick={toggle} w="99%">
        <Group justify="space-between">
          <h1 className="mb-3 text-2xl font-bold">
            Pending{" "}
            {pendingCount !== null && (
              <span className="text-[#808898]">({pendingCount})</span>
            )}
          </h1>
          <IconChevronDown
            size={24}
            style={{
              transform: opened ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 200ms ease",
            }}
          />
        </Group>
      </UnstyledButton>

      <Collapse in={opened}>
        <div>
          <p className="mb-3 text-sm text-[#808898]">
            A pending user is an identity that has not yet been activated and
            cannot access ClassCloud.
          </p>

          <Group mb="md" wrap="nowrap" align="flex-end" gap="sm">
            <SearchBar
              id="search-pending-users"
              placeholder="Search pending users..."
              ariaLabel="Search pending users"
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
                aria-label="Refresh pending users data"
                onClick={() => tableRef.current?.refresh()}
              >
                <IconRefresh size={18} stroke={1.5} />
              </ActionIcon>
            </Tooltip>
          </Group>

          <PendingUsersTableWrapper
            ref={tableRef}
            search={search}
            onCountChange={setPendingCount}
          />
        </div>
      </Collapse>
    </div>
  );
}
