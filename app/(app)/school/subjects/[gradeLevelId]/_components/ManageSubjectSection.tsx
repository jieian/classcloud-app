"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ActionIcon, Button, Group, Tooltip } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconArrowLeft, IconRefresh } from "@tabler/icons-react";
import { SearchBar } from "@/components/searchBar/SearchBar";
import CreateSubjectModal from "../../_components/CreateSubjectModal";
import SubjectTableWrapper, {
  type SubjectTableWrapperRef,
} from "./SubjectTableWrapper";

interface ManageSubjectSectionProps {
  gradeLevelId: number;
}

export function ManageSubjectSection({
  gradeLevelId,
}: ManageSubjectSectionProps) {
  const router = useRouter();
  const [subjectCount, setSubjectCount] = useState<number | null>(null);
  const [gradeLevelDisplay, setGradeLevelDisplay] = useState<string>("");
  const [search, setSearch] = useState("");
  const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure(false);
  const tableRef = useRef<SubjectTableWrapperRef>(null);

  return (
    <>
      <Button
        variant="light"
        color="#597D37"
        leftSection={<IconArrowLeft size={16} />}
        mb="md"
        onClick={() => router.push("/school/subjects")}
      >
        Back to Subjects
      </Button>
      <Group justify="space-between">
        <h1 className="mb-3 text-2xl font-bold">
          Subjects{" "}
          {subjectCount !== null && (
            <span className="text-[#808898]">({subjectCount})</span>
          )}
        </h1>
        <Button color="#4EAE4A" radius="md" mr="md" onClick={openModal}>
          Create Subject
        </Button>
      </Group>
      <p className="mb-3 text-sm text-[#808898]">
        {gradeLevelDisplay
          ? `Subjects assigned to ${gradeLevelDisplay}.`
          : "Subjects assigned to this grade level."}
      </p>
      <Group mb="md" wrap="nowrap" align="flex-end" gap="sm">
        <SearchBar
          id="search-subject"
          placeholder="Search subject..."
          ariaLabel="Search subject"
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
            aria-label="Refresh subject data"
            onClick={() => tableRef.current?.refresh()}
          >
            <IconRefresh size={18} stroke={1.5} />
          </ActionIcon>
        </Tooltip>
      </Group>

      <CreateSubjectModal
        opened={modalOpened}
        onClose={closeModal}
        onSuccess={() => tableRef.current?.refresh()}
        preselectedGradeLevelId={gradeLevelId}
      />

      <SubjectTableWrapper
        ref={tableRef}
        gradeLevelId={gradeLevelId}
        search={search}
        onCountChange={setSubjectCount}
        onGradeLevelDisplay={setGradeLevelDisplay}
      />
    </>
  );
}
