"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ActionIcon,
  Alert,
  Button,
  Center,
  Flex,
  Group,
  Stack,
  Text,
  ThemeIcon,
  Tooltip,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconRefresh, IconSchoolOff } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { SearchBar } from "@/components/searchBar/SearchBar";
import { getCurriculums, type Curriculum } from "../_lib/curriculumService";
import CurriculumCard from "./CurriculumCard";
import CurriculumCardSkeleton from "./CurriculumCardSkeleton";
import EmptySearchState from "@/components/EmptySearchState";

export default function CurriculumSection() {
  const router = useRouter();
  const isMobile = useMediaQuery("(max-width: 767.9px)");
  const [curriculums, setCurriculums] = useState<Curriculum[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const data = await getCurriculums();
      setCurriculums(data);
    } catch {
      setError("Failed to load curriculums. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    // Active curriculum always first
    const sorted = [...curriculums].sort(
      (a, b) => Number(b.is_active) - Number(a.is_active),
    );
    if (!search.trim()) return sorted;
    return sorted.filter((c) =>
      c.name.toLowerCase().includes(search.toLowerCase().trim()),
    );
  }, [curriculums, search]);

  return (
    <>
      <Group justify="space-between" wrap="nowrap" align="flex-end" mb="sm">
        <h1 className="text-2xl md:text-3xl font-bold text-[#597D37] mb-0 leading-tight">
          Curriculum{" "}
          {curriculums.length > 0 && (
            <span className="text-[#808898] text-xl font-semibold">
              ({curriculums.length})
            </span>
          )}
        </h1>
        <Button
          color="#4EAE4A"
          radius="md"
          size={isMobile ? "sm" : "sm"}
          px={isMobile ? "md" : undefined}
          style={isMobile ? { flexShrink: 0 } : undefined}
          onClick={() => router.push("/school/curriculum/create")}
        >
          Create a Curriculum
        </Button>
      </Group>

      <p className="mb-3 text-sm text-[#808898]">
        A curriculum defines the subjects offered per grade level for a school year.
      </p>

      {curriculums.length > 0 && (
        <Group mb="md" wrap="nowrap" align="flex-end" gap="sm">
          <SearchBar
            id="search-curriculums"
            placeholder="Search curriculums..."
            ariaLabel="Search curriculums"
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
              aria-label="Refresh curriculums"
              onClick={load}
            >
              <IconRefresh size={18} stroke={1.5} />
            </ActionIcon>
          </Tooltip>
        </Group>
      )}

      {loading && <CurriculumCardSkeleton />}

      {error && (
        <Alert color="red" title="Error" mt="md">
          {error}
        </Alert>
      )}

      {!loading && !error && filtered.length === 0 && curriculums.length === 0 && (
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
            <ThemeIcon size={48} radius="xl" color="gray.2" variant="filled" mb="sm">
              <IconSchoolOff size={28} stroke={1.5} color="#3D4147" />
            </ThemeIcon>
            <Stack gap={4} align="center">
              <Text size="md" fw={700} c="#111827" mb="sm">
                No Curriculum yet created.
              </Text>
            </Stack>
            <Button
              color="#4EAE4A"
              radius="md"
              size="sm"
              onClick={() => router.push("/school/curriculum/create")}
            >
              Create a Curriculum
            </Button>
          </Stack>
        </Center>
      )}

      {!loading && !error && filtered.length === 0 && curriculums.length > 0 && (
        <EmptySearchState />
      )}

      {!loading && !error && filtered.length > 0 && (
        <Flex wrap="wrap" gap="md" mt="md">
          {filtered.map((c) => (
            <CurriculumCard
              key={c.curriculum_id}
              name={c.name}
              is_active={c.is_active}
              created_at={c.created_at}
              onManage={() => router.push(`/school/curriculum/${c.curriculum_id}`)}
            />
          ))}
        </Flex>
      )}
    </>
  );
}
