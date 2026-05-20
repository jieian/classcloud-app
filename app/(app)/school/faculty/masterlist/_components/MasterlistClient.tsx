"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Group, Stack, Text, ThemeIcon } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { IconAlertTriangle } from "@tabler/icons-react";
import BackButton from "@/components/BackButton";
import { notify } from "@/components/notificationIcon/notificationIcon";
import GradeLevelPanel from "./GradeLevelPanel";
import MasterlistSkeleton from "./MasterlistSkeleton";
import {
  fetchMasterlistData,
  saveMasterlist,
  type MasterlistData,
  type MasterlistTeacherLoad,
} from "../../_lib/masterlistService";

type CellKey = string; // "adviser:{sectionId}" | "subject:{sectionId}:{csId}"

interface ValidationResult {
  missingAdvisers: number;
  missingSubjects: number;
  panelHasErrors: Map<number, boolean>;
}

function hasIncompleteAssignments(data: MasterlistData): boolean {
  const assignedSet = new Set(
    data.assignments.map((a) => `${a.section_id}:${a.curriculum_subject_id}`),
  );
  for (const gl of data.grade_levels) {
    for (const section of gl.sections) {
      if (!section.adviser_id) return true;
      for (const subject of gl.subjects) {
        const isApplicable =
          subject.subject_type === "BOTH" || section.section_type === "SSES";
        if (!isApplicable) continue;
        if (!assignedSet.has(`${section.section_id}:${subject.curriculum_subject_id}`)) return true;
      }
    }
  }
  return false;
}

function buildValidationMessage(missingAdvisers: number, missingSubjects: number): string {
  const hasA = missingAdvisers > 0;
  const hasS = missingSubjects > 0;

  if (hasA && hasS) {
    return "Some subjects and classes currently have no assigned teacher or adviser.";
  }
  if (hasA) {
    return missingAdvisers === 1
      ? "A class currently has no assigned adviser."
      : "Some classes currently have no assigned adviser.";
  }
  return missingSubjects === 1
    ? "A subject currently has no assigned teacher."
    : "Some subjects currently have no assigned teacher.";
}

export default function MasterlistClient() {
  const router = useRouter();

  const [data, setData] = useState<MasterlistData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Map<CellKey, string | null>>(new Map());
  const [showValidation, setShowValidation] = useState(false);

  const isMobile = useMediaQuery("(max-width: 768px)");
  const confirmModalProps = isMobile
    ? {
        styles: {
          inner: { alignItems: "flex-end", paddingBottom: "20px" },
          content: {
            width: "100%",
            maxWidth: "100%",
            borderRadius: "12px 12px 0 0",
          },
        },
      }
    : {};

  const syncValidationVisibility = useCallback((nextData: MasterlistData | null) => {
    setShowValidation(nextData ? hasIncompleteAssignments(nextData) : false);
  }, []);

  // ── Data fetch ──────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchMasterlistData()
      .then((d) => {
        setData(d);
        syncValidationVisibility(d);
      })
      .catch((err) => {
        notify({
          type: "error",
          title: "Failed to load masterlist",
          message: err instanceof Error ? err.message : "Something went wrong.",
        });
      })
      .finally(() => setLoading(false));
  }, [syncValidationVisibility]);

  // ── Derived state ───────────────────────────────────────────────────────────

  // O(1) lookup map: cellKey → original value from DB
  const originalMap = useMemo(() => {
    if (!data) return new Map<CellKey, string | null>();
    const map = new Map<CellKey, string | null>();
    for (const gl of data.grade_levels) {
      for (const s of gl.sections) {
        map.set(`adviser:${s.section_id}`, s.adviser_id);
      }
    }
    for (const a of data.assignments) {
      map.set(`subject:${a.section_id}:${a.curriculum_subject_id}`, a.teacher_id);
    }
    return map;
  }, [data]);

  // Precompute: grade_level_id → Set<section_id> for O(dirty-cells) panel dirty check
  const sectionSetByGl = useMemo(() => {
    if (!data) return new Map<number, Set<number>>();
    return new Map(
      data.grade_levels.map((gl) => [
        gl.grade_level_id,
        new Set(gl.sections.map((s) => s.section_id)),
      ]),
    );
  }, [data]);

  // Faculty Select options — sorted once, memoized
  const facultyNames = useMemo(() => {
    if (!data) return new Map<string, string>();
    return new Map(
      data.faculty.map((f) => [f.uid, `${f.first_name} ${f.last_name}`]),
    );
  }, [data]);

  const isDirty = draft.size > 0;

  // ── Cell helpers ────────────────────────────────────────────────────────────

  const getCellValue = useCallback(
    (key: CellKey): string | null => {
      if (draft.has(key)) return draft.get(key)!;
      return originalMap.get(key) ?? null;
    },
    [draft, originalMap],
  );

  const isCellDirty = useCallback(
    (key: CellKey): boolean => {
      if (!draft.has(key)) return false;
      return draft.get(key) !== originalMap.get(key);
    },
    [draft, originalMap],
  );

  const assignedAdviserUids = useMemo(() => {
    if (!data) return new Set<string>();

    const assigned = new Set<string>();
    for (const gl of data.grade_levels) {
      for (const section of gl.sections) {
        const adviserUid = getCellValue(`adviser:${section.section_id}`);
        if (adviserUid) assigned.add(adviserUid);
      }
    }

    return assigned;
  }, [data, getCellValue]);

  const teachingLoadByTeacher = useMemo(() => {
    if (!data) return new Map<string, MasterlistTeacherLoad[]>();

    type RawSection = { levelNumber: number; sectionName: string; label: string };
    type LoadEntry = {
      curriculum_subject_id: number;
      code: string;
      name: string;
      subject_type: "BOTH" | "SSES";
      isPending: boolean;
      rawSections: RawSection[];
    };

    const loadsByTeacher = new Map<string, Map<number, LoadEntry>>();

    for (const gl of data.grade_levels) {
      for (const section of gl.sections) {
        for (const subject of gl.subjects) {
          const isApplicable =
            subject.subject_type === "BOTH" || section.section_type === "SSES";
          if (!isApplicable) continue;

          const key = `subject:${section.section_id}:${subject.curriculum_subject_id}`;
          const teacherId = getCellValue(key);
          if (!teacherId) continue;

          const isPending =
            draft.has(key) && draft.get(key) !== (originalMap.get(key) ?? null);

          let teacherMap = loadsByTeacher.get(teacherId);
          if (!teacherMap) {
            teacherMap = new Map();
            loadsByTeacher.set(teacherId, teacherMap);
          }

          const sectionEntry: RawSection = {
            levelNumber: gl.level_number,
            sectionName: section.name,
            label: `${gl.display_name} • ${section.name}`,
          };

          const existing = teacherMap.get(subject.curriculum_subject_id);
          if (existing) {
            if (isPending) existing.isPending = true;
            existing.rawSections.push(sectionEntry);
          } else {
            teacherMap.set(subject.curriculum_subject_id, {
              curriculum_subject_id: subject.curriculum_subject_id,
              code: subject.code,
              name: subject.name,
              subject_type: subject.subject_type,
              isPending,
              rawSections: [sectionEntry],
            });
          }
        }
      }
    }

    return new Map(
      Array.from(loadsByTeacher.entries()).map(([teacherId, subjectMap]) => [
        teacherId,
        Array.from(subjectMap.values())
          .map(({ rawSections, ...load }) => ({
            ...load,
            sections: rawSections
              .sort((a, b) => a.levelNumber - b.levelNumber || a.sectionName.localeCompare(b.sectionName))
              .map((e) => e.label),
          }))
          .sort((a, b) => a.code.localeCompare(b.code) || a.name.localeCompare(b.name)),
      ]),
    );
  }, [data, draft, getCellValue, originalMap]);

  const isPanelDirty = useCallback(
    (gradeLevelId: number): boolean => {
      const sectionSet = sectionSetByGl.get(gradeLevelId);
      if (!sectionSet || draft.size === 0) return false;
      for (const key of draft.keys()) {
        const sectionId = parseInt(key.split(":")[1], 10);
        if (sectionSet.has(sectionId)) return true;
      }
      return false;
    },
    [draft, sectionSetByGl],
  );

  // ── Validation — always computed, only displayed when showValidation is true ─

  const validation = useMemo((): ValidationResult => {
    const panelHasErrors = new Map<number, boolean>();
    if (!data) return { missingAdvisers: 0, missingSubjects: 0, panelHasErrors };

    let missingAdvisers = 0;
    let missingSubjects = 0;

    for (const gl of data.grade_levels) {
      let glHasError = false;

      for (const section of gl.sections) {
        if (!getCellValue(`adviser:${section.section_id}`)) {
          missingAdvisers++;
          glHasError = true;
        }
        for (const subject of gl.subjects) {
          const isApplicable =
            subject.subject_type === "BOTH" || section.section_type === "SSES";
          if (!isApplicable) continue;
          if (!getCellValue(`subject:${section.section_id}:${subject.curriculum_subject_id}`)) {
            missingSubjects++;
            glHasError = true;
          }
        }
      }

      panelHasErrors.set(gl.grade_level_id, glHasError);
    }

    return { missingAdvisers, missingSubjects, panelHasErrors };
  }, [data, getCellValue]);

  const hasValidationErrors =
    validation.missingAdvisers > 0 || validation.missingSubjects > 0;

  // ── Cell change handler ─────────────────────────────────────────────────────

  const handleCellChange = useCallback(
    (key: CellKey, value: string | null) => {
      setDraft((prev) => {
        const next = new Map(prev);
        const original = originalMap.get(key) ?? null;
        if (value === original) {
          next.delete(key);
        } else {
          next.set(key, value);
        }
        return next;
      });
    },
    [originalMap],
  );

  // ── Navigation guards ───────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (draft.size > 0) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [draft.size]);

  useEffect(() => {
    if (draft.size === 0) return;

    const handler = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest("a[href]");
      if (!anchor) return;
      const href = anchor.getAttribute("href")!;
      if (/^(https?:|#|mailto:|tel:)/.test(href)) return;

      e.preventDefault();
      e.stopPropagation();

      modals.openConfirmModal({
        title: "Discard changes?",
        children: (
          <Text size="sm">You have unsaved changes. Are you sure you want to leave?</Text>
        ),
        labels: { confirm: "Discard", cancel: "Stay" },
        confirmProps: { color: "red" },
        onConfirm: () => {
          setDraft(new Map());
          router.push(href);
        },
        ...confirmModalProps,
      });
    };

    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.size]);

  // ── Revert & Save ───────────────────────────────────────────────────────────

  function handleRevert() {
    modals.openConfirmModal({
      title: "Revert all changes?",
      children: (
        <Text size="sm">All unsaved changes will be lost. This cannot be undone.</Text>
      ),
      labels: { confirm: "Revert", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: () => {
        setDraft(new Map());
        syncValidationVisibility(data);
      },
      ...confirmModalProps,
    });
  }

  async function handleSubmit() {
    if (!data) return;
    setSaving(true);
    try {
      const adviser_changes: { section_id: number; adviser_id: string | null }[] = [];
      const assignment_changes: {
        section_id: number;
        curriculum_subject_id: number;
        teacher_id: string | null;
      }[] = [];

      for (const [key, value] of draft) {
        if (value === (originalMap.get(key) ?? null)) continue;
        const parts = key.split(":");
        if (parts[0] === "adviser") {
          adviser_changes.push({ section_id: parseInt(parts[1], 10), adviser_id: value });
        } else {
          assignment_changes.push({
            section_id: parseInt(parts[1], 10),
            curriculum_subject_id: parseInt(parts[2], 10),
            teacher_id: value,
          });
        }
      }

      // Include the SY the client loaded so the server can detect staleness
      await saveMasterlist({ sy_id: data.sy_id, adviser_changes, assignment_changes });

      // Save committed — clear draft immediately and show success
      setDraft(new Map());
      setShowValidation(false);
      notify({
        type: "success",
        title: "Saved",
        message: "Teaching load masterlist updated successfully.",
      });

      // Refresh data in the background; failure here is non-fatal
      fetchMasterlistData()
        .then((fresh) => {
          setData(fresh);
          syncValidationVisibility(fresh);
        })
        .catch(() => {
          notify({
            type: "warning",
            title: "Saved, but refresh failed",
            message: "Your changes were saved. Reload the page to see the latest data.",
          });
        });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      // 409 = stale data (SY changed/deactivated) — prompt user to reload
      const isSyConflict =
        message.includes("school year changed") || message.includes("No active school year");
      notify({
        type: "error",
        title: isSyConflict ? "School year changed" : "Save failed",
        message: isSyConflict
          ? `${message} Your draft has been preserved.`
          : message,
      });
    } finally {
      setSaving(false);
    }
  }

  function handleSave() {
    // Validate completeness first
    if (hasValidationErrors) {
      setShowValidation(true);
      notify({
        title: "Incomplete Faculty Assignments",
        message: buildValidationMessage(
          validation.missingAdvisers,
          validation.missingSubjects,
        ),
        type: "error",
      });
      return;
    }

    modals.openConfirmModal({
      title: "Save changes?",
      children: (
        <Text size="sm">
          This will update all teaching load assignments for the current academic period.
        </Text>
      ),
      labels: { confirm: "Confirm", cancel: "Cancel" },
      confirmProps: { color: "#4EAE4A" },
      onConfirm: handleSubmit,
      ...confirmModalProps,
    });
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      <BackButton href="/school/faculty" mb="md" size="sm">
        Back to Faculty Menu
      </BackButton>

      <div className="mb-4 mt-4">
        <h2 className="mb-1 text-2xl font-bold">Teaching Load Master List</h2>
        <p className="text-sm text-[#808898]">
          The master record of all subject assignments and advisory designations for the current
          academic period.
        </p>
      </div>

      {loading ? (
        <MasterlistSkeleton />
      ) : (
        <Stack gap="sm">
          {showValidation && hasValidationErrors && (
            <Alert
              variant="filled"
              radius="md"
              styles={{
                root: {
                  backgroundColor: "#FF6666",
                },
                icon: {
                  alignSelf: "center",
                  marginTop: 0,
                },
              }}
              icon={
                <ThemeIcon color="white" variant="transparent" size="md">
                  <IconAlertTriangle size={20} />
                </ThemeIcon>
              }
            >
              <Text fw={700} size="sm">
                Incomplete Faculty Assignments
              </Text>
              <Text size="sm" fs="italic">
                {buildValidationMessage(
                  validation.missingAdvisers,
                  validation.missingSubjects,
                )}
              </Text>
            </Alert>
          )}

          {(data?.grade_levels ?? []).map((gl) => (
            <GradeLevelPanel
              key={gl.grade_level_id}
              gradeLevel={gl}
              isDirty={isPanelDirty(gl.grade_level_id)}
              hasPanelErrors={validation.panelHasErrors.get(gl.grade_level_id) ?? false}
              showValidation={showValidation}
              getCellValue={getCellValue}
              isCellDirty={isCellDirty}
              facultyNames={facultyNames}
              assignedAdviserUids={assignedAdviserUids}
              teachingLoadByTeacher={teachingLoadByTeacher}
              onCellChange={handleCellChange}
            />
          ))}

          <Group justify="flex-end" mt="sm" gap="sm">
            <Button
              variant="default"
              radius="md"
              disabled={!isDirty || saving}
              onClick={handleRevert}
            >
              Revert Changes
            </Button>
            <Button
              color="#4EAE4A"
              radius="md"
              disabled={!isDirty}
              loading={saving}
              onClick={handleSave}
            >
              Save
            </Button>
          </Group>
        </Stack>
      )}
    </>
  );
}
