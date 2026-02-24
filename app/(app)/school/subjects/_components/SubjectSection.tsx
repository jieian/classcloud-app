"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ActionIcon,
  Alert,
  Button,
  Group,
  SimpleGrid,
  Skeleton,
  Tooltip,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconRefresh } from "@tabler/icons-react";
import { SearchBar } from "@/components/searchBar/SearchBar";
import GradeLevelCard from "./GradeLevelCard";
import CreateSubjectModal from "./CreateSubjectModal";
import {
  fetchGradeLevelsWithSubjectCount,
  type GradeLevelWithCount,
} from "../_lib/subjectService";

export function SubjectSection() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [gradeLevels, setGradeLevels] = useState<GradeLevelWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchGradeLevelsWithSubjectCount();
      setGradeLevels(data);
    } catch (err) {
      setError("Failed to load subjects. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const totalSubjectCount = gradeLevels.reduce(
    (sum, gl) => sum + gl.subject_count,
    0,
  );

  const filteredGradeLevels = useMemo(() => {
    if (!search.trim()) return gradeLevels;
    const query = search.toLowerCase().trim();
    return gradeLevels.filter((gl) =>
      gl.display_name.toLowerCase().includes(query),
    );
  }, [gradeLevels, search]);

  return (
    <>
      <Group justify="space-between">
        <h1 className="mb-3 text-2xl font-bold">
          Subjects{" "}
          {!loading && (
            <span className="text-[#808898]">({totalSubjectCount})</span>
          )}
        </h1>
        <Button color="#4EAE4A" radius="md" mr="md" onClick={openModal}>
          Create Subject
        </Button>
      </Group>
      <p className="mb-3 text-sm text-[#808898]">
        A subject is an academic course offering assigned to sections and
        faculty members for a specific school year.
      </p>
      <Group mb="md" wrap="nowrap" align="flex-end" gap="sm">
        <SearchBar
          id="search-grade-level"
          placeholder="Search grade level..."
          ariaLabel="Search grade level"
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
            aria-label="Refresh grade level data"
            loading={loading}
            onClick={loadData}
          >
            <IconRefresh size={18} stroke={1.5} />
          </ActionIcon>
        </Tooltip>
      </Group>

      {error && (
        <Alert color="red" title="Error" mb="md">
          {error}
        </Alert>
      )}

      <CreateSubjectModal
        opened={modalOpened}
        onClose={closeModal}
        onSuccess={loadData}
      />

      {loading ? (
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} height={130} radius="md" />
          ))}
        </SimpleGrid>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
          {filteredGradeLevels.map((gl) => (
            <GradeLevelCard
              key={gl.grade_level_id}
              level_number={gl.level_number}
              display_name={gl.display_name}
              subject_count={gl.subject_count}
              onManage={() =>
                router.push(`/school/subjects/${gl.grade_level_id}`)
              }
            />
          ))}
        </SimpleGrid>
      )}
    </>
  );
}
