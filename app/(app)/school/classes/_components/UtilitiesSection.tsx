"use client";

import {
  ActionIcon,
  Group,
  Select,
  Tooltip,
} from "@mantine/core";
import { IconSchool, IconList, IconRefresh } from "@tabler/icons-react";
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
  loading: boolean;
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
  loading,
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
      <Group mb="md" wrap="nowrap" align="flex-end" gap="sm">
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
