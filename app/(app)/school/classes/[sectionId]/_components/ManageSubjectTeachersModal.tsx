"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Divider,
  Group,
  Modal,
  Select,
  Skeleton,
  Stack,
  Table,
  TableScrollContainer,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
  Text,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  assignSubjectTeachers,
  fetchAvailableAdviserCandidates,
  type AdviserCandidate,
  type SectionSubjectRow,
} from "../../_lib/classService";

interface Props {
  opened: boolean;
  sectionId: number;
  subjects: SectionSubjectRow[];
  onClose: () => void;
  onSaved: () => void;
}

const UNASSIGNED = "__none__";

export default function ManageSubjectTeachersModal({
  opened,
  sectionId,
  subjects,
  onClose,
  onSaved,
}: Props) {
  const [candidates, setCandidates] = useState<AdviserCandidate[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [candidateError, setCandidateError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Map: subject_id → selected teacher_id (or UNASSIGNED sentinel)
  const [selections, setSelections] = useState<Record<number, string>>({});

  // Seed selections from current subject data whenever modal opens
  useEffect(() => {
    if (!opened) return;
    const initial: Record<number, string> = {};
    for (const sub of subjects) {
      initial[sub.subject_id] = sub.assigned_teacher_id ?? UNASSIGNED;
    }
    setSelections(initial);
    void loadCandidates();
  }, [opened]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadCandidates() {
    setLoadingCandidates(true);
    setCandidateError(null);
    try {
      // includeAssigned=true → return all faculty regardless of advisory status
      const data = await fetchAvailableAdviserCandidates(true);
      setCandidates(data);
    } catch (e) {
      setCandidateError(
        e instanceof Error ? e.message : "Failed to load faculty list.",
      );
    } finally {
      setLoadingCandidates(false);
    }
  }

  const selectData = useMemo(() => {
    const options = candidates.map((c) => ({
      value: c.uid,
      label: `${c.first_name} ${c.last_name}`.trim(),
    }));
    return [{ value: UNASSIGNED, label: "Unassigned" }, ...options];
  }, [candidates]);

  const isDirty = useMemo(() => {
    return subjects.some(
      (sub) =>
        (selections[sub.subject_id] ?? UNASSIGNED) !==
        (sub.assigned_teacher_id ?? UNASSIGNED),
    );
  }, [subjects, selections]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const assignments = subjects.map((sub) => ({
        curriculum_subject_id: sub.curriculum_subject_id,
        teacher_id:
          (selections[sub.subject_id] ?? UNASSIGNED) === UNASSIGNED
            ? null
            : (selections[sub.subject_id] ?? null),
      }));
      await assignSubjectTeachers(sectionId, assignments);
      notifications.show({
        title: "Saved",
        message: "Subject teacher assignments updated.",
        color: "green",
      });
      onSaved();
      onClose();
    } catch (e) {
      notifications.show({
        title: "Error",
        message:
          e instanceof Error ? e.message : "Failed to save assignments.",
        color: "red",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Manage Subject Teacher Assignments"
      centered
      size="lg"
      closeOnClickOutside={!saving}
      closeOnEscape={!saving}
      withCloseButton={!saving}
    >
      <Text size="sm" c="dimmed" mb="md">
        Assign or change the teacher for each subject in this class.
      </Text>

      {candidateError && (
        <Alert color="red" title="Error" mb="md">
          {candidateError}
        </Alert>
      )}

      {subjects.length === 0 ? (
        <Text c="dimmed" ta="center" py="xl">
          No subjects assigned to this grade level.
        </Text>
      ) : (
        <TableScrollContainer minWidth={480}>
          <Table verticalSpacing="sm">
            <TableThead>
              <TableTr>
                <TableTh w="35%">Subject</TableTh>
                <TableTh>Teacher</TableTh>
              </TableTr>
            </TableThead>
            <TableTbody>
              {subjects.map((sub) => (
                <TableTr key={sub.subject_id}>
                  <TableTd>
                    <Text fz="sm" fw={500}>
                      {sub.name}
                    </Text>
                    <Text fz="xs" c="dimmed">
                      {sub.code}
                    </Text>
                  </TableTd>
                  <TableTd>
                    {loadingCandidates ? (
                      <Skeleton height={36} radius="sm" />
                    ) : (
                      <Select
                        data={selectData}
                        value={selections[sub.subject_id] ?? UNASSIGNED}
                        onChange={(val) =>
                          setSelections((prev) => ({
                            ...prev,
                            [sub.subject_id]: val ?? UNASSIGNED,
                          }))
                        }
                        disabled={saving || !!candidateError}
                        searchable
                        placeholder="Unassigned"
                        size="sm"
                      />
                    )}
                  </TableTd>
                </TableTr>
              ))}
            </TableTbody>
          </Table>
        </TableScrollContainer>
      )}

      <Divider mt="lg" mb="md" />

      <Group justify="flex-end">
        <Button variant="default" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          color="#4EAE4A"
          onClick={() => void handleSave()}
          loading={saving}
          disabled={!isDirty || loadingCandidates || !!candidateError}
        >
          Save Changes
        </Button>
      </Group>
    </Modal>
  );
}
