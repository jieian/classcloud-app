'use client';

import { useState, useEffect } from 'react';
import {
  Container, Title, Text, Card, TextInput, Select, Button, Badge, Group, Stack,
  Grid, ActionIcon, Menu, Loader, Alert, Paper, Divider, Box
} from '@mantine/core';
import {
  IconSearch, IconPlus, IconFileText, IconDownload, IconEdit, IconTrash,
  IconAlertCircle, IconRefreshDot, IconDots, IconEye
} from '@tabler/icons-react';
import Image from 'next/image';
import { notifications } from '@mantine/notifications';
import CreateExamModal from '@/components/CreateExamModal';
import CreateAnswerKeyModal from '@/components/CreateAnswerKeyModal';
import ScanPapersModal from '@/components/ScanPapersModal';
import ItemAnalysisModal from '@/components/ItemAnalysisModal';
import { generateAnswerSheetPdf } from '@/lib/services/examPdfService';
import { fetchExamsWithRelations, setExamLocked, deleteExamWithAssignments } from '@/lib/services/examService';
import type { ExamWithRelations } from '@/lib/exam-supabase';

export default function ExamPageClient() {
  const [exams, setExams] = useState<ExamWithRelations[]>([]);
  const [filteredExams, setFilteredExams] = useState<ExamWithRelations[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSection, setSelectedSection] = useState<string | null>('All');
  const [selectedSubject, setSelectedSubject] = useState<string | null>('All');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isAnswerKeyModalOpen, setIsAnswerKeyModalOpen] = useState(false);
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);
  const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);
  const [selectedExam, setSelectedExam] = useState<ExamWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<number | null>(null);

  const fetchExams = async () => {
    setLoading(true);
    setDbError(null);
    try {
      const data = await fetchExamsWithRelations();
      setExams(data);
    } catch (error: unknown) {
      setDbError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchExams(); }, []);

  const sectionOptions = ['All', ...Array.from(new Set(
    exams.flatMap(e => (e.exam_assignments ?? []).map(a => a.sections?.name).filter(Boolean) as string[])
  ))];

  const subjectOptions = ['All', ...Array.from(new Set(
    exams.map(e => e.subjects?.name).filter(Boolean) as string[]
  ))];

  useEffect(() => {
    let filtered = [...exams];
    if (searchQuery) {
      filtered = filtered.filter(e => e.title.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    if (selectedSection !== 'All') {
      filtered = filtered.filter(e =>
        (e.exam_assignments ?? []).some(a => a.sections?.name === selectedSection)
      );
    }
    if (selectedSubject !== 'All') {
      filtered = filtered.filter(e => e.subjects?.name === selectedSubject);
    }
    setFilteredExams(filtered);
  }, [exams, searchQuery, selectedSection, selectedSubject]);

  const handleStatusChange = async (exam: ExamWithRelations, newStatus: 'active' | 'closed') => {
    setUpdatingStatus(exam.exam_id);
    const isLocked = newStatus === 'closed';
    const success = await setExamLocked(exam.exam_id, isLocked);
    if (success) {
      setExams(prev => prev.map(e =>
        e.exam_id === exam.exam_id ? { ...e, is_locked: isLocked } : e
      ));
      notifications.show({
        title: 'Status updated',
        message: `Exam is now ${newStatus}`,
        color: 'green',
      });
    } else {
      notifications.show({
        title: 'Status update failed',
        message: 'Could not save exam status. Check permissions and try again.',
        color: 'red',
      });
      await fetchExams();
    }
    setUpdatingStatus(null);
  };

  const handleDownloadAnswerSheet = async (exam: ExamWithRelations) => {
    const sectionNames = (exam.exam_assignments ?? [])
      .map(a => a.sections?.name).filter(Boolean).join(', ');
    const pdf = await generateAnswerSheetPdf({ exam, sectionName: sectionNames });
    pdf.save(`${exam.title}_AnswerSheet.pdf`);
    notifications.show({
      title: 'Downloaded',
      message: 'Answer sheet saved to downloads',
      color: 'blue',
    });
  };

  const handleDeleteExam = async (exam: ExamWithRelations) => {
    if (!confirm('Are you sure you want to delete this examination?')) return;
    const success = await deleteExamWithAssignments(exam.exam_id);
    if (success) {
      notifications.show({ title: 'Deleted', message: 'Exam removed', color: 'red' });
      fetchExams();
    }
  };

  const activeCount = exams.filter(e => !e.is_locked).length;
  const closedCount = exams.filter(e => e.is_locked).length;

  return (
    <Container fluid px="md" py="xl">
      <Stack gap="xl">
        {/* Header */}
        <Group gap="md">
          <Box pos="relative" w={56} h={56}>
            <Image src="/logo.png" alt="Logo" fill style={{ objectFit: 'contain' }} />
          </Box>
          <div>
            <Title order={1}>Examinations</Title>
            <Text c="dimmed" size="sm">Manage and track all examinations</Text>
          </div>
        </Group>

        {/* Stats */}
        <Group gap="md">
          <Paper p="md" radius="md" withBorder style={{ flex: 1 }}>
            <Group gap="xs">
              <Box w={8} h={8} bg="green" style={{ borderRadius: '50%' }} />
              <Text size="sm" fw={500} c="green">Active: {activeCount}</Text>
            </Group>
          </Paper>
          <Paper p="md" radius="md" withBorder style={{ flex: 1 }}>
            <Group gap="xs">
              <Box w={8} h={8} bg="red" style={{ borderRadius: '50%' }} />
              <Text size="sm" fw={500} c="red">Closed: {closedCount}</Text>
            </Group>
          </Paper>
          <Paper p="md" radius="md" withBorder style={{ flex: 1 }}>
            <Group gap="xs">
              <IconFileText size={16} color="blue" />
              <Text size="sm" fw={500} c="blue">Total: {exams.length}</Text>
            </Group>
          </Paper>
        </Group>

        {/* Error */}
        {dbError && (
          <Alert icon={<IconAlertCircle size={16} />} title="Database Error" color="red">
            {dbError}
            <Button size="xs" variant="light" color="red" mt="sm" onClick={fetchExams}>
              <IconRefreshDot size={14} /> Retry
            </Button>
          </Alert>
        )}

        {/* Filters */}
        <Card padding="lg" radius="md" withBorder>
          <Grid>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <TextInput
                placeholder="Search examinations..."
                leftSection={<IconSearch size={16} />}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.currentTarget.value)}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 6, md: 2 }}>
              <Select
                data={sectionOptions}
                value={selectedSection}
                onChange={setSelectedSection}
                placeholder="Section"
              />
            </Grid.Col>
            <Grid.Col span={{ base: 6, md: 2 }}>
              <Select
                data={subjectOptions}
                value={selectedSubject}
                onChange={setSelectedSubject}
                placeholder="Subject"
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 2 }}>
              <Button fullWidth leftSection={<IconPlus size={16} />} onClick={() => setIsCreateModalOpen(true)}>
                Create Exam
              </Button>
            </Grid.Col>
          </Grid>
        </Card>

        <Text size="sm" c="dimmed" fw={500}>Examinations ({filteredExams.length})</Text>

        {/* Content */}
        {loading ? (
          <Stack align="center" py={60}>
            <Loader size="lg" />
            <Text c="dimmed">Loading examinations...</Text>
          </Stack>
        ) : dbError ? null : filteredExams.length === 0 ? (
          <Card padding={60} radius="md" withBorder>
            <Stack align="center">
              <IconFileText size={64} color="gray" stroke={1} />
              <Title order={3} c="dimmed">No examinations found</Title>
              <Text c="dimmed" size="sm">Create your first examination to get started.</Text>
            </Stack>
          </Card>
        ) : (
          <Grid>
            {filteredExams.map((exam) => {
              const gradeLabel = exam.exam_assignments?.[0]?.sections?.grade_levels?.display_name ?? '';
              const subjectName = exam.subjects?.name ?? '';
              const sectionNames = (exam.exam_assignments ?? [])
                .map(a => a.sections?.name).filter(Boolean).join(', ');
              return (
                <Grid.Col key={exam.exam_id} span={{ base: 12, sm: 6, md: 4 }}>
                  <Card padding="lg" radius="md" withBorder style={{ height: '100%' }}>
                    <Stack gap="md">
                      {/* Header */}
                      <Group justify="space-between">
                        <Group gap="sm" style={{ flex: 1 }}>
                          <Box pos="relative" w={40} h={40}>
                            <Image src="/logo.png" alt="Logo" fill style={{ objectFit: 'contain' }} />
                          </Box>
                          <Text fw={700} size="sm" lineClamp={2} style={{ flex: 1 }}>
                            {exam.title}
                          </Text>
                        </Group>
                        <button
                          type="button"
                          onClick={() => handleStatusChange(exam, exam.is_locked ? 'active' : 'closed')}
                          disabled={updatingStatus === exam.exam_id}
                          className={`min-w-[86px] px-4 py-1.5 rounded-xl text-sm font-medium text-white transition-all ${
                            exam.is_locked
                              ? 'bg-red-500 hover:bg-red-600'
                              : 'bg-green-500 hover:bg-green-600'
                          } ${updatingStatus === exam.exam_id ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer active:scale-95'}`}
                        >
                          {exam.is_locked ? 'Closed' : 'Active'}
                        </button>
                      </Group>

                      {/* Details */}
                      <Paper p="sm" bg="gray.0" radius="md">
                        <Stack gap={6}>
                          {gradeLabel && <Text size="xs"><Text span fw={500}>Grade:</Text> {gradeLabel}</Text>}
                          {subjectName && <Text size="xs"><Text span fw={500}>Subject:</Text> {subjectName}</Text>}
                          {sectionNames && <Text size="xs"><Text span fw={500}>Section:</Text> {sectionNames}</Text>}
                        </Stack>
                      </Paper>

                      {/* Download */}
                      <Button
                        variant="light"
                        fullWidth
                        leftSection={<IconDownload size={16} />}
                        onClick={() => handleDownloadAnswerSheet(exam)}
                      >
                        Download Answer Sheet
                      </Button>

                      {/* Actions */}
                      <div>
                        <Divider mb="sm" />
                        <Text size="xs" tt="uppercase" fw={600} c="dimmed" mb="xs">Actions</Text>
                        <Stack gap={6}>
                          <Button
                            variant="filled"
                            fullWidth
                            size="sm"
                            leftSection={<IconEdit size={14} />}
                            onClick={() => { setSelectedExam(exam); setIsAnswerKeyModalOpen(true); }}
                          >
                            Edit Answer Key
                          </Button>
                          <Button
                            variant="filled"
                            color="blue"
                            fullWidth
                            size="sm"
                            leftSection={<IconFileText size={14} />}
                            onClick={() => { setSelectedExam(exam); setIsScanModalOpen(true); }}
                          >
                            Scan Papers
                          </Button>
                          <Button
                            variant="filled"
                            color="violet"
                            fullWidth
                            size="sm"
                            leftSection={<IconEye size={14} />}
                            onClick={() => { setSelectedExam(exam); setIsAnalysisModalOpen(true); }}
                          >
                            Review Papers
                          </Button>
                          <Button
                            variant="subtle"
                            color="red"
                            fullWidth
                            size="sm"
                            leftSection={<IconTrash size={14} />}
                            onClick={() => handleDeleteExam(exam)}
                          >
                            Delete
                          </Button>
                        </Stack>
                      </div>
                    </Stack>
                  </Card>
                </Grid.Col>
              );
            })}
          </Grid>
        )}
      </Stack>

      {isCreateModalOpen && (
        <CreateExamModal onClose={() => setIsCreateModalOpen(false)} onSuccess={fetchExams} />
      )}
      {isAnswerKeyModalOpen && selectedExam && (
        <CreateAnswerKeyModal
          exam={selectedExam}
          onClose={() => { setIsAnswerKeyModalOpen(false); setSelectedExam(null); }}
          onSuccess={fetchExams}
        />
      )}
      {isScanModalOpen && selectedExam && (
        <ScanPapersModal
          exam={selectedExam}
          onClose={() => { setIsScanModalOpen(false); setSelectedExam(null); }}
          onSuccess={fetchExams}
        />
      )}
      {isAnalysisModalOpen && selectedExam && (
        <ItemAnalysisModal
          exam={selectedExam}
          onClose={() => { setIsAnalysisModalOpen(false); setSelectedExam(null); }}
        />
      )}
    </Container>
  );
}
