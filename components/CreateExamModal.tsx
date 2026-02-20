'use client';

import { useState, useEffect } from 'react';
import { Modal, TextInput, Select, Button, Stack, Group, Paper, Text, Badge, Alert, Loader } from '@mantine/core';
import { IconCheck, IconLink, IconAlertCircle } from '@tabler/icons-react';
import Image from 'next/image';
import { notifications } from '@mantine/notifications';
import { fetchSubjects } from '@/lib/services/subjectService';
import { fetchActiveQuarters } from '@/lib/services/quarterService';
import { fetchActiveSections } from '@/lib/services/sectionService';
import { fetchGradeLevels } from '@/lib/services/gradeLevelService';
import { createExamWithAssignments } from '@/lib/services/examService';
import type { Subject, Section, GradeLevel, Quarter } from '@/lib/exam-supabase';

interface CreateExamModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreateExamModal({ onClose, onSuccess }: CreateExamModalProps) {
  const [examName, setExamName] = useState('');
  const [selectedGradeLevelId, setSelectedGradeLevelId] = useState<string | null>(null);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [selectedSectionIds, setSelectedSectionIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);

  const [gradeLevels, setGradeLevels] = useState<GradeLevel[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [allSections, setAllSections] = useState<Section[]>([]);
  const [quarters, setQuarters] = useState<Quarter[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchGradeLevels(),
      fetchSubjects(),
      fetchActiveSections(),
      fetchActiveQuarters(),
    ]).then(([gl, sub, sec, q]) => {
      setGradeLevels(gl);
      setSubjects(sub);
      setAllSections(sec);
      setQuarters(q);
      setDataLoading(false);
    });
  }, []);

  useEffect(() => {
    setSelectedSectionIds([]);
  }, [selectedGradeLevelId]);

  const filteredSections = selectedGradeLevelId
    ? allSections.filter(s => s.grade_level_id === Number(selectedGradeLevelId))
    : allSections;

  const toggleSection = (sectionId: number) => {
    setSelectedSectionIds(prev =>
      prev.includes(sectionId) ? prev.filter(id => id !== sectionId) : [...prev, sectionId]
    );
  };

  const handleSubmit = async () => {
    if (!examName.trim()) { notifications.show({ title: 'Error', message: 'Enter exam name', color: 'red' }); return; }
    if (!selectedGradeLevelId) { notifications.show({ title: 'Error', message: 'Select grade level', color: 'red' }); return; }
    if (!selectedSubjectId) { notifications.show({ title: 'Error', message: 'Select subject', color: 'red' }); return; }
    if (selectedSectionIds.length === 0) { notifications.show({ title: 'Error', message: 'Select at least one section', color: 'red' }); return; }

    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const autoQuarterId = quarters.length > 0 ? quarters[0].quarter_id : null;

      const result = await createExamWithAssignments(
        {
          title: examName.trim(),
          description: null,
          subject_id: Number(selectedSubjectId),
          quarter_id: autoQuarterId,
          exam_date: today,
          total_items: 30,
        },
        selectedSectionIds
      );

      if (!result) throw new Error('Failed');

      notifications.show({ title: 'Success', message: 'Exam created', color: 'green' });
      onSuccess();
      onClose();
    } catch {
      notifications.show({ title: 'Error', message: 'Failed to create exam', color: 'red' });
    } finally {
      setLoading(false);
    }
  };

  const selectedSectionNames = filteredSections
    .filter(s => selectedSectionIds.includes(s.section_id))
    .map(s => s.name);

  return (
    <Modal opened onClose={onClose} title="Create Examination" size="lg">
      <Stack gap="md">
        <Alert color="blue" icon={<IconAlertCircle size={16} />}>
          New exam will be set to <Text span fw={600} c="green">Active</Text> automatically
        </Alert>

        {dataLoading ? (
          <Group justify="center" py="xl">
            <Loader />
          </Group>
        ) : (
          <>
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
                data={gradeLevels.map(g => ({ value: String(g.grade_level_id), label: g.display_name }))}
                value={selectedGradeLevelId}
                onChange={setSelectedGradeLevelId}
              />
              <Select
                label="Subject"
                placeholder="Select subject"
                required
                data={subjects.map(s => ({ value: String(s.subject_id), label: s.name }))}
                value={selectedSubjectId}
                onChange={setSelectedSubjectId}
              />
            </Group>

            <div>
              <Text size="sm" fw={500} mb={4}>
                Section <Text span c="red">*</Text> <Text span c="dimmed" fw={400}>(select one or more)</Text>
              </Text>
              <Text size="xs" c="dimmed" mb="sm">
                A separate exam record will be created per section, but they will all <strong>share one answer key</strong>
              </Text>

              {filteredSections.length === 0 ? (
                <Alert color="yellow" icon={<IconAlertCircle size={16} />}>
                  {selectedGradeLevelId
                    ? 'No sections found for selected grade level'
                    : 'Select a grade level first'}
                </Alert>
              ) : (
                <Group gap="xs">
                  {filteredSections.map(section => {
                    const isSelected = selectedSectionIds.includes(section.section_id);
                    return (
                      <Button
                        key={section.section_id}
                        variant={isSelected ? 'filled' : 'default'}
                        size="sm"
                        leftSection={isSelected ? <IconCheck size={14} /> : null}
                        onClick={() => toggleSection(section.section_id)}
                      >
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
                  <Text size="xs">
                    <Text span fw={600}>1 exam</Text> will be created for Section {selectedSectionNames[0]}
                  </Text>
                </Paper>
              )}

              {selectedSectionIds.length === 0 && filteredSections.length > 0 && (
                <Text size="xs" c="red" mt="xs">Please select at least one section</Text>
              )}
            </div>

            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={onClose} disabled={loading}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                loading={loading}
                disabled={selectedSectionIds.length === 0}
              >
                {selectedSectionIds.length > 1
                  ? `Create ${selectedSectionIds.length} Examinations`
                  : 'Create Examination'}
              </Button>
            </Group>
          </>
        )}
      </Stack>
    </Modal>
  );
}
