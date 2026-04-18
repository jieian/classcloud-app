// app/(app)/user-roles/_components/PendingSection.tsx
"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import {
  Group,
  Collapse,
  ActionIcon,
  Tooltip,
  UnstyledButton,
  Select,
  Badge,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconRefresh, IconChevronDown, IconList } from "@tabler/icons-react";
import { SearchBar } from "../../../../../components/searchBar/SearchBar";
import PendingUsersTableWrapper, {
  type PendingUsersTableWrapperRef,
  type PendingFilter,
} from "./PendingUsersTableWrapper";

const FILTER_OPTIONS = [
  { value: "self_register", label: "Self-Registration" },
  { value: "admin_invite", label: "Admin-Invited" },
];

type UnreadNotification = { notification_id: string; reference_id: string };

export function PendingSection() {
  const [opened, { toggle }] = useDisclosure(false);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [selfRegCount, setSelfRegCount] = useState(0);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<PendingFilter>("self_register");
  const tableRef = useRef<PendingUsersTableWrapperRef>(null);

  // uid → notifId map for unread new_signup notifications
  const [unreadMap, setUnreadMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    fetch("/api/users/signup-notifications", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { notifications?: UnreadNotification[] }) => {
        const map = new Map<string, string>();
        (d.notifications ?? []).forEach((n) => {
          if (n.reference_id) map.set(n.reference_id, n.notification_id);
        });
        setUnreadMap(map);
      })
      .catch(() => {});
  }, []);

  const handleMarkRead = useCallback(
    async (uid: string) => {
      const notifId = unreadMap.get(uid);
      if (!notifId) return;
      // Optimistic update — remove immediately so indicators clear at once
      setUnreadMap((prev) => {
        const next = new Map(prev);
        next.delete(uid);
        return next;
      });
      await fetch("/api/notifications/mark-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notification_ids: [notifId] }),
      }).catch(() => {});
    },
    [unreadMap],
  );

  return (
    <div className="mb-6">
      <UnstyledButton onClick={toggle} w="99%">
        <Group justify="space-between">
          <h1
            className="mb-3 text-2xl font-bold"
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            Pending{" "}
            {pendingCount !== null && (
              <span className="text-[#808898]">({pendingCount})</span>
            )}
            {selfRegCount > 0 && (
              <span
                style={{
                  display: "inline-block",
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  backgroundColor: "#fa5252",
                  flexShrink: 0,
                  marginBottom: 2,
                }}
              />
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

          <Group mb="xs" wrap="nowrap" align="flex-end" gap="sm">
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

          <Group mb="md" gap="sm">
            <Select
              data={FILTER_OPTIONS}
              value={filter}
              onChange={(val) =>
                setFilter((val as PendingFilter) ?? "self_register")
              }
              leftSection={<IconList size={16} />}
              w={180}
              clearable={false}
              allowDeselect={false}
              renderOption={({ option }) => (
                <Group
                  gap="xs"
                  justify="space-between"
                  style={{ width: "100%" }}
                >
                  <span>{option.label}</span>
                  {option.value === "self_register" && unreadMap.size > 0 && (
                    <Badge size="xs" color="red" variant="filled">
                      {unreadMap.size > 99 ? "99+" : unreadMap.size}
                    </Badge>
                  )}
                </Group>
              )}
            />
          </Group>

          <PendingUsersTableWrapper
            ref={tableRef}
            search={search}
            filter={filter}
            onCountChange={setPendingCount}
            onSelfRegCountChange={setSelfRegCount}
            unreadMap={unreadMap}
            onMarkRead={handleMarkRead}
          />
        </div>
      </Collapse>
    </div>
  );
}
