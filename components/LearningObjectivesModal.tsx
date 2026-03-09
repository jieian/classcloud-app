'use client';

import { useState } from 'react';
import {
  Modal,
  Stack,
  Group,
  Text,
  Button,
  TextInput,
  NumberInput,
  ActionIcon,
  Paper,
  Badge,
  Alert,
  ScrollArea,
} from '@mantine/core';
import { IconPlus, IconTrash, IconAlertCircle, IconBookmark } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { saveObjectives } from '@/lib/services/examService';
import type { ExamWithRelations, LearningObjective } from '@/lib/exam-supabase';
import CreationFlowStepper from './CreationFlowStepper';

interface LearningObjectivesModalProps {
  exam: ExamWithRelations;
  onClose: () => void;
  /** If provided, shows "Save & Continue to Answer Key" and calls this after saving */
  onContinue?: () => void;
  /** Called after a successful save (always) */
  onSaved?: () => void;
}

interface ObjectiveRow {
  id: number;
  objective: string;
  start_item: number | string;
  end_item: number | string;
}

let nextId = 1;

function makeRow(override?: Partial<ObjectiveRow>): ObjectiveRow {
  return { id: nextId++, objective: '', start_item: '', end_item: '', ...override };
}

export default function LearningObjectivesModal({
  exam,
  onClose,
  onContinue,
  onSaved,
}: LearningObjectivesModalProps) {
  const totalItems = exam.total_items;

  const initialRows: ObjectiveRow[] =
    exam.objectives && exam.objectives.length > 0
      ? exam.objectives.map((o) => makeRow(o))
      : [makeRow()];

  const [rows, setRows] = useState<ObjectiveRow[]>(initialRows);
  const [saving, setSaving] = useState(false);

  const addRow = () => setRows((prev) => [...prev, makeRow()]);

  const removeRow = (id: number) =>
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));

  const updateRow = (id: number, field: keyof ObjectiveRow, value: string | number) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));

  const validate = (): string | null => {
    for (const row of rows) {
      if (!row.objective.trim()) return 'All objectives must have a description.';
      const start = Number(row.start_item);
      const end = Number(row.end_item);
      if (!start || !end) return 'All objectives must have valid item ranges.';
      if (start > end) return 'Start item must be ≤ end item.';
      if (start < 1 || end > totalItems)
        return `Item numbers must be between 1 and ${totalItems}.`;
    }
    return null;
  };

  const handleSave = async (andContinue = false) => {
    const err = validate();
    if (err) {
      notifications.show({ title: 'Validation Error', message: err, color: 'red' });
      return;
    }

    const payload: LearningObjective[] = rows.map((r) => ({
      objective: r.objective.trim(),
      start_item: Number(r.start_item),
      end_item: Number(r.end_item),
    }));

    setSaving(true);
    const ok = await saveObjectives(exam.exam_id, payload);
    setSaving(false);

    if (!ok) {
      notifications.show({
        title: 'Save Failed',
        message: 'Could not save learning objectives. Please try again.',
        color: 'red',
        withBorder: true,
      });
      return;
    }

    notifications.show({
      title: 'Objectives Saved',
      message: 'Learning objectives have been saved successfully.',
      color: 'teal',
      withBorder: true,
      autoClose: 2000,
    });

    onSaved?.();

    if (andContinue && onContinue) {
      onContinue();
    } else {
      onClose();
    }
  };

  const coveredItems = rows.reduce<number[]>((acc, r) => {
    const start = Number(r.start_item);
    const end = Number(r.end_item);
    if (start && end && start <= end) {
      for (let i = start; i <= end; i++) acc.push(i);
    }
    return acc;
  }, []);
  const uniqueCovered = new Set(coveredItems).size;
  const hasOverlap = coveredItems.length !== uniqueCovered;

  return (
    <Modal
      opened
      onClose={onClose}
      title="Learning Objectives"
      size="lg"
      overlayProps={{ backgroundOpacity: 0.5, blur: 4 }}
      closeOnClickOutside={!saving}
      closeOnEscape={!saving}
    >
      <Stack gap="md">
        {onContinue && <CreationFlowStepper activeStep={1} />}
        <Text size="xs" c="dimmed">{exam.title}</Text>
        <Alert color="blue" icon={<IconBookmark size={16} />}>
          Map learning objectives to item number ranges. Total items:{' '}
          <Text span fw={700}>{totalItems}</Text>
        </Alert>

        {hasOverlap && (
          <Alert color="yellow" icon={<IconAlertCircle size={16} />}>
            Some item ranges overlap. Each item should belong to one objective.
          </Alert>
        )}

        <ScrollArea.Autosize mah={360}>
          <Stack gap="sm">
            {rows.map((row, idx) => (
              <Paper key={row.id} p="sm" withBorder radius="md">
                <Group gap="xs" mb="xs" justify="space-between">
                  <Badge size="sm" variant="light" color="blue">
                    Objective {idx + 1}
                  </Badge>
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    color="red"
                    onClick={() => removeRow(row.id)}
                    disabled={rows.length === 1}
                    aria-label="Remove objective"
                  >
                    <IconTrash size={14} />
                  </ActionIcon>
                </Group>

                <TextInput
                  placeholder="e.g. Identify the parts of a plant"
                  value={row.objective}
                  onChange={(e) => updateRow(row.id, 'objective', e.currentTarget.value)}
                  mb="xs"
                />

                <Group gap="sm">
                  <NumberInput
                    label="From item"
                    placeholder="1"
                    min={1}
                    max={totalItems}
                    value={row.start_item === '' ? '' : Number(row.start_item)}
                    onChange={(val) => updateRow(row.id, 'start_item', val)}
                    style={{ flex: 1 }}
                    allowDecimal={false}
                  />
                  <NumberInput
                    label="To item"
                    placeholder={String(totalItems)}
                    min={1}
                    max={totalItems}
                    value={row.end_item === '' ? '' : Number(row.end_item)}
                    onChange={(val) => updateRow(row.id, 'end_item', val)}
                    style={{ flex: 1 }}
                    allowDecimal={false}
                  />
                </Group>
              </Paper>
            ))}
          </Stack>
        </ScrollArea.Autosize>

        <Button
          variant="light"
          color="blue"
          leftSection={<IconPlus size={14} />}
          onClick={addRow}
          size="sm"
        >
          Add Objective
        </Button>

        <Paper p="sm" bg={uniqueCovered === totalItems ? 'teal.0' : 'orange.0'} radius="md" withBorder>
          <Text size="xs" fw={500}>
            Coverage:{' '}
            <Text span c={uniqueCovered === totalItems ? 'teal' : 'orange'} fw={700}>
              {uniqueCovered} / {totalItems} items
            </Text>
            {uniqueCovered < totalItems && (
              <Text span c="orange.7" fw={500}> — all {totalItems} items must be covered to proceed</Text>
            )}
            {uniqueCovered === totalItems && (
              <Text span c="teal.7" fw={500}> — full coverage! Ready to set answer key.</Text>
            )}
          </Text>
        </Paper>

        <Group justify="flex-end" gap="sm">
          {onContinue ? (
            <>
              <Button variant="default" onClick={onClose} disabled={saving}>
                Skip
              </Button>
              <Button
                variant="default"
                onClick={() => handleSave(false)}
                loading={saving}
              >
                Save Only
              </Button>
              <Button
                color="#466D1D"
                onClick={() => handleSave(true)}
                loading={saving}
                disabled={uniqueCovered < totalItems}
                title={uniqueCovered < totalItems ? `Cover all ${totalItems} items before proceeding` : undefined}
              >
                Save &amp; Set Answer Key
              </Button>
            </>
          ) : (
            <>
              <Button variant="default" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button
                color="#466D1D"
                onClick={() => handleSave(false)}
                loading={saving}
              >
                Save Objectives
              </Button>
            </>
          )}
        </Group>
      </Stack>
    </Modal>
  );
}
