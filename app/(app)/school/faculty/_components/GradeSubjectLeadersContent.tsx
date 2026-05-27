"use client";

import {
  forwardRef,
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import { Alert } from "@mantine/core";
import {
  fetchGradeSubjectLeaderData,
  type GradeSubjectLeaderRow,
} from "../_lib/facultyService";
import GradeSubjectLeadersSkeleton from "./GradeSubjectLeadersSkeleton";
import GradeSubjectLeadersGradePanel from "./GradeSubjectLeadersGradePanel";

export interface GradeSubjectLeadersContentRef {
  refresh: () => void;
}

interface GradeSubjectLeadersContentProps {
  onCountChange?: (count: number) => void;
  onIncompleteChange?: (hasIncomplete: boolean) => void;
}

export default forwardRef<
  GradeSubjectLeadersContentRef,
  GradeSubjectLeadersContentProps
>(function GradeSubjectLeadersContent(
  { onCountChange, onIncompleteChange },
  ref,
) {
  const [grades, setGrades] = useState<GradeSubjectLeaderRow[]>([]);
  const [assignedLeaderUids, setAssignedLeaderUids] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pathname = usePathname();

  const loadData = useEffectEvent(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchGradeSubjectLeaderData();
      setGrades(data);

      const allSubjects = data.flatMap((g) => g.subjects);
      const assignedCount = allSubjects.filter((s) => s.leader !== null).length;
      const hasIncomplete = allSubjects.some((s) => s.leader === null);
      const leaderUids = new Set(
        allSubjects.filter((s) => s.leader !== null).map((s) => s.leader!.uid),
      );

      setAssignedLeaderUids(leaderUids);
      onCountChange?.(assignedCount);
      onIncompleteChange?.(hasIncomplete);
    } catch (err) {
      setAssignedLeaderUids(new Set());
      setError("Failed to load grade subject leaders. Please try again later.");
      onIncompleteChange?.(false);
      console.error(err);
    } finally {
      setLoading(false);
    }
  });

  useImperativeHandle(ref, () => ({ refresh: loadData }));

  useEffect(() => {
    loadData();
  }, [pathname]);

  if (loading) return <GradeSubjectLeadersSkeleton />;

  if (error) {
    return (
      <Alert color="red" title="Error">
        {error}
      </Alert>
    );
  }

  if (grades.length === 0) {
    return null;
  }

  return (
    <div>
      {grades.map((row) => (
        <GradeSubjectLeadersGradePanel
          key={row.grade_level_id}
          row={row}
          assignedLeaderUids={assignedLeaderUids}
          onRefresh={loadData}
        />
      ))}
    </div>
  );
});
