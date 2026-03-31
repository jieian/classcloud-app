"use client";

import { useMemo, useState } from "react";
import {
  ActionIcon,
  Alert,
  Button,
  Flex,
  Group,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconRefresh } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { SearchBar } from "@/components/searchBar/SearchBar";
import { getCurriculums, type Curriculum } from "../_lib/curriculumService";
import CurriculumCard from "./CurriculumCard";
import CurriculumCardSkeleton from "./CurriculumCardSkeleton";

interface Props {
  initialData: Curriculum[];
}

export default function CurriculumSection({ initialData }: Props) {
  const router = useRouter();
  const [curriculums, setCurriculums] = useState<Curriculum[]>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

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
      <Group justify="space-between">
        <h1 className="mb-3 text-2xl font-bold">
          Curriculum{" "}
          {curriculums.length > 0 && (
            <span className="text-[#808898]">({curriculums.length})</span>
          )}
        </h1>
        <Button color="#4EAE4A" radius="md" mr="md" onClick={() => router.push("/school/curriculum/create")}>
          Create a Curriculum
        </Button>
      </Group>

      <p className="mb-3 text-sm text-[#808898]">
        A curriculum defines the subjects offered per grade level for a school year.
      </p>

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

      {loading && <CurriculumCardSkeleton />}

      {error && (
        <Alert color="red" title="Error" mt="md">
          {error}
        </Alert>
      )}

      {!loading && !error && filtered.length === 0 && (
        <Text c="dimmed" ta="center" py="xl">
          No curriculums found.
        </Text>
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
