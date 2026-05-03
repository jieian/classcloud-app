"use client";

import {
  forwardRef,
  useEffectEvent,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useEffect,
} from "react";
import { usePathname } from "next/navigation";
import { Alert, Group, Pagination } from "@mantine/core";
import EmptySearchState from "@/components/EmptySearchState";
import FacultyTable from "./FacultyTable";
import FacultyTableSkeleton from "./FacultyTableSkeleton";
import { fetchFaculty, type FacultyMember } from "../_lib/facultyService";

type SortKey = [number, number, string, string, string];

function getSortKey(m: FacultyMember): SortKey {
  if (!m.advisory_section) {
    return [0, 0, "", m.last_name, m.first_name];
  }
  const grade =
    parseInt(m.advisory_section.grade_level_display.replace(/\D/g, ""), 10) ||
    999;
  return [1, grade, m.advisory_section.section_name, m.last_name, m.first_name];
}

function compareSortKeys(a: SortKey, b: SortKey): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
}

const PAGE_SIZE = 10;

export interface FacultyTableWrapperRef {
  refresh: () => void;
}

interface FacultyTableWrapperProps {
  search?: string;
  onCountChange?: (count: number) => void;
}

export default forwardRef<FacultyTableWrapperRef, FacultyTableWrapperProps>(
  function FacultyTableWrapper({ search = "", onCountChange }, ref) {
    const [faculty, setFaculty] = useState<FacultyMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [lockedHeight, setLockedHeight] = useState<number | undefined>();
    const tableContainerRef = useRef<HTMLDivElement>(null);
    const pathname = usePathname();
    
    const loadFaculty = useEffectEvent(async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchFaculty();
        setFaculty(data);
        onCountChange?.(data.length);
      } catch (err) {
        setError("Failed to load faculty. Please try again later.");
        console.error(err);
      } finally {
        setLoading(false);
      }
    });

    useImperativeHandle(ref, () => ({ refresh: loadFaculty }));

    useEffect(() => {
      loadFaculty();
    }, [pathname]);

    useEffect(() => {
      setPage(1);
    }, [search]);

    const filteredFaculty = useMemo(() => {
      if (!search.trim()) return faculty;
      const query = search.toLowerCase().trim();
      return faculty.filter((member) => {
        const fullName = `${member.first_name} ${member.last_name}`.toLowerCase();
        return (
          fullName.includes(query) ||
          member.first_name.toLowerCase().includes(query) ||
          member.last_name.toLowerCase().includes(query) ||
          (member.advisory_section?.section_name ?? "").toLowerCase().includes(query) ||
          (member.advisory_section?.grade_level_display ?? "").toLowerCase().includes(query)
        );
      });
    }, [faculty, search]);

    const sortedFaculty = useMemo(() => {
      const keyed = filteredFaculty.map((m) => ({ member: m, key: getSortKey(m) }));
      keyed.sort((a, b) => compareSortKeys(a.key, b.key));
      return keyed.map(({ member }) => member);
    }, [filteredFaculty]);

    const totalPages = Math.ceil(sortedFaculty.length / PAGE_SIZE);
    const pageStart = (page - 1) * PAGE_SIZE;
    const pagedFaculty = sortedFaculty.slice(pageStart, pageStart + PAGE_SIZE);
    const hasSearchQuery = search.trim().length > 0;

    useLayoutEffect(() => {
      if (!tableContainerRef.current) return;
      if (pagedFaculty.length === PAGE_SIZE) {
        const h = tableContainerRef.current.offsetHeight;
        setLockedHeight((prev) => (prev === undefined ? h : Math.max(prev, h)));
      }
    }, [pagedFaculty.length]);

    if (loading) return <FacultyTableSkeleton />;

    if (error) {
      return (
        <Alert color="red" title="Error">
          {error}
        </Alert>
      );
    }

    if (hasSearchQuery && filteredFaculty.length === 0) {
      return <EmptySearchState />;
    }

    return (
      <>
        <div ref={tableContainerRef} style={{ minHeight: lockedHeight }}>
          <FacultyTable faculty={pagedFaculty} onUpdate={loadFaculty} />
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
      </>
    );
  },
);
