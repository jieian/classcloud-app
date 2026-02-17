"use client";

import { SearchBar } from "@/components/searchBar/SearchBar";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  ActionIcon,
  Alert,
  Button,
  Group,
  SimpleGrid,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconRefresh } from "@tabler/icons-react";
import { getSchoolYears, SchoolYear } from "../_lib/yearService";
import SchoolYearCard from "./SchoolYearCard";
import SchoolYearCardSkeleton from "./SchoolYearCardSkeleton";

export default function SchoolYearSection() {
  const [schoolYears, setSchoolYears] = useState<SchoolYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const pathname = usePathname();
  const hasMounted = useRef(false);

  useEffect(() => {
    loadSchoolYears();
    hasMounted.current = true;
  }, []);

  useEffect(() => {
    if (hasMounted.current) loadSchoolYears();
  }, [pathname]);

  async function loadSchoolYears() {
    try {
      setLoading(true);
      setError(null);
      const data = await getSchoolYears();
      setSchoolYears(data);
    } catch (err) {
      setError("Failed to load school years. Please try again later.");
    } finally {
      setLoading(false);
    }
  }

  const filteredYears = useMemo(() => {
    const sorted = [...schoolYears].sort(
      (a, b) => Number(b.is_active) - Number(a.is_active)
    );
    if (!search.trim()) return sorted;
    return sorted.filter((sy) =>
      sy.year_range.toLowerCase().includes(search.toLowerCase().trim())
    );
  }, [schoolYears, search]);

  return (
    <>
      <Group justify="space-between">
        <h1 className="mb-3 text-2xl font-bold">
          School Year{" "}
          {schoolYears.length > 0 && (
            <span className="text-[#808898]">({schoolYears.length})</span>
          )}
        </h1>
        <Button color="#4EAE4A" radius="md" mr="md">
          Create School Year
        </Button>
      </Group>
      <p className="mb-3 text-sm text-[#808898]">
        A school year is a period of time that defines the academic calendar for
        a school.
      </p>
      <Group mb="md" wrap="nowrap" align="flex-end" gap="sm">
        <SearchBar
          id="search-school-years"
          placeholder="Search school years..."
          ariaLabel="Search school years"
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
            aria-label="Refresh school years data"
            onClick={loadSchoolYears}
          >
            <IconRefresh size={18} stroke={1.5} />
          </ActionIcon>
        </Tooltip>
      </Group>

      {loading && <SchoolYearCardSkeleton />}

      {error && (
        <Alert color="red" title="Error" mt="md">
          {error}
        </Alert>
      )}

      {!loading && !error && filteredYears.length === 0 && (
        <Text c="dimmed" ta="center" py="xl">
          No school year found
        </Text>
      )}

      {!loading && !error && filteredYears.length > 0 && (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md" mt="md">
          {filteredYears.map((sy) => (
            <SchoolYearCard
              key={sy.sy_id}
              year_range={sy.year_range}
              is_active={sy.is_active}
              sy_id={sy.sy_id}
            />
          ))}
        </SimpleGrid>
      )}
    </>
  );
}
