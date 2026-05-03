"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { ActionIcon, Button, Group, Indicator, Tooltip } from "@mantine/core";
import { IconClipboardList, IconRefresh } from "@tabler/icons-react";
import Link from "next/link";
import { SearchBar } from "@/components/searchBar/SearchBar";
import FacultyTableWrapper, {
  type FacultyTableWrapperRef,
} from "./FacultyTableWrapper";

export interface TeachingStaffSectionRef {
  refresh: () => void;
}

interface TeachingStaffSectionProps {
  onCountChange?: (count: number) => void;
}

export const TeachingStaffSection = forwardRef<
  TeachingStaffSectionRef,
  TeachingStaffSectionProps
>(function TeachingStaffSection({ onCountChange }, ref) {
  const [staffCount, setStaffCount] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [masterlistIncomplete, setMasterlistIncomplete] = useState(false);
  const tableRef = useRef<FacultyTableWrapperRef>(null);

  useImperativeHandle(ref, () => ({
    refresh: () => tableRef.current?.refresh(),
  }));

  useEffect(() => {
    fetch("/api/faculty/masterlist/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d?.hasIncomplete) setMasterlistIncomplete(true);
      })
      .catch(() => {
        // Non-fatal — indicator simply won't show
      });
  }, []);

  function handleCountChange(count: number) {
    setStaffCount(count);
    onCountChange?.(count);
  }

  return (
    <>
      <Group justify="space-between" align="flex-start">
        <h2 className="mb-3 text-2xl font-bold">
          Teaching Staff{" "}
          {staffCount !== null && (
            <span className="text-[#808898]">({staffCount})</span>
          )}
        </h2>
        <Indicator
          color="red"
          size={10}
          disabled={!masterlistIncomplete}
          position="top-end"
          offset={4}
        >
          <Button
            variant="filled"
            color="#4A72AE"
            radius="md"
            leftSection={<IconClipboardList size={16} />}
            component={Link}
            href="/school/faculty/masterlist"
          >
            Masterlist
          </Button>
        </Indicator>
      </Group>
      <p className="mb-3 text-sm text-[#808898]">
        Teachers responsible for delivering subject instruction and managing
        their assigned advisory class.
      </p>
      <Group mb="md" wrap="nowrap" align="flex-end" gap="sm">
        <SearchBar
          id="search-teaching-staff"
          placeholder="Search teaching staff..."
          ariaLabel="Search teaching staff"
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
            aria-label="Refresh teaching staff"
            onClick={() => tableRef.current?.refresh()}
          >
            <IconRefresh size={18} stroke={1.5} />
          </ActionIcon>
        </Tooltip>
      </Group>

      <FacultyTableWrapper
        ref={tableRef}
        search={search}
        onCountChange={handleCountChange}
      />
    </>
  );
});
