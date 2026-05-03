"use client";

import {
  forwardRef,
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import { Alert, Group, Pagination } from "@mantine/core";
import EmptySearchState from "@/components/EmptySearchState";
import SubjectCoordinatorsTable from "./SubjectCoordinatorsTable";
import SubjectCoordinatorsTableSkeleton from "./SubjectCoordinatorsTableSkeleton";
import EditCoordinatorModal from "./EditCoordinatorModal";
import {
  fetchSubjectCoordinatorGroups,
  type SubjectCoordinatorRow,
} from "../_lib/facultyService";

const PAGE_SIZE = 10;

export interface SubjectCoordinatorsTableWrapperRef {
  refresh: () => void;
}

interface SubjectCoordinatorsTableWrapperProps {
  search?: string;
  onCountChange?: (count: number) => void;
  onIncompleteChange?: (hasIncomplete: boolean) => void;
}

export default forwardRef<
  SubjectCoordinatorsTableWrapperRef,
  SubjectCoordinatorsTableWrapperProps
>(function SubjectCoordinatorsTableWrapper(
  { search = "", onCountChange, onIncompleteChange },
  ref,
) {
  const [groups, setGroups] = useState<SubjectCoordinatorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [lockedHeight, setLockedHeight] = useState<number | undefined>();
  const [editingGroup, setEditingGroup] = useState<SubjectCoordinatorRow | null>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  const loadGroups = useEffectEvent(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchSubjectCoordinatorGroups();
      setGroups(data);
      // Report distinct assigned coordinator count (stable, uses full unfiltered data)
      const assignedCount = new Set(
        data
          .filter((g) => g.coordinator !== null)
          .map((g) => g.coordinator!.uid),
      ).size;
      onCountChange?.(assignedCount);
      onIncompleteChange?.(data.some((g) => g.coordinator === null));
    } catch (err) {
      setError("Failed to load subject coordinators. Please try again later.");
      onIncompleteChange?.(false);
      console.error(err);
    } finally {
      setLoading(false);
    }
  });

  useImperativeHandle(ref, () => ({ refresh: loadGroups }));

  useEffect(() => {
    loadGroups();
  }, [pathname]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  // Sort: groups with no coordinator float to top, then alphabetical by name.
  // Schwartzian transform — sort key computed once per item, O(n log n).
  const sortedAndFiltered = useMemo(() => {
    const query = search.toLowerCase().trim();

    const filtered = query
      ? groups.filter((g) => {
          const coordinatorName = g.coordinator
            ? `${g.coordinator.first_name} ${g.coordinator.last_name}`.toLowerCase()
            : "";
          return (
            g.name.toLowerCase().includes(query) ||
            coordinatorName.includes(query)
          );
        })
      : groups;

    return filtered
      .map((g) => ({
        g,
        sortKey: [g.coordinator === null ? 0 : 1, g.name.toLowerCase()] as [
          number,
          string,
        ],
      }))
      .sort((a, b) => {
        const groupDiff = a.sortKey[0] - b.sortKey[0];
        if (groupDiff !== 0) return groupDiff;
        return a.sortKey[1].localeCompare(b.sortKey[1]);
      })
      .map(({ g }) => g);
  }, [groups, search]);

  const totalPages = Math.ceil(sortedAndFiltered.length / PAGE_SIZE);
  const pageStart = (page - 1) * PAGE_SIZE;
  const pagedGroups = sortedAndFiltered.slice(pageStart, pageStart + PAGE_SIZE);
  const hasSearchQuery = search.trim().length > 0;

  useLayoutEffect(() => {
    if (!tableContainerRef.current) return;
    if (pagedGroups.length === PAGE_SIZE) {
      const h = tableContainerRef.current.offsetHeight;
      setLockedHeight((prev) => (prev === undefined ? h : Math.max(prev, h)));
    }
  }, [pagedGroups.length]);

  if (loading) return <SubjectCoordinatorsTableSkeleton />;

  if (error) {
    return (
      <Alert color="red" title="Error">
        {error}
      </Alert>
    );
  }

  if (hasSearchQuery && sortedAndFiltered.length === 0) {
    return <EmptySearchState />;
  }

  return (
    <>
      <div ref={tableContainerRef} style={{ minHeight: lockedHeight }}>
        <SubjectCoordinatorsTable
          groups={pagedGroups}
          editingOpen={editingGroup !== null}
          onEditCoordinator={(group) => setEditingGroup(group)}
        />
      </div>
      {totalPages > 1 && (
        <Group justify="center" mt="md">
          <Pagination
            value={page}
            onChange={setPage}
            total={totalPages}
            color="#4EAE4A"
          />
        </Group>
      )}

      {/* Always rendered so Mantine can run exit-transition cleanup (scroll-lock release). */}
      <EditCoordinatorModal
        opened={editingGroup !== null}
        subjectGroupId={editingGroup?.subject_group_id ?? 0}
        subjectGroupName={editingGroup?.name ?? ""}
        currentCoordinator={editingGroup?.coordinator ?? null}
        onClose={() => setEditingGroup(null)}
        onAssigned={loadGroups}
      />
    </>
  );
});
