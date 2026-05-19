'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Container, Stepper, Button, Group, Text, rem, Paper, Stack,
  Select, MultiSelect, Alert, ActionIcon, NumberInput, TextInput, Tooltip,
  Skeleton,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import {
  IconPlus, IconBookmark, IconAlertCircle,
  IconAlertTriangle, IconMinus, IconX, IconClipboardCheck,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { modals } from '@mantine/modals';
import { fetchActiveQuarters, abbreviateQuarterName } from '@/lib/services/quarterService';
import { fetchGradeLevels } from '@/lib/services/gradeLevelService';
import { fetchSubjectsWithGradeLevels, type SubjectWithGradeLevel } from '@/lib/services/subjectService';
import { fetchActiveSections } from '@/lib/services/sectionService';
import { fetchSchoolYears, fetchTeacherClassAssignments } from '@/lib/services/classService';
import { createExamWithAssignments, saveObjectives, saveAnswerKey, checkExamDuplicates, checkOccupiedSubjects, fetchOccupiedSectionSubjectPairs } from '@/lib/services/examService';
import type { LearningObjective, AnswerKeyJsonb, Quarter, Section, GradeLevel } from '@/lib/exam-supabase';
import { useAuth } from '@/context/AuthContext';
import WizardNavigationButtons from '@/components/WizardNavigationButtons';
import NoActivePeriodBanner from '@/components/NoActivePeriodBanner';

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
  const [hasActiveSchoolYear, setHasActiveSchoolYear] = useState<boolean | null>(null);
  const [duplicateSectionIds, setDuplicateSectionIds] = useState<Set<number>>(new Set());
  const [occupiedSubjectIds, setOccupiedSubjectIds] = useState<Set<number>>(new Set());
  const [allOccupiedPairs, setAllOccupiedPairs] = useState<Map<number, Set<number>>>(new Map());
  const [allowedSectionIds, setAllowedSectionIds] = useState<Set<number> | null>(null);
  const [allowedSubjectIds, setAllowedSubjectIds] = useState<Set<number> | null>(null);
  const [isFacultyView] = useState(() =>
    typeof window !== "undefined" && localStorage.getItem("examViewMode") === "faculty",
  );
  // An admin in faculty view is treated as restricted — only their assigned sections/subjects.
  const isRestricted = !hasFullAccess || isFacultyView;
  const [teacherAssignments, setTeacherAssignments] = useState<{ section_id: number; curriculum_subject_id: number; subject_id: number }[]>([]);
  // Step 0 — Exam Details
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
  const [isAnswerKeyFlashStrong, setIsAnswerKeyFlashStrong] = useState(false);
  const answerKeyFlashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs to skip auto-reset effects on the very first mount (would clear restored data)
  const gradeLevelMountedRef = useRef(false);
  const sectionMountedRef = useRef(false);
  const totalItemsMountedRef = useRef(false);
  const prevGradeLevelForItemsRef = useRef<string | null | undefined>(d?.gradeLevelId);

  useEffect(() => {
    const load = async () => {
      const [q, gl, sub, sec, schoolYears] = await Promise.all([
        fetchActiveQuarters(),
        fetchGradeLevels(),
        fetchSubjectsWithGradeLevels(),
        fetchActiveSections(),
        fetchSchoolYears(),
      ]);
      setQuarters(q);
      setGradeLevels(gl);
      setSubjects(sub);
      setAllSections(sec);
      setHasActiveSchoolYear(schoolYears.some((schoolYear) => schoolYear.is_active));
      setDataLoading(false);
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Runs once auth is ready (user?.id becomes available after session resolves).
  // Separated from the data-load effect so reload doesn't skip assignment filtering
  // when user is still null at mount.
  useEffect(() => {
    if (!user?.id) return;
    void fetchTeacherClassAssignments(user.id).then(assignments => {
      setTeacherAssignments(assignments);
      if (isRestricted) {
        setAllowedSectionIds(new Set(assignments.map(a => a.section_id)));
        setAllowedSubjectIds(new Set(assignments.map(a => a.curriculum_subject_id)));
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    return () => {
      if (answerKeyFlashTimeoutRef.current) clearTimeout(answerKeyFlashTimeoutRef.current);
    };
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
  }, [activeStep, selectedGradeLevelId, selectedSubjectId, selectedSectionIds, totalItems, numChoices, objectiveRows, answers]);

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

  // Subjects the teacher handles in ALL selected sections (intersection). Memoized so the
  // validation effect below only re-fires when the actual set of IDs changes.
  const sectionAwareSubjectIds = useMemo(() => {
    if (!isRestricted || selectedSectionIds.length === 0 || teacherAssignments.length === 0) return allowedSubjectIds;
    const perSection = selectedSectionIds.map(
      sectionId => new Set(teacherAssignments.filter(a => a.section_id === sectionId).map(a => a.curriculum_subject_id))
    );
    const [first, ...rest] = perSection;
    return new Set([...first].filter(id => rest.every(set => set.has(id))));
  }, [isRestricted, selectedSectionIds, teacherAssignments, allowedSubjectIds]);

  // Any change to the section selection always clears the subject so the user must
  // re-pick from the freshly computed intersection of subjects across the new sections.
  useEffect(() => {
    if (!sectionMountedRef.current) { sectionMountedRef.current = true; return; }
    setSelectedSubjectId(null);
  }, [selectedSectionIds]);

  // Fetch all occupied subjects for the selected sections + active quarter
  useEffect(() => {
    const activeQuarter = quarters.find((q) => q.is_active);
    if (selectedSectionIds.length === 0 || !activeQuarter) {
      setOccupiedSubjectIds(new Set());
      return;
    }
    checkOccupiedSubjects(selectedSectionIds, activeQuarter.quarter_id)
      .then(setOccupiedSubjectIds);
  }, [selectedSectionIds, quarters]);

  // Fetch all occupied section+subject pairs for the active quarter (used to lock sections/grade levels)
  useEffect(() => {
    const activeQuarter = quarters.find((q) => q.is_active);
    if (!activeQuarter) { setAllOccupiedPairs(new Map()); return; }
    fetchOccupiedSectionSubjectPairs(activeQuarter.quarter_id)
      .then(setAllOccupiedPairs);
  }, [quarters]);

  // Real-time duplicate check: fires whenever subject or sections change
  useEffect(() => {
    const activeQuarter = quarters.find((q) => q.is_active);
    if (!selectedSubjectId || selectedSectionIds.length === 0 || !activeQuarter) {
      setDuplicateSectionIds(new Set());
      return;
    }
    checkExamDuplicates(selectedSectionIds, Number(selectedSubjectId), activeQuarter.quarter_id)
      .then((ids) => setDuplicateSectionIds(new Set(ids)));
  }, [selectedSubjectId, selectedSectionIds, quarters]);

  const filteredSubjects = Array.from(
    new Map(
      subjects
        .filter(s => !selectedGradeLevelId || s.grade_level_id === Number(selectedGradeLevelId))
        .filter(s => !sectionAwareSubjectIds || sectionAwareSubjectIds.has(s.curriculum_subject_id))
        .filter(s => s.subject_type === 'BOTH' || activeSectionType === 'SSES')
        .map(s => [s.curriculum_subject_id, s] as const)
    ).values()
  );
  const selectedSectionNames = filteredSections.filter(s => selectedSectionIds.includes(s.section_id)).map(s => s.name);

  // Sections where every applicable subject already has an exam this quarter.
  const lockedSectionIds = useMemo(() => {
    const locked = new Set<number>();
    for (const section of allSections.filter(s => !allowedSectionIds || allowedSectionIds.has(s.section_id))) {
      const applicable = subjects.filter(s => {
        if (s.grade_level_id !== section.grade_level_id) return false;
        if (s.subject_type !== 'BOTH' && section.section_type !== 'SSES') return false;
        // Admin: all subjects count. Restricted: only subjects assigned to THIS section.
        if (!allowedSubjectIds) return true;
        return teacherAssignments.some(
          a => a.section_id === section.section_id && a.curriculum_subject_id === s.curriculum_subject_id,
        );
      });
      if (applicable.length === 0) continue;
      const occupied = allOccupiedPairs.get(section.section_id) ?? new Set<number>();
      if (applicable.every(s => occupied.has(s.curriculum_subject_id))) locked.add(section.section_id);
    }
    return locked;
  }, [allSections, subjects, allOccupiedPairs, allowedSectionIds, allowedSubjectIds, teacherAssignments]);

  // Grade levels where every visible section is locked.
  const lockedGradeLevelIds = useMemo(() => {
    const locked = new Set<number>();
    for (const gl of gradeLevels) {
      const glSections = allSections.filter(
        s => s.grade_level_id === gl.grade_level_id &&
          (!allowedSectionIds || allowedSectionIds.has(s.section_id)),
      );
      if (glSections.length > 0 && glSections.every(s => lockedSectionIds.has(s.section_id))) {
        locked.add(gl.grade_level_id);
      }
    }
    return locked;
  }, [gradeLevels, allSections, lockedSectionIds, allowedSectionIds]);

  const titleBase = (() => {
    const term = abbreviateQuarterName(quarters.find((q) => q.is_active)?.name ?? '');
    const subjectCode = filteredSubjects.find(s => String(s.curriculum_subject_id) === selectedSubjectId)?.code ?? '';
    if (!term || !subjectCode) return '';
    return `${term} - ${subjectCode}`;
  })();

  const generatedExamNames: string[] = titleBase
    ? selectedSectionNames.map((name) => `${titleBase} - ${name}`)
    : [];

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
    if (hasOverlap) return 'Objective item ranges overlap. Each item should belong to one objective only.';
    if (uniqueCovered < totalItems) {
      return `${totalItems - uniqueCovered} item${totalItems - uniqueCovered > 1 ? 's' : ''} are not mapped to any objective.`;
    }
    return null;
  };

  // ── Answer key helpers ──
  const unansweredQuestions = Array.from({ length: totalItems }, (_, i) => i + 1).filter(q => !answers[q]);
  const isAnswerKeyComplete = unansweredQuestions.length === 0;
  const answeredCount = totalItems - unansweredQuestions.length;

  const handleAnswerSelect = (qNum: number, answer: string) => {
    setAnswers(prev => ({ ...prev, [qNum]: prev[qNum] === answer ? null : answer }));
  };
  const triggerAnswerKeyMissingFlash = () => {
    setIsAnswerKeyFlashStrong(true);
    if (answerKeyFlashTimeoutRef.current) clearTimeout(answerKeyFlashTimeoutRef.current);
    answerKeyFlashTimeoutRef.current = setTimeout(() => setIsAnswerKeyFlashStrong(false), 2200);
  };
  const handleClearAnswerKey = () => {
    setAnswers({});
    setTriedToSave(false);
    setIsAnswerKeyFlashStrong(false);
    if (answerKeyFlashTimeoutRef.current) clearTimeout(answerKeyFlashTimeoutRef.current);
  };

  // ── Final save ──
  const handleFinalSave = async () => {
    setSaving(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const autoQuarterId = quarters.find((q) => q.is_active)?.quarter_id ?? null;

      const { exam_ids } = await createExamWithAssignments(
        { title: titleBase, description: null, curriculum_subject_id: Number(selectedSubjectId), quarter_id: autoQuarterId, exam_date: today, total_items: totalItems },
        selectedSectionIds
      );

      const validObjectives: LearningObjective[] = objectiveRows
        .filter(r => r.objective.trim() && Number(r.start_item) && Number(r.end_item))
        .map(r => ({ objective: r.objective.trim(), start_item: Number(r.start_item), end_item: Number(r.end_item) }));

      const answerKeyData: AnswerKeyJsonb = {
        total_questions: totalItems,
        num_choices: numChoices,
        answers: answers as { [questionNumber: number]: string | null },
      };

      await Promise.all(exam_ids.map(async (id) => {
        if (validObjectives.length > 0) await saveObjectives(id, validObjectives);
        await saveAnswerKey(id, answerKeyData);
      }));

      notifications.show({
        title: 'Examination Created',
        message: exam_ids.length > 1 ? `${exam_ids.length} examinations were created successfully.` : 'Examination was created successfully.',
        color: 'teal', withBorder: true, autoClose: 2500,
      });
      clearDraft();
      router.push(`/exam?newExamIds=${exam_ids.join(',')}`);
    } catch (error) {
      notifications.show({ title: 'Creation Failed', message: (error as Error)?.message || 'Unable to create examination. Please try again.', color: 'red', withBorder: true });
    } finally {
      setSaving(false);
    }
  };

  const nextStep = () => setActiveStep(s => s + 1);
  const prevStep = () => setActiveStep(s => s - 1);
  const neutralFocusStyles = {
    input: {},
  };

  // ── Step content ──
  const renderStep0 = () => (
    <Stack gap="md">
      <Text size="lg" fw={700} c="#4EAE4A">Specify Exam Information</Text>
      <Paper p="lg" withBorder radius="md">
        <Text size="md" fw={700} mb="md" c="#4EAE4A">Exam Details</Text>
        {dataLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              { labelW: 84 },
              { labelW: 56 },
              { labelW: 56 },
            ].map((col, i) => (
              <Stack key={i} gap={6}>
                <Skeleton height={14} width={col.labelW} radius="sm" />
                <Skeleton height={36} radius="sm" />
                <Skeleton height={14} width={0} radius="sm" />
              </Stack>
            ))}
          </div>
        ) : (
          <Stack gap="md">
            {!quarters.some((q) => q.is_active) && (
              <Alert color="orange" icon={<IconAlertTriangle size={16} />} title="No Active Term">
                No term is currently active for this school year. An administrator must activate
                a term before exams can be created.
              </Alert>
            )}
            {(() => {
              const subjectError = duplicateSectionIds.size > 0
                ? 'An examination for this subject already exists for the active term.'
                : '';
              return (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
                  <div className="flex flex-col">
                    <Select
                      label="Grade Level"
                      placeholder="Select grade"
                      required
                      clearable
                      data={filteredGradeLevels
                        .map(g => ({
                          value: String(g.grade_level_id),
                          label: g.display_name,
                          disabled: lockedGradeLevelIds.has(g.grade_level_id),
                        }))
                        .sort((a, b) => Number(a.disabled) - Number(b.disabled))}
                      value={selectedGradeLevelId}
                      onChange={setSelectedGradeLevelId}
                      renderOption={({ option }) =>
                        option.disabled ? (
                          <Tooltip label="All subjects in this grade level already have an exam" position="right" withArrow>
                            <Group gap={6} wrap="nowrap" style={{ width: '100%' }}>
                              <span>{option.label}</span>
                              <IconClipboardCheck size={14} style={{ color: '#aaa', flexShrink: 0 }} />
                            </Group>
                          </Tooltip>
                        ) : (
                          <Group gap={6} wrap="nowrap"><span>{option.label}</span></Group>
                        )
                      }
                    />
                    <Text size="xs" c="red" mt={4} style={{ minHeight: 16 }}>{' '}</Text>
                  </div>
                  <div className="flex flex-col">
                    <MultiSelect
                      label="Section"
                      placeholder={selectedGradeLevelId ? "Select section(s)" : "Select grade level first"}
                      required
                      data={filteredSections
                        .map(s => ({
                          value: String(s.section_id),
                          label: s.name,
                          disabled: lockedSectionIds.has(s.section_id),
                        }))
                        .sort((a, b) => Number(a.disabled) - Number(b.disabled))}
                      value={selectedSectionIds.map(String)}
                      onChange={(values) => setSelectedSectionIds(values.map(Number))}
                      nothingFoundMessage={selectedGradeLevelId ? 'No sections available' : 'Select a grade level first'}
                      disabled={!selectedGradeLevelId || filteredSections.length === 0}
                      renderOption={({ option }) =>
                        option.disabled ? (
                          <Tooltip label="All subjects in this section already have an exam" position="right" withArrow>
                            <Group gap={6} wrap="nowrap" style={{ width: '100%' }}>
                              <span>{option.label}</span>
                              <IconClipboardCheck size={14} style={{ color: '#aaa', flexShrink: 0 }} />
                            </Group>
                          </Tooltip>
                        ) : (
                          <Group gap={6} wrap="nowrap"><span>{option.label}</span></Group>
                        )
                      }
                    />
                    <Text size="xs" c="red" mt={4} style={{ minHeight: 16 }}>{' '}</Text>
                  </div>
                  <div className="flex flex-col">
                    <Select
                      label="Subject"
                      placeholder={selectedSectionIds.length > 0 ? 'Select subject' : 'Select section(s) first'}
                      required
                      clearable
                      data={filteredSubjects
                        .map(s => ({
                          value: String(s.curriculum_subject_id),
                          label: s.name,
                          disabled: occupiedSubjectIds.has(s.curriculum_subject_id),
                        }))
                        .sort((a, b) => Number(a.disabled) - Number(b.disabled))}
                      value={selectedSubjectId}
                      onChange={setSelectedSubjectId}
                      disabled={selectedSectionIds.length === 0}
                      error={Boolean(subjectError)}
                      renderOption={({ option }) => (
                        option.disabled ? (
                          <Tooltip label="An exam already exists for this subject" position="right" withArrow>
                            <Group gap={6} wrap="nowrap" style={{ width: '100%' }}>
                              <span>{option.label}</span>
                              <IconClipboardCheck size={14} style={{ color: '#aaa', flexShrink: 0 }} />
                            </Group>
                          </Tooltip>
                        ) : (
                          <Group gap={6} wrap="nowrap">
                            <span>{option.label}</span>
                          </Group>
                        )
                      )}
                    />
                    <Text size="xs" c="red" mt={4} style={{ minHeight: 16 }}>
                      {subjectError || ' '}
                    </Text>
                  </div>
                </div>
              );
            })()}
            {generatedExamNames.length > 0 && (
              <div>
                <Text size="sm" fw={600} mb={4}>
                  Examination Name{generatedExamNames.length > 1 ? 's' : ''}
                </Text>
                <Paper withBorder p="sm" radius="md" bg="white" style={{ borderColor: 'var(--mantine-color-gray-3)' }}>
                  <Stack gap={6}>
                    {generatedExamNames.map((name, idx) => (
                      <Text key={`${name}-${idx}`} size="sm" fw={600} c="dark" title={name} className="truncate">
                        {name}
                      </Text>
                    ))}
                  </Stack>
                </Paper>
              </div>
            )}
            {selectedSectionIds.length === 0 && filteredSections.length === 0 && (
              <Alert color="yellow" icon={<IconAlertCircle size={16} />}>
                {selectedGradeLevelId ? 'No sections found for selected grade level' : 'Select a grade level first'}
              </Alert>
            )}
          </Stack>
        )}
      </Paper>
    </Stack>
  );

  const renderStep1 = () => (
    <Stack gap="md">
      <Text size="lg" fw={700} c="#4EAE4A">Set Items and Choices</Text>
      <Paper p="lg" withBorder radius="md">
        <Text size="md" fw={700} mb="md" c="#4EAE4A">Exam Configuration</Text>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-white border border-gray-200 rounded-md p-4">
            <p className="text-sm font-semibold text-gray-800 mb-3 text-center">Number of Items</p>
            <div className="flex items-center justify-center gap-3">
              <button type="button" onClick={() => setTotalItems(prev => Math.max(10, prev - 1))} disabled={totalItems <= 10}
                className={`w-10 h-10 rounded-full border flex items-center justify-center transition-all ${totalItems <= 10 ? 'border-gray-200 text-gray-300 bg-gray-50 cursor-not-allowed' : 'border-gray-300 text-gray-700 hover:bg-gray-100 active:scale-95'}`}>
                <IconMinus className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-2">
                <input type="number" min={10} max={200} value={totalItems}
                  onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) setTotalItems(Math.max(10, Math.min(200, v))); }}
                  className="w-20 text-center text-2xl font-bold text-gray-900 border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:border-green-500" />
                <span className="text-sm text-gray-400">items</span>
              </div>
              <button type="button" onClick={() => setTotalItems(prev => Math.min(200, prev + 1))} disabled={totalItems >= 200}
                className={`w-10 h-10 rounded-full border flex items-center justify-center transition-all ${totalItems >= 200 ? 'border-gray-200 text-gray-300 bg-gray-50 cursor-not-allowed' : 'border-gray-300 text-gray-700 hover:bg-gray-100 active:scale-95'}`}>
                <IconPlus className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-gray-500 text-center mt-2">Recommended by grade level (G1-2: 30, G3-4: 40, G5-6: 50)</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-md p-4">
            <p className="text-sm font-semibold text-gray-800 mb-3 text-center">Choices per Item</p>
            <div className="flex items-center justify-center gap-3">
              <button type="button" onClick={() => setNumChoices(prev => Math.max(2, prev - 1))} disabled={numChoices <= 2}
                className={`w-10 h-10 rounded-full border flex items-center justify-center transition-all ${numChoices <= 2 ? 'border-gray-200 text-gray-300 bg-gray-50 cursor-not-allowed' : 'border-gray-300 text-gray-700 hover:bg-gray-100 active:scale-95'}`}>
                <IconMinus className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-2">
                <div className="w-20 text-center py-1.5">
                  <p className="text-2xl font-bold text-gray-900">{numChoices}</p>
                </div>
                <div className="flex flex-col">
                  <span className="text-sm text-gray-400">choices</span>
                  <span className="text-xs font-semibold text-green-600">{ALL_CHOICES.slice(0, numChoices).join(' / ')}</span>
                </div>
              </div>
              <button type="button" onClick={() => setNumChoices(prev => Math.min(8, prev + 1))} disabled={numChoices >= 8}
                className={`w-10 h-10 rounded-full border flex items-center justify-center transition-all ${numChoices >= 8 ? 'border-gray-200 text-gray-300 bg-gray-50 cursor-not-allowed' : 'border-gray-300 text-gray-700 hover:bg-gray-100 active:scale-95'}`}>
                <IconPlus className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-gray-500 text-center mt-2">Min: 2 (A/B) / Max: 8 (A-H)</p>
          </div>
        </div>
      </Paper>
    </Stack>
  );

  const renderStep2 = () => (
    <Stack gap="md">
      <Text size="lg" fw={700} c="#4EAE4A">Set Learning Objectives</Text>
      <Paper p="lg" withBorder radius="md">
        <Text size="md" fw={700} mb="md" c="#4EAE4A">Map Objectives to Items</Text>
        <Stack gap="sm">
          {(() => {
            const remaining = Math.max(totalItems - uniqueCovered, 0);
            const objectiveError = validateObjectives();
            const subtitleClass = objectiveError && triedToSaveObjectives ? 'text-red-600 font-semibold' : 'text-gray-800';
            let subtitle = `${remaining} item${remaining !== 1 ? 's' : ''} remaining`;
            if (!objectiveError && remaining === 0) {
              subtitle = 'Ready to proceed';
            } else if (objectiveError && triedToSaveObjectives) {
              subtitle = hasOverlap
                ? 'Fix overlapping ranges to continue'
                : remaining > 0
                  ? `${remaining} item${remaining > 1 ? 's' : ''} are not mapped to any objective`
                  : 'Complete required objective fields to continue';
            }
            return (
          <div className="bg-white border border-gray-200 rounded-xl p-5 text-center mx-auto w-full max-w-md">
            <p className="text-3xl font-bold text-gray-900">{uniqueCovered}/{totalItems}</p>
            <p className={`text-sm mt-1 ${!objectiveError && remaining === 0 ? 'text-[#2f7f2b]' : subtitleClass}`}>
              {subtitle}
            </p>
          </div>
            );
          })()}
          <Stack gap="xs">
            {objectiveRows.map((row, idx) => {
              const isOverlapping = overlappingRowIds.has(row.id);
              const descriptionMissing = triedToSaveObjectives && !row.objective.trim();
              const startMissing = triedToSaveObjectives && !Number(row.start_item);
              const endMissing = triedToSaveObjectives && !Number(row.end_item);
              const startError = isOverlapping || startMissing;
              const endError = isOverlapping || endMissing ||
                (Number(row.start_item) > 0 && Number(row.end_item) > 0 && Number(row.start_item) > Number(row.end_item));
              const startErrorMessage = isOverlapping ? 'Overlap' : '';
              const endErrorMessage = isOverlapping
                ? 'Overlap'
                : (Number(row.start_item) > 0 && Number(row.end_item) > 0 && Number(row.start_item) > Number(row.end_item)
                  ? 'Must be >= From'
                  : '');
              return (
                <div key={row.id} className={`grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_120px_120px_36px] gap-2 items-start rounded-md px-1 ${idx > 0 ? 'pt-1' : ''}`}>
                  <div className="flex flex-col">
                    <TextInput
                      label="Objective Description"
                      withAsterisk
                      placeholder="e.g. Identify the parts of a plant"
                      value={row.objective}
                      onChange={(e) => updateRow(row.id, 'objective', e.currentTarget.value)}
                      styles={neutralFocusStyles}
                      error={descriptionMissing}
                    />
                    <Text size="xs" c="red" mt={4} style={{ minHeight: 16 }}>
                      {' '}
                    </Text>
                  </div>
                  <div className="flex flex-col">
                    <NumberInput
                      label="From"
                      withAsterisk
                      placeholder="1"
                      min={1}
                      max={totalItems}
                      value={row.start_item === '' ? '' : Number(row.start_item)}
                      onChange={(val) => updateRow(row.id, 'start_item', val)}
                      allowDecimal={false}
                      error={Boolean(startErrorMessage)}
                      styles={neutralFocusStyles}
                    />
                    <Text size="xs" c="red" mt={4} style={{ minHeight: 16 }}>
                      {startErrorMessage || ' '}
                    </Text>
                  </div>
                  <div className="flex flex-col">
                    <NumberInput
                      label="To"
                      withAsterisk
                      placeholder={String(totalItems)}
                      min={1}
                      max={totalItems}
                      value={row.end_item === '' ? '' : Number(row.end_item)}
                      onChange={(val) => updateRow(row.id, 'end_item', val)}
                      allowDecimal={false}
                      error={Boolean(endErrorMessage)}
                      styles={neutralFocusStyles}
                    />
                    <Text size="xs" c="red" mt={4} style={{ minHeight: 16 }}>
                      {endErrorMessage || ' '}
                    </Text>
                  </div>
                  <div className="pt-7">
                    <Tooltip label="Remove objective" withArrow position="top">
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="red"
                        onClick={() => removeRow(row.id)}
                        disabled={objectiveRows.length === 1}
                        aria-label="Remove objective"
                      >
                        <IconX size={14} stroke={1.8} />
                      </ActionIcon>
                    </Tooltip>
                  </div>
                </div>
              );
            })}
          </Stack>
          <Button variant="default" leftSection={<IconPlus size={14} />} onClick={addRow} size="sm">
            Add Objective
          </Button>
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
    const remainingCount = unansweredQuestions.length;
    return (
      <Stack gap="md">
        <Text size="lg" fw={700} c="#4EAE4A">Answer Key</Text>
        <Paper p="lg" withBorder radius="md">
          <Text size="md" fw={700} mb="md" c="#4EAE4A">Set Answer Key</Text>
          <Stack gap="md">
            <div className="bg-white border border-gray-200 rounded-xl p-4 text-center mx-auto w-full max-w-md">
              <p className="text-3xl font-bold text-gray-900">{answeredCount}/{totalItems}</p>
              <p className={`text-sm mt-1 ${
                remainingCount === 0
                  ? 'text-[#2f7f2b]'
                  : triedToSave
                    ? 'text-red-600 font-semibold'
                    : 'text-gray-800'
              }`}>
                {remainingCount === 0
                  ? 'Ready to proceed'
                  : triedToSave
                    ? `${remainingCount} item${remainingCount > 1 ? 's' : ''} need answers to continue`
                    : `${remainingCount} item${remainingCount > 1 ? 's' : ''} remaining`}
              </p>
            </div>
            <Paper
              withBorder
              radius="md"
              p={0}
              style={{ overflow: 'hidden', width: 'fit-content', margin: '0 auto' }}
            >
              <div className="flex flex-col md:flex-row justify-center items-start md:divide-x md:divide-gray-100">
                {[0, 1].map(col => {
                  const start = col === 0 ? 1 : itemsInCol1 + 1;
                  const count = col === 0 ? itemsInCol1 : totalItems - itemsInCol1;
                  if (start > totalItems || count <= 0) return null;
                  return (
                    <div key={col} className="overflow-x-auto">
                      <table className="w-auto border-collapse text-sm">
                      <thead>
                        <tr className="bg-[#4EAE4A]">
                          <th className="h-7 w-8 px-1 text-center text-xs font-semibold text-white whitespace-nowrap">No.</th>
                          {choices.map(option => (
                            <th key={option} className="h-7 w-9 px-1 text-center text-xs font-semibold text-white whitespace-nowrap">
                              {option}
                            </th>
                          ))}
                          <th className="h-7 w-[96px] px-2 text-center text-xs font-semibold text-white whitespace-nowrap">
                            Objective
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {Array.from({ length: count }, (_, row) => {
                          const qNum = start + row;
                          const isUnanswered = triedToSave && !answers[qNum];
                          const unansweredRowClass = isUnanswered ? (isAnswerKeyFlashStrong ? 'bg-red-200' : 'bg-red-50') : '';
                          const unansweredNumClass = isUnanswered ? (isAnswerKeyFlashStrong ? 'text-red-700' : 'text-red-600') : 'text-gray-600';
                          const objIdx = qNumToObjIdx.has(qNum) ? qNumToObjIdx.get(qNum)! : -1;
                          const color = objIdx >= 0 ? OBJECTIVE_PALETTE[objIdx % OBJECTIVE_PALETTE.length] : null;
                          const objRow = objIdx >= 0 ? objectiveRows[objIdx] : null;
                          return (
                            <tr key={qNum} className={`transition-colors duration-500 ${unansweredRowClass}`}>
                              <td className={`py-1 px-1 text-center text-xs font-semibold ${unansweredNumClass}`}>{qNum}</td>
                              {choices.map(option => (
                                <td key={option} className="py-1 px-1 text-center">
                                  <button
                                    type="button"
                                    onClick={() => handleAnswerSelect(qNum, option)}
                                    className={`w-8 h-8 rounded-full border flex items-center justify-center font-bold text-xs transition duration-75 hover:scale-105 ${
                                      answers[qNum] === option
                                        ? 'bg-green-600 border-green-600 text-white'
                                        : isUnanswered
                                          ? (isAnswerKeyFlashStrong
                                            ? 'border-red-500 text-red-700 hover:border-red-600 hover:bg-red-100'
                                            : 'border-red-300 text-red-500 hover:border-red-400 hover:bg-red-50')
                                          : 'border-gray-300 text-gray-500 hover:border-green-500 hover:bg-green-50'
                                    }`}
                                  >
                                    {option}
                                  </button>
                                </td>
                              ))}
                              <td className="py-1 px-2 text-center">
                                <Tooltip
                                  label={objRow?.objective ?? 'Not mapped'}
                                  withArrow
                                  position="top-start"
                                  multiline
                                  w={260}
                                  disabled={!objRow || objRow.objective.length <= 24}
                                  styles={{ tooltip: { wordBreak: 'break-all' } }}
                                >
                                  <span
                                    className="inline-flex h-7 items-center rounded border px-2 text-[10px] font-semibold leading-none w-[96px] overflow-hidden justify-center text-center"
                                    style={color && objRow
                                      ? { background: color.bg, borderColor: color.border, color: color.text }
                                      : { background: '#ffffff', borderColor: '#e5e7eb', color: '#6b7280' }}
                                  >
                                    <span className="block w-full overflow-hidden whitespace-nowrap text-ellipsis">
                                      {objRow?.objective ?? 'Not mapped'}
                                    </span>
                                  </span>
                                </Tooltip>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      </table>
                    </div>
                  );
                })}
              </div>
            </Paper>
            <Group justify="flex-end" mt="xs">
              <Button
                variant="default"
                onClick={handleClearAnswerKey}
                disabled={answeredCount === 0}
              >
                Clear answer key
              </Button>
            </Group>
          </Stack>
        </Paper>
      </Stack>
    );
  };

  const renderStep4 = () => {
    const half = Math.ceil(totalItems / 2);
    const gradeLabel = gradeLevels.find(g => String(g.grade_level_id) === selectedGradeLevelId)?.display_name ?? '-';
    const subjectName = filteredSubjects.find(s => String(s.curriculum_subject_id) === selectedSubjectId)?.name ?? '-';
    const sectionNames = selectedSectionNames.map(n => `Section ${n}`).join(', ');

    const renderTable = (startIdx: number, endIdx: number) => (
      <table className="w-full text-sm table-fixed">
        <thead>
          <tr className="text-xs text-white border-b border-[#3f8f3b] bg-[#4EAE4A]">
            <th className="text-left py-2 px-3 font-semibold w-10">No.</th>
            <th className="text-left py-2 px-3 font-semibold w-14">Answer</th>
            <th className="text-left py-2 px-3 font-semibold">Objective</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {Array.from({ length: endIdx - startIdx }, (_, i) => {
            const qNum = startIdx + i + 1;
            const answer = answers[qNum] ?? '-';
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
                  <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${answer !== '-' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-400'}`}>{answer}</span>
                </td>
                <td className="py-1.5 px-3">
                  {color && objRow ? (
                    <Tooltip
                      label={objRow.objective}
                      withArrow
                      multiline
                      w={220}
                      disabled={objRow.objective.length <= 24}
                      styles={{ tooltip: { wordBreak: 'break-all' } }}
                    >
                      <span
                        className="inline-block max-w-full truncate px-2 py-0.5 rounded text-xs font-medium border"
                        style={{ background: color.bg, borderColor: color.border, color: color.text }}
                      >
                        {objRow.objective}
                      </span>
                    </Tooltip>
                  ) : <span className="text-xs text-gray-300">-</span>}
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
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {[
                ['Exam Name', generatedExamNames.join('\n')],
                ['Items', String(totalItems)],
                ['Choices', `${numChoices} (${ALL_CHOICES.slice(0, numChoices).join('/')})`],
              ].map(([label, value]) => (
                <div key={label}>
                  <Text size="sm" fw={700} mb={2}>
                    {label}
                  </Text>
                  <Text size="sm" style={{ whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>
                    {value}
                  </Text>
                </div>
              ))}
            </div>
            <Paper withBorder radius="md" p={0} style={{ overflow: 'hidden' }}>
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

  const showValidationNotification = (message: string) => {
    notifications.show({
      title: 'Please complete required fields',
      message,
      color: 'yellow',
      withBorder: true,
      icon: <IconAlertTriangle size={16} />,
    });
  };

  const handleNext = () => {
    if (activeStep === 0) {
      if (dataLoading) {
        showValidationNotification('Please wait while required data is still loading.');
        return;
      }
      if (!quarters.some((q) => q.is_active)) {
        showValidationNotification('No active quarter found. Please activate a quarter first.');
        return;
      }
      if (!selectedGradeLevelId) {
        showValidationNotification('Grade level is required.');
        return;
      }
      if (!selectedSubjectId) {
        showValidationNotification('Subject is required.');
        return;
      }
      if (selectedSectionIds.length === 0) {
        showValidationNotification('Please select at least one section.');
        return;
      }
      if (duplicateSectionIds.size > 0) {
        showValidationNotification('An exam already exists for one or more selected sections in the active quarter.');
        return;
      }
      nextStep();
    } else if (activeStep === 2) {
      setTriedToSaveObjectives(true);
      const err = validateObjectives();
      if (err) {
        showValidationNotification(err);
        return;
      }
      nextStep();
    } else if (activeStep === 3) {
      if (!isAnswerKeyComplete) {
        setTriedToSave(true);
        triggerAnswerKeyMissingFlash();
        const missingCount = unansweredQuestions.length;
        showValidationNotification(
          missingCount > 0
            ? `Answer key is incomplete. ${missingCount} item${missingCount > 1 ? 's are' : ' is'} missing.`
            : 'Answer key is incomplete.',
        );
        return;
      }
      nextStep();
    } else {
      nextStep();
    }
  };

  const resetAndExit = () => {
    setSelectedGradeLevelId(null);
    setSelectedSubjectId(null);
    setSelectedSectionIds([]);
    setTotalItems(30);
    setNumChoices(4);
    setObjectiveRows([makeRow()]);
    setAnswers({});
    setActiveStep(0);
    setTriedToSave(false);
    setTriedToSaveObjectives(false);
    gradeLevelMountedRef.current = false;
    totalItemsMountedRef.current = false;
    prevGradeLevelForItemsRef.current = null;
    draftRef.current = null;
    clearDraft();
    router.push('/exam');
  };

  const mobileConfirmModalProps = isMobile
    ? {
        styles: {
          inner: { alignItems: 'flex-end', paddingBottom: '20px' },
          content: {
            width: '100%',
            maxWidth: '100%',
            borderRadius: '12px 12px 0 0',
          },
        },
      }
    : {};

  const handleCancel = () => {
    const defaultObjectiveRow = objectiveRows[0];
    const hasObjectiveProgress = objectiveRows.length > 1 || Boolean(
      defaultObjectiveRow &&
      (
        defaultObjectiveRow.objective.trim().length > 0 ||
        defaultObjectiveRow.start_item !== '' ||
        defaultObjectiveRow.end_item !== ''
      ),
    );

    const hasInProgressChanges =
      activeStep > 0 ||
      Boolean(selectedGradeLevelId) ||
      Boolean(selectedSubjectId) ||
      selectedSectionIds.length > 0 ||
      totalItems !== 30 ||
      numChoices !== 4 ||
      hasObjectiveProgress ||
      Object.keys(answers).length > 0;

    if (!hasInProgressChanges) {
      resetAndExit();
      return;
    }

    modals.openConfirmModal({
      title: 'Discard changes?',
      children: (
        <Text size="sm">
          You have unsaved changes. Are you sure you want to leave?
        </Text>
      ),
      labels: { confirm: 'Discard', cancel: 'Stay' },
      confirmProps: { color: 'red' },
      onConfirm: resetAndExit,
      ...mobileConfirmModalProps,
    });
  };

  const stepDescriptions = [
    { label: 'Step 1', description: 'Specify Exam Information' },
    { label: 'Step 2', description: 'Set Items and Choices' },
    { label: 'Step 3', description: 'Set Learning Objectives' },
    { label: 'Step 4', description: 'Set Answer Key' },
    { label: 'Step 5', description: 'Review and Create' },
  ];

  const stepContent = [renderStep0, renderStep1, renderStep2, renderStep3, renderStep4];

  const isFinalStep = activeStep === 4;
  const navigationButtons = (
    <WizardNavigationButtons
      onCancel={handleCancel}
      showPrevious={activeStep > 0}
      onPrevious={prevStep}
      onPrimary={isFinalStep ? handleFinalSave : handleNext}
      primaryLabel={isFinalStep ? 'Create Examination' : 'Next'}
      primaryDisabled={false}
      primaryLoading={isFinalStep ? saving : false}
    />
  );

  if (!dataLoading && (hasActiveSchoolYear === false || !quarters.some((q) => q.is_active))) {
    return (
      <>
        <h1 className="text-3xl font-bold mb-6 text-[#597D37]">Create Examination</h1>
        <NoActivePeriodBanner />
      </>
    );
  }

  return (
    <>
      <h1 className="text-3xl font-bold mb-6 text-[#597D37]">Create Examination</h1>
      <Container fluid py={{ base: 'md', sm: 'xl' }} px={{ base: 0, sm: 'md' }} h="100%">
        {isMobile ? (
          <Stack gap="md">
            <Stepper active={activeStep} color="#4EAE4A" orientation="vertical">
              {stepDescriptions.map((s, i) => (
                <Stepper.Step key={i} label={s.label} description={s.description}>
                  {activeStep === i ? stepContent[i]() : null}
                </Stepper.Step>
              ))}
            </Stepper>
            {navigationButtons}
          </Stack>
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
            <div style={{ flex: 1, minWidth: 0 }}>
              {stepContent[activeStep]()}
              {navigationButtons}
            </div>
          </div>
        )}
      </Container>
    </>
  );
}

