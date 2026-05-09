'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  Container,
  Divider,
  Group,
  Paper,
  Progress,
  Select,
  Skeleton,
  Table,
  TableScrollContainer,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
  Text,
  ThemeIcon,
  Title,
  Stack,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import {
  IconUpload, IconCamera, IconCircleCheck, IconAlertTriangle,
  IconRefresh,
  IconDownload,
  IconGenderBigender,
} from '@tabler/icons-react';
import { processAnswerSheet } from '@/lib/services/omrService';
import { createAttempt, scoreResponses, fetchAttemptsForExam } from '@/lib/services/attemptService';
import { computeItemStatistics, saveItemStatistics } from '@/lib/services/analysisService';
import { fetchStudentRoster } from '@/lib/services/classService';
import { fetchExamById } from '@/lib/services/examService';
import { useAuth } from '@/context/AuthContext';
import BackButton from '@/components/BackButton';
import WizardNavigationButtons from '@/components/WizardNavigationButtons';
import { SearchBar } from '@/components/searchBar/SearchBar';
import VerticalWizardLayout, { type VerticalWizardStep } from '@/components/VerticalWizardLayout';
import type { ExamWithRelations, ExamScore } from '@/lib/exam-supabase';
import { resolveExamParams } from '@/lib/exam-supabase';

// â"€â"€â"€ Types â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

type Step = 'students' | 'capture' | 'processing' | 'review' | 'submit';

interface DetectedAnswers { [item: number]: string | null; }

interface RosterStudent {
  enrollment_id: number;
  lrn: string;
  full_name: string;
  sex: 'M' | 'F';
  section_id: number;
  section_name: string;
  grade_level_display: string;
}

// â"€â"€â"€ Helpers â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

const CHOICES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

function getMpl(score: number, totalItems: number): number {
  if (!totalItems) return 0;
  return Math.round((score / totalItems) * 100);
}

function getProficiency(mpl: number): string {
  if (mpl >= 90) return 'Highly Proficient';
  if (mpl >= 75) return 'Proficient';
  if (mpl >= 50) return 'Nearly Proficient';
  if (mpl >= 25) return 'Low Proficient';
  return 'Not Proficient';
}

function proficiencyBadge(mpl: number): string {
  if (mpl >= 90) return 'bg-green-100 text-green-800';
  if (mpl >= 75) return 'bg-lime-100 text-lime-800';
  if (mpl >= 50) return 'bg-yellow-100 text-yellow-800';
  if (mpl >= 25) return 'bg-orange-100 text-orange-800';
  return 'bg-red-100 text-red-800';
}

const STEP_LABELS: Record<string, string> = {
  students: 'Students',
  capture: 'Scan',
  review: 'Review',
  submit: 'Save',
};
const STEP_ORDER = ['capture', 'review', 'submit'] as const;

// â"€â"€â"€ Page â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

export default function ScanPapersPage() {
  const { examId } = useParams<{ examId: string }>();
  const router = useRouter();
  const { permissions } = useAuth();
  const isMobile = useMediaQuery('(max-width: 768px)');

  const [exam, setExam] = useState<ExamWithRelations | null>(null);
  const [examLoading, setExamLoading] = useState(true);

  const [step, setStep] = useState<Step>('students');
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [detectedAnswers, setDetectedAnswers] = useState<DetectedAnswers>({});
  const [cornersOk, setCornersOk] = useState(true);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [startingCamera, setStartingCamera] = useState(false);
  const [debugImageUrl, setDebugImageUrl] = useState<string | null>(null);
  const [warpedImageUrl, setWarpedImageUrl] = useState<string | null>(null);

  const [rosterStudents, setRosterStudents] = useState<RosterStudent[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [existingAttempts, setExistingAttempts] = useState<ExamScore[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<RosterStudent | null>(null);
  const [studentSearch, setStudentSearch] = useState('');
  const [sexFilter, setSexFilter] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoTrackRef = useRef<MediaStreamTrack | null>(null);

  // â"€â"€ Fetch exam â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  useEffect(() => {
    console.log('[scan] examId:', examId, typeof examId);
    const examIdNum = Number(examId);
    if (!examId || !Number.isFinite(examIdNum)) {
      setExamLoading(false);
      return;
    }
    fetchExamById(examIdNum).then(data => {
      console.log('[scan] fetchExamById result:', data);
      setExam(data);
    }).catch(console.error).finally(() => setExamLoading(false));
  }, [examId]);

  const { totalItems, numChoices } = resolveExamParams(exam);
  const choices = CHOICES.slice(0, numChoices);
  const answerKey: { [item: number]: string | null } = exam?.answer_key?.answers ?? {};

  // â"€â"€ Camera management â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

  const startCamera = async () => {
    if (startingCamera) return;
    setStartingCamera(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera API not available.');

      const constraints: MediaStreamConstraints[] = [
        { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false },
        { video: { width: { ideal: 1600 }, height: { ideal: 900 } }, audio: false },
        { video: true, audio: false },
      ];

      let stream: MediaStream | null = null;
      for (const c of constraints) {
        try { stream = await navigator.mediaDevices.getUserMedia(c); break; } catch { /* try next */ }
      }
      if (!stream) throw new Error('Unable to access camera.');

      streamRef.current = stream;
      videoTrackRef.current = stream.getVideoTracks()[0] ?? null;

      if (videoTrackRef.current) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await videoTrackRef.current.applyConstraints({ width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } } as any);
        } catch { /* unsupported */ }
      }

      setCameraActive(true);

      let videoEl: HTMLVideoElement | null = null;
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 25));
        if (videoRef.current) { videoEl = videoRef.current; break; }
      }
      if (!videoEl) throw new Error('Video element failed to mount.');

      videoEl.srcObject = stream;
      videoEl.muted = true;
      await new Promise<void>(resolve => { videoEl!.onloadedmetadata = () => resolve(); });
      await videoEl.play();
    } catch (error) {
      console.error('Failed to start camera:', error);
      alert('Camera not available or blocked. Please allow camera permission, then try again.');
      stopCamera();
    } finally {
      setStartingCamera(false);
    }
  };

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    videoTrackRef.current = null;
    setCameraActive(false);
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const loadRosterAndAttempts = useCallback(async () => {
    if (!exam) return;

    const sectionIds = (exam.exam_assignments ?? [])
      .map(a => a.sections?.section_id)
      .filter((id): id is number => id != null);

    setRosterLoading(true);
    try {
      const [attempts, rosterResults] = await Promise.all([
        fetchAttemptsForExam(exam.exam_id),
        Promise.all(sectionIds.map(id => fetchStudentRoster(id))),
      ]);

      const all: RosterStudent[] = rosterResults.flatMap(r =>
        r.students.map(s => ({
          enrollment_id: s.enrollment_id,
          lrn: s.lrn,
          full_name: s.full_name,
          sex: s.sex,
          section_id: r.section.section_id,
          section_name: r.section.name,
          grade_level_display: r.section.grade_level_display,
        }))
      );
      all.sort((a, b) => a.full_name.localeCompare(b.full_name));

      setExistingAttempts(attempts);
      setRosterStudents(all);
    } catch (err) {
      console.error('[ScanPage] Failed to load scan roster data:', err);
    } finally {
      setRosterLoading(false);
    }
  }, [exam]);

  // â"€â"€ Fetch roster + existing attempts once exam is loaded â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  useEffect(() => {
    void loadRosterAndAttempts();
  }, [loadRosterAndAttempts]);

  // â"€â"€ Attempt lookup map â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const attemptByEnrollment = new Map<number, ExamScore>();
  for (const a of existingAttempts) {
    if (a.enrollment_id != null) attemptByEnrollment.set(a.enrollment_id, a);
  }
  const getStudentAttempt = (s: RosterStudent) => attemptByEnrollment.get(s.enrollment_id);


  const filteredStudents = rosterStudents.filter(s => {
    const q = studentSearch.toLowerCase();
    const matchesSearch = !q || s.full_name.toLowerCase().includes(q) || s.lrn.includes(q);
    const matchesSex = sexFilter === '' || s.sex === sexFilter;
    return matchesSearch && matchesSex;
  });
  const maleStudents = filteredStudents.filter((s) => s.sex === 'M');
  const femaleStudents = filteredStudents.filter((s) => s.sex === 'F');
  const scannedStudentsCount = rosterStudents.filter((s) => getStudentAttempt(s) != null).length;

  // â"€â"€ Camera capture â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  // ── Scan student: preload OpenCV + transition to capture step ────────────
  const handleScanStudent = useCallback((student: RosterStudent) => {
    setSelectedStudent(student);
    setCapturedFile(null);
    setPreviewUrl(null);
    setDetectedAnswers({});
    setDebugImageUrl(null);
    setWarpedImageUrl(null);
    setProcessingError(null);
    setStep('capture');
  }, []);

  const captureFromCamera = async () => {
    if (!videoRef.current) return;
    if (videoRef.current.readyState < 2 || videoRef.current.videoWidth === 0) {
      alert('Camera is still initializing. Please wait a moment and try again.');
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ImageCaptureCtor = (window as any).ImageCapture;
    const track = videoTrackRef.current;
    if (ImageCaptureCtor && track) {
      try {
        const ic = new ImageCaptureCtor(track);
        // Request maximum photo resolution — on Android this captures at full
        // camera sensor resolution (e.g. 13MP on A03s) regardless of the 1080p
        // video stream constraint, giving gallery-quality images.
        let photoOptions: Record<string, number> = {};
        try {
          const caps = await ic.getPhotoCapabilities();
          if (caps.imageWidth?.max && caps.imageHeight?.max) {
            photoOptions = { imageWidth: caps.imageWidth.max, imageHeight: caps.imageHeight.max };
          }
        } catch { /* capabilities not supported — use defaults */ }
        const blob: Blob = await ic.takePhoto(photoOptions);
        stopCamera();
        handleFileSelected(new File([blob], 'scan.jpg', { type: blob.type || 'image/jpeg' }));
        return;
      } catch (err) {
        console.warn('[Camera] ImageCapture.takePhoto() failed, falling back to canvas:', err);
      }
    }
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(videoRef.current, 0, 0);
    canvas.toBlob(blob => {
      if (!blob) return;
      stopCamera();
      handleFileSelected(new File([blob], 'scan.jpg', { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.99);
  };

  // â"€â"€ File handling â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const handleFileSelected = (file: File) => {
    setCapturedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelected(file);
  };

  // â"€â"€ OMR Processing â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const runProcessing = async () => {
    if (!capturedFile) return;
    setStep('processing');
    setProcessingError(null);
    setProcessingStatus('');
    try {
      const result = await processAnswerSheet(
        capturedFile, totalItems, numChoices,
        undefined,
        setProcessingStatus,
      );

      // QR mismatch — scanned sheet belongs to a different exam
      if (result.detectedExamId !== null && result.detectedExamId !== Number(examId)) {
        // Try to fetch the scanned sheet's exam title for a friendlier message
        let scannedExamTitle = 'a different exam';
        try {
          const scannedExam = await fetchExamById(result.detectedExamId);
          if (scannedExam?.title) scannedExamTitle = `"${scannedExam.title}"`;
        } catch { /* ignore — title is optional, fallback is fine */ }

        const currentExamTitle = exam?.title ? `"${exam.title}"` : 'this exam';
        setProcessingError(
          `This answer sheet is for ${scannedExamTitle}, not ${currentExamTitle}. ` +
          `Please use the correct answer sheet and try again.`
        );
        setStep('capture');
        return;
      }

      setDetectedAnswers(result.answers);
      setCornersOk(result.cornersAutoDetected);
      setDebugImageUrl(result.debugDataUrl);
      setStep('review');
    } catch (err: unknown) {
      setProcessingError(err instanceof Error ? err.message : 'Processing failed');
      setStep('capture');
    }
  };

  // â"€â"€ Review â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const toggleAnswer = (item: number, choice: string) => {
    setDetectedAnswers(prev => ({ ...prev, [item]: prev[item] === choice ? null : choice }));
  };

  const answeredCount = Object.values(detectedAnswers).filter(Boolean).length;
  const score = scoreResponses(
    Object.fromEntries(Object.entries(detectedAnswers).filter(([, v]) => v)) as { [k: number]: string },
    answerKey
  );
  const hasAnswerKey = Object.keys(answerKey).length > 0;
  const itemResults = Array.from({ length: totalItems }, (_, i) => {
    const item = i + 1;
    const student = detectedAnswers[item] ?? null;
    const correct = answerKey[item] ?? null;
    return { item, student, correct, isCorrect: Boolean(student && correct && student === correct) };
  });

  const scoreMpl = getMpl(score, totalItems);
  const isStudentStep = step === 'students';
  const wizardSteps: VerticalWizardStep[] = STEP_ORDER.map((s, i) => ({
    label: `Step ${i + 1}`,
    description: STEP_LABELS[s],
  }));
  const canAccessExams =
    permissions.includes("exams.full_access") ||
    permissions.includes("exams.limited_access") ||
    permissions.includes("access_examinations");
  const hasFullAccess = permissions.includes("exams.full_access");
  const viewMode = typeof window !== "undefined" ? localStorage.getItem("examViewMode") : "admin";
  const isAdminView = hasFullAccess && viewMode !== "faculty";

  const hasScanProgress = Boolean(
    selectedStudent && (
      capturedFile ||
      previewUrl ||
      Object.keys(detectedAnswers).length > 0 ||
      cameraActive ||
      step === 'review' ||
      step === 'submit' ||
      processingStatus ||
      debugImageUrl ||
      warpedImageUrl
    )
  );

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

  const resetScanState = () => {
    stopCamera();
    setSelectedStudent(null);
    setCapturedFile(null);
    setPreviewUrl(null);
    setDetectedAnswers({});
    setDebugImageUrl(null);
    setWarpedImageUrl(null);
    setProcessingError(null);
    setProcessingStatus('');
    setSubmitting(false);
    setStep('students');
  };

  const handleCancel = () => {
    if (!hasScanProgress) {
      resetScanState();
      return;
    }

    modals.openConfirmModal({
      title: 'Discard changes?',
      children: (
        <Text size="sm">
          You have unsaved scan progress. Are you sure you want to return to the student list?
        </Text>
      ),
      labels: { confirm: 'Discard', cancel: 'Stay' },
      confirmProps: { color: 'red' },
      onConfirm: resetScanState,
      ...mobileConfirmModalProps,
    });
  };

  // â"€â"€ Submit â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const handleSubmit = async () => {
    if (!canAccessExams) {
      alert("You don't have permission to save exam scores.");
      return;
    }
    if (!exam || !selectedStudent) { alert('No student selected.'); return; }

    const examAssignmentId = (exam.exam_assignments ?? [])
      .find(a => a.sections?.section_id === selectedStudent.section_id)?.id;

    if (!examAssignmentId) {
      alert('Could not find exam assignment for this student\'s section.');
      return;
    }

    setSubmitting(true);
    const cleanedResponses: { [item: number]: string } = {};
    Object.entries(detectedAnswers).forEach(([k, v]) => { if (v) cleanedResponses[parseInt(k)] = v; });

    const attempt = await createAttempt({
      enrollment_id: selectedStudent.enrollment_id,
      exam_assignment_id: examAssignmentId,
      responses: cleanedResponses,
      calculated_score: score,
    });

    if (attempt) {
      const allAttempts = await fetchAttemptsForExam(exam.exam_id);
      const itemStats = computeItemStatistics(allAttempts, answerKey, totalItems);
      await saveItemStatistics(exam.exam_id, itemStats);

      // Refresh existing attempts and go back to student list
      setExistingAttempts(allAttempts);
      setStep('students');
      setSelectedStudent(null);
      setCapturedFile(null);
      setPreviewUrl(null);
      setDetectedAnswers({});
    } else {
      alert('Failed to save. Please try again.');
    }
    setSubmitting(false);
  };

  const handleExportCsv = async () => {
    if (!exam) return;
    if (scannedStudentsCount === 0) {
      alert('No scanned student results to export yet.');
      return;
    }
    setExportingCsv(true);
    try {
      const response = await fetch(`/api/exams/${exam.exam_id}/download`, {
        method: 'GET',
      });
      if (!response.ok) {
        let message = 'Failed to export CSV.';
        try {
          const body = await response.json();
          if (body?.error) message = String(body.error);
        } catch {
          // ignore parse errors
        }
        alert(message);
        return;
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      const contentDisposition = response.headers.get('content-disposition') ?? '';
      const filenameMatch = contentDisposition.match(/filename="([^"]+)"/i);
      link.href = url;
      link.download = filenameMatch?.[1] ?? `exam_${exam.exam_id}_Results.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('CSV export failed:', error);
      alert('Failed to export CSV.');
    } finally {
      setExportingCsv(false);
    }
  };

  // â"€â"€ Answer bubble color â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const confColor = (item: number, ch: string) => {
    if (answerKey[item] === ch) return 'bg-green-200 border-green-400 text-green-900 shadow-sm ring-2 ring-green-200';
    if (detectedAnswers[item] === ch) return 'bg-gray-300 border-gray-500 text-gray-900 shadow-sm ring-2 ring-gray-200';
    return 'bg-white border-gray-300 text-gray-500 hover:border-blue-500 hover:bg-blue-50';
  };

  const activeStep = step === 'processing' ? 'capture' : step;
  const stepIndex = STEP_ORDER.indexOf(activeStep as typeof STEP_ORDER[number]);

  // â"€â"€â"€ Loading â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

  if (examLoading) {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Skeleton height={36} width={220} radius="md" />
          <Skeleton height={14} width={160} radius="md" />
        </div>
        <Paper withBorder radius="md" p="md">
          <Skeleton height={42} radius="md" mb="md" />
          <Skeleton height={16} radius="md" mb="xs" />
          <Skeleton height={16} radius="md" mb="xs" />
          <Skeleton height={16} width="72%" radius="md" />
        </Paper>
      </div>
    );
  }

  if (!canAccessExams) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500 font-medium">You do not have permission to access this page.</p>
        <BackButton mt="md" size="sm" onClick={() => router.push('/exam')}>Back to Examinations</BackButton>
      </div>
    );
  }

  if (!exam) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500 font-medium">Exam not found.</p>
        <BackButton mt="md" size="sm" onClick={() => router.push('/exam')}>Back to Examinations</BackButton>
      </div>
    );
  }

  const scanProgressPercent = rosterStudents.length > 0
    ? Math.round((scannedStudentsCount / rosterStudents.length) * 100)
    : 0;

  // Navigation buttons rendered outside the main Paper
  const wizardNavButtons = !isStudentStep ? (
    step === 'capture' ? (
      <WizardNavigationButtons
        onCancel={handleCancel}
        onPrimary={runProcessing}
        primaryLabel="Process Sheet"
        primaryDisabled={!previewUrl}
        cancelLabel="Cancel"
        leftExtra={previewUrl && !cameraActive ? (
          <Button
            variant="default"
            onClick={() => { setPreviewUrl(null); setCapturedFile(null); }}
            leftSection={<IconRefresh className="w-4 h-4" />}
          >
            Retake
          </Button>
        ) : undefined}
      />
    ) : step === 'review' ? (
      <WizardNavigationButtons
        onCancel={handleCancel}
        onPrevious={() => setStep('capture')}
        showPrevious
        onPrimary={() => setStep('submit')}
        primaryLabel="Next"
        cancelLabel="Cancel"
      />
    ) : step === 'submit' ? (
      <WizardNavigationButtons
        onCancel={handleCancel}
        onPrevious={() => setStep('review')}
        showPrevious
        onPrimary={handleSubmit}
        primaryLabel={submitting ? 'Saving...' : 'Save Result'}
        primaryLoading={submitting}
        primaryDisabled={submitting}
        cancelLabel="Cancel"
      />
    ) : null
  ) : null;

  // ── Render ───────────────────────────────────────────────────────────────────

  if (isStudentStep) {
    return (
      <>
        <h1 className="text-2xl sm:text-3xl font-bold mb-4 sm:mb-6 text-[#597D37]">Scan Papers</h1>
        <Stack gap="md" maw={1000} style={{ width: '100%' }}>
          <Box>
            <BackButton size="sm" href="/exam">
              Back to Examinations
            </BackButton>
          </Box>

          <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
            <Box style={{ flex: 1, minWidth: 0 }}>
              <Title order={3} fw={700} lineClamp={2}>{exam.title}</Title>
            </Box>
            <Button
              variant="outline"
              color="gray"
              leftSection={<IconDownload size={16} />}
              size="sm"
              w={isMobile ? '100%' : 180}
              loading={exportingCsv}
              disabled={exportingCsv || scannedStudentsCount === 0}
              onClick={handleExportCsv}
            >
              Download Results
            </Button>
            {rosterStudents.length > 0 && scannedStudentsCount >= rosterStudents.length ? (
              <Button
                variant="filled"
                size="sm"
                w={isMobile ? '100%' : 180}
                styles={{ root: { backgroundColor: '#4EAE4A', '--button-hover': '#3D9B39' } }}
                onClick={() => router.push('/reports')}
              >
                Proceed to Reports
              </Button>
            ) : (
              <Button
                variant="outline"
                color="gray"
                size="sm"
                w={isMobile ? '100%' : 180}
                disabled
              >
                Scanned {scannedStudentsCount}/{rosterStudents.length}
              </Button>
            )}
          </Group>

          <Paper withBorder radius="md" p="md">
            <Progress value={scanProgressPercent} color="#4EAE4A" radius="xl" size="sm" />
          </Paper>

          <Group gap="sm" align="flex-end" wrap="wrap">
            <SearchBar
              id="search-scan-students"
              placeholder="Search student name or LRN..."
              ariaLabel="Search students"
              style={{ flex: '1 1 260px', minWidth: 0 }}
              value={studentSearch}
              onChange={e => setStudentSearch(e.target.value)}
            />
            <Select
              data={[
                { value: '', label: 'All Sexes' },
                { value: 'M', label: 'Male' },
                { value: 'F', label: 'Female' },
              ]}
              value={sexFilter}
              onChange={(v) => setSexFilter(v ?? '')}
              placeholder="All Sexes"
              leftSection={<IconGenderBigender size={16} />}
              w={isMobile ? '100%' : 140}
              clearable={false}
            />
          </Group>

          <Paper withBorder radius="md" p={0} style={{ overflow: 'hidden', width: '100%' }}>

        {/* â"€â"€ STEP: STUDENTS â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
        {step === 'students' && (
          <>
            {rosterLoading ? (
              <div className="p-4">
                <div className="space-y-3">
                  <Skeleton height={18} width={180} radius="md" />
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Group key={n} justify="space-between" wrap="nowrap">
                      <Skeleton height={16} width="40%" radius="md" />
                      <Skeleton height={16} width={90} radius="md" />
                      <Skeleton height={16} width={150} radius="md" />
                      <Skeleton height={28} width={90} radius="md" />
                    </Group>
                  ))}
                </div>
              </div>
            ) : rosterStudents.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-sm font-semibold text-gray-600">No students found</p>
                <p className="text-xs text-gray-400 mt-1">No roster is linked to the sections assigned to this exam.</p>
              </div>
            ) : (
                <TableScrollContainer minWidth={640} type="native">
                  <Table verticalSpacing="sm" striped={false} highlightOnHover>
                    <TableThead>
                      <TableTr>
                        <TableTh>Name of Pupil</TableTh>
                        <TableTh w={160} ta="center">Test Score</TableTh>
                        <TableTh w={220} ta="center">Level of Proficiency</TableTh>
                        {!isAdminView && <TableTh w={120} ta="center">Action</TableTh>}
                      </TableTr>
                    </TableThead>
                    <TableTbody>
                      {filteredStudents.length === 0 ? (
                        <TableTr>
                          <TableTd colSpan={isAdminView ? 3 : 4}>
                            <Text size="sm" c="dimmed" ta="center" py="md">No matching students</Text>
                          </TableTd>
                        </TableTr>
                      ) : (
                        <>
                          {maleStudents.length > 0 && (
                            <TableTr>
                              <TableTd colSpan={isAdminView ? 3 : 4} fw={700} fz="sm" ta="center" style={{ backgroundColor: "var(--mantine-color-gray-1)" }}>
                                Male ({maleStudents.length})
                              </TableTd>
                            </TableTr>
                          )}
                          {maleStudents.map(student => {
                            const attempt = getStudentAttempt(student);
                            const mpl = attempt ? getMpl(attempt.calculated_score, totalItems) : null;
                            const proficiency = mpl != null ? getProficiency(mpl) : null;
                            const hasScanned = attempt != null;
                            return (
                              <TableTr key={student.enrollment_id}>
                                <TableTd>
                                  <Text
                                    fz="sm"
                                    fw={500}
                                    c={hasScanned ? undefined : "dimmed"}
                                    style={!hasScanned ? { opacity: 0.75 } : undefined}
                                  >
                                    {student.full_name}
                                  </Text>
                                  <Text fz="xs" c="dimmed" mt={2}>{student.grade_level_display} - {student.section_name}</Text>
                                </TableTd>
                                <TableTd ta="center">
                                  <Text fz="sm" fw={600} c={attempt ? "dark" : "dimmed"}>
                                    {attempt ? `${attempt.calculated_score} / ${totalItems}` : '—'}
                                  </Text>
                                </TableTd>
                                <TableTd ta="center">
                                  {proficiency ? (
                                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${proficiencyBadge(mpl!)}`}>
                                      {proficiency}
                                    </span>
                                  ) : <Text span size="sm" c="dimmed">—</Text>}
                                </TableTd>
                                {!isAdminView && (
                                  <TableTd ta="center">
                                    <Button
                                      size="xs"
                                      radius="md"
                                      color={hasScanned ? "yellow" : "#4EAE4A"}
                                      onClick={() => handleScanStudent(student)}
                                    >
                                      {hasScanned ? 'Rescan' : 'Scan'}
                                    </Button>
                                  </TableTd>
                                )}
                              </TableTr>
                            );
                          })}

                          {femaleStudents.length > 0 && (
                            <TableTr>
                              <TableTd colSpan={isAdminView ? 3 : 4} fw={700} fz="sm" ta="center" style={{ backgroundColor: "var(--mantine-color-gray-1)" }}>
                                Female ({femaleStudents.length})
                              </TableTd>
                            </TableTr>
                          )}
                          {femaleStudents.map(student => {
                            const attempt = getStudentAttempt(student);
                            const mpl = attempt ? getMpl(attempt.calculated_score, totalItems) : null;
                            const proficiency = mpl != null ? getProficiency(mpl) : null;
                            const hasScanned = attempt != null;
                            return (
                              <TableTr key={student.enrollment_id}>
                                <TableTd>
                                  <Text
                                    fz="sm"
                                    fw={500}
                                    c={hasScanned ? undefined : "dimmed"}
                                    style={!hasScanned ? { opacity: 0.75 } : undefined}
                                  >
                                    {student.full_name}
                                  </Text>
                                  <Text fz="xs" c="dimmed" mt={2}>{student.grade_level_display} - {student.section_name}</Text>
                                </TableTd>
                                <TableTd ta="center">
                                  <Text fz="sm" fw={600} c={attempt ? "dark" : "dimmed"}>
                                    {attempt ? `${attempt.calculated_score} / ${totalItems}` : '—'}
                                  </Text>
                                </TableTd>
                                <TableTd ta="center">
                                  {proficiency ? (
                                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${proficiencyBadge(mpl!)}`}>
                                      {proficiency}
                                    </span>
                                  ) : <Text span size="sm" c="dimmed">—</Text>}
                                </TableTd>
                                {!isAdminView && (
                                  <TableTd ta="center">
                                    <Button
                                      size="xs"
                                      radius="md"
                                      color={hasScanned ? "yellow" : "#4EAE4A"}
                                      onClick={() => handleScanStudent(student)}
                                    >
                                      {hasScanned ? 'Rescan' : 'Scan'}
                                    </Button>
                                  </TableTd>
                                )}
                              </TableTr>
                            );
                          })}
                        </>
                      )}
                    </TableTbody>
                  </Table>
                </TableScrollContainer>
            )}
          </>
        )}

          </Paper>
        </Stack>
      </>
    );
  }

  // Wizard steps: capture / review / submit
  return (
    <>
      <h1 className="text-2xl sm:text-3xl font-bold mb-4 sm:mb-6 text-[#597D37]">Scan Papers</h1>
      <Container fluid py={{ base: 'md', sm: 'xl' }} px={{ base: 0, sm: 'md' }} h="100%">
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm" mb="xl">
          <Box style={{ minWidth: 0 }}>
            <Title order={3} fw={700} lineClamp={2}>{exam.title}</Title>
          </Box>
        </Group>
      <VerticalWizardLayout active={stepIndex} steps={wizardSteps}>

        {/* STEP: CAPTURE */}
        {step === 'capture' && (
          <Paper withBorder radius="md" p="lg">
            <Text size="lg" fw={700} c="#3D9B39">Scan Answer Sheet</Text>
            <Divider my="md" />

            {/* Selected Student */}
            {selectedStudent && (
              <>
                <Text fw={600} size="sm" c="#3D9B39" mb="sm">Selected Student</Text>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pb-4">
                  <div>
                    <Text size="xs" c="dimmed" mb={2}>Name</Text>
                    <Text fw={550} size="md">{selectedStudent.full_name}</Text>
                  </div>
                  <div>
                    <Text size="xs" c="dimmed" mb={2}>Grade & Section</Text>
                    <Text fw={550} size="md">{selectedStudent.grade_level_display} – {selectedStudent.section_name}</Text>
                  </div>
                  <div>
                    <Text size="xs" c="dimmed" mb={2}>LRN</Text>
                    <Text fw={550} size="md">{selectedStudent.lrn}</Text>
                  </div>
                </div>
                <Divider mb="md" />
              </>
            )}

            {/* Exam Information */}
            <Text fw={600} size="sm" c="#3D9B39" mb="sm">Exam Information</Text>
            <Text fw={550} size="md">{exam.title}</Text>
            <Text size="xs" c="dimmed" mt={2} mb="md">{totalItems} items</Text>
            <Divider mb="md" />

            {/* Processing Error */}
            {processingError && (
              <Alert
                variant="filled"
                radius="md"
                mb="md"
                styles={{
                  root: { backgroundColor: '#FF6666' },
                  icon: { alignSelf: 'center', marginTop: 0 },
                }}
                icon={
                  <ThemeIcon color="white" variant="transparent" size="md">
                    <IconAlertTriangle size={20} />
                  </ThemeIcon>
                }
              >
                <Text fw={700} size="sm">
                  {processingError.includes('answer sheet is for') ? 'Wrong Answer Sheet' : 'Processing Failed'}
                </Text>
                <Text size="sm" fs="italic">{processingError}</Text>
              </Alert>
            )}

            {/* Camera active */}
            {(cameraActive || startingCamera) && (
              <div>
                <video ref={videoRef} autoPlay playsInline className="w-full rounded-xl border border-gray-300 bg-black" />
                {startingCamera && <Text size="xs" c="dimmed" mt="xs">Initializing camera...</Text>}
                <Group mt="sm">
                  <Button color="#4EAE4A" onClick={captureFromCamera} leftSection={<IconCamera className="w-4 h-4" />} style={{ flex: 1 }}>
                    Capture
                  </Button>
                  <Button variant="default" onClick={stopCamera}>Cancel</Button>
                </Group>
              </div>
            )}

            {/* Image preview */}
            {previewUrl && !cameraActive && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={previewUrl} alt="Captured sheet" className="w-full rounded-xl border border-gray-200 max-h-64 object-contain bg-gray-50" />
            )}

            {/* Upload section */}
            {!cameraActive && !previewUrl && (
              <>
                <Text fw={600} size="sm" c="#3D9B39" mb="sm">Scanning Guidelines</Text>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700">
                    <p className="font-semibold mb-2 flex items-center gap-1.5">
                      <IconCircleCheck className="w-4 h-4 text-blue-500 shrink-0" />
                      Tips for best results:
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-xs">
                      <li>Place sheet on a dark, flat surface with good lighting</li>
                      <li>Keep the entire sheet visible — all 4 corners must be in frame</li>
                      <li>Avoid glare and shadows; hold camera directly above the sheet</li>
                      <li>Ensure student has filled bubbles darkly and completely</li>
                    </ul>
                  </div>
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700">
                    <p className="font-semibold mb-2 flex items-center gap-1.5">
                      <IconCamera className="w-4 h-4 text-blue-500 shrink-0" />
                      Photo tips for best results:
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-xs">
                      <li>Hold the camera <strong>directly above</strong> the sheet (no tilt)</li>
                      <li>All <strong>4 black corner squares</strong> must be visible</li>
                      <li>Good lighting — avoid shadows over the bubbles</li>
                    </ul>
                  </div>
                </div>

                <Text fw={600} size="sm" c="#3D9B39" mb="sm">Upload Answer Sheet</Text>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center gap-3 p-8 border-2 border-dashed border-gray-300 hover:border-green-400 rounded-xl hover:bg-green-50 transition-all"
                  >
                    <IconUpload className="w-8 h-8 text-gray-400" />
                    <div className="text-center">
                      <p className="font-semibold text-gray-700">Upload Photo</p>
                      <p className="text-xs text-gray-400 mt-0.5">JPG, PNG from gallery</p>
                    </div>
                  </button>
                  <button
                    onClick={startCamera}
                    disabled={startingCamera}
                    className="flex flex-col items-center gap-3 p-8 border-2 border-dashed border-gray-300 hover:border-green-400 rounded-xl hover:bg-green-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <IconCamera className="w-8 h-8 text-gray-400" />
                    <div className="text-center">
                      <p className="font-semibold text-gray-700">{startingCamera ? 'Starting camera...' : 'Use Camera'}</p>
                      <p className="text-xs text-gray-400 mt-0.5">Phone or webcam</p>
                    </div>
                  </button>
                </div>
              </>
            )}

            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileInput} />
          </Paper>
        )}

        {/* â"€â"€ STEP: PROCESSING â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
        {step === 'processing' && (
          <div className="py-12 flex flex-col items-center gap-5">
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-medium text-gray-700">
              {processingStatus || 'Processing…'}
            </p>
            <p className="text-xs text-gray-400">This may take a few seconds</p>
          </div>
        )}

        {/* â"€â"€ STEP: REVIEW â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
        {step === 'review' && (
          <div className="space-y-5">
            {selectedStudent && (
              <Paper withBorder radius="md" p="lg">
                <Text fw={600} size="sm" c="#3D9B39" mb="sm">Selected Student</Text>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <Text size="xs" c="dimmed" mb={2}>Name</Text>
                    <Text fw={550} size="md">{selectedStudent.full_name}</Text>
                  </div>
                  <div>
                    <Text size="xs" c="dimmed" mb={2}>Grade & Section</Text>
                    <Text fw={550} size="md">{selectedStudent.grade_level_display} – {selectedStudent.section_name}</Text>
                  </div>
                  <div>
                    <Text size="xs" c="dimmed" mb={2}>LRN</Text>
                    <Text fw={550} size="md">{selectedStudent.lrn}</Text>
                  </div>
                </div>
              </Paper>
            )}

            <div className={`rounded-xl p-3 flex items-start gap-3 text-sm ${cornersOk ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'}`}>
              {cornersOk
                ? <IconCircleCheck className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                : <IconAlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5 shrink-0" />}
              <p className={cornersOk ? 'text-green-700' : 'text-yellow-700'}>
                {cornersOk
                  ? 'Corner markers detected automatically - high confidence detection.'
                  : 'Corner markers not found - results may be less accurate. Review and correct any wrong answers.'}
              </p>
            </div>

            {warpedImageUrl && (
              <details className="rounded-xl border border-gray-200">
                <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-gray-600 select-none">
                  Debug: Perspective-Corrected Image (verify alignment)
                </summary>
                <img src={warpedImageUrl} alt="Warped scan" className="w-full rounded-b-xl" />
              </details>
            )}

            {debugImageUrl && (
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <p className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-50 border-b border-gray-200">
                  Bubble Detection Map — <span className="text-green-600">green = detected</span>, <span className="text-red-500">red = not selected</span>. Verify circles align with bubbles.
                </p>
                <div className="overflow-auto bg-gray-100 flex items-start justify-center p-2" style={{ maxHeight: '640px' }}>
                  <img src={debugImageUrl} alt="OMR debug" style={{ height: '640px', width: 'auto' }} className="object-contain" />
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-blue-50 rounded-xl p-3">
                <p className="text-2xl font-bold text-blue-700">{answeredCount}</p>
                <p className="text-xs text-blue-500 mt-0.5">Detected</p>
              </div>
              <div className="bg-orange-50 rounded-xl p-3">
                <p className="text-2xl font-bold text-orange-600">{totalItems - answeredCount}</p>
                <p className="text-xs text-orange-400 mt-0.5">Undetected</p>
              </div>
              <div className="bg-green-50 rounded-xl p-3">
                <p className="text-2xl font-bold text-green-700">{score}</p>
                <p className="text-xs text-green-500 mt-0.5">Correct (preview)</p>
              </div>
            </div>

            <p className="text-xs text-gray-500 text-center">
              Student answer is gray. Correct answer key is light green. Click any bubble to correct.
            </p>

            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
              {[1, 2].map(col => {
                const itemsInCol1 = Math.ceil(totalItems / 2);
                const start = col === 1 ? 1 : itemsInCol1 + 1;
                const end = col === 1 ? itemsInCol1 : totalItems;
                if (start > totalItems) return null;
                return (
                  <div key={col} className="space-y-0.5">
                    <div className="flex items-center gap-2 pb-1 border-b border-gray-100">
                      <span className="text-xs font-semibold text-gray-400 w-7">#</span>
                      {choices.map(ch => <span key={ch} className="text-xs font-bold text-gray-500 w-8 text-center">{ch}</span>)}
                      <span className="text-xs font-semibold text-gray-400 w-5 text-center">✓</span>
                    </div>
                    {Array.from({ length: end - start + 1 }, (_, i) => start + i).map(item => {
                      const correct = answerKey[item];
                      const detected = detectedAnswers[item];
                      const isRight = detected && correct && detected === correct;
                      return (
                        <div key={item} className={`flex items-center gap-2 py-0.5 px-1 rounded-lg transition-all ${!detected ? 'bg-orange-50' : ''}`}>
                          <span className="text-xs font-semibold w-7 text-right text-gray-600">{item}</span>
                          {choices.map(ch => (
                            <button
                              key={ch}
                              type="button"
                              onClick={() => toggleAnswer(item, ch)}
                              className={`w-8 h-8 rounded-full border-2 flex items-center justify-center font-bold text-xs transition-all duration-100 hover:scale-110 ${confColor(item, ch)}`}
                            >
                              {ch}
                            </button>
                          ))}
                          <span className="w-5 text-center text-sm">
                            {detected && correct ? (isRight ? '✓' : '✗') : detected ? '·' : ' - '}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

          </div>
        )}

        {/* â"€â"€ STEP: SUBMIT â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
        {step === 'submit' && (
          <div className="space-y-5">
            {selectedStudent && (
              <Paper withBorder radius="md" p="lg">
                <Text fw={600} size="sm" c="#3D9B39" mb="sm">Selected Student</Text>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <Text size="xs" c="dimmed" mb={2}>Name</Text>
                    <Text fw={550} size="md">{selectedStudent.full_name}</Text>
                  </div>
                  <div>
                    <Text size="xs" c="dimmed" mb={2}>Grade & Section</Text>
                    <Text fw={550} size="md">{selectedStudent.grade_level_display} – {selectedStudent.section_name}</Text>
                  </div>
                  <div>
                    <Text size="xs" c="dimmed" mb={2}>LRN</Text>
                    <Text fw={550} size="md">{selectedStudent.lrn}</Text>
                  </div>
                </div>
              </Paper>
            )}

              <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                <p className="text-3xl font-bold text-green-700">{score} / {totalItems}</p>
                <p className="text-green-600 text-sm mt-1">
                  Level of Proficiency: {getProficiency(scoreMpl)} · {answeredCount} bubbles detected
                </p>
              </div>

            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-700">Student vs Correct Answer</p>
                {!hasAnswerKey && <p className="text-xs text-amber-600">Set answer key to score correctness</p>}
              </div>
              <div className="max-h-56 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white border-b border-gray-200">
                    <tr className="text-left text-gray-500">
                      <th className="px-4 py-2 font-semibold">#</th>
                      <th className="px-4 py-2 font-semibold">Student</th>
                      <th className="px-4 py-2 font-semibold">Correct</th>
                      <th className="px-4 py-2 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itemResults.map(r => (
                      <tr key={`submit-${r.item}`} className="border-b border-gray-100 last:border-b-0">
                        <td className="px-4 py-2 font-medium text-gray-700">{r.item}</td>
                        <td className="px-4 py-2">{r.student ?? '-'}</td>
                        <td className="px-4 py-2">{r.correct ?? '-'}</td>
                        <td className="px-4 py-2">
                          {!r.student
                            ? <span className="text-orange-600">No answer</span>
                            : !r.correct
                              ? <span className="text-gray-500">No key</span>
                              : r.isCorrect
                                ? <span className="text-green-700 font-medium">Correct</span>
                                : <span className="text-red-600 font-medium">Wrong</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}
      </VerticalWizardLayout>
      {wizardNavButtons}
    </Container>
    </>
  );
}
