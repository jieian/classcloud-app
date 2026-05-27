'use client';

import { useState, useRef, useCallback, useEffect, type CSSProperties } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  Collapse,
  Container,
  Divider,
  Group,
  Modal,
  Paper,
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
  Tooltip,
} from '@mantine/core';
import { useDisclosure, useMediaQuery } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import {
  IconUpload, IconCamera, IconCircleCheck, IconAlertTriangle,
  IconRefresh,
  IconDownload,
  IconGenderBigender,
  IconChevronRight,
  IconX,
  IconBolt,
  IconBoltOff,
} from '@tabler/icons-react';
import { detectDocumentInCanvas, processAnswerSheet, type DetectionResult, type LiveDocumentDetectionResult } from '@/lib/services/omrService';
import { createAttempt, scoreResponses, fetchAttemptsForExam } from '@/lib/services/attemptService';
import { fetchStudentRoster } from '@/lib/services/classService';
import { fetchExamById } from '@/lib/services/examService';
import { useAuth } from '@/context/AuthContext';
import BackButton from '@/components/BackButton';
import WizardNavigationButtons from '@/components/WizardNavigationButtons';
import { SearchBar } from '@/components/searchBar/SearchBar';
import VerticalWizardLayout, { type VerticalWizardStep } from '@/components/VerticalWizardLayout';
import type { ExamWithRelations, ExamScore } from '@/lib/exam-supabase';
import { resolveExamParams } from '@/lib/exam-supabase';
import { invalidateReportsCache, fetchMyAssignedScope } from '@/lib/services/reportsAnalysisService';
import { notify } from '@/components/notificationIcon/notificationIcon';

// â"€â"€â"€ Types â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

type Step = 'students' | 'capture' | 'processing' | 'review' | 'submit';
type ReviewFilter = 'all' | 'detected' | 'undetected' | 'needs_attention';
type FlashMode = 'off' | 'on' | 'auto';

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

interface ScanPageCache {
  cachedAt: number;
  exam: ExamWithRelations | null;
  rosterStudents: RosterStudent[];
  existingAttempts: ExamScore[];
}

interface ItemConfidenceSummary {
  top: number;
  second: number;
}

function normalizedCornerDistance(
  a: LiveDocumentDetectionResult,
  b: LiveDocumentDetectionResult,
): number {
  if (!a.corners || !b.corners) return Number.POSITIVE_INFINITY;
  const total = a.corners.reduce((sum, point, index) => {
    const other = b.corners?.[index];
    if (!other) return sum + 1;
    const ax = point.x / a.width;
    const ay = point.y / a.height;
    const bx = other.x / b.width;
    const by = other.y / b.height;
    return sum + Math.hypot(ax - bx, ay - by);
  }, 0);
  return total / a.corners.length;
}

function visualPolygonCorners(result: LiveDocumentDetectionResult): string {
  if (!result.corners) return '';
  const [tl, tr, bl, br] = result.corners;
  return [tl, tr, br, bl].map((point) => `${point.x},${point.y}`).join(' ');
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

function studentHighlightCellStyle(
  isHighlighted: boolean,
  edge: 'start' | 'middle' | 'end' = 'middle',
): CSSProperties | undefined {
  if (!isHighlighted) return undefined;

  const shadows = [
    'inset 0 3px 0 #4EAE4A',
    'inset 0 -3px 0 #4EAE4A',
  ];

  if (edge === 'start') shadows.push('inset 3px 0 0 #4EAE4A');
  if (edge === 'end') shadows.push('inset -3px 0 0 #4EAE4A');

  return {
    boxShadow: shadows.join(', '),
    borderBottomLeftRadius: edge === 'start' ? 8 : undefined,
    borderTopLeftRadius: edge === 'start' ? 8 : undefined,
    borderBottomRightRadius: edge === 'end' ? 8 : undefined,
    borderTopRightRadius: edge === 'end' ? 8 : undefined,
    transition: 'box-shadow 1.2s ease',
  };
}

const STEP_LABELS: Record<string, string> = {
  students: 'Students',
  capture: 'Scan Answer Sheet',
  review: 'Review Detected Answers',
  submit: 'Save Scanned Results',
};
const STEP_ORDER = ['capture', 'review', 'submit'] as const;
const STEP_HEADING_COLOR = '#4EAE4A';
const STEP_BORDER_COLOR = '#e0e0e0';
const SCAN_PAGE_CACHE_TTL_MS = 2 * 60 * 1000;
const getScanPageCacheKey = (id: number) => `scanPageCache:${id}`;

// ─── Mobile accordion row ─────────────────────────────────────────────────────

function StudentMobileRow({
  student,
  attempt,
  totalItems,
  isHighlighted,
  isAdminView,
  isLocked,
  onScan,
}: {
  student: RosterStudent;
  attempt: ExamScore | undefined;
  totalItems: number;
  isHighlighted: boolean;
  isAdminView: boolean;
  isLocked: boolean;
  onScan: (student: RosterStudent) => void;
}) {
  const [opened, { toggle }] = useDisclosure(false);
  const mpl = attempt ? getMpl(attempt.calculated_score, totalItems) : null;
  const proficiency = mpl != null ? getProficiency(mpl) : null;
  const hasScanned = attempt != null;

  return (
    <>
      <div
        onClick={toggle}
        style={{
          cursor: 'pointer',
          padding: '12px 16px',
          borderLeft: isHighlighted ? '3px solid #4EAE4A' : undefined,
          backgroundColor: isHighlighted ? '#f7fbf4' : undefined,
          transition: 'background-color 1.2s ease',
        }}
      >
        <Group justify="space-between" wrap="nowrap" align="center">
          <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
            <IconChevronRight
              size={16}
              style={{
                transform: opened ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: 'transform 200ms ease',
                flexShrink: 0,
                color: '#808898',
              }}
            />
            <div style={{ overflow: 'hidden', minWidth: 0 }}>
              <Text fw={500} fz="sm" truncate>{student.full_name}</Text>
              <Text fz="xs" c="dimmed">LRN: {student.lrn}</Text>
            </div>
          </Group>
          {!isAdminView && (
            <div onClick={(e) => e.stopPropagation()}>
              <Tooltip label="This examination has already been proceeded." disabled={!isLocked} withArrow>
                <Button size="xs" radius="md" color={hasScanned ? 'yellow' : '#4EAE4A'} onClick={() => onScan(student)} disabled={isLocked}>
                  {hasScanned ? 'Rescan' : 'Scan'}
                </Button>
              </Tooltip>
            </div>
          )}
        </Group>
      </div>

      <Collapse in={opened}>
        <Box pb="md" pl={36} pr={16}>
          <Text size="xs" c="dimmed" fw={600} tt="uppercase" mb={2} style={{ letterSpacing: '0.04em' }}>
            Test Score
          </Text>
          <Text fz="sm" mb="sm" fw={600} c={attempt ? 'dark' : 'dimmed'}>
            {attempt ? `${attempt.calculated_score}/${totalItems}` : '—'}
          </Text>
          <Text size="xs" c="dimmed" fw={600} tt="uppercase" mb={6} style={{ letterSpacing: '0.04em' }}>
            Level of Proficiency
          </Text>
          {proficiency ? (
            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${proficiencyBadge(mpl!)}`}>
              {proficiency}
            </span>
          ) : (
            <Text fz="sm" c="dimmed" fs="italic">Not yet scanned</Text>
          )}
        </Box>
      </Collapse>
      <Divider />
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ScanPapersPage() {
  const { examId } = useParams<{ examId: string }>();
  const router = useRouter();
  const { user, permissions } = useAuth();
  const isMobile = useMediaQuery('(max-width: 768px)');

  const [exam, setExam] = useState<ExamWithRelations | null>(null);
  const [examLoading, setExamLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);

  const [step, setStep] = useState<Step>('students');
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [imgScale, setImgScale] = useState(1);
  const [imgTranslate, setImgTranslate] = useState({ x: 0, y: 0 });
  const [detectedAnswers, setDetectedAnswers] = useState<DetectedAnswers>({});
  const [initialDetectedAnswers, setInitialDetectedAnswers] = useState<DetectedAnswers>({});
  const [detectedConfidence, setDetectedConfidence] = useState<{ [item: number]: { [choice: string]: number } }>({});
  const [cornersOk, setCornersOk] = useState(true);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [finalizingReports, setFinalizingReports] = useState(false);
  const [duplicateImageError, setDuplicateImageError] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [startingCamera, setStartingCamera] = useState(false);
  const [flashMode, setFlashMode] = useState<FlashMode>('off');
  const [torchSupported, setTorchSupported] = useState(false);
  const [scannerStatus, setScannerStatus] = useState('Looking for sheet');
  const [liveDocument, setLiveDocument] = useState<LiveDocumentDetectionResult | null>(null);
  const [autoCapturing, setAutoCapturing] = useState(false);
  const [scannerProcessingCapture, setScannerProcessingCapture] = useState(false);
  const [scannerProcessedPreviewUrl, setScannerProcessedPreviewUrl] = useState<string | null>(null);
  const [scannerCaptureError, setScannerCaptureError] = useState<string | null>(null);
  const [scannerScanResult, setScannerScanResult] = useState<DetectionResult | null>(null);
  const [debugImageUrl, setDebugImageUrl] = useState<string | null>(null);
  const [highlightedEnrollmentId, setHighlightedEnrollmentId] = useState<number | null>(null);
  const [warpedImageUrl, setWarpedImageUrl] = useState<string | null>(null);

  const [rosterStudents, setRosterStudents] = useState<RosterStudent[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [existingAttempts, setExistingAttempts] = useState<ExamScore[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<RosterStudent | null>(null);
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('all');
  const [studentSearch, setStudentSearch] = useState('');
  const [sexFilter, setSexFilter] = useState<string>('');
  const [manuallyReviewedItems, setManuallyReviewedItems] = useState<Set<number>>(new Set());

  const fileInputRef = useRef<HTMLInputElement>(null);
  const previousFileRef = useRef<File | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoTrackRef = useRef<MediaStreamTrack | null>(null);
  const torchEnabledRef = useRef(false);
  const liveDetectionInFlightRef = useRef(false);
  const lastDocumentRef = useRef<LiveDocumentDetectionResult | null>(null);
  const stableDocumentFramesRef = useRef(0);
  const autoCaptureLockedRef = useRef(false);
  const captureFromCameraRef = useRef<() => void | Promise<void>>(() => undefined);
  const rosterStudentsRef = useRef<RosterStudent[]>([]);
  const existingAttemptsRef = useRef<ExamScore[]>([]);
  const useSilentRosterRefreshRef = useRef(false);
  const lastTouchDistRef = useRef<number | null>(null);
  const lastTouchPosRef = useRef<{ x: number; y: number } | null>(null);
  const lastTapTimeRef = useRef<number>(0);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const imgContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    rosterStudentsRef.current = rosterStudents;
  }, [rosterStudents]);

  useEffect(() => {
    existingAttemptsRef.current = existingAttempts;
  }, [existingAttempts]);

  const persistScanPageCache = useCallback(
    (
      examData: ExamWithRelations | null,
      rosterData: RosterStudent[],
      attemptsData: ExamScore[],
    ) => {
      const examIdNum = Number(examId);
      if (!Number.isFinite(examIdNum) || !examData) return;
      try {
        const payload: ScanPageCache = {
          cachedAt: Date.now(),
          exam: examData,
          rosterStudents: rosterData,
          existingAttempts: attemptsData,
        };
        sessionStorage.setItem(
          getScanPageCacheKey(examIdNum),
          JSON.stringify(payload),
        );
      } catch {
        // Ignore cache write errors.
      }
    },
    [examId],
  );

  // â"€â"€ Fetch exam â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  useEffect(() => {
    const examIdNum = Number(examId);
    if (!examId || !Number.isFinite(examIdNum)) {
      setExamLoading(false);
      return;
    }

    let hydratedFromCache = false;
    try {
      const raw = sessionStorage.getItem(getScanPageCacheKey(examIdNum));
      if (raw) {
        const parsed = JSON.parse(raw) as ScanPageCache;
        if (
          parsed &&
          typeof parsed.cachedAt === 'number' &&
          Date.now() - parsed.cachedAt <= SCAN_PAGE_CACHE_TTL_MS &&
          parsed.exam
        ) {
          setExam(parsed.exam);
          setRosterStudents(parsed.rosterStudents ?? []);
          setExistingAttempts(parsed.existingAttempts ?? []);
          useSilentRosterRefreshRef.current =
            (parsed.rosterStudents?.length ?? 0) > 0 ||
            (parsed.existingAttempts?.length ?? 0) > 0;
          setExamLoading(false);
          hydratedFromCache = true;
        }
      }
    } catch {
      // Ignore malformed cache.
    }

    fetchExamById(examIdNum)
      .then((data) => {
        setExam(data);
        if (data) {
          persistScanPageCache(
            data,
            rosterStudentsRef.current,
            existingAttemptsRef.current,
          );
        }
      })
      .catch(console.error)
      .finally(() => {
        if (!hydratedFromCache) setExamLoading(false);
      });
  }, [examId, persistScanPageCache]);

  // Scope-check: teachers (limited_access only) must be assigned to one of the exam's sections
  useEffect(() => {
    const hasFullAccess = permissions.includes("exams.full_access");
    const hasLimitedAccess = permissions.includes("exams.limited_access");
    if (!exam || !user?.id || hasFullAccess || !hasLimitedAccess) {
      setAccessDenied(false);
      return;
    }
    const examSectionIds = exam.exam_assignments
      .map((a) => a.sections?.section_id)
      .filter((id): id is number => id != null);
    if (examSectionIds.length === 0) {
      setAccessDenied(false);
      return;
    }
    fetchMyAssignedScope(user.id).then((scope) => {
      const hasAccess = examSectionIds.some((id) => scope.sectionIds.includes(id));
      setAccessDenied(!hasAccess);
    });
  }, [exam, user?.id, permissions]);

  const { totalItems, numChoices } = resolveExamParams(exam);
  const choices = CHOICES.slice(0, numChoices);
  const answerKey: { [item: number]: string | null } = exam?.answer_key?.answers ?? {};

  // â"€â"€ Camera management â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

  const setTorch = useCallback(async (enabled: boolean) => {
    const track = videoTrackRef.current;
    if (!track) return false;

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const capabilities = typeof track.getCapabilities === 'function' ? (track.getCapabilities() as any) : null;
      if (!capabilities?.torch) {
        setTorchSupported(false);
        return false;
      }

      if (torchEnabledRef.current === enabled) return true;

      await track.applyConstraints({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        advanced: [{ torch: enabled } as any],
      });
      torchEnabledRef.current = enabled;
      setTorchSupported(true);
      return true;
    } catch {
      setTorchSupported(false);
      return false;
    }
  }, []);

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
          const capabilities = typeof videoTrackRef.current.getCapabilities === 'function' ? (videoTrackRef.current.getCapabilities() as any) : null;
          setTorchSupported(Boolean(capabilities?.torch));
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await videoTrackRef.current.applyConstraints({ width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } } as any);
        } catch { /* unsupported */ }
      }

      setLiveDocument(null);
      setScannerStatus('Looking for sheet');
      setAutoCapturing(false);
      setScannerProcessingCapture(false);
      setScannerProcessedPreviewUrl(null);
      setScannerCaptureError(null);
      setScannerScanResult(null);
      autoCaptureLockedRef.current = false;
      stableDocumentFramesRef.current = 0;
      lastDocumentRef.current = null;
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
      if (flashMode === 'on') void setTorch(true);
    } catch (error) {
      console.error('Failed to start camera:', error);
      notify({ type: 'error', title: 'Camera Error', message: 'Camera not available or blocked. Please allow camera permission, then try again.' });
      stopCamera();
    } finally {
      setStartingCamera(false);
    }
  };

  const stopCameraStream = useCallback(() => {
    void setTorch(false);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    videoTrackRef.current = null;
    torchEnabledRef.current = false;
    setTorchSupported(false);
    setCameraActive(false);
    setLiveDocument(null);
    setScannerStatus('Looking for sheet');
    setAutoCapturing(false);
    liveDetectionInFlightRef.current = false;
    stableDocumentFramesRef.current = 0;
    lastDocumentRef.current = null;
    autoCaptureLockedRef.current = false;
  }, [setTorch]);

  const stopCamera = useCallback(() => {
    stopCameraStream();
    setScannerProcessingCapture(false);
    setScannerProcessedPreviewUrl(null);
    setScannerCaptureError(null);
    setScannerScanResult(null);
  }, [stopCameraStream]);

  useEffect(() => {
    if (!cameraActive || flashMode === 'auto') return;
    void setTorch(flashMode === 'on');
  }, [cameraActive, flashMode, setTorch]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const loadRosterAndAttempts = useCallback(async (options?: { silent?: boolean }) => {
    if (!exam) return;

    const sectionIds = (exam.exam_assignments ?? [])
      .map(a => a.sections?.section_id)
      .filter((id): id is number => id != null);

    if (!options?.silent) {
      setRosterLoading(true);
    }
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
      persistScanPageCache(exam, all, attempts);
    } catch (err) {
      console.error('[ScanPage] Failed to load scan roster data:', err);
    } finally {
      if (!options?.silent) {
        setRosterLoading(false);
      }
    }
  }, [exam, persistScanPageCache]);

  // â"€â"€ Fetch roster + existing attempts once exam is loaded â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  useEffect(() => {
    void loadRosterAndAttempts({
      silent: useSilentRosterRefreshRef.current,
    });
    useSilentRosterRefreshRef.current = false;
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
    if (exam?.is_locked) {
      notify({ type: 'warning', title: 'Exam Finalized', message: 'This examination has been finalized and can no longer accept scans.' });
      return;
    }
    setSelectedStudent(student);
    setCapturedFile(null);
    setPreviewUrl(null);
    setDetectedAnswers({});
    setInitialDetectedAnswers({});
    setDetectedConfidence({});
    setManuallyReviewedItems(new Set());
    setReviewFilter('all');
    setDebugImageUrl(null);
    setWarpedImageUrl(null);
    setProcessingError(null);
    setStep('capture');
  }, [exam?.is_locked]);

  const captureFromCamera = async () => {
    if (!videoRef.current) return;
    if (videoRef.current.readyState < 2 || videoRef.current.videoWidth === 0) {
      notify({ type: 'warning', title: 'Camera Initializing', message: 'Camera is still initializing. Please wait a moment and try again.' });
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
        void handleCameraCapturedFile(new File([blob], 'scan.jpg', { type: blob.type || 'image/jpeg' }));
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
      void handleCameraCapturedFile(new File([blob], 'scan.jpg', { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.99);
  };
  captureFromCameraRef.current = captureFromCamera;

  const handleCameraCapturedFile = async (file: File) => {
    stopCameraStream();
    setCapturedFile(file);
    setPreviewUrl(null);
    setScannerProcessingCapture(true);
    setScannerCaptureError(null);
    setScannerProcessedPreviewUrl(null);
    setScannerScanResult(null);
    setProcessingError(null);
    setScannerStatus('Processing scan');

    try {
      const result = await processAnswerSheet(
        file,
        totalItems,
        numChoices,
        undefined,
        setScannerStatus,
      );
      setScannerProcessedPreviewUrl(result.debugDataUrl);
      setPreviewUrl(result.warpedDataUrl);
      const validationError = await getScanValidationError(result);
      if (validationError) {
        setScannerCaptureError(validationError);
        setScannerStatus('Wrong answer sheet');
        return;
      }
      setScannerScanResult(result);
      setScannerStatus('Review capture');
    } catch (err: unknown) {
      setScannerCaptureError(err instanceof Error ? err.message : 'Processing failed');
      setScannerStatus('Processing failed');
    } finally {
      setScannerProcessingCapture(false);
      setAutoCapturing(false);
    }
  };

  useEffect(() => {
    if (!cameraActive || startingCamera) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const frameCanvas = document.createElement('canvas');

    const schedule = (delay = 520) => {
      if (cancelled) return;
      timer = setTimeout(() => {
        void detectFrame();
      }, delay);
    };

    const detectFrame = async () => {
      if (cancelled) return;
      const video = videoRef.current;
      if (!video || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
        schedule();
        return;
      }

      if (liveDetectionInFlightRef.current) {
        schedule(180);
        return;
      }

      liveDetectionInFlightRef.current = true;
      try {
        frameCanvas.width = video.videoWidth;
        frameCanvas.height = video.videoHeight;
        const ctx = frameCanvas.getContext('2d');
        if (!ctx) {
          schedule();
          return;
        }

        ctx.drawImage(video, 0, 0, frameCanvas.width, frameCanvas.height);
        const result = await detectDocumentInCanvas(frameCanvas);
        if (cancelled) return;

        setLiveDocument(result);
        if (flashMode === 'auto' && torchSupported) {
          void setTorch(result.brightness < 75);
        }

        const previous = lastDocumentRef.current;
        const stable =
          result.isVisible &&
          result.confidence >= 0.6 &&
          result.blur >= 25 &&
          previous != null &&
          normalizedCornerDistance(result, previous) < 0.03;

        stableDocumentFramesRef.current = stable
          ? stableDocumentFramesRef.current + 1
          : result.isVisible
            ? 1
            : 0;
        lastDocumentRef.current = result;

        if (autoCapturing || autoCaptureLockedRef.current) {
          setScannerStatus('Capturing');
        } else if (!result.corners) {
          setScannerStatus('Looking for sheet');
        } else if (!result.isVisible) {
          setScannerStatus('Fit the full sheet inside the frame');
        } else if (stableDocumentFramesRef.current < 2) {
          setScannerStatus('Hold steady');
        } else {
          setScannerStatus('Capturing');
          autoCaptureLockedRef.current = true;
          setAutoCapturing(true);
          setTimeout(() => {
            void captureFromCameraRef.current();
          }, 180);
          return;
        }
      } catch {
        if (!cancelled) {
          setLiveDocument(null);
          setScannerStatus('Looking for sheet');
        }
      } finally {
        liveDetectionInFlightRef.current = false;
      }

      schedule();
    };

    void detectFrame();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      liveDetectionInFlightRef.current = false;
    };
  }, [autoCapturing, cameraActive, flashMode, setTorch, startingCamera, torchSupported]);

  // â"€â"€ File handling â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const handleFileSelected = (file: File) => {
    const prev = previousFileRef.current;
    if (prev && file.name === prev.name && file.size === prev.size && file.lastModified === prev.lastModified) {
      setDuplicateImageError(true);
      return;
    }
    setDuplicateImageError(false);
    setCapturedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelected(file);
  };

  const getScanValidationError = async (result: DetectionResult): Promise<string | null> => {
    if (result.detectedExamId !== null && result.detectedExamId !== Number(examId)) {
      let scannedExamTitle = 'a different exam';
      try {
        const scannedExam = await fetchExamById(result.detectedExamId);
        if (scannedExam?.title) scannedExamTitle = `"${scannedExam.title}"`;
      } catch { /* ignore — title is optional, fallback is fine */ }

      const currentExamTitle = exam?.title ? `"${exam.title}"` : 'this exam';
      return (
        `This answer sheet is for ${scannedExamTitle}, not ${currentExamTitle}. ` +
        `Please use the correct answer sheet and try again.`
      );
    }

    if (
      result.detectedTotalItems !== null &&
      result.detectedTotalItems !== totalItems
    ) {
      return (
        `This answer sheet is for ${result.detectedTotalItems} items, but this exam expects ${totalItems}. ` +
        'Please use the correct answer sheet and try again.'
      );
    }

    if (
      result.detectedNumChoices !== null &&
      result.detectedNumChoices !== numChoices
    ) {
      return (
        `This answer sheet uses ${result.detectedNumChoices} choices per item, but this exam expects ${numChoices}. ` +
        'Please use the correct answer sheet and try again.'
      );
    }

    return null;
  };

  const applyProcessedScanResult = async (result: DetectionResult): Promise<boolean> => {
    const validationError = await getScanValidationError(result);
    if (validationError) {
      setProcessingError(validationError);
      setStep('capture');
      return false;
    }

    setDetectedAnswers(result.answers);
    setInitialDetectedAnswers({ ...result.answers });
    setDetectedConfidence(result.confidence);
    setCornersOk(result.cornersAutoDetected);
    setDebugImageUrl(result.debugDataUrl);
    setWarpedImageUrl(result.warpedDataUrl);
    setPreviewUrl(result.warpedDataUrl);
    setStep('review');
    return true;
  };

  const handleScannerRetake = () => {
    setCapturedFile(null);
    setPreviewUrl(null);
    setScannerProcessedPreviewUrl(null);
    setScannerScanResult(null);
    setScannerCaptureError(null);
    setScannerProcessingCapture(false);
    setScannerStatus('Looking for sheet');
    setAutoCapturing(false);
    autoCaptureLockedRef.current = false;
    stableDocumentFramesRef.current = 0;
    lastDocumentRef.current = null;
    void startCamera();
  };

  const handleScannerDone = async () => {
    if (!scannerScanResult) return;
    const applied = await applyProcessedScanResult(scannerScanResult);
    if (!applied) return;
    setScannerProcessedPreviewUrl(null);
    setScannerScanResult(null);
    setScannerCaptureError(null);
    setScannerProcessingCapture(false);
    setScannerStatus('Looking for sheet');
    setAutoCapturing(false);
  };

  // â"€â"€ OMR Processing â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const runProcessing = async () => {
    if (!capturedFile) {
      notify({ type: 'warning', title: 'No Answer Sheet', message: 'Please upload or capture an answer sheet before proceeding.' });
      return;
    }
    setStep('processing');
    setProcessingError(null);
    setProcessingStatus('');
    try {
      const result = await processAnswerSheet(
        capturedFile, totalItems, numChoices,
        undefined,
        setProcessingStatus,
      );
      await applyProcessedScanResult(result);
    } catch (err: unknown) {
      setProcessingError(err instanceof Error ? err.message : 'Processing failed');
      setStep('capture');
    }
  };

  // â"€â"€ Review â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const toggleAnswer = (item: number, choice: string) => {
    setDetectedAnswers(prev => ({ ...prev, [item]: prev[item] === choice ? null : choice }));
    setManuallyReviewedItems((prev) => {
      const next = new Set(prev);
      next.add(item);
      return next;
    });
  };

  const handleResetToDetected = () => {
    setDetectedAnswers({ ...initialDetectedAnswers });
    setManuallyReviewedItems(new Set());
    setReviewFilter('all');
  };

  const answeredCount = Object.values(detectedAnswers).filter(Boolean).length;
  const allReviewItems = Array.from({ length: totalItems }, (_, i) => i + 1);

  const getConfidenceSummary = (item: number): ItemConfidenceSummary => {
    const values = Object.values(detectedConfidence[item] ?? {}).sort((a, b) => b - a);
    return {
      top: values[0] ?? 0,
      second: values[1] ?? 0,
    };
  };

  const isLowConfidenceItem = (item: number): boolean => {
    if (!detectedAnswers[item]) return false;
    if (manuallyReviewedItems.has(item)) return false;
    const { top, second } = getConfidenceSummary(item);
    return top < 0.08 || top - second < 0.04;
  };

  const undetectedCount = allReviewItems.filter((item) => !detectedAnswers[item]).length;
  const lowConfidenceCount = allReviewItems.filter((item) => isLowConfidenceItem(item)).length;
  const needsAttentionItems = allReviewItems.filter(
    (item) => !detectedAnswers[item] || isLowConfidenceItem(item),
  );
  const needsAttentionCount = needsAttentionItems.length;

  const getRowHighlight = (item: number): string => {
    if (reviewFilter === 'all') return '';
    if (reviewFilter === 'detected' && Boolean(detectedAnswers[item])) return 'bg-gray-200';
    if (reviewFilter === 'undetected' && !detectedAnswers[item]) return 'bg-gray-200';
    if (reviewFilter === 'needs_attention' && needsAttentionItems.includes(item)) return 'bg-gray-200';
    return '';
  };

  const hasManualReviewChanges = allReviewItems.some(
    (item) => (detectedAnswers[item] ?? null) !== (initialDetectedAnswers[item] ?? null),
  );

  const score = scoreResponses(
    Object.fromEntries(Object.entries(detectedAnswers).filter(([, v]) => v)) as { [k: number]: string },
    answerKey
  );
  const hasAnswerKey = Object.keys(answerKey).length > 0;
  const itemResults = allReviewItems.map((item) => {
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
    setInitialDetectedAnswers({});
    setDetectedConfidence({});
    setManuallyReviewedItems(new Set());
    setReviewFilter('all');
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
      notify({ type: 'error', title: 'No Permission', message: "You don't have permission to save exam scores." });
      return;
    }
    if (!exam || !selectedStudent) { notify({ type: 'warning', title: 'No Student', message: 'No student selected.' }); return; }
    if (exam.is_locked) {
      notify({ type: 'warning', title: 'Exam Finalized', message: 'This examination has been finalized and can no longer accept scans.' });
      return;
    }

    const examAssignmentId = (exam.exam_assignments ?? [])
      .find(a => a.sections?.section_id === selectedStudent.section_id)?.id;

    if (!examAssignmentId) {
      notify({ type: 'error', title: 'Assignment Not Found', message: "Could not find exam assignment for this student's section." });
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

      // Refresh existing attempts and go back to student list
      const scannedId = selectedStudent.enrollment_id;
      setExistingAttempts(allAttempts);
      setStep('students');
      setSelectedStudent(null);
      setCapturedFile(null);
      setPreviewUrl(null);
      setDetectedAnswers({});
      setInitialDetectedAnswers({});
      setDetectedConfidence({});
      setManuallyReviewedItems(new Set());
      setReviewFilter('all');
      setHighlightedEnrollmentId(scannedId);
      setTimeout(() => setHighlightedEnrollmentId(null), 3000);
      notify({
        type: 'success',
        title: 'Results Saved',
        message: `Scanned results for ${selectedStudent.full_name} were saved successfully.`,
      });
    } else {
      notify({ type: 'error', title: 'Save Failed', message: 'Failed to save. Please try again.' });
    }
    setSubmitting(false);
  };

  const handleSubmitWithValidation = () => {
    if (undetectedCount <= 0) {
      modals.openConfirmModal({
        title: 'Save Results?',
        children: (
          <Text size="sm">
            {`Save scanned results for ${selectedStudent?.full_name ?? 'this student'}? This will record their answers and compute their score.`}
          </Text>
        ),
        labels: { confirm: 'Save Results', cancel: 'Review Again' },
        confirmProps: { color: '#4EAE4A' },
        onConfirm: () => { void handleSubmit(); },
        ...mobileConfirmModalProps,
      });
      return;
    }

    modals.openConfirmModal({
      title: 'Submit with unanswered items?',
      children: (
        <Text size="sm">
          {`There are ${undetectedCount} undetected item${undetectedCount > 1 ? 's' : ''}. You can still save this scan, or go back and review first.`}
        </Text>
      ),
      labels: { confirm: 'Save Anyway', cancel: 'Review Answers' },
      confirmProps: { color: '#4EAE4A' },
      onConfirm: () => {
        void handleSubmit();
      },
      ...mobileConfirmModalProps,
    });
  };

  const handleExportCsv = async () => {
    if (!exam) return;
    if (scannedStudentsCount === 0) {
      notify({ type: 'warning', title: 'No Results', message: 'No scanned student results to export yet.' });
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
        notify({ type: 'error', title: 'Export Failed', message });
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
      notify({ type: 'error', title: 'Export Failed', message: 'Failed to export CSV.' });
    } finally {
      setExportingCsv(false);
    }
  };

  // â"€â"€ Answer bubble color â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const confColor = (item: number, ch: string) => {
    const isAnswerKey = answerKey[item] === ch;
    const isDetected = detectedAnswers[item] === ch;
    if (isDetected && isAnswerKey) return 'bg-green-600 border-green-600 text-white';
    if (isDetected && !isAnswerKey) return 'bg-[#fef2f2] border-[#f87171] text-[#991b1b]';
    if (isAnswerKey) return 'bg-[#eef8e9] border-[#4EAE4A] text-[#2f5f2d]';
    return 'bg-white border-gray-200 text-gray-500 hover:border-[#4EAE4A] hover:bg-[#f7fbf4]';
  };

  const doFinalizeReports = async () => {
    if (!exam) return;
    setFinalizingReports(true);
    try {
      const response = await fetch(
        `/api/exams/${exam.exam_id}/finalize-reports`,
        { method: "POST" },
      );

      const body = (await response.json().catch(() => null)) as
        | {
            error?: string;
            gradeLevelId?: number;
            sectionId?: number;
            examId?: number;
            finalized?: boolean;
          }
        | null;

      if (!response.ok) {
        notify({ type: 'error', title: 'Finalization Failed', message: body?.error ?? 'Unable to finalize examination for reports. Please try again.' });
        return;
      }

      const gradeLevelId = Number(body?.gradeLevelId);
      const sectionId = Number(body?.sectionId);
      const finalizedExamId = Number(body?.examId ?? exam.exam_id);

      if (
        !Number.isFinite(gradeLevelId) ||
        !Number.isFinite(sectionId) ||
        !Number.isFinite(finalizedExamId)
      ) {
        notify({ type: 'error', title: 'Incomplete Response', message: 'Finalization succeeded but report context is incomplete.' });
        return;
      }

      invalidateReportsCache();
      router.push(
        `/assessment-reports/report-analytics/${gradeLevelId}/${sectionId}/${finalizedExamId}`,
      );
    } catch (error) {
      console.error("Failed to finalize examination:", error);
      notify({ type: 'error', title: 'Finalization Failed', message: 'Unable to finalize examination for reports. Please try again.' });
    } finally {
      setFinalizingReports(false);
    }
  };

  const handleProceedToReports = () => {
    if (!exam) return;
    if (exam.is_locked) {
      notify({ type: 'info', title: 'Already Proceeded', message: 'This examination has already been proceeded to reports.' });
      return;
    }
    if (rosterStudents.length > 0 && scannedStudentsCount < rosterStudents.length) {
      notify({ type: 'warning', title: 'Incomplete Scans', message: `Not all students have been scanned yet (${scannedStudentsCount}/${rosterStudents.length}). Please scan all students before proceeding to reports.` });
      return;
    }
    modals.openConfirmModal({
      title: 'Proceed to Reports?',
      children: (
        <Text size="sm">
          Are you sure you want to proceed? This will finalize the examination, generate reports, and prevent any further scans or edits. This action cannot be undone.
        </Text>
      ),
      labels: { confirm: 'Proceed', cancel: 'Stay' },
      confirmProps: { color: '#4EAE4A' },
      onConfirm: () => { void doFinalizeReports(); },
      ...mobileConfirmModalProps,
    });
  };

  const getStatusChip = (studentAnswer: string | null, correctAnswer: string | null) => {
    if (!studentAnswer) {
      return { label: 'Blank', className: 'bg-gray-100 text-gray-600' };
    }
    if (!correctAnswer) {
      return { label: 'No key', className: 'bg-gray-100 text-gray-700' };
    }
    if (studentAnswer === correctAnswer) {
      return { label: 'Correct', className: 'bg-[#eef8e9] text-[#2f5f2d]' };
    }
    return { label: 'Wrong', className: 'bg-[#fef2f2] text-[#991b1b]' };
  };
  const STATUS_CHIP_CLASS = 'inline-flex w-[64px] items-center justify-center text-[10px] font-medium px-1.5 py-0.5 rounded';

  const activeStep = step === 'processing' ? 'capture' : step;
  const stepIndex = STEP_ORDER.indexOf(activeStep as typeof STEP_ORDER[number]);

  // â"€â"€â"€ Loading â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

  if (examLoading) {
    return (
      <>
        <h1 className="text-xl md:text-2xl font-bold mb-2 md:mb-4 text-[#597D37]">Scan Papers</h1>
        <Stack gap="md" maw={1000} style={{ width: '100%' }}>
          <Box>
            <BackButton size="sm" href="/exam">
              Back to Examinations
            </BackButton>
          </Box>

          <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
            <Box style={{ flex: 1, minWidth: 0 }}>
              <Skeleton height={30} width="65%" radius="md" />
            </Box>
            <Skeleton height={36} w={180} radius="md" />
            <Skeleton height={36} w={180} radius="md" />
          </Group>

          <Group gap="sm" align="flex-end" wrap="wrap">
            <Skeleton height={36} style={{ flex: '1 1 260px', minWidth: 0 }} radius="md" />
            <Skeleton height={36} w={140} radius="md" />
          </Group>

          <Paper withBorder radius="md" p={0} style={{ overflow: 'hidden', width: '100%' }}>
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
          </Paper>
        </Stack>
      </>
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

  if (accessDenied) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500 font-medium">You do not have permission to access this exam.</p>
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

  // Navigation buttons — call with mt=0 for the fixed mobile bar
  const getNavButtons = (mt?: number | string) => {
    if (step === 'capture') return (
      <WizardNavigationButtons mt={mt} onCancel={handleCancel} onPrimary={runProcessing} primaryLabel="Next" colorWhenEnabledOnly={false} cancelLabel="Cancel" />
    );
    if (step === 'review') return (
      <WizardNavigationButtons mt={mt} onCancel={handleCancel} onPrevious={() => setStep('capture')} showPrevious onPrimary={() => setStep('submit')} primaryLabel="Next" cancelLabel="Cancel" />
    );
    if (step === 'submit') return (
      <WizardNavigationButtons mt={mt} onCancel={handleCancel} onPrevious={() => setStep('review')} showPrevious onPrimary={handleSubmitWithValidation} primaryLabel={submitting ? 'Saving...' : 'Save Result'} primaryLoading={submitting} primaryDisabled={submitting} colorWhenEnabledOnly={false} cancelLabel="Cancel" />
    );
    return null;
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  if (isStudentStep) {
    return (
      <>
        <h1 className="text-xl md:text-2xl font-bold mb-2 md:mb-4 text-[#597D37]">Scan Papers</h1>
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
            <Group gap="sm" grow={!!isMobile} w={isMobile ? '100%' : 'auto'}>
              <Button
                variant="outline"
                color="#4EAE4A"
                radius="md"
                leftSection={<IconDownload size={16} />}
                size="sm"
                loading={exportingCsv}
                disabled={exportingCsv || scannedStudentsCount === 0}
                onClick={handleExportCsv}
              >
                {isMobile ? 'Download' : 'Download Results'}
              </Button>
              {exam.is_locked ? (
                <Tooltip label="This examination has already been proceeded." withArrow>
                  <Button
                    variant="outline"
                    color="gray"
                    size="sm"
                    w={isMobile ? undefined : 180}
                    disabled
                  >
                    Proceed to Reports
                  </Button>
                </Tooltip>
              ) : rosterStudents.length > 0 && scannedStudentsCount >= rosterStudents.length ? (
                <Button
                  variant="filled"
                  size="sm"
                  w={isMobile ? undefined : 180}
                  styles={{ root: { backgroundColor: '#4EAE4A', '--button-hover': '#3D9B39' } }}
                  onClick={handleProceedToReports}
                  loading={finalizingReports}
                  disabled={finalizingReports}
                >
                  Proceed to Reports
                </Button>
              ) : (
                <Button
                  variant="outline"
                  color="gray"
                  size="sm"
                  w={isMobile ? undefined : 180}
                  disabled
                >
                  Scanned {scannedStudentsCount}/{rosterStudents.length}
                </Button>
              )}
            </Group>
          </Group>

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
              <>
                {/* Desktop table */}
                <div className="hidden sm:block">
                  <TableScrollContainer minWidth={640} type="native">
                    <Table verticalSpacing="sm" striped={false} highlightOnHover>
                      <TableThead>
                        <TableTr>
                          <TableTh>Name of Pupil</TableTh>
                          <TableTh w={160} ta="center">Test Score</TableTh>
                          <TableTh w={220} ta="center">Level of Proficiency</TableTh>
                          {!isAdminView && <TableTh w={120} ta="center" />}
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
                              const isHighlighted = highlightedEnrollmentId === student.enrollment_id;
                              return (
                                <TableTr key={student.enrollment_id}>
                                  <TableTd style={studentHighlightCellStyle(isHighlighted, 'start')}>
                                    <Text fz="sm" fw={500} c="dark">{student.full_name}</Text>
                                    <Text fz="xs" c="dimmed" mt={2}>LRN: {student.lrn}</Text>
                                  </TableTd>
                                  <TableTd ta="center" style={studentHighlightCellStyle(isHighlighted)}>
                                    <Text fz="sm" fw={600} c={attempt ? "dark" : "dimmed"}>
                                      {attempt ? `${attempt.calculated_score}/${totalItems}` : '—'}
                                    </Text>
                                  </TableTd>
                                  <TableTd ta="center" style={studentHighlightCellStyle(isHighlighted, isAdminView ? 'end' : 'middle')}>
                                    {proficiency ? (
                                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${proficiencyBadge(mpl!)}`}>
                                        {proficiency}
                                      </span>
                                    ) : <Text span size="sm" c="dimmed">—</Text>}
                                  </TableTd>
                                  {!isAdminView && (
                                    <TableTd ta="center" style={studentHighlightCellStyle(isHighlighted, 'end')}>
                                      <Tooltip label="This examination has already been proceeded." disabled={!exam.is_locked} withArrow>
                                        <Button size="xs" radius="md" color={hasScanned ? "yellow" : "#4EAE4A"} onClick={() => handleScanStudent(student)} disabled={exam.is_locked}>
                                          {hasScanned ? 'Rescan' : 'Scan'}
                                        </Button>
                                      </Tooltip>
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
                              const isHighlighted = highlightedEnrollmentId === student.enrollment_id;
                              return (
                                <TableTr key={student.enrollment_id}>
                                  <TableTd style={studentHighlightCellStyle(isHighlighted, 'start')}>
                                    <Text fz="sm" fw={500} c="dark">{student.full_name}</Text>
                                    <Text fz="xs" c="dimmed" mt={2}>LRN: {student.lrn}</Text>
                                  </TableTd>
                                  <TableTd ta="center" style={studentHighlightCellStyle(isHighlighted)}>
                                    <Text fz="sm" fw={600} c={attempt ? "dark" : "dimmed"}>
                                      {attempt ? `${attempt.calculated_score}/${totalItems}` : '—'}
                                    </Text>
                                  </TableTd>
                                  <TableTd ta="center" style={studentHighlightCellStyle(isHighlighted, isAdminView ? 'end' : 'middle')}>
                                    {proficiency ? (
                                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${proficiencyBadge(mpl!)}`}>
                                        {proficiency}
                                      </span>
                                    ) : <Text span size="sm" c="dimmed">—</Text>}
                                  </TableTd>
                                  {!isAdminView && (
                                    <TableTd ta="center" style={studentHighlightCellStyle(isHighlighted, 'end')}>
                                      <Tooltip label="This examination has already been proceeded." disabled={!exam.is_locked} withArrow>
                                        <Button size="xs" radius="md" color={hasScanned ? "yellow" : "#4EAE4A"} onClick={() => handleScanStudent(student)} disabled={exam.is_locked}>
                                          {hasScanned ? 'Rescan' : 'Scan'}
                                        </Button>
                                      </Tooltip>
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
                </div>

                {/* Mobile accordion list */}
                <div className="sm:hidden">
                  <Divider />
                  {filteredStudents.length === 0 ? (
                    <div className="text-center py-12">
                      <Text size="sm" c="dimmed" ta="center">No matching students</Text>
                    </div>
                  ) : (
                    <>
                      {maleStudents.length > 0 && (
                        <>
                          <div className="px-4 py-2 bg-gray-100 text-sm font-bold text-center text-gray-700">
                            Male ({maleStudents.length})
                          </div>
                          {maleStudents.map(student => (
                            <StudentMobileRow
                              key={student.enrollment_id}
                              student={student}
                              attempt={getStudentAttempt(student)}
                              totalItems={totalItems}
                              isHighlighted={highlightedEnrollmentId === student.enrollment_id}
                              isAdminView={isAdminView}
                              isLocked={exam.is_locked}
                              onScan={handleScanStudent}
                            />
                          ))}
                        </>
                      )}
                      {femaleStudents.length > 0 && (
                        <>
                          <div className="px-4 py-2 bg-gray-100 text-sm font-bold text-center text-gray-700">
                            Female ({femaleStudents.length})
                          </div>
                          {femaleStudents.map(student => (
                            <StudentMobileRow
                              key={student.enrollment_id}
                              student={student}
                              attempt={getStudentAttempt(student)}
                              totalItems={totalItems}
                              isHighlighted={highlightedEnrollmentId === student.enrollment_id}
                              isAdminView={isAdminView}
                              isLocked={exam.is_locked}
                              onScan={handleScanStudent}
                            />
                          ))}
                        </>
                      )}
                    </>
                  )}
                </div>
              </>
            )}
          </>
        )}

          </Paper>
        </Stack>
      </>
    );
  }

  const clampTranslate = (x: number, y: number, scale: number) => {
    const el = imgContainerRef.current;
    if (!el || scale <= 1) return { x: 0, y: 0 };
    const maxX = (el.clientWidth * (scale - 1)) / 2;
    const maxY = (el.clientHeight * (scale - 1)) / 2;
    return {
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    };
  };

  // Wizard steps: capture / review / submit
  return (
    <>
      {/* Image viewer overlay */}
      {viewerUrl && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-8"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setViewerUrl(null);
              setImgScale(1);
              setImgTranslate({ x: 0, y: 0 });
            }
          }}
        >
        <div
          className="bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden w-full max-w-2xl"
          style={{ maxHeight: '90vh' }}
        >
          {/* Header bar */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
            <span className="font-semibold text-sm text-gray-800">Answer Sheet Preview</span>
            <button
              type="button"
              onClick={() => {
                setViewerUrl(null);
                setImgScale(1);
                setImgTranslate({ x: 0, y: 0 });
              }}
              className="text-gray-500 p-1 rounded-full hover:bg-gray-100 transition-colors"
              aria-label="Close preview"
            >
              <IconX className="w-6 h-6" />
            </button>
          </div>

          {/* Zoomable image area */}
          <div
            ref={imgContainerRef}
            className="relative overflow-hidden bg-gray-50 select-none"
            style={{ height: '70vh', cursor: imgScale > 1 ? 'grab' : 'default', touchAction: 'none' }}
            onWheel={(e) => {
              e.preventDefault();
              const factor = e.deltaY > 0 ? 0.9 : 1.1;
              setImgScale(s => {
                const next = Math.min(Math.max(s * factor, 1), 5);
                setImgTranslate(t => clampTranslate(t.x, t.y, next));
                return next;
              });
            }}
            onMouseDown={(e) => {
              if (imgScale > 1) {
                isDraggingRef.current = true;
                dragStartRef.current = { x: e.clientX - imgTranslate.x, y: e.clientY - imgTranslate.y };
              }
            }}
            onMouseMove={(e) => {
              if (isDraggingRef.current && dragStartRef.current) {
                const raw = { x: e.clientX - dragStartRef.current.x, y: e.clientY - dragStartRef.current.y };
                setImgTranslate(clampTranslate(raw.x, raw.y, imgScale));
              }
            }}
            onMouseUp={() => { isDraggingRef.current = false; }}
            onMouseLeave={() => { isDraggingRef.current = false; }}
            onTouchStart={(e) => {
              if (e.touches.length === 2) {
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                lastTouchDistRef.current = Math.hypot(dx, dy);
              } else if (e.touches.length === 1) {
                lastTouchPosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
                const now = Date.now();
                if (now - lastTapTimeRef.current < 300) {
                  setImgScale(s => {
                    if (s > 1) { setImgTranslate({ x: 0, y: 0 }); return 1; }
                    setImgTranslate({ x: 0, y: 0 });
                    return 2.5;
                  });
                }
                lastTapTimeRef.current = now;
              }
            }}
            onTouchMove={(e) => {
              if (e.touches.length === 2) {
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                const dist = Math.hypot(dx, dy);
                if (lastTouchDistRef.current !== null) {
                  const ratio = dist / lastTouchDistRef.current;
                  setImgScale(s => {
                    const next = Math.min(Math.max(s * ratio, 1), 5);
                    setImgTranslate(t => clampTranslate(t.x, t.y, next));
                    return next;
                  });
                }
                lastTouchDistRef.current = dist;
              } else if (e.touches.length === 1 && lastTouchPosRef.current) {
                const dx = e.touches[0].clientX - lastTouchPosRef.current.x;
                const dy = e.touches[0].clientY - lastTouchPosRef.current.y;
                setImgTranslate(t => clampTranslate(t.x + dx, t.y + dy, imgScale));
                lastTouchPosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
              }
            }}
            onTouchEnd={() => { lastTouchDistRef.current = null; }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={viewerUrl}
              alt="Answer sheet preview"
              draggable={false}
              style={{
                transform: `scale(${imgScale}) translate(${imgTranslate.x / imgScale}px, ${imgTranslate.y / imgScale}px)`,
                transformOrigin: 'center center',
                transition: imgScale === 1 ? 'transform 0.2s ease' : 'none',
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                userSelect: 'none',
              }}
            />

            {imgScale > 1 && (
              <button
                type="button"
                onClick={() => { setImgScale(1); setImgTranslate({ x: 0, y: 0 }); }}
                className="absolute bottom-4 right-4 bg-white/90 rounded-full px-3 py-1 text-xs text-gray-800 shadow-lg"
              >
                Reset zoom
              </button>
            )}
            {imgScale === 1 && (
              <p className="absolute bottom-3 left-0 right-0 text-center text-xs text-gray-400 pointer-events-none">
                Pinch or double-tap to zoom · drag to pan
              </p>
            )}
          </div>
        </div>
        </div>
      )}
      {(cameraActive || startingCamera || scannerProcessingCapture || scannerProcessedPreviewUrl || scannerCaptureError) && (
        <div className="fixed inset-0 z-[10000] bg-black text-white">
          {(cameraActive || startingCamera) && (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 h-full w-full object-contain"
            />
          )}

          {scannerProcessedPreviewUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={scannerProcessedPreviewUrl}
              alt="Marked answer sheet"
              className="absolute inset-0 h-full w-full object-contain"
            />
          )}

          {cameraActive && liveDocument?.corners && (
            <svg
              className="absolute inset-0 h-full w-full pointer-events-none"
              viewBox={`0 0 ${liveDocument.width} ${liveDocument.height}`}
              preserveAspectRatio="xMidYMid meet"
            >
              <polygon
                points={visualPolygonCorners(liveDocument)}
                fill={liveDocument.isVisible ? 'rgba(78,174,74,0.10)' : 'rgba(255,193,7,0.08)'}
                stroke={liveDocument.isVisible ? '#4EAE4A' : '#F6C343'}
                strokeWidth={Math.max(4, liveDocument.width * 0.006)}
                strokeLinejoin="round"
              />
            </svg>
          )}

          {scannerProcessingCapture && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/65 px-6 text-center">
              <div className="rounded-2xl bg-black/70 px-5 py-4 shadow-xl backdrop-blur">
                <Text c="white" fw={700}>{scannerStatus || 'Processing scan'}</Text>
                <Text c="white" opacity={0.75} size="sm" mt={4}>Correcting orientation...</Text>
              </div>
            </div>
          )}

          {scannerCaptureError && !scannerProcessingCapture && (
            <div
              role="alert"
              className="absolute inset-x-4 top-28 rounded-2xl border border-red-300/60 bg-red-600 px-4 py-3 text-sm shadow-2xl"
            >
              <Text c="white" fw={800} size="sm">Wrong answer sheet</Text>
              <Text c="white" fw={600} size="sm" mt={4}>
                {scannerCaptureError}
              </Text>
            </div>
          )}

          <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))]">
            {scannerProcessedPreviewUrl || scannerCaptureError ? (
              <button
                type="button"
                onClick={handleScannerRetake}
                className="rounded-full bg-black/60 px-4 py-2 text-sm font-bold text-white backdrop-blur"
              >
                Retake
              </button>
            ) : (
              <button
                type="button"
                onClick={stopCamera}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur"
                aria-label="Close scanner"
              >
                <IconX className="h-6 w-6" />
              </button>
            )}

            {scannerProcessedPreviewUrl || scannerCaptureError ? (
              <button
                type="button"
                onClick={handleScannerDone}
                disabled={!scannerScanResult || Boolean(scannerCaptureError)}
                className="rounded-full bg-white px-5 py-2 text-sm font-bold text-black shadow-lg disabled:opacity-50"
              >
                Done
              </button>
            ) : (
              <div className="flex items-center gap-1 rounded-full bg-black/55 p-1 text-xs font-semibold backdrop-blur">
                {(['off', 'auto', 'on'] as const).map((mode) => {
                  const selected = flashMode === mode;
                  const disabled = mode === 'on' && !torchSupported;
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => !disabled && setFlashMode(mode)}
                      disabled={disabled}
                      className={[
                        'flex h-9 min-w-14 items-center justify-center gap-1 rounded-full px-3 transition',
                        selected ? 'bg-white text-black' : 'text-white/85',
                        disabled ? 'cursor-not-allowed opacity-40' : 'hover:bg-white/15',
                      ].join(' ')}
                      title={disabled ? 'Flash is not supported on this camera' : `Flash ${mode}`}
                    >
                      {mode === 'off' ? <IconBoltOff className="h-4 w-4" /> : <IconBolt className="h-4 w-4" />}
                      <span className="capitalize">{mode}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {!scannerProcessedPreviewUrl && !scannerCaptureError && (
          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-4 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <div className="rounded-full bg-black/55 px-4 py-2 text-sm font-semibold shadow-lg backdrop-blur">
              {startingCamera ? 'Initializing camera' : scannerStatus}
            </div>
            <button
              type="button"
              onClick={captureFromCamera}
              disabled={startingCamera || autoCapturing}
              className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white/90 bg-white/20 shadow-2xl transition active:scale-95 disabled:opacity-60"
              aria-label="Capture answer sheet"
            >
              <span className="block h-14 w-14 rounded-full bg-white" />
            </button>
          </div>
          )}
        </div>
      )}
      <h1 className="text-xl md:text-2xl font-bold mb-2 md:mb-4 text-[#597D37]">Scan Papers</h1>
      <Container fluid py={{ base: 'md', sm: 'xl' }} px={{ base: 0, sm: 'md' }} h="100%">
      <div style={isMobile ? { paddingBottom: 80 } : undefined}>
      <VerticalWizardLayout active={stepIndex} steps={wizardSteps}>

        {/* STEP: CAPTURE */}
        {step === 'capture' && (
          <Stack gap="sm">
            {!isMobile && <Text size="xl" fw={700} c={STEP_HEADING_COLOR}>Scan Answer Sheet</Text>}
            <Stack gap="md">
                {/* Student & Examination Information */}
                <Paper withBorder radius="md" p="md" style={{ borderColor: STEP_BORDER_COLOR }}>
                  <Text size="lg" fw={700} mb="md" c={STEP_HEADING_COLOR}>Student &amp; Examination Information</Text>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div>
                      <Text size="sm" fw={700} mb={2}>Student Name</Text>
                      <Text size="sm">{selectedStudent?.full_name ?? '—'}</Text>
                    </div>
                    <div>
                      <Text size="sm" fw={700} mb={2}>LRN</Text>
                      <Text size="sm">{selectedStudent?.lrn ?? '—'}</Text>
                    </div>
                    <div>
                      <Text size="sm" fw={700} mb={2}>Exam Name</Text>
                      <Text size="sm">{exam.title}</Text>
                    </div>
                    <div>
                      <Text size="sm" fw={700} mb={2}>Items</Text>
                      <Text size="sm">{totalItems}</Text>
                    </div>
                  </div>
                </Paper>

                {/* Scanning Guidelines — only on the initial upload page */}
                {!cameraActive && !previewUrl && (
                  <Paper withBorder radius="md" p="md" style={{ borderColor: STEP_BORDER_COLOR }}>
                    <Text size="lg" fw={700} mb="md" c={STEP_HEADING_COLOR}>Scanning Guidelines</Text>
                    <div>
                      <p className="font-semibold text-sm mb-2">Tips for best results:</p>
                      <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
                        <li>Place the sheet on a dark, flat surface with good lighting.</li>
                        <li>Keep all 4 black corner squares fully visible in the frame.</li>
                        <li>Hold the camera directly above the sheet and avoid tilt, glare, and shadows.</li>
                        <li>Make sure bubbles are filled darkly and completely.</li>
                      </ul>
                    </div>
                  </Paper>
                )}

                {/* Upload Answer Sheet — shows upload buttons or uploaded preview */}
                {!cameraActive && (
                  <Paper withBorder radius="md" p="md" style={{ borderColor: STEP_BORDER_COLOR }}>
                    <Text size="lg" fw={700} mb="md" c={STEP_HEADING_COLOR}>Upload Answer Sheet</Text>

                    {duplicateImageError && (
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
                        <Text fw={700} size="sm">Duplicate Image</Text>
                        <Text size="sm" fs="italic">You already uploaded this image. Please select a different one.</Text>
                      </Alert>
                    )}

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
                          {processingError.toLowerCase().includes('answer sheet') ? 'Wrong Answer Sheet' : 'Processing Failed'}
                        </Text>
                        <Text size="sm" fs="italic">{processingError}</Text>
                      </Alert>
                    )}

                    {previewUrl ? (
                      <>
                        <button
                          type="button"
                          className="mb-4 block w-full max-h-96 overflow-hidden rounded-xl bg-gray-50 cursor-zoom-in"
                          onClick={() => setViewerUrl(previewUrl)}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={previewUrl}
                            alt="Captured sheet"
                            className="w-full max-h-96 object-contain"
                          />
                        </button>
                        <Group justify="flex-end">
                          <Button
                            variant="default"
                            onClick={() => {
                              if (fileInputRef.current) fileInputRef.current.value = '';
                              setDuplicateImageError(false);
                              setViewerUrl(null);
                              setProcessingError(null);
                              setPreviewUrl(null);
                              setCapturedFile(null);
                            }}
                            leftSection={<IconRefresh className="w-4 h-4" />}
                          >
                            Retake
                          </Button>
                        </Group>
                      </>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <button
                          onClick={() => { if (fileInputRef.current) { fileInputRef.current.value = ''; fileInputRef.current.click(); } }}
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
                    )}
                  </Paper>
                )}

                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileInput} />
            </Stack>
          </Stack>
        )}

        {/* â"€â"€ STEP: PROCESSING â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
        {step === 'processing' && (
          <Stack gap="sm">
            {!isMobile && <Text size="xl" fw={700} c={STEP_HEADING_COLOR}>Scan Answer Sheet</Text>}
            <Stack gap="md">
              <Paper withBorder radius="md" p="md" style={{ borderColor: STEP_BORDER_COLOR }}>
                <Text size="lg" fw={700} mb="md" c={STEP_HEADING_COLOR}>Student &amp; Examination Information</Text>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <Text size="sm" fw={700} mb={2}>Student Name</Text>
                    <Text size="sm">{selectedStudent?.full_name ?? '—'}</Text>
                  </div>
                  <div>
                    <Text size="sm" fw={700} mb={2}>LRN</Text>
                    <Text size="sm">{selectedStudent?.lrn ?? '—'}</Text>
                  </div>
                  <div>
                    <Text size="sm" fw={700} mb={2}>Exam Name</Text>
                    <Text size="sm">{exam.title}</Text>
                  </div>
                  <div>
                    <Text size="sm" fw={700} mb={2}>Items</Text>
                    <Text size="sm">{totalItems}</Text>
                  </div>
                </div>
              </Paper>

              <Paper withBorder radius="md" p="md" style={{ borderColor: STEP_BORDER_COLOR }}>
                <Group justify="space-between" align="center" mb="md">
                  <Skeleton height={22} width="48%" radius="md" />
                  <Text size="sm" fw={500} c="dimmed">
                    {processingStatus || 'Processing answer sheet...'}
                  </Text>
                </Group>

                <Skeleton height={260} radius="md" mb="md" />

                <Group justify="space-between" align="center">
                  <Skeleton height={12} width="36%" radius="md" />
                  <Skeleton height={30} width={96} radius="md" />
                </Group>
              </Paper>
            </Stack>
          </Stack>
        )}

        {/* â"€â"€ STEP: REVIEW â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
        {step === 'review' && (
          <Stack gap="sm">
            {!isMobile && <Text size="xl" fw={700} c={STEP_HEADING_COLOR}>Review Detected Answers</Text>}
            <Stack gap="md">

                {/* Student & Examination Information */}
                <Paper withBorder radius="md" p="md" style={{ borderColor: STEP_BORDER_COLOR }}>
                  <Text size="lg" fw={700} mb="md" c={STEP_HEADING_COLOR}>Student &amp; Examination Information</Text>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div>
                      <Text size="sm" fw={700} mb={2}>Student Name</Text>
                      <Text size="sm">{selectedStudent?.full_name ?? '—'}</Text>
                    </div>
                    <div>
                      <Text size="sm" fw={700} mb={2}>LRN</Text>
                      <Text size="sm">{selectedStudent?.lrn ?? '—'}</Text>
                    </div>
                    <div>
                      <Text size="sm" fw={700} mb={2}>Exam Name</Text>
                      <Text size="sm">{exam.title}</Text>
                    </div>
                    <div>
                      <Text size="sm" fw={700} mb={2}>Items</Text>
                      <Text size="sm">{totalItems}</Text>
                    </div>
                  </div>
                </Paper>

                {/* Answer Bubble Detection Map */}
                {debugImageUrl && (
                  <Paper withBorder radius="md" p="md" style={{ borderColor: STEP_BORDER_COLOR }}>
                    <Text size="lg" fw={700} mb="md" c={STEP_HEADING_COLOR}>Answer Bubble Detection Map</Text>
                    <div className="mb-3">
                      <Text size="sm" fw={600} mb={4}>Detection Guide:</Text>
                      <div className="flex items-center gap-4 text-sm mb-1">
                        <span className="flex items-center gap-1.5">
                          <span className="inline-block w-3 h-3 rounded-full bg-green-500" />
                          Detected Answer
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="inline-block w-3 h-3 rounded-full bg-red-500" />
                          Not Selected
                        </span>
                      </div>
                      <Text size="xs" c="dimmed">Confirm that all markers correctly align with the answer bubbles.</Text>
                    </div>
                    {!cornersOk && (
                      <div className="flex items-start gap-2 text-sm bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-3">
                        <IconAlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5 shrink-0" />
                        <p className="text-yellow-700">Corner markers not found — results may be less accurate. Review and correct any wrong answers.</p>
                      </div>
                    )}
                    <button
                      type="button"
                      className="w-full overflow-auto bg-gray-100 rounded-xl flex items-start justify-center p-2 cursor-zoom-in"
                      style={{ maxHeight: '640px' }}
                      onClick={() => setViewerUrl(debugImageUrl)}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={debugImageUrl} alt="OMR debug" style={{ height: '640px', width: 'auto' }} className="object-contain pointer-events-none" />
                    </button>
                  </Paper>
                )}

                {/* Review Detected Answers */}
                <Paper withBorder radius="md" p="md" style={{ borderColor: STEP_BORDER_COLOR }}>
                  <Text size="lg" fw={700} mb="md" c={STEP_HEADING_COLOR}>Review Detected Answers</Text>

                  <div className="mx-auto w-full max-w-[860px] flex flex-col gap-4">
                    {/* Stat cards — clickable filters for faster review */}
                    <div className="grid grid-cols-4 gap-3 w-full">
                      {([
                        { filter: 'detected', count: answeredCount, label: 'Detected' },
                        { filter: 'undetected', count: undetectedCount, label: 'Undetected' },
                        { filter: 'needs_attention', count: needsAttentionCount, label: 'Needs Attention' },
                        { filter: 'all', count: totalItems, label: 'All Items' },
                      ] as const).map(({ filter, count, label }) => (
                        <button
                          key={filter}
                          type="button"
                          onClick={() => setReviewFilter(filter)}
                          className={`rounded-xl p-3 flex flex-col items-center justify-center border transition ${reviewFilter === filter ? 'border-[#2f7f2b] bg-[#4EAE4A]' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
                        >
                          <span className={`text-2xl font-bold ${reviewFilter === filter ? 'text-white' : 'text-gray-900'}`}>{count}</span>
                          <span className={`text-xs mt-0.5 leading-tight text-center ${reviewFilter === filter ? 'text-white/95' : 'text-gray-600'}`}>{label}</span>
                        </button>
                      ))}
                    </div>
                    <Group justify="center" align="center" gap="sm">
                      <Text size="xs" c="dimmed">
                        {`Low-confidence items: ${lowConfidenceCount}. Tap a count card to filter.`}
                      </Text>
                    </Group>

                    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-gray-500">
                      <div className="flex items-center gap-1.5">
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full border bg-[#eef8e9] border-[#4EAE4A] text-[#2f5f2d] text-[10px] font-bold">A</span>
                        <span>Answer Key</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full border bg-green-600 border-green-600 text-white text-[10px] font-bold">A</span>
                        <span>Correct</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full border bg-[#fef2f2] border-[#f87171] text-[#991b1b] text-[10px] font-bold">A</span>
                        <span>Wrong Answer</span>
                      </div>
                    </div>

                    {/* Bubble columns */}
                    {allReviewItems.length === 0 ? (
                      <div className="w-full rounded-xl border border-gray-200 bg-white p-5 text-center">
                        <Text size="sm" fw={700} c="dark">No items found for this filter</Text>
                        <Text size="xs" c="dimmed" mt={4}>
                          Try another filter, or show all items to continue reviewing.
                        </Text>
                        <Group justify="center" mt="sm">
                          <Button
                            size="xs"
                            variant="default"
                            onClick={() => setReviewFilter('all')}
                          >
                            Show all items
                          </Button>
                        </Group>
                      </div>
                    ) : (
                      <Paper withBorder radius="md" p={0} style={{ overflow: 'hidden', width: 'fit-content', margin: '0 auto' }}>
                        <div className="flex flex-col md:flex-row justify-center items-start md:divide-x md:divide-gray-100">
                          {[1, 2].map(col => {
                            const splitIndex = Math.ceil(allReviewItems.length / 2);
                            const columnItems = col === 1
                              ? allReviewItems.slice(0, splitIndex)
                              : allReviewItems.slice(splitIndex);
                            if (columnItems.length === 0) return null;
                            return (
                              <div key={col} className="overflow-x-auto">
                                <table className="w-auto border-collapse text-sm [&_th]:border-x-0 [&_td]:border-x-0">
                                  <colgroup>
                                    <col className="w-8" />
                                    {choices.map((_, i) => <col key={i} className="w-9" />)}
                                    <col className="w-[64px]" />
                                  </colgroup>
                                  {(col === 1 || !isMobile) && (
                                    <thead>
                                      <tr className="bg-[#4EAE4A]">
                                        <th className="h-7 w-8 px-1 text-center text-xs font-semibold text-white whitespace-nowrap">No.</th>
                                        {choices.map(ch => (
                                          <th key={ch} className="h-7 w-9 px-1 text-center text-xs font-semibold text-white whitespace-nowrap">{ch}</th>
                                        ))}
                                        <th className="h-7 w-[64px] px-2 text-center text-xs font-semibold text-white whitespace-nowrap">Status</th>
                                      </tr>
                                    </thead>
                                  )}
                                  <tbody className="divide-y divide-gray-100">
                                    {columnItems.map((item, rowIdx) => {
                                      const correct = answerKey[item];
                                      const detected = detectedAnswers[item];
                                      const statusChip = getStatusChip(detected, correct);
                                      const rowHighlight = getRowHighlight(item);
                                      return (
                                        <tr key={item} className={`transition-colors duration-300 ${rowHighlight || (!detected && reviewFilter === 'all' ? 'bg-gray-50' : '')}${col === 2 && rowIdx === 0 ? ' border-t border-gray-100' : ''}`}>
                                          <td className="py-1 px-1 text-center text-xs font-semibold text-gray-600">{item}</td>
                                          {choices.map(ch => (
                                            <td key={ch} className="py-1 px-1 text-center">
                                              <button
                                                type="button"
                                                onClick={() => toggleAnswer(item, ch)}
                                                className={`w-8 h-8 rounded-full border flex items-center justify-center font-bold text-xs transition duration-75 hover:scale-105 ${confColor(item, ch)}`}
                                              >
                                                {ch}
                                              </button>
                                            </td>
                                          ))}
                                          <td className="py-1 px-2 text-center">
                                            <span className={`${STATUS_CHIP_CLASS} ${statusChip.className}`}>
                                              {statusChip.label}
                                            </span>
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
                    )}

                  </div>

                  <Group justify="flex-end" mt="md">
                    <Button
                      variant="default"
                      onClick={handleResetToDetected}
                      disabled={!hasManualReviewChanges}
                      leftSection={<IconRefresh className="w-4 h-4" />}
                    >
                      Reset to detected
                    </Button>
                  </Group>
                </Paper>

            </Stack>
          </Stack>
        )}

        {/* â"€â"€ STEP: SUBMIT â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
        {step === 'submit' && (
          <Stack gap="sm">
            {!isMobile && <Text size="xl" fw={700} c={STEP_HEADING_COLOR}>Save Scanned Results</Text>}
            <Stack gap="md">

                {/* Student & Examination Information */}
                <Paper withBorder radius="md" p="md" style={{ borderColor: STEP_BORDER_COLOR }}>
                  <Text size="lg" fw={700} mb="md" c={STEP_HEADING_COLOR}>Student &amp; Examination Information</Text>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div>
                      <Text size="sm" fw={700} mb={2}>Student Name</Text>
                      <Text size="sm">{selectedStudent?.full_name ?? '—'}</Text>
                    </div>
                    <div>
                      <Text size="sm" fw={700} mb={2}>LRN</Text>
                      <Text size="sm">{selectedStudent?.lrn ?? '—'}</Text>
                    </div>
                    <div>
                      <Text size="sm" fw={700} mb={2}>Exam Name</Text>
                      <Text size="sm">{exam.title}</Text>
                    </div>
                    <div>
                      <Text size="sm" fw={700} mb={2}>Items</Text>
                      <Text size="sm">{totalItems}</Text>
                    </div>
                  </div>
                </Paper>

                {/* Student Responses & Correct Answers */}
                <Paper withBorder radius="md" p="md" style={{ borderColor: STEP_BORDER_COLOR }}>
                  <Text size="lg" fw={700} mb="md" c={STEP_HEADING_COLOR}>Student Responses &amp; Correct Answers</Text>

                  {/* Score card */}
                  <div className="bg-white border border-gray-200 rounded-xl p-4 text-center mb-4 mx-auto max-w-sm">
                    <p className="text-3xl font-bold text-gray-900">{score}/{totalItems}</p>
                    <p className="text-gray-800 text-sm mt-1">
                      Level of Proficiency: {getProficiency(scoreMpl)} · {answeredCount} bubbles detected
                    </p>
                    {!hasAnswerKey && <p className="text-xs text-amber-600 mt-1">Set answer key to score correctness</p>}
                  </div>

                  <Paper withBorder radius="md" p={0} style={{ overflow: 'hidden', width: 'fit-content', margin: '0 auto' }}>
                    {isMobile ? (
                      <div className="overflow-x-auto">
                        <table className="w-auto table-fixed border-collapse text-sm [&_th]:border-x-0 [&_td]:border-x-0">
                          <colgroup>
                            <col className="w-8" />
                            <col className="w-14" />
                            <col className="w-14" />
                            <col className="w-[64px]" />
                          </colgroup>
                          <thead>
                            <tr className="bg-[#4EAE4A]">
                              <th className="h-7 w-8 px-1 text-center text-xs font-semibold text-white whitespace-nowrap">No.</th>
                              <th className="h-7 w-14 px-2 text-center text-xs font-semibold text-white whitespace-nowrap">Student</th>
                              <th className="h-7 w-14 px-2 text-center text-xs font-semibold text-white whitespace-nowrap">Correct</th>
                              <th className="h-7 w-[64px] px-2 text-center text-xs font-semibold text-white whitespace-nowrap">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {itemResults.map((r) => {
                              const statusChip = getStatusChip(r.student, r.correct);
                              return (
                                <tr key={`submit-${r.item}`}>
                                  <td className="w-8 py-1 px-1 text-center text-xs font-semibold text-gray-600">{r.item}</td>
                                  <td className="w-14 py-1 px-2 text-center text-xs text-gray-800">{r.student ?? '-'}</td>
                                  <td className="w-14 py-1 px-2 text-center text-xs text-gray-800">{r.correct ?? '-'}</td>
                                  <td className="w-[64px] py-1 px-2 text-center">
                                    <span className={`${STATUS_CHIP_CLASS} ${statusChip.className}`}>
                                      {statusChip.label}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="flex justify-center items-start divide-x divide-gray-100">
                        {[1, 2].map(col => {
                          const itemsInCol1 = Math.ceil(itemResults.length / 2);
                          const colItems = col === 1 ? itemResults.slice(0, itemsInCol1) : itemResults.slice(itemsInCol1);
                          if (colItems.length === 0) return null;
                          return (
                            <div key={col} className="overflow-x-auto">
                              <table className="w-auto table-fixed border-collapse text-sm [&_th]:border-x-0 [&_td]:border-x-0">
                                <colgroup>
                                  <col className="w-8" />
                                  <col className="w-14" />
                                  <col className="w-14" />
                                  <col className="w-[64px]" />
                                </colgroup>
                                <thead>
                                  <tr className="bg-[#4EAE4A]">
                                    <th className="h-7 w-8 px-1 text-center text-xs font-semibold text-white whitespace-nowrap">No.</th>
                                    <th className="h-7 w-14 px-2 text-center text-xs font-semibold text-white whitespace-nowrap">Student</th>
                                    <th className="h-7 w-14 px-2 text-center text-xs font-semibold text-white whitespace-nowrap">Correct</th>
                                    <th className="h-7 w-[64px] px-2 text-center text-xs font-semibold text-white whitespace-nowrap">Status</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {colItems.map((r) => {
                                    const statusChip = getStatusChip(r.student, r.correct);
                                    return (
                                      <tr key={`submit-${r.item}`}>
                                        <td className="w-8 py-1 px-1 text-center text-xs font-semibold text-gray-600">{r.item}</td>
                                        <td className="w-14 py-1 px-2 text-center text-xs text-gray-800">{r.student ?? '-'}</td>
                                        <td className="w-14 py-1 px-2 text-center text-xs text-gray-800">{r.correct ?? '-'}</td>
                                        <td className="w-[64px] py-1 px-2 text-center">
                                          <span className={`${STATUS_CHIP_CLASS} ${statusChip.className}`}>
                                            {statusChip.label}
                                          </span>
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
                    )}
                  </Paper>
                </Paper>

            </Stack>
          </Stack>
        )}
      </VerticalWizardLayout>
      {!isMobile && getNavButtons()}
      </div>
      {isMobile && (
        <div style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: 'white',
          borderTop: '1px solid #e5e7eb',
          padding: '12px 16px',
          zIndex: 200,
        }}>
          {getNavButtons(0)}
        </div>
      )}
    </Container>
    </>
  );
}
