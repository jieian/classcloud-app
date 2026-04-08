'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  Container, Stepper, Button, Group, Text, rem, Paper, Stack,
  MultiSelect, Alert, Loader,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import {
  IconPlus,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { fetchActiveSections } from '@/lib/services/sectionService';
import { fetchTeacherClassAssignments } from '@/lib/services/classService';
import { fetchSubjectsWithGradeLevels, type SubjectWithGradeLevel } from '@/lib/services/subjectService';
import { createExamWithAssignments, fetchExamById } from '@/lib/services/examService';
import type { Section, ExamWithRelations } from '@/lib/exam-supabase';
import { useAuth } from '@/context/AuthContext';

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

export default function CopyExamPage() {
  const router = useRouter();
  const params = useParams();
  const examId = Number(params.examId);
  const { user, permissions } = useAuth();
  const hasFullAccess = permissions.includes('exams.full_access');
  const isMobile = useMediaQuery('(max-width: 768px)');

  // Draft persistence (keyed by examId so copying different exams doesn't mix)
  const draftKey = `exam_copy_draft_${examId}`;
  const draftRef = useRef<{ step: number; sectionIds: number[] } | null | undefined>(undefined);
  if (draftRef.current === undefined) {
    try {
      const raw = typeof window !== 'undefined' ? sessionStorage.getItem(draftKey) : null;
      draftRef.current = raw ? JSON.parse(raw) : null;
    } catch { draftRef.current = null; }
  }
  const d = draftRef.current;

  const [activeStep, setActiveStep] = useState(d?.step ?? 0);
  const [saving, setSaving] = useState(false);

  // Reference data
  const [allSections, setAllSections] = useState<Section[]>([]);
  const [subjects, setSubjects] = useState<SubjectWithGradeLevel[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [assignments, setAssignments] = useState<any[]>([]);

  // Original exam data
  const [originalExam, setOriginalExam] = useState<ExamWithRelations | null>(null);

  // Step 0 — Select Sections
  const [selectedSectionIds, setSelectedSectionIds] = useState<number[]>(d?.sectionIds ?? []);

  // Save draft whenever step or sections change
  useEffect(() => {
    try { sessionStorage.setItem(draftKey, JSON.stringify({ step: activeStep, sectionIds: selectedSectionIds })); }
    catch { /* ignore */ }
  }, [activeStep, selectedSectionIds, draftKey]);

  useEffect(() => {
    if (!Number.isFinite(examId)) return;
    const load = async () => {
      const [sec, subs, exam] = await Promise.all([
        fetchActiveSections(),
        fetchSubjectsWithGradeLevels(),
        fetchExamById(examId),
      ]);

      if (!exam) {
        notifications.show({ title: 'Error', message: 'Exam not found', color: 'red' });
        router.push('/exam');
        return;
      }

      setAllSections(sec);
      setSubjects(subs);
      setOriginalExam(exam);

      if (user?.id) {
        const assignmentsData = await fetchTeacherClassAssignments(user.id);
        setAssignments(assignmentsData);
      } else {
        setAssignments([]);
      }

      setDataLoading(false);
    };
    load();
  }, [examId, user?.id, hasFullAccess, router]);

  // Derive the grade level of the original exam from its assigned sections.
  const originalGradeLevelId = (() => {
    if (!originalExam) return null;
    for (const a of (originalExam.exam_assignments ?? [])) {
      const sec = allSections.find(s => s.section_id === a.sections?.section_id);
      if (sec?.grade_level_id) return sec.grade_level_id;
    }
    return null;
  })();

  const originalSubjectName = originalExam?.curriculum_subjects?.subjects?.name ?? null;

  const filteredSections = allSections.filter(s => {
    if (!originalExam?.curriculum_subject_id) return false;

    return assignments.some(a => {
      if (a.section_id !== s.section_id) return false;

      // Primary: exact curriculum_subject match
      if (a.curriculum_subject_id === originalExam.curriculum_subject_id) return true;

      // Fallback: same subject name + same grade level
      if (!originalSubjectName || !originalGradeLevelId) return false;
      const sub = subjects.find(sub => sub.subject_id === a.subject_id);
      return sub?.name === originalSubjectName && sub?.grade_level_id === originalGradeLevelId;
    });
  });

  const sectionOptions = filteredSections.map(s => ({
    value: String(s.section_id),
    label: s.name,
  }));

  const selectedSectionNames = selectedSectionIds.map(id => {
    const section = allSections.find(s => s.section_id === id);
    return section?.name ?? '';
  });

  const canGoStep1 = selectedSectionIds.length > 0;

  const nextStep = () => setActiveStep((current) => (current < 1 ? current + 1 : current));
  const prevStep = () => setActiveStep((current) => (current > 0 ? current - 1 : current));

  const handleNext = () => {
    if (activeStep === 0) {
      if (!canGoStep1) return;
      nextStep();
    }
  };

  const stepDescriptions = [
    { label: 'Step 1', description: 'Select sections' },
    { label: 'Step 2', description: 'Review and copy' },
  ];

  const renderStep0 = () => (
    <Stack gap="md">
      <Text size="lg" fw={700} c="#4EAE4A">Select Sections</Text>
      <Paper p="lg" withBorder radius="md">
        <Text size="md" fw={700} mb="md" c="#4EAE4A">Copy Exam to New Sections</Text>
        <Text size="sm" c="dimmed" mb="md">
          Select the sections where you want to copy this exam. Only sections you are assigned to will be available.
        </Text>
        <MultiSelect
          label="Sections"
          placeholder="Select sections"
          data={sectionOptions}
          value={selectedSectionIds.map(String)}
          onChange={(values) => setSelectedSectionIds(values.map(Number))}
          searchable
          clearable
          required
          hidePickedOptions
          comboboxProps={{ dropdownPadding: 0 }}
          onOptionSubmit={() => {
            // Close the dropdown after each selection so it doesn't cover the buttons
            document.activeElement instanceof HTMLElement && document.activeElement.blur();
          }}
        />
        {!canGoStep1 && (
          <Alert icon={<IconPlus size={16} />} title="Selection Required" color="blue" mt="md">
            Please select at least one section to copy the exam to.
          </Alert>
        )}
      </Paper>
    </Stack>
  );

  const renderStep1 = () => {
    if (!originalExam) return <Loader />;

    const half = Math.ceil(originalExam.total_items / 2);
    const gradeLabel = originalExam.exam_assignments?.[0]?.sections?.grade_levels?.display_name ?? '—';
    const subjectName = originalExam.curriculum_subjects?.subjects?.name ?? '—';
    const sectionNames = selectedSectionNames.map(n => `Section ${n}`).join(', ');

    const answers = originalExam.answer_key?.answers ?? {};
    const objectives = originalExam.objectives ?? [];

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
            const objRow = objectives.find(o => {
              const s = Number(o.start_item); const e = Number(o.end_item);
              return s && e && qNum >= s && qNum <= e;
            });
            const objIdx = objRow ? objectives.indexOf(objRow) : -1;
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
        <Text size="lg" fw={700} c="#4EAE4A">Review & Copy</Text>
        <Paper p="lg" withBorder radius="md">
          <Text size="md" fw={700} mb="md" c="#4EAE4A">Exam Summary</Text>
          <Stack gap="md">
            <div className="text-center pb-2">
              <div className="text-4xl mb-2">📋</div>
              <h3 className="text-xl font-bold text-gray-900">Ready to Copy!</h3>
              <p className="text-gray-500 text-sm mt-0.5">Review the exam details below, then hit Copy Exam.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {[
                ['Original Exam', originalExam.title],
                ['Grade', gradeLabel],
                ['Subject', subjectName],
                ['New Section(s)', sectionNames],
                ['Items', String(originalExam.total_items)],
                ['Choices', `${originalExam.answer_key?.num_choices ?? 4} (${['A','B','C','D','E','F','G','H'].slice(0, originalExam.answer_key?.num_choices ?? 4).join('·')})`],
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
                <div className="overflow-x-auto">{renderTable(half, originalExam.total_items)}</div>
              </div>
            </Paper>
          </Stack>
        </Paper>
      </Stack>
    );
  };

  const stepContent = [renderStep0, renderStep1];

  const handleFinalCopy = async () => {
    if (!originalExam) return;

    setSaving(true);
    try {
      const payload = {
        title: `${originalExam.title} (Copy)`,
        total_items: originalExam.total_items,
        exam_date: new Date().toISOString().split('T')[0], // Today
        curriculum_subject_id: originalExam.curriculum_subject_id,
        quarter_id: originalExam.quarter_id,
        description: originalExam.description,
        creator_teacher_id: user?.id,
      };

      const result = await createExamWithAssignments(payload, selectedSectionIds);

      if (!result) throw new Error('Failed to create exam');

      // Copy answer key if exists
      if (originalExam.answer_key) {
        const { saveAnswerKey } = await import('@/lib/services/examService');
        await saveAnswerKey(result.exam_id, originalExam.answer_key);
      }

      // Copy learning objectives if exist
      if (originalExam.objectives && originalExam.objectives.length > 0) {
        const { saveObjectives } = await import('@/lib/services/examService');
        const sanitizedObjectives = originalExam.objectives
          .map(o => ({
            objective: o.objective,
            start_item: Number(o.start_item),
            end_item: Number(o.end_item),
          }))
          .filter(o => o.objective?.trim() && o.start_item > 0 && o.end_item > 0);
        if (sanitizedObjectives.length > 0) {
          await saveObjectives(result.exam_id, sanitizedObjectives);
        }
      }

      notifications.show({
        title: 'Success',
        message: 'Exam copied successfully!',
        color: 'green',
      });

      try { sessionStorage.removeItem(draftKey); } catch { /* ignore */ }
      router.push(`/exam?newExamId=${result.exam_id}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      notifications.show({
        title: 'Copy Failed',
        message,
        color: 'red',
      });
    } finally {
      setSaving(false);
    }
  };

  const navigationButtons = (
    <Group justify="flex-end" mt="xl">
      <Button variant="default" onClick={() => {
        if (activeStep === 0) { try { sessionStorage.removeItem(draftKey); } catch { /* ignore */ } router.push('/exam'); }
        else prevStep();
      }}>
        {activeStep === 0 ? 'Cancel' : 'Previous'}
      </Button>
      {activeStep < 1 ? (
        <Button
          onClick={handleNext}
          disabled={!canGoStep1}
          style={!canGoStep1 ? undefined : { backgroundColor: '#4EAE4A' }}
        >
          Next
        </Button>
      ) : (
        <Button onClick={handleFinalCopy} loading={saving} style={{ backgroundColor: '#4EAE4A' }}>
          Copy Exam
        </Button>
      )}
    </Group>
  );

  if (dataLoading) {
    return (
      <Container fluid py="xl">
        <Group justify="center">
          <Loader size="lg" />
        </Group>
      </Container>
    );
  }

  return (
    <>
      <h1 className="text-3xl font-bold mb-6 text-[#597D37]">Copy Examination</h1>
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
      </Container>
    </>
  );
}