"use client";

import { SearchBar } from "@/components/searchBar/SearchBar";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ActionIcon,
  Alert,
  Button,
  Center,
  Group,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Tooltip,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconCalendarOff, IconRefresh } from "@tabler/icons-react";
import {
  getSchoolYears,
  SchoolYear,
  checkCanCreateSchoolYear,
  CanCreateResult,
} from "../_lib/yearService";
import SchoolYearCard from "./SchoolYearCard";
import SchoolYearCardSkeleton from "./SchoolYearCardSkeleton";
import EmptySearchState from "@/components/EmptySearchState";

export default function SchoolYearSection({
  initialSchoolYears,
}: {
  initialSchoolYears?: SchoolYear[];
}) {
  const router = useRouter();
  const isMobile = useMediaQuery("(max-width: 767.9px)");
  const [schoolYears, setSchoolYears] = useState<SchoolYear[]>(initialSchoolYears ?? []);
  const [loading, setLoading] = useState(!initialSchoolYears);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [canCreate, setCanCreate] = useState<CanCreateResult>({
    allowed: true,
  });

  useEffect(() => {
    checkCanCreateSchoolYear().then(setCanCreate).catch(() => {});
    if (!initialSchoolYears) loadSchoolYears();
  }, []);

  async function loadSchoolYears() {
    try {
      setLoading(true);
      setError(null);
      const data = await getSchoolYears();
      setSchoolYears(data);
    } catch {
      setError("Failed to load school years. Please try again later.");
    } finally {
      setLoading(false);
    }
  }

  const filteredYears = useMemo(() => {
    const sorted = [...schoolYears].sort(
      (a, b) => Number(b.is_active) - Number(a.is_active),
    );
    if (!search.trim()) return sorted;
    return sorted.filter((sy) =>
      sy.year_range.toLowerCase().includes(search.toLowerCase().trim()),
    );
  }, [schoolYears, search]);

  return (
    <>
      <Group justify="space-between" wrap="nowrap" align="flex-end" mb="sm">
        <h1 className="text-2xl md:text-3xl font-bold text-[#597D37] mb-0 leading-tight">
          School Year{" "}
          {schoolYears.length > 0 && (
            <span className="text-[#808898] text-xl font-semibold">
              ({schoolYears.length})
            </span>
          )}
        </h1>
        <Tooltip
          label={canCreate.reason}
          withArrow
          position="bottom"
          multiline
          w={280}
          disabled={canCreate.allowed}
        >
          <Button
            color="#4EAE4A"
            radius="md"
            size={isMobile ? "sm" : "sm"}
            px={isMobile ? "md" : undefined}
            // disabled={!canCreate.allowed}
            onClick={() => router.push("/school/year/create")}
            style={isMobile ? { flexShrink: 0 } : undefined}
          >
            Create a School Year
          </Button>
        </Tooltip>
      </Group>
      <p className="mb-3 text-sm text-[#808898]">
        A school year is a period of time that defines the academic calendar for
        a school.
      </p>
      {schoolYears.length > 0 && (
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
              onClick={() => {
                loadSchoolYears();
                checkCanCreateSchoolYear().then(setCanCreate).catch(() => {});
              }}
            >
              <IconRefresh size={18} stroke={1.5} />
            </ActionIcon>
          </Tooltip>
        </Group>
      )}

      {loading && <SchoolYearCardSkeleton />}

      {error && (
        <Alert color="red" title="Error" mt="md">
          {error}
        </Alert>
      )}

      {!loading &&
        !error &&
        filteredYears.length === 0 &&
        schoolYears.length === 0 && (
          <Center
            py={36}
            px="md"
            style={{
              border: "1px solid var(--mantine-color-gray-3)",
              borderRadius: "8px",
              backgroundColor: "#FFFFFF",
            }}
          >
            <Stack gap={10} align="center">
              <ThemeIcon
                size={48}
                radius="xl"
                color="gray.2"
                variant="filled"
                mb="sm"
              >
                <IconCalendarOff size={28} stroke={1.5} color="#3D4147" />
              </ThemeIcon>
              <Stack gap={4} align="center">
                <Text size="md" fw={700} c="#111827" mb="sm">
                  No School Year yet created.
                </Text>
              </Stack>
              <Button
                color="#4EAE4A"
                radius="md"
                size="sm"
                component={Link}
                href="/school/year/create"
              >
                Create a School Year
              </Button>
            </Stack>
          </Center>
        )}

      {!loading &&
        !error &&
        filteredYears.length === 0 &&
        schoolYears.length > 0 && <EmptySearchState />}

      {!loading && !error && filteredYears.length > 0 && (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md" mt="md">
          {filteredYears.map((sy) => (
            <SchoolYearCard
              key={sy.sy_id}
              sy_id={sy.sy_id}
              start_year={sy.start_year}
              end_year={sy.end_year}
              is_active={sy.is_active}
              hasExams={sy.hasExams}
            />
          ))}
        </SimpleGrid>
      )}
    </>
  );
}
