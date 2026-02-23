"use client";

import { useRef, useState } from "react";
import { ActionIcon, Group, Tooltip, Button } from "@mantine/core";
import { IconRefresh } from "@tabler/icons-react";
import { SearchBar } from "@/components/searchBar/SearchBar";
import FacultyTableWrapper, {
  type FacultyTableWrapperRef,
} from "./FacultyTableWrapper";
import AddFacultyDrawer from "./AddFacultyDrawer";

export function FacultySection() {
  const [facultyCount, setFacultyCount] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const tableRef = useRef<FacultyTableWrapperRef>(null);
  const [drawerOpened, setDrawerOpened] = useState(false);

  return (
    <>
      <AddFacultyDrawer
        opened={drawerOpened}
        onClose={() => setDrawerOpened(false)}
        onSuccess={() => {
          setDrawerOpened(false);
          tableRef.current?.refresh();
        }}
      />
      <Group justify="space-between">
        <h1 className="mb-3 text-2xl font-bold">
          Faculty{" "}
          {facultyCount !== null && (
            <span className="text-[#808898]">({facultyCount})</span>
          )}
        </h1>
        <Button color="#4EAE4A" radius="md" mr="md" onClick={() => setDrawerOpened(true)}>
          Add Faculty
        </Button>
      </Group>
      <p className="mb-3 text-sm text-[#808898]">
        A faculty member is an academic staff identity assigned to teach
        subjects and handle sections for a school year.
      </p>
      <Group mb="md" wrap="nowrap" align="flex-end" gap="sm">
        <SearchBar
          id="search-faculty"
          placeholder="Search faculty..."
          ariaLabel="Search faculty"
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
            aria-label="Refresh faculty data"
            onClick={() => tableRef.current?.refresh()}
          >
            <IconRefresh size={18} stroke={1.5} />
          </ActionIcon>
        </Tooltip>
      </Group>

      <FacultyTableWrapper
        ref={tableRef}
        search={search}
        onCountChange={setFacultyCount}
      />
    </>
  );
}
