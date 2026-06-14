'use client';

import { useEffect, useState } from 'react';
import {
  Alert, Button, Divider, Group, Modal, MultiSelect, Skeleton, Stack, Text, Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconClipboardCheck } from '@tabler/icons-react';
import type { ExamWithRelations, Section, AnswerKeyJsonb, LearningObjective } from '@/lib/exam-supabase';
import { fetchActiveSections } from '@/lib/services/sectionService';
import { abbreviateQuarterName } from '@/lib/services/quarterService';
import { fetchTeacherClassAssignments } from '@/lib/services/classService';
import {
  checkExamDuplicates,
  createExamWithAssignments,
  saveAnswerKey,
  saveObjectives,
} from '@/lib/services/examService';
import { useAuth } from '@/context/AuthContext';

interface CopyExamModalProps {
  exam: ExamWithRelations | null;
  opened: boolean;
  onClose: () => void;
  onCopied?: (examIds: number[]) => void;
}

export default function CopyExamModal({ exam, opened, onClose, onCopied }: CopyExamModalProps) {
  const { user } = useAuth();
  const [allSections, setAllSections] = useState<Section[]>([]);
  const [occupiedSectionIds, setOccupiedSectionIds] = useState<Set<number>>(new Set());
  const [selectedSectionIds, setSelectedSectionIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    if (!opened || !exam) return;

    setSelectedSectionIds([]);
    setLoadError(null);
    setLoading(true);

    void (async () => {
      try {
        const [secs, assignments] = await Promise.all([
          fetchActiveSections(),
          user?.id ? fetchTeacherClassAssignments() : Promise.resolve([]),
        ]);

        // Determine the grade level of the source exam from its current section assignments.
        const examSectionIds = new Set(
          (exam.exam_assignments ?? [])
            .map(a => a.sections?.section_id)
            .filter((id): id is number => id != null),
        );
        const sourceGradeLevelId = secs.find(s => examSectionIds.has(s.section_id))?.grade_level_id;

        // Filter to sections the faculty member handles.
        // If no assignments (admin), keep all.
        const assignedSectionIds = new Set(assignments.map(a => a.section_id));
        let visibleSections = assignedSectionIds.size > 0
          ? secs.filter(s => assignedSectionIds.has(s.section_id))
          : secs;

        // Further restrict to the same grade level as the source exam.
        if (sourceGradeLevelId) {
          visibleSections = visibleSections.filter(s => s.grade_level_id === sourceGradeLevelId);
        }

        // SSES-exclusive subjects can only be copied to SSES sections. Regular sections
        // never take an SSES subject, so they must not be offered as copy targets.
        if (exam.curriculum_subjects?.subjects?.subject_type === 'SSES') {
          visibleSections = visibleSections.filter(s => s.section_type === 'SSES');
        }

        setAllSections(visibleSections);

        if (exam.quarter_id) {
          const allSectionIds = visibleSections.map(s => s.section_id);
          const occupied = await checkExamDuplicates(
            allSectionIds,
            exam.curriculum_subject_id,
            exam.quarter_id,
          );
          setOccupiedSectionIds(new Set(occupied));
        } else {
          setOccupiedSectionIds(new Set());
        }
      } catch {
        setLoadError('Failed to load sections. Please try again.');
      } finally {
        setLoading(false);
      }
    })();
  }, [opened, exam, user?.id]);

  const sectionData = allSections
    .map(s => ({
      value: String(s.section_id),
      label: s.name,
      disabled: occupiedSectionIds.has(s.section_id),
    }))
    .sort((a, b) => Number(a.disabled) - Number(b.disabled));

  async function handleCreate() {
    if (!exam || selectedSectionIds.length === 0) return;
    setCopying(true);
    try {
      const termName = abbreviateQuarterName(exam.quarters?.name ?? '');
      const subjectCode = (exam.curriculum_subjects as { subjects?: { code?: string } } | null)?.subjects?.code ?? '';
      const titleBase = termName && subjectCode ? `${termName} - ${subjectCode}` : exam.title;

      const { exam_ids } = await createExamWithAssignments(
        {
          title: titleBase,
          total_items: exam.total_items,
          exam_date: exam.exam_date,
          curriculum_subject_id: exam.curriculum_subject_id,
          quarter_id: exam.quarter_id ?? null,
          is_locked: false,
        },
        selectedSectionIds,
      );

      await Promise.all(
        exam_ids.flatMap(id => {
          const tasks: Promise<boolean>[] = [];
          if (exam.answer_key) {
            tasks.push(saveAnswerKey(id, exam.answer_key as AnswerKeyJsonb));
          }
          const objectives = exam.objectives as LearningObjective[] | null;
          if (objectives?.length) {
            tasks.push(saveObjectives(id, objectives));
          }
          return tasks;
        }),
      );

      notifications.show({ title: 'Exam Copied', message: 'Exam copied successfully.', color: 'green' });
      onClose();
      onCopied?.(exam_ids);
    } catch (e) {
      notifications.show({
        title: 'Error',
        message: e instanceof Error ? e.message : 'Failed to copy exam.',
        color: 'red',
      });
    } finally {
      setCopying(false);
    }
  }

  const termName = exam?.quarters?.name ?? '—';
  const subjectName = (exam?.curriculum_subjects as { subjects?: { name?: string } } | null)?.subjects?.name ?? '—';
  const isSsesSubject = exam?.curriculum_subjects?.subjects?.subject_type === 'SSES';

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Copy Exam"
      centered
      size="md"
      closeOnClickOutside={!copying}
      closeOnEscape={!copying}
      withCloseButton={!copying}
    >
      <Stack gap="md">
        {loadError && <Alert color="red">{loadError}</Alert>}

        {/* Read-only exam info */}
        <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50 rounded border border-gray-200">
          <div>
            <Text size="xs" c="dimmed" fw={500}>Term</Text>
            {loading ? <Skeleton height={20} mt={4} /> : <Text size="sm" fw={600}>{termName}</Text>}
          </div>
          <div>
            <Text size="xs" c="dimmed" fw={500}>Subject</Text>
            {loading ? <Skeleton height={20} mt={4} /> : <Text size="sm" fw={600}>{subjectName}</Text>}
          </div>
        </div>

        {!loading && isSsesSubject && (
          <Alert color="blue" variant="light" py="xs">
            <Text size="xs">
              {subjectName} is exclusive to SSES sections, so only SSES sections can be selected.
            </Text>
          </Alert>
        )}

        <MultiSelect
          label="Section"
          placeholder={loading ? 'Loading sections…' : 'Select section(s)'}
          required
          data={sectionData}
          value={selectedSectionIds.map(String)}
          onChange={vals => setSelectedSectionIds(vals.map(Number))}
          disabled={loading || allSections.length === 0}
          nothingFoundMessage="No sections available"
          renderOption={({ option }) =>
            option.disabled ? (
              <Tooltip label="This section already has an exam for this subject" position="right" withArrow>
                <Group gap={6} wrap="nowrap" style={{ width: '100%' }}>
                  <span>{option.label}</span>
                  <IconClipboardCheck size={14} style={{ color: '#374151', flexShrink: 0 }} />
                </Group>
              </Tooltip>
            ) : (
              <Group gap={6} wrap="nowrap">
                <span>{option.label}</span>
              </Group>
            )
          }
        />

        <Divider />

        <Group justify="flex-end">
          <Button variant="default" onClick={onClose} disabled={copying}>
            Cancel
          </Button>
          <Button
            color="#4EAE4A"
            onClick={() => void handleCreate()}
            loading={copying}
            disabled={selectedSectionIds.length === 0 || copying || loading}
          >
            Create
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
