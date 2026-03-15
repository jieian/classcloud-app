'use client';

import { useState, useEffect } from 'react';
import {
  Modal, TextInput, Select, Button, Stack, Group, Paper, Text, Alert, Loader,
} from '@mantine/core';
import { IconCheck, IconLink, IconAlertCircle, IconMinus, IconPlus } from '@tabler/icons-react';
import { fetchSubjectsWithGradeLevels, SubjectWithGradeLevel } from '@/lib/services/subjectService';
import { fetchActiveSections } from '@/lib/services/sectionService';
import { fetchGradeLevels } from '@/lib/services/gradeLevelService';
import { fetchTeacherClassAssignments } from '@/app/(app)/school/classes/_lib/classService';
import { useAuth } from '@/context/AuthContext';
import type { Section, GradeLevel } from '@/lib/exam-supabase';
import CreationFlowStepper from './CreationFlowStepper';

const ALL_CHOICES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

export interface ExamDraft {
  examName: string;
  gradeLevelId: string | null;
  subjectId: string | null;
  sectionIds: number[];
  totalItems: number;
  numChoices: number;
}

export const EXAM_DRAFT_KEY = 'exam_creation_draft';

function getAutoTotalItems(levelNumber: number | null | undefined): number {
  if (!levelNumber) return 30;
  if (levelNumber <= 2) return 30;
  if (levelNumber <= 4) return 40;
  if (levelNumber <= 6) return 50;
  return 50;
}

interface CreateExamModalProps {
  onClose: () => void;
  onProceed: (draft: ExamDraft) => void;
  initialDraft?: ExamDraft | null;
  existingTitles?: string[];
}

export default function CreateExamModal({ onClose, onProceed, initialDraft, existingTitles = [] }: CreateExamModalProps) {
  const { user, permissions } = useAuth();
  const hasFullAccess = permissions.includes('exams.full_access');

  const [step, setStep] = useState(0);

  // Step 0
  const [examName, setExamName] = useState(initialDraft?.examName ?? '');
  const [selectedGradeLevelId, setSelectedGradeLevelId] = useState<string | null>(initialDraft?.gradeLevelId ?? null);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(initialDraft?.subjectId ?? null);
  const [selectedSectionIds, setSelectedSectionIds] = useState<number[]>(initialDraft?.sectionIds ?? []);

  // Step 1
  const [totalItems, setTotalItems] = useState(initialDraft?.totalItems ?? 30);
  const [numChoices, setNumChoices] = useState(initialDraft?.numChoices ?? 4);

  // Reference data
  const [gradeLevels, setGradeLevels] = useState<GradeLevel[]>([]);
  const [subjects, setSubjects] = useState<SubjectWithGradeLevel[]>([]);
  const [allSections, setAllSections] = useState<Section[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [allowedSectionIds, setAllowedSectionIds] = useState<Set<number> | null>(null);
  const [allowedSubjectIds, setAllowedSubjectIds] = useState<Set<number> | null>(null);

  useEffect(() => {
    const baseLoad = Promise.all([
      fetchGradeLevels(),
      fetchSubjectsWithGradeLevels(),
      fetchActiveSections(),
    ]).then(([gl, sub, sec]) => {
      setGradeLevels(gl);
      setSubjects(sub);
      setAllSections(sec);
    });

    const assignmentLoad = !hasFullAccess && user?.id
      ? fetchTeacherClassAssignments(user.id).then((assignments) => {
          setAllowedSectionIds(new Set(assignments.map((a) => a.section_id)));
          setAllowedSubjectIds(new Set(assignments.map((a) => a.subject_id)));
        })
      : Promise.resolve();

    Promise.all([baseLoad, assignmentLoad]).then(() => setDataLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (initialDraft) return; // don't reset if restoring draft
    setSelectedSectionIds([]);
    setSelectedSubjectId(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGradeLevelId]);

  useEffect(() => {
    if (initialDraft) return;
    const gradeLevel = gradeLevels.find(g => g.grade_level_id === Number(selectedGradeLevelId)) ?? null;
    setTotalItems(getAutoTotalItems(gradeLevel?.level_number));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGradeLevelId, gradeLevels]);

  const allowedGradeLevelIds = allowedSectionIds
    ? new Set(allSections.filter(s => s.grade_level_id !== null && allowedSectionIds.has(s.section_id)).map(s => s.grade_level_id as number))
    : null;

  const filteredGradeLevels = gradeLevels.filter(g => !allowedGradeLevelIds || allowedGradeLevelIds.has(g.grade_level_id));

  const filteredSections = allSections
    .filter(s => !selectedGradeLevelId || s.grade_level_id === Number(selectedGradeLevelId))
    .filter(s => !allowedSectionIds || allowedSectionIds.has(s.section_id));

  const selectedSectionTypes = new Set(
    filteredSections.filter(s => selectedSectionIds.includes(s.section_id)).map(s => s.section_type).filter(Boolean)
  );
  const activeSectionType = selectedSectionTypes.size === 1 ? [...selectedSectionTypes][0] : null;

  useEffect(() => {
    if (!activeSectionType || !selectedSubjectId) return;
    const isValid = subjects.some(s => String(s.subject_id) === selectedSubjectId && (s.section_type === null || s.section_type === activeSectionType));
    if (!isValid) setSelectedSubjectId(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSectionType]);

  const filteredSubjects = Array.from(
    new Map(
      subjects
        .filter(s => !selectedGradeLevelId || s.grade_level_id === Number(selectedGradeLevelId))
        .filter(s => !allowedSubjectIds || allowedSubjectIds.has(s.subject_id))
        .filter(s => !activeSectionType || s.section_type === null || s.section_type === activeSectionType)
        .map(s => [s.subject_id, s] as const)
    ).values()
  );

  const selectedSectionNames = filteredSections.filter(s => selectedSectionIds.includes(s.section_id)).map(s => s.name);

  const isDuplicateName = examName.trim().length > 0 &&
    existingTitles.some(t => t.trim().toLowerCase() === examName.trim().toLowerCase());

  const canGoStep1 = examName.trim().length > 0 && !isDuplicateName && Boolean(selectedGradeLevelId) && Boolean(selectedSubjectId) && selectedSectionIds.length > 0;

  const toggleSection = (sectionId: number) => {
    setSelectedSectionIds(prev => prev.includes(sectionId) ? prev.filter(id => id !== sectionId) : [...prev, sectionId]);
  };

  const handleProceed = () => {
    onProceed({
      examName,
      gradeLevelId: selectedGradeLevelId,
      subjectId: selectedSubjectId,
      sectionIds: selectedSectionIds,
      totalItems,
      numChoices,
    });
  };

  return (
    <Modal
      opened
      onClose={onClose}
      title="Create Examination"
      size="lg"
      overlayProps={{ backgroundOpacity: 0.5, blur: 4 }}
    >
      <Stack gap="md">
        <CreationFlowStepper activeStep={0} />

        <Alert color="blue" icon={<IconAlertCircle size={16} />}>
          New exam will be set to <Text span fw={600} c="green">Active</Text> automatically
        </Alert>

        {/* ── Step 0: Exam Details ── */}
        {step === 0 && (
          dataLoading ? (
            <Group justify="center" py="xl"><Loader /></Group>
          ) : (
            <>
              <TextInput
                label="Examination Name"
                placeholder="e.g., Mid-term Examination"
                required
                value={examName}
                onChange={(e) => setExamName(e.currentTarget.value)}
                error={isDuplicateName ? 'An examination with this name already exists. Please use a different name.' : undefined}
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
                <Select
                  label="Subject"
                  placeholder="Select subject"
                  required
                  data={filteredSubjects.map(s => ({ value: String(s.subject_id), label: s.name }))}
                  value={selectedSubjectId}
                  onChange={setSelectedSubjectId}
                  color="#4EAE4A"
                />
              </Group>

              <div>
                <Text size="sm" fw={500} mb={4}>
                  Section <Text span c="red">*</Text>{' '}
                  <Text span c="dimmed" fw={400}>(select one or more)</Text>
                </Text>
                <Text size="xs" c="dimmed" mb="sm">
                  A separate exam record will be created per section, but they will all <strong>share one answer key</strong>
                </Text>

                {filteredSections.length === 0 ? (
                  <Alert color="yellow" icon={<IconAlertCircle size={16} />}>
                    {selectedGradeLevelId ? 'No sections found for selected grade level' : 'Select a grade level first'}
                  </Alert>
                ) : (
                  <Group gap="xs">
                    {filteredSections.map(section => {
                      const isSelected = selectedSectionIds.includes(section.section_id);
                      return (
                        <Button key={section.section_id} variant={isSelected ? 'filled' : 'default'} size="sm"
                          leftSection={isSelected ? <IconCheck size={14} /> : null}
                          onClick={() => toggleSection(section.section_id)}>
                          Section {section.name}
                        </Button>
                      );
                    })}
                  </Group>
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
                {selectedSectionIds.length === 0 && filteredSections.length > 0 && (
                  <Text size="xs" c="red" mt="xs">Please select at least one section</Text>
                )}
              </div>

              <Group justify="flex-end" mt="md">
                <Button variant="default" onClick={onClose}>Cancel</Button>
                <Button color="#4EAE4A" onClick={() => setStep(1)} disabled={!canGoStep1 || dataLoading}>Next</Button>
              </Group>
            </>
          )
        )}

        {/* ── Step 1: Items + Choices ── */}
        {step === 1 && (
          <>
            <div className="grid grid-cols-2 gap-4">
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
                      className="w-20 text-center text-2xl font-bold text-gray-900 border-2 border-gray-300 rounded-xl px-2 py-1.5 focus:outline-none focus:border-primary" />
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
                      <span className="text-xs font-semibold text-primary">{ALL_CHOICES.slice(0, numChoices).join(' · ')}</span>
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

            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={() => setStep(0)}>Back</Button>
              <Button color="#4EAE4A" onClick={handleProceed}>Next</Button>
            </Group>
          </>
        )}
      </Stack>
    </Modal>
  );
}
