'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Container, Stepper, Button, Group, Text, rem, Paper, Stack,
  Select, MultiSelect, Alert, Badge, ActionIcon, NumberInput, Progress,
  Loader, TextInput,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import {
  IconPlus, IconTrash, IconBookmark, IconAlertCircle,
  IconAlertTriangle, IconCheck, IconLink, IconMinus,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { fetchActiveQuarters } from '@/lib/services/quarterService';
import { fetchGradeLevels } from '@/lib/services/gradeLevelService';
import { fetchSubjectsWithGradeLevels, type SubjectWithGradeLevel } from '@/lib/services/subjectService';
import { fetchActiveSections } from '@/lib/services/sectionService';
import { fetchTeacherClassAssignments } from '@/app/(app)/school/classes/_lib/classService';
import { createExamWithAssignments, saveObjectives, saveAnswerKey, fetchExamsWithRelations } from '@/lib/services/examService';
import type { LearningObjective, AnswerKeyJsonb, Quarter, Section, GradeLevel } from '@/lib/exam-supabase';
import { useAuth } from '@/context/AuthContext';

const ALL_CHOICES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
// Always 2 columns matching the PDF answer sheet layout

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

// ── Draft persistence ────────────────────────────────────────────────────────
const DRAFT_KEY = 'exam_create_draft';

interface ExamCreateDraft {
  step: number;
  examName: string;
  gradeLevelId: string | null;
  subjectId: string | null;
  sectionIds: number[];
  totalItems: number;
  numChoices: number;
  objectiveRows: ObjectiveRow[];
  answers: Record<number, string | null>;
}

function readDraft(): ExamCreateDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as ExamCreateDraft) : null;
  } catch { return null; }
}

function clearDraft() {
  try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
}

function getAutoTotalItems(levelNumber: number | null | undefined): number {
  if (!levelNumber) return 30;
  if (levelNumber <= 2) return 30;
  if (levelNumber <= 4) return 40;
  if (levelNumber <= 6) return 50;
  return 50;
}

export default function CreateExamPage() {
  const router = useRouter();
  const { user, permissions } = useAuth();
  const hasFullAccess = permissions.includes('exams.full_access');
  const isMobile = useMediaQuery('(max-width: 768px)');

  // Load once on first render — does not re-run on re-renders
  const draftRef = useRef<ExamCreateDraft | null | undefined>(undefined);
  if (draftRef.current === undefined) draftRef.current = readDraft();
  const d = draftRef.current;

  // Restore saved row IDs so nextRowId stays ahead
  if (d?.objectiveRows?.length) {
    const maxId = Math.max(...d.objectiveRows.map(r => r.id));
    if (maxId >= nextRowId) nextRowId = maxId + 1;
  }

  const [activeStep, setActiveStep] = useState(d?.step ?? 0);
  const [saving, setSaving] = useState(false);

  // Reference data
  const [gradeLevels, setGradeLevels] = useState<GradeLevel[]>([]);
  const [subjects, setSubjects] = useState<SubjectWithGradeLevel[]>([]);
  const [allSections, setAllSections] = useState<Section[]>([]);
  const [quarters, setQuarters] = useState<Quarter[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [allowedSectionIds, setAllowedSectionIds] = useState<Set<number> | null>(null);
  const [allowedSubjectIds, setAllowedSubjectIds] = useState<Set<number> | null>(null);
  const [teacherAssignments, setTeacherAssignments] = useState<{ section_id: number; subject_id: number }[]>([]);
  // Step 0 — Exam Details
  const [examName, setExamName] = useState(d?.examName ?? '');
  const [selectedGradeLevelId, setSelectedGradeLevelId] = useState<string | null>(d?.gradeLevelId ?? null);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(d?.subjectId ?? null);
  const [selectedSectionIds, setSelectedSectionIds] = useState<number[]>(d?.sectionIds ?? []);

  // Step 1 — Items & Choices
  const [totalItems, setTotalItems] = useState(d?.totalItems ?? 30);
  const [numChoices, setNumChoices] = useState(d?.numChoices ?? 4);

  // Step 2 — Objectives
  const [objectiveRows, setObjectiveRows] = useState<ObjectiveRow[]>(
    d?.objectiveRows?.length ? d.objectiveRows : [makeRow()]
  );
  const [triedToSaveObjectives, setTriedToSaveObjectives] = useState(false);

  // Step 3 — Answer Key
  const [answers, setAnswers] = useState<{ [key: number]: string | null }>(d?.answers ?? {});
  const [triedToSave, setTriedToSave] = useState(false);

  // Refs to skip auto-reset effects on the very first mount (would clear restored data)
  const gradeLevelMountedRef = useRef(false);
  const totalItemsMountedRef = useRef(false);
  const prevGradeLevelForItemsRef = useRef<string | null | undefined>(d?.gradeLevelId);

  useEffect(() => {
    const load = async () => {
      const [q, gl, sub, sec, allExams] = await Promise.all([
        fetchActiveQuarters(),
        fetchGradeLevels(),
        fetchSubjectsWithGradeLevels(),
        fetchActiveSections(),
        fetchExamsWithRelations().catch(() => []),
      ]);
      setQuarters(q);
      setGradeLevels(gl);
      setSubjects(sub);
      setAllSections(sec);
      if (user?.id) {
        const assignments = await fetchTeacherClassAssignments(user.id);
        setTeacherAssignments(assignments);
        if (!hasFullAccess) {
          setAllowedSectionIds(new Set(assignments.map(a => a.section_id)));
          setAllowedSubjectIds(new Set(assignments.map(a => a.subject_id)));
        }
      }
      setDataLoading(false);
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-reset sections/subject when grade changes (skip on first mount to preserve restored draft)
  useEffect(() => {
    if (!gradeLevelMountedRef.current) { gradeLevelMountedRef.current = true; return; }
    setSelectedSectionIds([]);
    setSelectedSubjectId(null);
  }, [selectedGradeLevelId]);

  // Auto-set totalItems based on grade — only fires when user actually changes grade,
  // not on initial mount or when gradeLevels data loads (preserves restored draft value)
  useEffect(() => {
    if (!totalItemsMountedRef.current) { totalItemsMountedRef.current = true; return; }
    if (prevGradeLevelForItemsRef.current === selectedGradeLevelId) return; // gradeLevels loaded, grade unchanged
    prevGradeLevelForItemsRef.current = selectedGradeLevelId;
    const gradeLevel = gradeLevels.find(g => g.grade_level_id === Number(selectedGradeLevelId)) ?? null;
    setTotalItems(getAutoTotalItems(gradeLevel?.level_number));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGradeLevelId, gradeLevels]);

  // Save draft to sessionStorage whenever form state changes
  useEffect(() => {
    try {
      const draft: ExamCreateDraft = {
        step: activeStep,
        examName,
        gradeLevelId: selectedGradeLevelId,
        subjectId: selectedSubjectId,
        sectionIds: selectedSectionIds,
        totalItems,
        numChoices,
        objectiveRows,
        answers,
      };
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch { /* ignore */ }
  }, [activeStep, examName, selectedGradeLevelId, selectedSubjectId, selectedSectionIds, totalItems, numChoices, objectiveRows, answers]);

  const choices = ALL_CHOICES.slice(0, numChoices);
  const itemsInCol1 = Math.ceil(totalItems / 2);

  // Filtered data
  const allowedGradeLevelIds = allowedSectionIds
    ? new Set(allSections.filter(s => s.grade_level_id !== null && allowedSectionIds.has(s.section_id)).map(s => s.grade_level_id as number))
    : null;
  const filteredGradeLevels = gradeLevels.filter(g => !allowedGradeLevelIds || allowedGradeLevelIds.has(g.grade_level_id));
  const filteredSections = allSections
    .filter(s => !selectedGradeLevelId || s.grade_level_id === Number(selectedGradeLevelId))
    .filter(s => !allowedSectionIds || allowedSectionIds.has(s.section_id));
  const selectedSectionTypes = new Set(filteredSections.filter(s => selectedSectionIds.includes(s.section_id)).map(s => s.section_type).filter(Boolean));
  const activeSectionType = selectedSectionTypes.size === 1 ? [...selectedSectionTypes][0] : null;

  useEffect(() => {
    if (selectedSectionIds.length === 0) {
      setSelectedSubjectId(null);
      return;
    }

    if (!activeSectionType || !selectedSubjectId) return;
    const isValid = subjects.some(s => String(s.subject_id) === selectedSubjectId && (s.section_type === null || s.section_type === activeSectionType));
    if (!isValid) setSelectedSubjectId(null);
  }, [activeSectionType, selectedSectionIds, selectedSubjectId, subjects]);

  // When sections are selected, narrow subjects to those the teacher actually teaches in those sections.
  // Fall back to the global allowedSubjectIds (or no restriction for full-access) when no sections are chosen yet.
  const sectionAwareSubjectIds = selectedSectionIds.length > 0 && teacherAssignments.length > 0
    ? new Set(teacherAssignments.filter(a => selectedSectionIds.includes(a.section_id)).map(a => a.subject_id))
    : allowedSubjectIds;

  const filteredSubjects = Array.from(
    new Map(
      subjects
        .filter(s => !selectedGradeLevelId || s.grade_level_id === Number(selectedGradeLevelId))
        .filter(s => !sectionAwareSubjectIds || sectionAwareSubjectIds.has(s.subject_id))
        .filter(s => !activeSectionType || s.section_type === null || s.section_type === activeSectionType)
        .map(s => [s.subject_id, s] as const)
    ).values()
  );
  const selectedSectionNames = filteredSections.filter(s => selectedSectionIds.includes(s.section_id)).map(s => s.name);
  const canGoStep1 = examName.trim().length > 0 && Boolean(selectedGradeLevelId) && Boolean(selectedSubjectId) && selectedSectionIds.length > 0;

  const toggleSection = (sectionId: number) => {
    setSelectedSectionIds(prev => prev.includes(sectionId) ? prev.filter(id => id !== sectionId) : [...prev, sectionId]);
  };

  // ── Objectives helpers ──
  const addRow = () => setObjectiveRows(prev => [...prev, makeRow()]);
  const removeRow = (id: number) => setObjectiveRows(prev => prev.length > 1 ? prev.filter(r => r.id !== id) : prev);
  const updateRow = (id: number, field: keyof ObjectiveRow, value: string | number) =>
    setObjectiveRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));

  const coveredItems = objectiveRows.reduce<number[]>((acc, r) => {
    const start = Number(r.start_item); const end = Number(r.end_item);
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
      if (aStart <= bEnd && bStart <= aEnd) { overlappingRowIds.add(a.id); overlappingRowIds.add(b.id); }
    }
  }

  const validateObjectives = (): string | null => {
    for (const row of objectiveRows) {
      if (!row.objective.trim()) return 'All objectives must have a description.';
      const start = Number(row.start_item); const end = Number(row.end_item);
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

  const handleAnswerSelect = (qNum: number, answer: string) => {
    setAnswers(prev => ({ ...prev, [qNum]: prev[qNum] === answer ? null : answer }));
  };

  // ── Final save ──
  const handleFinalSave = async () => {
    setSaving(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const autoQuarterId = quarters.length > 0 ? quarters[0].quarter_id : null;

      const examResult = await createExamWithAssignments(
        { title: examName.trim(), description: null, subject_id: Number(selectedSubjectId), quarter_id: autoQuarterId, exam_date: today, total_items: totalItems },
        selectedSectionIds
      );
      if (!examResult) throw new Error('Failed to create exam');
      const examId = examResult.exam_id;

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

      notifications.show({
        title: 'Examination Created',
        message: selectedSectionIds.length > 1 ? `${selectedSectionIds.length} examinations were created successfully.` : 'Examination was created successfully.',
        color: 'teal', withBorder: true, autoClose: 2500,
      });
      clearDraft();
      router.push(`/exam?newExamId=${examId}`);
    } catch (error) {
      notifications.show({ title: 'Creation Failed', message: (error as Error)?.message || 'Unable to create examination. Please try again.', color: 'red', withBorder: true });
    } finally {
      setSaving(false);
    }
  };

  const nextStep = () => setActiveStep(s => s + 1);
  const prevStep = () => setActiveStep(s => s - 1);

  // ── Step content ──
  const renderStep0 = () => (
    <Stack gap="md">
      <Text size="lg" fw={700} c="#4EAE4A">Specify Exam Information</Text>
      <Paper p="lg" withBorder radius="md">
        <Text size="md" fw={700} mb="md" c="#4EAE4A">Exam Details</Text>
        {dataLoading ? (
          <Group justify="center" py="xl"><Loader /></Group>
        ) : (
          <Stack gap="md">
            <Alert color="blue" icon={<IconAlertCircle size={16} />}>
              New exam will be set to <Text span fw={600} c="green">Active</Text> automatically
            </Alert>
            <Text size="xs" c="dimmed">
              Complete all required fields marked with <Text span c="red">*</Text> to continue.
            </Text>
            <TextInput
              label="Examination Name"
              placeholder="e.g., Mid-term Examination"
              required
              value={examName}
              onChange={(e) => setExamName(e.currentTarget.value)}
            />
            <Group grow>
              <Select
                label="Grade Level"
                placeholder="Select grade"
                required
                data={filteredGradeLevels.map(g => ({ value: String(g.grade_level_id), label: g.display_name }))}
                value={selectedGradeLevelId}
                onChange={setSelectedGradeLevelId}
              />
              <MultiSelect
                label="Section"
                placeholder="Select section(s)"
                required
                data={filteredSections.map(s => ({ value: String(s.section_id), label: `Section ${s.name}` }))}
                value={selectedSectionIds.map(String)}
                onChange={(values) => setSelectedSectionIds(values.map(Number))}
                nothingFoundMessage={selectedGradeLevelId ? 'No sections available' : 'Select a grade level first'}
                disabled={filteredSections.length === 0}
              />
              <Select
                label="Subject"
                placeholder={selectedSectionIds.length > 0 ? 'Select subject' : 'Select section(s) first'}
                required
                data={filteredSubjects.map(s => ({ value: String(s.subject_id), label: s.name }))}
                value={selectedSubjectId}
                onChange={setSelectedSubjectId}
                disabled={selectedSectionIds.length === 0}
              />
            </Group>
            <div>
              {selectedSectionIds.length === 0 && filteredSections.length === 0 && (
                <Alert color="yellow" icon={<IconAlertCircle size={16} />}>
                  {selectedGradeLevelId ? 'No sections found for selected grade level' : 'Select a grade level first'}
                </Alert>
              )}
              {selectedSectionIds.length > 1 && (
                <Paper p="sm" mt="sm" bg="blue.0" withBorder>
                  <Group gap="xs">
                    <IconLink size={16} />
                    <Text size="xs">
                      <Text span fw={600}>{selectedSectionIds.length} exams will be created</Text> for sections{' '}
                      {selectedSectionNames.map(n => `Section ${n}`).join(', ')}. Editing the answer key on any one will update all sections.
                    </Text>
                  </Group>
                </Paper>
              )}
              {selectedSectionIds.length === 1 && (
                <Paper p="sm" mt="sm" bg="green.0" withBorder>
                  <Text size="xs"><Text span fw={600}>1 exam</Text> will be created for Section {selectedSectionNames[0]}</Text>
                </Paper>
              )}
            </div>
          </Stack>
        )}
      </Paper>
    </Stack>
  );

  const renderStep1 = () => (
    <Stack gap="md">
      <Text size="lg" fw={700} c="#4EAE4A">Set Items & Choices</Text>
      <Paper p="lg" withBorder radius="md">
        <Text size="md" fw={700} mb="md" c="#4EAE4A">Exam Configuration</Text>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-gray-700 mb-3 text-center">Number of Items</p>
            <div className="flex items-center justify-center gap-3">
              <button type="button" onClick={() => setTotalItems(prev => Math.max(10, prev - 1))} disabled={totalItems <= 10}
                className={`w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all ${totalItems <= 10 ? 'border-gray-200 text-gray-300 cursor-not-allowed' : 'border-red-300 text-red-500 hover:bg-red-50 active:scale-95'}`}>
                <IconMinus className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-2">
                <input type="number" min={10} max={200} value={totalItems}
                  onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) setTotalItems(Math.max(10, Math.min(200, v))); }}
                  className="w-20 text-center text-2xl font-bold text-gray-900 border-2 border-gray-300 rounded-xl px-2 py-1.5 focus:outline-none focus:border-green-400" />
                <span className="text-sm text-gray-400">items</span>
              </div>
              <button type="button" onClick={() => setTotalItems(prev => Math.min(200, prev + 1))} disabled={totalItems >= 200}
                className={`w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all ${totalItems >= 200 ? 'border-gray-200 text-gray-300 cursor-not-allowed' : 'border-green-300 text-green-600 hover:bg-green-50 active:scale-95'}`}>
                <IconPlus className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-gray-400 text-center mt-2">Auto default by grade level (G1-2: 30, G3-4: 40, G5-6: 50)</p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-gray-700 mb-3 text-center">Choices per Item</p>
            <div className="flex items-center justify-center gap-3">
              <button type="button" onClick={() => setNumChoices(prev => Math.max(2, prev - 1))} disabled={numChoices <= 2}
                className={`w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all ${numChoices <= 2 ? 'border-gray-200 text-gray-300 cursor-not-allowed' : 'border-red-300 text-red-500 hover:bg-red-50 active:scale-95'}`}>
                <IconMinus className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-2">
                <div className="w-20 text-center py-1.5">
                  <p className="text-2xl font-bold text-gray-900">{numChoices}</p>
                </div>
                <div className="flex flex-col">
                  <span className="text-sm text-gray-400">choices</span>
                  <span className="text-xs font-semibold text-green-600">{ALL_CHOICES.slice(0, numChoices).join(' · ')}</span>
                </div>
              </div>
              <button type="button" onClick={() => setNumChoices(prev => Math.min(8, prev + 1))} disabled={numChoices >= 8}
                className={`w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all ${numChoices >= 8 ? 'border-gray-200 text-gray-300 cursor-not-allowed' : 'border-green-300 text-green-600 hover:bg-green-50 active:scale-95'}`}>
                <IconPlus className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-gray-400 text-center mt-2">Min: 2 (A·B) · Max: 8 (A–H)</p>
          </div>
        </div>
      </Paper>
    </Stack>
  );

  const renderStep2 = () => (
    <Stack gap="md">
      <Text size="lg" fw={700} c="#4EAE4A">Learning Objectives</Text>
      <Paper p="lg" withBorder radius="md">
        <Text size="md" fw={700} mb="md" c="#4EAE4A">Map Objectives to Items</Text>
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
                    <ActionIcon size="sm" variant="subtle" color="red" onClick={() => removeRow(row.id)} disabled={objectiveRows.length === 1}>
                      <IconTrash size={14} />
                    </ActionIcon>
                  </Group>
                  <input
                    placeholder="e.g. Identify the parts of a plant"
                    value={row.objective}
                    onChange={(e) => updateRow(row.id, 'objective', e.currentTarget.value)}
                    className={`w-full border rounded-md px-3 py-2 text-sm mb-3 focus:outline-none ${descError ? 'border-red-400' : 'border-gray-300 focus:border-blue-400'}`}
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
        </Stack>
      </Paper>
    </Stack>
  );

  const renderStep3 = () => {
    const qNumToObjIdx = new Map<number, number>();
    objectiveRows.forEach((row, idx) => {
      const start = Number(row.start_item); const end = Number(row.end_item);
      if (!start || !end || start > end || !row.objective.trim()) return;
      for (let i = start; i <= end; i++) qNumToObjIdx.set(i, idx);
    });
    return (
      <Stack gap="md">
        <Text size="lg" fw={700} c="#4EAE4A">Answer Key</Text>
        <Paper p="lg" withBorder radius="md">
          <Text size="md" fw={700} mb="md" c="#4EAE4A">Set Correct Answers</Text>
          <Stack gap="md">
            <Group justify="space-between">
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
            <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
              {[0, 1].map(col => {
                const start = col === 0 ? 1 : itemsInCol1 + 1;
                const count = col === 0 ? itemsInCol1 : totalItems - itemsInCol1;
                if (start > totalItems) return null;
                return (
                <div key={col} className="space-y-1">
                  {Array.from({ length: count }, (_, row) => {
                    const qNum = start + row;
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
                                answers[qNum] === option ? 'bg-green-600 border-green-600 text-white shadow-md'
                                : isUnanswered ? 'border-orange-300 text-orange-400 hover:border-green-500 hover:bg-green-50'
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
                );
              })}
            </div>
          </Stack>
        </Paper>
      </Stack>
    );
  };

  const renderStep4 = () => {
    const half = Math.ceil(totalItems / 2);
    const gradeLabel = gradeLevels.find(g => String(g.grade_level_id) === selectedGradeLevelId)?.display_name ?? '—';
    const subjectName = filteredSubjects.find(s => String(s.subject_id) === selectedSubjectId)?.name ?? '—';
    const sectionNames = selectedSectionNames.map(n => `Section ${n}`).join(', ');

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
                  <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${answer !== '—' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-400'}`}>{answer}</span>
                </td>
                <td className="py-1.5 px-3">
                  {color && objRow ? (
                    <span className="inline-block px-2 py-0.5 rounded text-xs font-medium border"
                      style={{ background: color.bg, borderColor: color.border, color: color.text }}>
                      {objRow.objective}
                    </span>
                  ) : <span className="text-xs text-gray-300">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );

    return (
      <Stack gap="md">
        <Text size="lg" fw={700} c="#4EAE4A">Review & Create</Text>
        <Paper p="lg" withBorder radius="md">
          <Text size="md" fw={700} mb="md" c="#4EAE4A">Exam Summary</Text>
          <Stack gap="md">
            <div className="text-center pb-2">
              <div className="text-4xl mb-2">🎉</div>
              <h3 className="text-xl font-bold text-gray-900">Ready to Create!</h3>
              <p className="text-gray-500 text-sm mt-0.5">Review your exam setup below, then hit Create.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {[
                ['Exam', examName],
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
            <Paper withBorder radius="md" p={0} style={{ overflow: 'hidden' }}>
              <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
                <Text size="xs" fw={700} tt="uppercase" c="dimmed">Items · Answer Key · Objectives</Text>
              </div>
              <div className="grid grid-cols-2 divide-x divide-gray-100">
                <div className="overflow-x-auto">{renderTable(0, half)}</div>
                <div className="overflow-x-auto">{renderTable(half, totalItems)}</div>
              </div>
            </Paper>
          </Stack>
        </Paper>
      </Stack>
    );
  };

  const isNextDisabled = (() => {
    if (activeStep === 0) return !canGoStep1 || dataLoading;
    if (activeStep === 2) return uniqueCovered < totalItems;
    return false;
  })();

  const handleNext = () => {
    if (activeStep === 0) {
      nextStep();
    } else if (activeStep === 2) {
      setTriedToSaveObjectives(true);
      const err = validateObjectives();
      if (err) { notifications.show({ title: 'Validation Error', message: err, color: 'red' }); return; }
      nextStep();
    } else if (activeStep === 3) {
      if (!isAnswerKeyComplete) { setTriedToSave(true); return; }
      nextStep();
    } else {
      nextStep();
    }
  };

  const stepDescriptions = [
    { label: 'Step 1', description: 'Specify exam information' },
    { label: 'Step 2', description: 'Set items and answer choices' },
    { label: 'Step 3', description: 'Map learning objectives' },
    { label: 'Step 4', description: 'Set correct answers' },
    { label: 'Step 5', description: 'Review and create' },
  ];

  const stepContent = [renderStep0, renderStep1, renderStep2, renderStep3, renderStep4];

  const navigationButtons = (
    <Group justify="flex-end" mt="xl">
      <Button variant="default" onClick={() => {
        if (activeStep === 0) { clearDraft(); router.push('/exam'); }
        else prevStep();
      }}>
        {activeStep === 0 ? 'Cancel' : 'Previous'}
      </Button>
      {activeStep < 4 ? (
        <Button
          onClick={handleNext}
          disabled={isNextDisabled}
          style={isNextDisabled ? undefined : { backgroundColor: '#4EAE4A' }}
        >
          {activeStep === 3 && !isAnswerKeyComplete
            ? `${unansweredQuestions.length} item${unansweredQuestions.length > 1 ? 's' : ''} missing`
            : 'Next'}
        </Button>
      ) : (
        <Button onClick={handleFinalSave} loading={saving} style={{ backgroundColor: '#4EAE4A' }}>
          Create Examination
        </Button>
      )}
    </Group>
  );

  return (
    <>
      <h1 className="text-3xl font-bold mb-6 text-[#597D37]">Create Examination</h1>
      <Container fluid py="xl" h="100%">
        {isMobile ? (
          <Stepper active={activeStep} color="#4EAE4A" orientation="vertical">
            {stepDescriptions.map((s, i) => (
              <Stepper.Step key={i} label={s.label} description={s.description}>
                {stepContent[i]()}
              </Stepper.Step>
            ))}
          </Stepper>
        ) : (
          <div style={{ display: 'flex', gap: rem(32), height: '100%' }}>
            {/* Left: Stepper */}
            <div style={{ flexShrink: 0, width: '20%' }}>
              <Stepper active={activeStep} color="#4EAE4A" orientation="vertical">
                {stepDescriptions.map((s, i) => (
                  <Stepper.Step key={i} label={s.label} description={s.description} />
                ))}
              </Stepper>
            </div>
            {/* Right: Content */}
            <div style={{ width: '70%' }}>
              {stepContent[activeStep]()}
              {navigationButtons}
            </div>
          </div>
        )}
        {isMobile && navigationButtons}
      </Container>
    </>
  );
}
