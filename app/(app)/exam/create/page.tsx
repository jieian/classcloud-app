'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Container, Title, Text, Button, Stack, Group, Paper,
  Alert, Badge, ActionIcon, NumberInput, Progress, Divider,
} from '@mantine/core';
import {
  IconPlus, IconTrash, IconBookmark, IconAlertCircle,
  IconAlertTriangle, IconDeviceFloppy, IconArrowLeft,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { fetchActiveQuarters } from '@/lib/services/quarterService';
import { fetchGradeLevels } from '@/lib/services/gradeLevelService';
import { fetchSubjectsWithGradeLevels } from '@/lib/services/subjectService';
import { fetchActiveSections } from '@/lib/services/sectionService';
import { createExamWithAssignments, saveObjectives, saveAnswerKey } from '@/lib/services/examService';
import type { LearningObjective, AnswerKeyJsonb, Quarter } from '@/lib/exam-supabase';
import CreationFlowStepper from '@/components/CreationFlowStepper';
import { EXAM_DRAFT_KEY, type ExamDraft } from '@/components/CreateExamModal';

const ALL_CHOICES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

const OBJECTIVE_PALETTE = [
  { dot: '#3b82f6', bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8' },
  { dot: '#22c55e', bg: '#f0fdf4', border: '#bbf7d0', text: '#15803d' },
  { dot: '#a855f7', bg: '#faf5ff', border: '#e9d5ff', text: '#7e22ce' },
  { dot: '#f97316', bg: '#fff7ed', border: '#fed7aa', text: '#c2410c' },
  { dot: '#ec4899', bg: '#fdf2f8', border: '#fbcfe8', text: '#be185d' },
  { dot: '#14b8a6', bg: '#f0fdfa', border: '#99f6e4', text: '#0f766e' },
  { dot: '#ef4444', bg: '#fef2f2', border: '#fecaca', text: '#b91c1c' },
  { dot: '#eab308', bg: '#fefce8', border: '#fef08a', text: '#854d0e' },
];
const QUESTIONS_PER_COL = 10;

interface ObjectiveRow {
  id: number;
  objective: string;
  start_item: number | string;
  end_item: number | string;
}

let nextRowId = 1;
function makeRow(override?: Partial<ObjectiveRow>): ObjectiveRow {
  return { id: nextRowId++, objective: '', start_item: '', end_item: '', ...override };
}

// Page steps: 0=objectives, 1=answer key, 2=summary
// Maps to stepper: 0→1, 1→2, 2→3
function toStepperStep(pageStep: number): number {
  return pageStep + 1;
}

export default function CreateExamPage() {
  const router = useRouter();

  const [draft, setDraft] = useState<ExamDraft | null>(null);
  const [quarters, setQuarters] = useState<Quarter[]>([]);
  const [gradeLabelMap, setGradeLabelMap] = useState<Map<string, string>>(new Map());
  const [subjectNameMap, setSubjectNameMap] = useState<Map<string, string>>(new Map());
  const [sectionNameMap, setSectionNameMap] = useState<Map<number, string>>(new Map());

  // Page step: 0=objectives, 1=answer key, 2=summary
  const [step, setStep] = useState(0);

  // Step 0 — Objectives
  const [objectiveRows, setObjectiveRows] = useState<ObjectiveRow[]>([makeRow()]);
  const [triedToSaveObjectives, setTriedToSaveObjectives] = useState(false);

  // Step 1 — Answer key
  const [answers, setAnswers] = useState<{ [key: number]: string | null }>({});
  const [triedToSave, setTriedToSave] = useState(false);

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Read draft from sessionStorage
    const raw = sessionStorage.getItem(EXAM_DRAFT_KEY);
    if (!raw) {
      router.replace('/exam');
      return;
    }
    setDraft(JSON.parse(raw));

    // Load label maps for the summary
    Promise.all([
      fetchActiveQuarters(),
      fetchGradeLevels(),
      fetchSubjectsWithGradeLevels(),
      fetchActiveSections(),
    ]).then(([q, gl, sub, sec]) => {
      setQuarters(q);
      setGradeLabelMap(new Map(gl.map(g => [String(g.grade_level_id), g.display_name])));
      setSubjectNameMap(new Map(sub.map(s => [String(s.subject_id), s.name])));
      setSectionNameMap(new Map(sec.map(s => [s.section_id, s.name])));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!draft) return null;

  const { totalItems, numChoices } = draft;
  const choices = ALL_CHOICES.slice(0, numChoices);

  const gradeLabel = gradeLabelMap.get(draft.gradeLevelId ?? '') ?? '';
  const subjectName = subjectNameMap.get(draft.subjectId ?? '') ?? '';
  const sectionNames = draft.sectionIds.map(id => sectionNameMap.get(id)).filter(Boolean).map(n => `Section ${n}`).join(', ');

  // ── Objectives helpers ──
  const addRow = () => setObjectiveRows(prev => [...prev, makeRow()]);
  const removeRow = (id: number) => setObjectiveRows(prev => prev.length > 1 ? prev.filter(r => r.id !== id) : prev);
  const updateRow = (id: number, field: keyof ObjectiveRow, value: string | number) =>
    setObjectiveRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));

  const coveredItems = objectiveRows.reduce<number[]>((acc, r) => {
    const start = Number(r.start_item);
    const end = Number(r.end_item);
    if (start && end && start <= end) for (let i = start; i <= end; i++) acc.push(i);
    return acc;
  }, []);
  const uniqueCovered = new Set(coveredItems).size;
  const hasOverlap = coveredItems.length !== uniqueCovered;

  const overlappingRowIds = new Set<number>();
  for (let i = 0; i < objectiveRows.length; i++) {
    const a = objectiveRows[i];
    const aStart = Number(a.start_item); const aEnd = Number(a.end_item);
    if (!aStart || !aEnd || aStart > aEnd) continue;
    for (let j = i + 1; j < objectiveRows.length; j++) {
      const b = objectiveRows[j];
      const bStart = Number(b.start_item); const bEnd = Number(b.end_item);
      if (!bStart || !bEnd || bStart > bEnd) continue;
      if (aStart <= bEnd && bStart <= aEnd) {
        overlappingRowIds.add(a.id);
        overlappingRowIds.add(b.id);
      }
    }
  }

  const validateObjectives = (): string | null => {
    for (const row of objectiveRows) {
      if (!row.objective.trim()) return 'All objectives must have a description.';
      const start = Number(row.start_item);
      const end = Number(row.end_item);
      if (!start || !end) return 'All objectives must have valid item ranges.';
      if (start > end) return 'Start item must be ≤ end item.';
      if (start < 1 || end > totalItems) return `Item numbers must be between 1 and ${totalItems}.`;
    }
    return null;
  };

  // ── Answer key helpers ──
  const unansweredQuestions = Array.from({ length: totalItems }, (_, i) => i + 1).filter(q => !answers[q]);
  const isAnswerKeyComplete = unansweredQuestions.length === 0;
  const answeredCount = totalItems - unansweredQuestions.length;
  const progressPercent = Math.round((answeredCount / totalItems) * 100);
  const columns = Math.ceil(totalItems / QUESTIONS_PER_COL);

  const handleAnswerSelect = (qNum: number, answer: string) => {
    setAnswers(prev => ({ ...prev, [qNum]: prev[qNum] === answer ? null : answer }));
  };

  const handleBack = () => {
    router.push('/exam?openCreate=1');
  };

  // ── Final save ──
  const handleFinalSave = async () => {
    setSaving(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const autoQuarterId = quarters.length > 0 ? quarters[0].quarter_id : null;

      const examId = await createExamWithAssignments(
        { title: draft.examName.trim(), description: null, subject_id: Number(draft.subjectId), quarter_id: autoQuarterId, exam_date: today, total_items: totalItems },
        draft.sectionIds
      );

      if (!examId) throw new Error('Failed to create exam');

      const validObjectives: LearningObjective[] = objectiveRows
        .filter(r => r.objective.trim() && Number(r.start_item) && Number(r.end_item))
        .map(r => ({ objective: r.objective.trim(), start_item: Number(r.start_item), end_item: Number(r.end_item) }));

      if (validObjectives.length > 0) await saveObjectives(examId, validObjectives);

      const answerKeyData: AnswerKeyJsonb = {
        total_questions: totalItems,
        num_choices: numChoices,
        answers: answers as { [questionNumber: number]: string | null },
      };
      await saveAnswerKey(examId, answerKeyData);

      sessionStorage.removeItem(EXAM_DRAFT_KEY);

      notifications.show({
        title: 'Examination Created',
        message: draft.sectionIds.length > 1
          ? `${draft.sectionIds.length} examinations were created successfully.`
          : 'Examination was created successfully.',
        color: 'teal', withBorder: true, autoClose: 2500,
      });

      router.push(`/exam?newExamId=${examId}`);
    } catch {
      notifications.show({ title: 'Creation Failed', message: 'Unable to create examination. Please try again.', color: 'red', withBorder: true });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Container fluid px="md" py="xl">
      <Stack gap="xl">
        {/* Header */}
        <div>
          <Group mb="xs">
            <Button
              variant="subtle"
              color="gray"
              leftSection={<IconArrowLeft size={16} />}
              onClick={() => router.push('/exam')}
              disabled={saving}
              size="sm"
            >
              Back to Examinations
            </Button>
          </Group>
          <Title order={2}>Create Examination</Title>
          <Text c="dimmed" size="sm" mt={4}>Complete all steps to create a new examination</Text>
        </div>

        {/* Stepper */}
        <CreationFlowStepper activeStep={toStepperStep(step)} />

        {/* Exam summary banner */}
        <Paper p="sm" bg="gray.0" withBorder radius="md">
          <Group gap="xl" wrap="wrap">
            <Text size="sm"><Text span fw={600}>Exam:</Text> {draft.examName}</Text>
            {gradeLabel && <Text size="sm"><Text span fw={600}>Grade:</Text> {gradeLabel}</Text>}
            {subjectName && <Text size="sm"><Text span fw={600}>Subject:</Text> {subjectName}</Text>}
            <Text size="sm"><Text span fw={600}>Items:</Text> {totalItems}</Text>
            <Text size="sm"><Text span fw={600}>Choices:</Text> {numChoices} ({ALL_CHOICES.slice(0, numChoices).join('·')})</Text>
          </Group>
        </Paper>

        {/* ── Step 0: Learning Objectives ── */}
        {step === 0 && (
          <Stack gap="md">
            <Alert color="blue" icon={<IconBookmark size={16} />}>
              Map learning objectives to item ranges. Total items: <Text span fw={700}>{totalItems}</Text>
            </Alert>

            {hasOverlap && (
              <Alert color="yellow" icon={<IconAlertCircle size={16} />}>
                Some item ranges overlap. Each item should belong to one objective.
              </Alert>
            )}

            <Stack gap="sm">
              {objectiveRows.map((row, idx) => {
                const isOverlapping = overlappingRowIds.has(row.id);
                const descError = triedToSaveObjectives && !row.objective.trim();
                const startError = (triedToSaveObjectives && !Number(row.start_item)) || isOverlapping;
                const endError = (triedToSaveObjectives && !Number(row.end_item)) || isOverlapping ||
                  (Number(row.start_item) > 0 && Number(row.end_item) > 0 && Number(row.start_item) > Number(row.end_item));
                return (
                  <Paper key={row.id} p="md" withBorder radius="md">
                    <Group gap="xs" mb="xs" justify="space-between">
                      <Badge size="sm" variant="light" color="blue">Objective {idx + 1}</Badge>
                      <ActionIcon size="sm" variant="subtle" color="red" onClick={() => removeRow(row.id)} disabled={objectiveRows.length === 1} aria-label="Remove">
                        <IconTrash size={14} />
                      </ActionIcon>
                    </Group>
                    <input
                      placeholder="e.g. Identify the parts of a plant"
                      value={row.objective}
                      onChange={(e) => updateRow(row.id, 'objective', e.currentTarget.value)}
                      className={`w-full border rounded-md px-3 py-2 text-sm mb-3 focus:outline-none ${
                        descError ? 'border-red-400 focus:border-red-500' : 'border-gray-300 focus:border-blue-400'
                      }`}
                    />
                    <Group gap="sm">
                      <NumberInput label="From item" placeholder="1" min={1} max={totalItems}
                        value={row.start_item === '' ? '' : Number(row.start_item)}
                        onChange={(val) => updateRow(row.id, 'start_item', val)}
                        style={{ flex: 1 }} allowDecimal={false}
                        error={startError ? (isOverlapping ? 'Range overlaps' : true) : undefined} />
                      <NumberInput label="To item" placeholder={String(totalItems)} min={1} max={totalItems}
                        value={row.end_item === '' ? '' : Number(row.end_item)}
                        onChange={(val) => updateRow(row.id, 'end_item', val)}
                        style={{ flex: 1 }} allowDecimal={false}
                        error={endError ? (isOverlapping ? 'Range overlaps' : Number(row.start_item) > Number(row.end_item) ? 'Must be ≥ start' : true) : undefined} />
                    </Group>
                  </Paper>
                );
              })}
            </Stack>

            <Button variant="light" color="blue" leftSection={<IconPlus size={14} />} onClick={addRow} size="sm">
              Add Objective
            </Button>

            <Paper p="sm" bg={uniqueCovered === totalItems ? 'teal.0' : 'orange.0'} radius="md" withBorder>
              <Text size="xs" fw={500}>
                Coverage:{' '}
                <Text span c={uniqueCovered === totalItems ? 'teal' : 'orange'} fw={700}>{uniqueCovered} / {totalItems} items</Text>
                {uniqueCovered < totalItems && <Text span c="orange.7" fw={500}> — all {totalItems} items must be covered to proceed</Text>}
                {uniqueCovered === totalItems && <Text span c="teal.7" fw={500}> — full coverage! Ready to set answer key.</Text>}
              </Text>
            </Paper>

            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={handleBack}>Back</Button>
              <Button variant="default" onClick={() => setStep(1)}>Skip</Button>
              <Button
                color="#466D1D"
                disabled={uniqueCovered < totalItems}
                onClick={() => {
                  setTriedToSaveObjectives(true);
                  const err = validateObjectives();
                  if (err) { notifications.show({ title: 'Validation Error', message: err, color: 'red' }); return; }
                  setStep(1);
                }}
              >
                Save &amp; Set Answer Key
              </Button>
            </Group>
          </Stack>
        )}

        {/* ── Step 1: Answer Key ── */}
        {step === 1 && (
          <Stack gap="md">
            <Group justify="space-between" mb={4}>
              <Text size="sm" c="dimmed">Progress</Text>
              <Text size="sm" fw={600} c={isAnswerKeyComplete ? 'green' : 'orange'}>
                {answeredCount} / {totalItems} answered ({progressPercent}%)
              </Text>
            </Group>
            <Progress value={progressPercent} color={isAnswerKeyComplete ? 'green' : 'orange'} size="md" radius="xl" />

            {triedToSave && !isAnswerKeyComplete && (
              <div className="bg-orange-50 border-2 border-orange-300 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <IconAlertTriangle className="w-5 h-5 text-orange-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-bold text-orange-800">Answer Key is incomplete!</p>
                    <p className="text-orange-700 text-sm mt-1">Missing <strong>{unansweredQuestions.length}</strong> answer{unansweredQuestions.length > 1 ? 's' : ''}:</p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {unansweredQuestions.map(q => <span key={q} className="bg-orange-200 text-orange-900 text-xs font-bold px-2.5 py-1 rounded-md">#{q}</span>)}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {isAnswerKeyComplete && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-2">
                <span className="text-green-600 text-lg">✅</span>
                <span className="text-green-700 font-medium text-sm">All {totalItems} questions answered — ready to proceed!</span>
              </div>
            )}

            {/* Bubble grid */}
            {(() => {
              const qNumToObjIdx = new Map<number, number>();
              objectiveRows.forEach((row, idx) => {
                const start = Number(row.start_item); const end = Number(row.end_item);
                if (!start || !end || start > end || !row.objective.trim()) return;
                for (let i = start; i <= end; i++) qNumToObjIdx.set(i, idx);
              });
              return (
                <div className={`grid gap-6 ${columns <= 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}>
                  {Array.from({ length: columns }, (_, col) => (
                    <div key={col} className="space-y-1">
                      {Array.from({ length: QUESTIONS_PER_COL }, (_, row) => {
                        const qNum = col * QUESTIONS_PER_COL + row + 1;
                        if (qNum > totalItems) return null;
                        const isUnanswered = triedToSave && !answers[qNum];
                        const objIdx = qNumToObjIdx.has(qNum) ? qNumToObjIdx.get(qNum)! : -1;
                        const color = objIdx >= 0 ? OBJECTIVE_PALETTE[objIdx % OBJECTIVE_PALETTE.length] : null;
                        const objRow = objIdx >= 0 ? objectiveRows[objIdx] : null;
                        return (
                          <div key={qNum} className={`flex items-center gap-2 py-1.5 px-2 rounded-lg transition-all ${isUnanswered ? 'bg-orange-50 border border-orange-200' : 'hover:bg-gray-50'}`}>
                            <span className={`text-sm font-semibold w-7 text-right flex-shrink-0 ${isUnanswered ? 'text-orange-600' : 'text-gray-700'}`}>{qNum}</span>
                            <div className="flex gap-1 flex-shrink-0">
                              {choices.map(option => (
                                <button key={option} type="button" onClick={() => handleAnswerSelect(qNum, option)}
                                  className={`w-8 h-8 rounded-full border-2 flex items-center justify-center font-bold text-xs transition-all duration-150 hover:scale-110 ${
                                    answers[qNum] === option
                                      ? 'bg-green-600 border-green-600 text-white shadow-md'
                                      : isUnanswered
                                      ? 'border-orange-300 text-orange-400 hover:border-green-500 hover:bg-green-50'
                                      : 'border-gray-300 text-gray-500 hover:border-green-500 hover:bg-green-50'
                                  }`}>
                                  {option}
                                </button>
                              ))}
                            </div>
                            {color && objRow && (
                              <div className="relative group flex-shrink-0">
                                <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold border cursor-help leading-tight"
                                  style={{ background: color.bg, borderColor: color.border, color: color.text }}>
                                  {objRow.objective.length > 14 ? objRow.objective.slice(0, 14) + '…' : objRow.objective}
                                </span>
                                <div className="pointer-events-none absolute bottom-full left-0 mb-2 hidden group-hover:block z-50 w-max max-w-[240px]">
                                  <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-xl leading-snug whitespace-normal">{objRow.objective}</div>
                                  <div className="w-2 h-2 bg-gray-900 rotate-45 ml-2 -mt-1" />
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              );
            })()}

            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={() => setStep(0)}>Back</Button>
              <Button
                color="green"
                leftSection={<IconDeviceFloppy size={16} />}
                onClick={() => {
                  if (!isAnswerKeyComplete) { setTriedToSave(true); return; }
                  setStep(2);
                }}
              >
                {isAnswerKeyComplete ? 'Next' : `${unansweredQuestions.length} item${unansweredQuestions.length > 1 ? 's' : ''} missing`}
              </Button>
            </Group>
          </Stack>
        )}

        {/* ── Step 2: Summary ── */}
        {step === 2 && (
          <Stack gap="md">
            <div className="text-center pb-2">
              <div className="text-4xl mb-2">🎉</div>
              <h3 className="text-xl font-bold text-gray-900">Ready to Create!</h3>
              <p className="text-gray-500 text-sm mt-0.5">Review your exam setup below, then hit Create.</p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm">
              {[
                ['Exam', draft.examName],
                ['Grade', gradeLabel],
                ['Subject', subjectName],
                ['Section(s)', sectionNames],
                ['Items', String(totalItems)],
                ['Choices', `${numChoices} (${ALL_CHOICES.slice(0, numChoices).join('·')})`],
              ].map(([label, value]) => (
                <div key={label} className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
                  <p className="font-semibold text-gray-900 truncate">{value}</p>
                </div>
              ))}
            </div>

            {/* Items with answers and objectives — 2 columns */}
            <Paper withBorder radius="md" p={0} style={{ overflow: 'hidden' }}>
              <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
                <Text size="xs" fw={700} tt="uppercase" c="dimmed">Items · Answer Key · Objectives</Text>
              </div>
              {(() => {
                const half = Math.ceil(totalItems / 2);
                const renderTable = (startIdx: number, endIdx: number) => (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-500 border-b border-gray-100 bg-gray-50">
                        <th className="text-left py-2 px-3 font-semibold w-10">#</th>
                        <th className="text-left py-2 px-3 font-semibold w-14">Answer</th>
                        <th className="text-left py-2 px-3 font-semibold">Objective</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {Array.from({ length: endIdx - startIdx }, (_, i) => {
                        const qNum = startIdx + i + 1;
                        const answer = answers[qNum] ?? '—';
                        const objRow = objectiveRows.find(r => {
                          const s = Number(r.start_item); const e = Number(r.end_item);
                          return s && e && qNum >= s && qNum <= e && r.objective.trim();
                        });
                        const objIdx = objRow ? objectiveRows.indexOf(objRow) : -1;
                        const color = objIdx >= 0 ? OBJECTIVE_PALETTE[objIdx % OBJECTIVE_PALETTE.length] : null;
                        return (
                          <tr key={qNum} className="hover:bg-gray-50">
                            <td className="py-1.5 px-3 font-semibold text-gray-500">{qNum}</td>
                            <td className="py-1.5 px-3">
                              <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${
                                answer !== '—' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-400'
                              }`}>{answer}</span>
                            </td>
                            <td className="py-1.5 px-3">
                              {color && objRow ? (
                                <span className="inline-block px-2 py-0.5 rounded text-xs font-medium border"
                                  style={{ background: color.bg, borderColor: color.border, color: color.text }}>
                                  {objRow.objective}
                                </span>
                              ) : (
                                <span className="text-xs text-gray-300">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                );
                return (
                  <div className="grid grid-cols-2 divide-x divide-gray-100">
                    <div className="overflow-x-auto">{renderTable(0, half)}</div>
                    <div className="overflow-x-auto">{renderTable(half, totalItems)}</div>
                  </div>
                );
              })()}
            </Paper>

            <Divider />

            <Group justify="flex-end">
              <Button variant="default" onClick={() => setStep(1)} disabled={saving}>Back</Button>
              <Button color="#466D1D" onClick={handleFinalSave} loading={saving}>
                Create Examination
              </Button>
            </Group>
          </Stack>
        )}
      </Stack>
    </Container>
  );
}
