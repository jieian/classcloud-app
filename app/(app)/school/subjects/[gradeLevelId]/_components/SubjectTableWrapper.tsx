"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Alert } from "@mantine/core";
import SubjectTable from "./SubjectTable";
import SubjectTableSkeleton from "./SubjectTableSkeleton";
import {
  fetchSubjectsByGradeLevel,
  fetchTeachersForSubjects,
  type SubjectRow,
  type SectionType,
} from "../../_lib/subjectService";

export interface SubjectTableWrapperRef {
  refresh: () => void;
}

interface SubjectTableWrapperProps {
  gradeLevelId: number;
  sectionType?: SectionType;
  search?: string;
  onCountChange?: (count: number) => void;
  onGradeLevelDisplay?: (display: string) => void;
}

export default forwardRef<SubjectTableWrapperRef, SubjectTableWrapperProps>(
  function SubjectTableWrapper(
    { gradeLevelId, sectionType = "REGULAR", search = "", onCountChange, onGradeLevelDisplay },
    ref,
  ) {
    const [subjects, setSubjects] = useState<SubjectRow[]>([]);
    const [gradeLevelDisplay, setGradeLevelDisplay] = useState("");
    const [loading, setLoading] = useState(true);
    const [teachersLoading, setTeachersLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const genRef = useRef(0);

    useImperativeHandle(ref, () => ({ refresh: loadSubjects }));

    useEffect(() => {
      loadSubjects();
    }, [gradeLevelId, sectionType]);

    async function loadSubjects() {
      const gen = ++genRef.current;
      setLoading(true);
      setTeachersLoading(false);
      setError(null);

      // Phase 1: fetch subjects (fast — 2 parallel queries, no teacher joins)
      let result: { gradeLevelDisplay: string; subjects: SubjectRow[] };
      try {
        result = await fetchSubjectsByGradeLevel(gradeLevelId, sectionType);
      } catch (err) {
        if (gen !== genRef.current) return;
        setError("Failed to load subjects. Please try again.");
        setLoading(false);
        console.error(err);
        return;
      }

      if (gen !== genRef.current) return;
      setSubjects(result.subjects);
      setGradeLevelDisplay(result.gradeLevelDisplay);
      onCountChange?.(result.subjects.length);
      onGradeLevelDisplay?.(result.gradeLevelDisplay);
      setLoading(false);

      if (result.subjects.length === 0) return;

      // Phase 2: fetch teachers in background (non-fatal, table already visible)
      setTeachersLoading(true);
      try {
        const subjectIds = result.subjects.map((s) => s.subject_id);
        const teacherMap = await fetchTeachersForSubjects(gradeLevelId, subjectIds);
        if (gen !== genRef.current) return;
        setSubjects((prev) =>
          prev.map((s) => ({ ...s, teachers: teacherMap.get(s.subject_id) ?? [] })),
        );
      } catch (e) {
        console.error("Failed to load teachers:", e);
      } finally {
        if (gen === genRef.current) setTeachersLoading(false);
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
        sectionType={sectionType}
        teachersLoading={teachersLoading}
        onUpdate={loadSubjects}
      />
    );
  },
);
