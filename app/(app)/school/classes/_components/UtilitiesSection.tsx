"use client";

import Link from "next/link";
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Select,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  IconSchool,
  IconList,
  IconRefresh,
  IconArrowsTransferUp,
} from "@tabler/icons-react";
import { SearchBar } from "@/components/searchBar/SearchBar";
import type { GradeLevelRow, SchoolYearOption } from "../_lib/classService";

interface UtilitiesSectionProps {
  schoolYears: SchoolYearOption[];
  selectedSyId: number | null;
  onSyChange: (syId: number) => void;
  gradeLevels: GradeLevelRow[];
  gradeLevelFilter: number | null;
  onGradeLevelChange: (id: number | null) => void;
  search: string;
  onSearchChange: (val: string) => void;
  onRefresh: () => void;
  hasCreatePermission: boolean;
  canViewTransferRequests: boolean;
  pendingTransferCount: number;
  loading: boolean;
  onCreateClass: () => void;
}

export default function UtilitiesSection({
  schoolYears,
  selectedSyId,
  onSyChange,
  gradeLevels,
  gradeLevelFilter,
  onGradeLevelChange,
  search,
  onSearchChange,
  onRefresh,
  hasCreatePermission,
  canViewTransferRequests,
  pendingTransferCount,
  loading,
  onCreateClass,
}: UtilitiesSectionProps) {
  const syOptions = schoolYears.map((sy) => ({
    value: String(sy.sy_id),
    label: sy.year_range,
  }));

  const glOptions = [
    { value: "all", label: "All Grade Levels" },
    ...gradeLevels.map((gl) => ({
      value: String(gl.grade_level_id),
      label: gl.display_name,
    })),
  ];

  return (
    <>
      <Group justify="space-between" mb="xs">
        <Text size="xl" fw={700}>
          Classes
        </Text>
        <Group gap="xs">
          {canViewTransferRequests && (
            <Button
              component={Link}
              href="/school/classes/transfer-requests"
              variant="outline"
              color="#4EAE4A"
              radius="md"
              size="sm"
              leftSection={<IconArrowsTransferUp size={15} />}
              rightSection={
                pendingTransferCount > 0 ? (
                  <Badge size="xs" color="red" variant="filled" circle>
                    {pendingTransferCount > 99 ? "99+" : pendingTransferCount}
                  </Badge>
                ) : undefined
              }
            >
              Transfer Requests
            </Button>
          )}
          {hasCreatePermission && (
            <Button color="#4EAE4A" radius="md" onClick={onCreateClass}>
              Create a Class
            </Button>
          )}
        </Group>
      </Group>
      <p className="mb-3 text-sm text-[#808898]">
        A class, or section, is a distinct group of students within a specific
        grade level, organized under a dedicated Class Adviser.
      </p>
      <Group mb="sm" wrap="nowrap" align="flex-end" gap="sm">
        <SearchBar
          id="search-classes"
          placeholder="Search classes..."
          ariaLabel="Search classes"
          style={{ flex: 1, minWidth: 0 }}
          maw={700}
          value={search}
          onChange={(e) => onSearchChange(e.currentTarget.value)}
        />
        <Tooltip label="Refresh" position="bottom" withArrow>
          <ActionIcon
            variant="outline"
            color="#808898"
            size="lg"
            radius="xl"
            onClick={onRefresh}
            loading={loading}
            aria-label="Refresh classes"
          >
            <IconRefresh size={18} stroke={1.5} />
          </ActionIcon>
        </Tooltip>
      </Group>
      <Group mb="md" gap="sm">
        <Select
          placeholder="School Year"
          data={syOptions}
          value={selectedSyId ? String(selectedSyId) : null}
          onChange={(val) => val && onSyChange(Number(val))}
          leftSection={<IconSchool size={16} />}
          w={200}
          clearable={false}
        />
        <Select
          placeholder="All Grade Levels"
          data={glOptions}
          value={gradeLevelFilter ? String(gradeLevelFilter) : "all"}
          onChange={(val) =>
            onGradeLevelChange(val && val !== "all" ? Number(val) : null)
          }
          leftSection={<IconList size={16} />}
          w={200}
        />
      </Group>
    </>
  );
}
