"use client";

import {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useState,
  useEffect,
} from "react";
import { usePathname } from "next/navigation";
import { Alert } from "@mantine/core";
import FacultyTable from "./FacultyTable";
import FacultyTableSkeleton from "./FacultyTableSkeleton";
import { fetchFaculty, type FacultyMember } from "../_lib/facultyService";

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
    const pathname = usePathname();

    useImperativeHandle(ref, () => ({ refresh: loadFaculty }));

    useEffect(() => {
      loadFaculty();
    }, [pathname]);

    async function loadFaculty() {
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
    }

    const filteredFaculty = useMemo(() => {
      if (!search.trim()) return faculty;
      const query = search.toLowerCase().trim();
      return faculty.filter((member) => {
        const fullName =
          `${member.first_name} ${member.last_name}`.toLowerCase();
        return (
          fullName.includes(query) ||
          member.first_name.toLowerCase().includes(query) ||
          member.last_name.toLowerCase().includes(query) ||
          member.email.toLowerCase().includes(query) ||
          (member.advisory_section?.section_name ?? "")
            .toLowerCase()
            .includes(query) ||
          (member.advisory_section?.grade_level_display ?? "")
            .toLowerCase()
            .includes(query)
        );
      });
    }, [faculty, search]);

    if (loading) return <FacultyTableSkeleton />;

    if (error) {
      return (
        <Alert color="red" title="Error">
          {error}
        </Alert>
      );
    }

    return (
      <FacultyTable faculty={filteredFaculty} onUpdate={loadFaculty} />
    );
  },
);
