"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import { Alert } from "@mantine/core";
import SubjectTable from "./SubjectTable";
import SubjectTableSkeleton from "./SubjectTableSkeleton";
import {
  fetchSubjectsByGradeLevel,
  type SubjectRow,
} from "../../_lib/subjectService";

export interface SubjectTableWrapperRef {
  refresh: () => void;
}

interface SubjectTableWrapperProps {
  gradeLevelId: number;
  search?: string;
  onCountChange?: (count: number) => void;
  onGradeLevelDisplay?: (display: string) => void;
}

export default forwardRef<SubjectTableWrapperRef, SubjectTableWrapperProps>(
  function SubjectTableWrapper(
    { gradeLevelId, search = "", onCountChange, onGradeLevelDisplay },
    ref,
  ) {
    const [subjects, setSubjects] = useState<SubjectRow[]>([]);
    const [gradeLevelDisplay, setGradeLevelDisplay] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useImperativeHandle(ref, () => ({ refresh: loadSubjects }));

    useEffect(() => {
      loadSubjects();
    }, [gradeLevelId]);

    async function loadSubjects() {
      try {
        setLoading(true);
        setError(null);
        const result = await fetchSubjectsByGradeLevel(gradeLevelId);
        setSubjects(result.subjects);
        setGradeLevelDisplay(result.gradeLevelDisplay);
        onCountChange?.(result.subjects.length);
        onGradeLevelDisplay?.(result.gradeLevelDisplay);
      } catch (err) {
        setError("Failed to load subjects. Please try again.");
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    const filteredSubjects = useMemo(() => {
      if (!search.trim()) return subjects;
      const query = search.toLowerCase().trim();
      return subjects.filter(
        (s) =>
          s.name.toLowerCase().includes(query) ||
          s.code.toLowerCase().includes(query) ||
          (s.description ?? "").toLowerCase().includes(query),
      );
    }, [subjects, search]);

    if (loading) return <SubjectTableSkeleton />;

    if (error) {
      return (
        <Alert color="red" title="Error">
          {error}
        </Alert>
      );
    }

    return (
      <SubjectTable
        subjects={filteredSubjects}
        gradeLevelDisplay={gradeLevelDisplay}
        onUpdate={loadSubjects}
      />
    );
  },
);
