'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  IconX,
  IconUpload,
  IconCamera,
  IconCircleCheck,
  IconAlertTriangle,
  IconRefresh,
  IconDeviceFloppy,
  IconChevronRight,
  IconChevronLeft,
  IconSearch,
} from '@tabler/icons-react';
import Image from 'next/image';
import { processAnswerSheet } from '@/lib/services/omrService';
import { createAttempt, fetchAttemptsForExam, scoreResponses } from '@/lib/services/attemptService';
import { computeItemStatistics, saveItemStatistics } from '@/lib/services/analysisService';
import { supabase } from '@/lib/exam-supabase';
import type { ExamWithRelations, AnswerKeyJsonb, ExamAttempt } from '@/lib/exam-supabase';

type Step = 'students' | 'capture' | 'processing' | 'review' | 'submit';
type DetectedAnswers = { [item: number]: string | null };

interface ScanPapersModalProps {
  exam: ExamWithRelations;
  onClose: () => void;
  onSuccess: () => void;
}

type StudentRow = {
  uid: string;
  fullName: string;
  studentLrn: string | null;
  enrollmentId: number | null;
  sectionId: number | null;
};

const CHOICES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

function buildFullName(firstName: string, middleName: string | null, lastName: string): string {
  return [firstName, middleName ?? '', lastName].join(' ').replace(/\s+/g, ' ').trim();
}

type JoinedStudentRow = {
  lrn?: string | null;
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
};

type EnrollmentQueryRow = {
  enrollment_id?: number | null;
  section_id?: number | null;
  lrn?: string | null;
  student_lrn?: string | null;
  students?: JoinedStudentRow | JoinedStudentRow[] | null;
};

function normalizeJoinedStudent(raw: EnrollmentQueryRow): { fullName: string; lrn: string | null } {
  const rawStudent = Array.isArray(raw.students) ? raw.students[0] : raw.students;
  const fullName =
    rawStudent?.full_name?.trim() ||
    buildFullName(rawStudent?.first_name ?? '', rawStudent?.middle_name ?? null, rawStudent?.last_name ?? '');
  const lrn = raw.lrn ?? raw.student_lrn ?? rawStudent?.lrn ?? null;
  return { fullName, lrn };
}

export default function ScanPapersModal({ exam, onClose, onSuccess }: ScanPapersModalProps) {
  const [step, setStep] = useState<Step>('students');
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [detectedAnswers, setDetectedAnswers] = useState<DetectedAnswers>({});
  const [cornersOk, setCornersOk] = useState(true);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [studentName, setStudentName] = useState('');
  const [studentLrn, setStudentLrn] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [startingCamera, setStartingCamera] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [attempts, setAttempts] = useState<ExamAttempt[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [selectedStudentUid, setSelectedStudentUid] = useState<string | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoTrackRef = useRef<MediaStreamTrack | null>(null);

  const ak = exam.answer_key as AnswerKeyJsonb | null;
  const totalItems = ak?.total_questions ?? exam.total_items ?? 30;
  const numChoices = ak?.num_choices ?? 4;
  const choices = CHOICES.slice(0, numChoices);
  const answerKey: { [item: number]: string | null } = ak?.answers ?? {};

  const assignedSections = useMemo(() => {
    return (exam.exam_assignments ?? [])
      .map((assignment) => ({
        sectionId: assignment.sections?.section_id ?? null,
        sectionName: assignment.sections?.name ?? '',
        gradeLabel: assignment.sections?.grade_levels?.display_name ?? '',
      }))
      .filter((s): s is { sectionId: number; sectionName: string; gradeLabel: string } => s.sectionId !== null);
  }, [exam.exam_assignments]);

  const selectedStudent = useMemo(
    () => students.find((s) => s.uid === selectedStudentUid) ?? null,
    [students, selectedStudentUid]
  );

  const latestAttemptByName = useMemo(() => {
    const map = new Map<string, ExamAttempt>();
    for (const attempt of attempts) {
      const key = (attempt.student_name ?? '').trim().toLowerCase();
      if (!key || map.has(key)) continue;
      map.set(key, attempt);
    }
    return map;
  }, [attempts]);

  const latestAttemptByEnrollment = useMemo(() => {
    const map = new Map<number, ExamAttempt>();
    for (const attempt of attempts) {
      if (!attempt.enrollment_id || map.has(attempt.enrollment_id)) continue;
      map.set(attempt.enrollment_id, attempt);
    }
    return map;
  }, [attempts]);

  const filteredStudents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return students;
    return students.filter((student) => student.fullName.toLowerCase().includes(query));
  }, [students, searchQuery]);

  useEffect(() => {
    if (selectedSectionId === null && assignedSections.length > 0) {
      setSelectedSectionId(assignedSections[0].sectionId);
    }
  }, [assignedSections, selectedSectionId]);

  const resetScanFlow = useCallback(() => {
    setCapturedFile(null);
    setPreviewUrl(null);
    setDetectedAnswers({});
    setCornersOk(true);
    setProcessingError(null);
    setCameraActive(false);
    setStartingCamera(false);
  }, []);

  const fetchEnrolledStudentsForSection = useCallback(async (sectionId: number): Promise<StudentRow[]> => {
    const tryQuery = async (selectClause: string) => {
      return supabase.from('enrollments').select(selectClause).eq('section_id', sectionId);
    };

    const queryAttempts = [
      `
        enrollment_id,
        section_id,
        lrn,
        students!inner(
          lrn,
          first_name,
          middle_name,
          last_name,
          full_name
        )
      `,
      `
        enrollment_id,
        section_id,
        student_lrn,
        students!inner(
          lrn,
          first_name,
          middle_name,
          last_name,
          full_name
        )
      `,
    ];

    let rows: EnrollmentQueryRow[] = [];
    let lastError: string | null = null;

    for (const selectClause of queryAttempts) {
      const { data, error } = await tryQuery(selectClause);
      if (!error) {
        rows = (data ?? []) as EnrollmentQueryRow[];
        lastError = null;
        break;
      }
      lastError = error.message;
    }

    if (lastError) {
      console.error('[ScanPapersModal] failed to load enrollments:', lastError);
      return [];
    }

    return rows
      .map((row, index) => {
        const normalized = normalizeJoinedStudent(row);
        if (!normalized.fullName) return null;
        return {
          uid: `enr-${row.enrollment_id ?? index}-${normalized.lrn ?? normalized.fullName}`,
          fullName: normalized.fullName,
          studentLrn: normalized.lrn,
          enrollmentId: row.enrollment_id ?? null,
          sectionId: row.section_id ?? sectionId,
        } satisfies StudentRow;
      })
      .filter((row): row is StudentRow => row !== null);
  }, []);

  const loadStudentsAndAttempts = useCallback(async () => {
    setLoadingStudents(true);
    const [attemptRows, enrolledStudents] = await Promise.all([
      fetchAttemptsForExam(exam.exam_id),
      selectedSectionId ? fetchEnrolledStudentsForSection(selectedSectionId) : Promise.resolve([]),
    ]);

    setAttempts(attemptRows);
    setStudents(enrolledStudents);
    setLoadingStudents(false);
  }, [exam.exam_id, fetchEnrolledStudentsForSection, selectedSectionId]);

  useEffect(() => {
    loadStudentsAndAttempts();
  }, [loadStudentsAndAttempts]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const startCamera = async () => {
    if (startingCamera) return;
    setStartingCamera(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera API not available in this browser.');
      }

      const attemptsConstraints: MediaStreamConstraints[] = [
        {
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        },
        { video: { width: { ideal: 1600 }, height: { ideal: 900 } }, audio: false },
        { video: true, audio: false },
      ];

      let stream: MediaStream | null = null;
      for (const constraints of attemptsConstraints) {
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
          break;
        } catch {
          // Try next constraints.
        }
      }

      if (!stream) throw new Error('Unable to access camera.');

      streamRef.current = stream;
      videoTrackRef.current = stream.getVideoTracks()[0] ?? null;

      if (videoTrackRef.current) {
        try {
          await videoTrackRef.current.applyConstraints({
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30 },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any);
        } catch {
          // Ignore unsupported camera constraints.
        }
      }

      setCameraActive(true);

      let videoEl: HTMLVideoElement | null = null;
      for (let i = 0; i < 20; i++) {
        await new Promise((resolve) => setTimeout(resolve, 25));
        if (videoRef.current) {
          videoEl = videoRef.current;
          break;
        }
      }
      if (!videoEl) throw new Error('Video element failed to mount.');

      videoEl.srcObject = stream;
      videoEl.muted = true;

      await new Promise<void>((resolve) => {
        videoEl!.onloadedmetadata = () => resolve();
      });

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
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    videoTrackRef.current = null;
    setCameraActive(false);
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const handleFileSelected = (file: File) => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setCapturedFile(file);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelected(file);
  };

  const captureFromCamera = async () => {
    if (!videoRef.current) return;
    if (videoRef.current.readyState < 2 || videoRef.current.videoWidth === 0) {
      alert('Camera is still initializing. Please wait and try again.');
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ImageCaptureCtor = (window as any).ImageCapture;
    const track = videoTrackRef.current;
    if (ImageCaptureCtor && track) {
      try {
        const ic = new ImageCaptureCtor(track);
        const blob: Blob = await ic.takePhoto();
        const file = new File([blob], 'scan.jpg', { type: blob.type || 'image/jpeg' });
        stopCamera();
        handleFileSelected(file);
        return;
      } catch {
        // Fall through to canvas capture.
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
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], 'scan.jpg', { type: 'image/jpeg' });
      stopCamera();
      handleFileSelected(file);
    }, 'image/jpeg', 0.99);
  };

  const runProcessing = async () => {
    if (!capturedFile) return;
    setStep('processing');
    setProcessingError(null);
    try {
      const result = await processAnswerSheet(capturedFile, totalItems, numChoices);
      setDetectedAnswers(result.answers);
      setCornersOk(result.cornersAutoDetected);
      setStep('review');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Processing failed';
      setProcessingError(message);
      setStep('capture');
    }
  };

  const toggleAnswer = (item: number, choice: string) => {
    setDetectedAnswers((prev) => ({
      ...prev,
      [item]: prev[item] === choice ? null : choice,
    }));
  };

  const answeredCount = Object.values(detectedAnswers).filter(Boolean).length;
  const score = scoreResponses(
    Object.fromEntries(Object.entries(detectedAnswers).filter(([, value]) => value)) as { [k: number]: string },
    answerKey
  );
  const hasAnswerKey = Object.keys(answerKey).length > 0;
  const itemResults = Array.from({ length: totalItems }, (_, i) => {
    const item = i + 1;
    const student = detectedAnswers[item] ?? null;
    const correct = answerKey[item] ?? null;
    const isCorrect = Boolean(student && correct && student === correct);
    return { item, student, correct, isCorrect };
  });

  const handleSubmit = async () => {
    if (!studentName.trim()) {
      alert('Please select a student first.');
      return;
    }
    setSubmitting(true);

    const cleanedResponses: { [item: number]: string } = {};
    Object.entries(detectedAnswers).forEach(([k, value]) => {
      if (value) cleanedResponses[parseInt(k, 10)] = value;
    });

    const attempt = await createAttempt({
      exam_id: exam.exam_id,
      student_name: studentName.trim(),
      student_lrn: studentLrn.trim() || null,
      enrollment_id: selectedStudent?.enrollmentId ?? null,
      section_id: selectedStudent?.sectionId ?? selectedSectionId ?? null,
      responses: cleanedResponses,
      score,
      total_items: totalItems,
    });

    if (attempt) {
      const allAttempts = await fetchAttemptsForExam(exam.exam_id);
      const itemStats = computeItemStatistics(allAttempts, answerKey, totalItems);
      await saveItemStatistics(exam.exam_id, itemStats);
      setAttempts(allAttempts);
      onSuccess();
      resetScanFlow();
      setStep('students');
    } else {
      alert('Failed to save. Please try again.');
    }
    setSubmitting(false);
  };

  const handleStartScanForStudent = (student: StudentRow) => {
    setSelectedStudentUid(student.uid);
    setStudentName(student.fullName);
    setStudentLrn(student.studentLrn ?? '');
    resetScanFlow();
    setStep('capture');
  };

  const goBackToStudents = () => {
    stopCamera();
    resetScanFlow();
    setStep('students');
  };

  const confColor = (item: number, ch: string) => {
    const correct = answerKey[item];
    if (correct === ch) return 'bg-green-200 border-green-400 text-green-900 shadow-sm ring-2 ring-green-200';
    if (detectedAnswers[item] === ch) return 'bg-gray-300 border-gray-500 text-gray-900 shadow-sm ring-2 ring-gray-200';
    return 'bg-white border-gray-300 text-gray-500 hover:border-blue-500 hover:bg-blue-50';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-y-auto animate-slide-in">
        <div className="sticky top-0 bg-white border-b border-gray-200 p-5 z-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 relative flex-shrink-0">
              <Image src="/logo.png" alt="Logo" fill className="object-contain" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Scan Papers</h2>
              <p className="text-gray-500 text-xs mt-0.5">{exam.title}</p>
            </div>
          </div>
          {step !== 'students' && (
            <button onClick={goBackToStudents} className="mr-2 px-3 py-1.5 rounded-md text-sm bg-gray-100 hover:bg-gray-200">
              Back to Students
            </button>
          )}
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <IconX className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6">
          {step === 'students' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <h3 className="text-lg font-semibold text-gray-900">Students</h3>
                <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                  <select
                    value={selectedSectionId ?? ''}
                    onChange={(e) => setSelectedSectionId(e.target.value ? Number(e.target.value) : null)}
                    className="min-w-[220px] px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    {assignedSections.length === 0 && <option value="">No assigned section</option>}
                    {assignedSections.map((section) => (
                      <option key={section.sectionId} value={section.sectionId}>
                        {section.gradeLabel ? `${section.gradeLabel} - ${section.sectionName}` : section.sectionName}
                      </option>
                    ))}
                  </select>
                  <div className="relative w-full sm:w-80">
                    <IconSearch className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search student"
                      className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr className="text-left text-gray-700">
                      <th className="py-3 px-4 font-semibold">Name of Pupil</th>
                      <th className="py-3 px-4 font-semibold">Test Score</th>
                      <th className="py-3 px-4 font-semibold w-40">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingStudents ? (
                      <tr>
                        <td colSpan={3} className="py-8 px-4 text-center text-gray-500">Loading students...</td>
                      </tr>
                    ) : filteredStudents.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="py-8 px-4 text-center text-gray-500">No students found.</td>
                      </tr>
                    ) : (
                      filteredStudents.map((student) => {
                        const attempt =
                          (student.enrollmentId ? latestAttemptByEnrollment.get(student.enrollmentId) : undefined) ??
                          latestAttemptByName.get(student.fullName.toLowerCase());
                        const hasAttempt = Boolean(attempt);
                        return (
                          <tr key={student.uid} className="border-b border-gray-100 last:border-b-0">
                            <td className="py-3 px-4 font-medium text-gray-800">{student.fullName}</td>
                            <td className="py-3 px-4 text-gray-700">{attempt ? `${attempt.score}/${attempt.total_items}` : '-'}</td>
                            <td className="py-3 px-4">
                              <button
                                type="button"
                                onClick={() => handleStartScanForStudent(student)}
                                className={`w-full rounded-md px-3 py-1.5 text-sm font-medium text-white ${
                                  hasAttempt ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-green-600 hover:bg-green-700'
                                }`}
                              >
                                {hasAttempt ? 'Rescan' : 'Scan'}
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {step === 'capture' && (
            <div className="space-y-5">
              {processingError && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex gap-3">
                  <IconAlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-red-700">Processing failed</p>
                    <p className="text-red-600 text-sm mt-1">{processingError}</p>
                  </div>
                </div>
              )}

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700">
                <p className="font-semibold mb-1">Scanning for: {selectedStudent?.fullName ?? studentName}</p>
                <ul className="space-y-0.5 list-disc list-inside text-xs">
                  <li>Keep all 4 paper corners visible</li>
                  <li>Use good lighting and avoid glare</li>
                  <li>Capture from directly above the sheet</li>
                </ul>
              </div>

              {(cameraActive || startingCamera) && (
                <div className="relative">
                  <video ref={videoRef} autoPlay playsInline className="w-full rounded-xl border border-gray-300 bg-black" />
                  {startingCamera && <p className="text-xs text-gray-500 mt-2">Initializing camera...</p>}
                  <div className="mt-3 flex gap-3">
                    <button onClick={captureFromCamera} className="flex-1 btn-primary flex items-center justify-center gap-2">
                      <IconCamera className="w-4 h-4" /> Capture
                    </button>
                    <button onClick={stopCamera} className="btn-secondary">Cancel</button>
                  </div>
                </div>
              )}

              {previewUrl && !cameraActive && (
                <div className="space-y-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewUrl} alt="Captured sheet" className="w-full rounded-xl border border-gray-200 max-h-64 object-contain bg-gray-50" />
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setPreviewUrl(null);
                        setCapturedFile(null);
                      }}
                      className="btn-secondary flex items-center gap-2"
                    >
                      <IconRefresh className="w-4 h-4" /> Retake
                    </button>
                    <button onClick={runProcessing} className="flex-1 btn-primary flex items-center justify-center gap-2">
                      Process Sheet <IconChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {!cameraActive && !previewUrl && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center gap-3 p-8 border-2 border-dashed border-gray-300 hover:border-primary rounded-xl hover:bg-green-50 transition-all"
                  >
                    <IconUpload className="w-8 h-8 text-gray-400" />
                    <div className="text-center">
                      <p className="font-semibold text-gray-700">Upload Photo</p>
                      <p className="text-xs text-gray-400 mt-0.5">JPG, PNG</p>
                    </div>
                  </button>
                  <button
                    onClick={startCamera}
                    disabled={startingCamera}
                    className="flex flex-col items-center gap-3 p-8 border-2 border-dashed border-gray-300 hover:border-primary rounded-xl hover:bg-green-50 transition-all"
                  >
                    <IconCamera className="w-8 h-8 text-gray-400" />
                    <div className="text-center">
                      <p className="font-semibold text-gray-700">{startingCamera ? 'Starting camera...' : 'Use Camera'}</p>
                      <p className="text-xs text-gray-400 mt-0.5">Phone or webcam</p>
                    </div>
                  </button>
                </div>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileInput} />
            </div>
          )}

          {step === 'processing' && (
            <div className="text-center py-16">
              <div className="inline-block w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-lg font-semibold text-gray-700">Processing answer sheet...</p>
            </div>
          )}

          {step === 'review' && (
            <div className="space-y-5">
              <div className={`rounded-xl p-3 flex items-start gap-3 text-sm ${cornersOk ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'}`}>
                {cornersOk ? (
                  <IconCircleCheck className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                ) : (
                  <IconAlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                )}
                <p className={cornersOk ? 'text-green-700' : 'text-yellow-700'}>
                  {cornersOk ? 'Corner markers detected automatically.' : 'Corner markers were not fully detected. Please review detected answers.'}
                </p>
              </div>

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

              <div className={`grid gap-4 ${totalItems > 20 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
                {[1, 2].map((col) => {
                  const start = col === 1 ? 1 : 21;
                  const end = col === 1 ? Math.min(20, totalItems) : totalItems;
                  if (start > totalItems) return null;
                  return (
                    <div key={col} className="space-y-0.5">
                      <div className="flex items-center gap-2 pb-1 border-b border-gray-100">
                        <span className="text-xs font-semibold text-gray-400 w-7">#</span>
                        {choices.map((ch) => (
                          <span key={ch} className="text-xs font-bold text-gray-500 w-8 text-center">{ch}</span>
                        ))}
                        <span className="text-xs font-semibold text-gray-400 w-5 text-center">OK</span>
                      </div>
                      {Array.from({ length: end - start + 1 }, (_, i) => start + i).map((item) => {
                        const correct = answerKey[item];
                        const detected = detectedAnswers[item];
                        const isRight = Boolean(detected && correct && detected === correct);
                        return (
                          <div key={item} className={`flex items-center gap-2 py-0.5 px-1 rounded-lg transition-all ${!detected ? 'bg-orange-50' : ''}`}>
                            <span className="text-xs font-semibold w-7 text-right text-gray-600">{item}</span>
                            {choices.map((ch) => (
                              <button
                                key={ch}
                                type="button"
                                onClick={() => toggleAnswer(item, ch)}
                                className={`w-8 h-8 rounded-full border-2 flex items-center justify-center font-bold text-xs transition-all duration-100 hover:scale-110 ${confColor(item, ch)}`}
                              >
                                {ch}
                              </button>
                            ))}
                            <span className="w-5 text-center text-sm">{detected && correct ? (isRight ? 'Y' : 'N') : detected ? '*' : '-'}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-3 pt-4 border-t">
                <button onClick={() => setStep('capture')} className="btn-secondary flex items-center gap-2">
                  <IconChevronLeft className="w-4 h-4" /> Rescan
                </button>
                <button onClick={() => setStep('submit')} className="flex-1 btn-primary flex items-center justify-center gap-2">
                  Continue <IconChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {step === 'submit' && (
            <div className="space-y-5">
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                <p className="text-3xl font-bold text-green-700">{score} / {totalItems}</p>
                <p className="text-green-600 text-sm mt-1">{Math.round((score / totalItems) * 100)}%</p>
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
                      {itemResults.map((r) => (
                        <tr key={`submit-${r.item}`} className="border-b border-gray-100 last:border-b-0">
                          <td className="px-4 py-2 font-medium text-gray-700">{r.item}</td>
                          <td className="px-4 py-2">{r.student ?? '-'}</td>
                          <td className="px-4 py-2">{r.correct ?? '-'}</td>
                          <td className="px-4 py-2">
                            {!r.student ? (
                              <span className="text-orange-600">No answer</span>
                            ) : !r.correct ? (
                              <span className="text-gray-500">No key</span>
                            ) : r.isCorrect ? (
                              <span className="text-green-700 font-medium">Correct</span>
                            ) : (
                              <span className="text-red-600 font-medium">Wrong</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 p-3 bg-gray-50">
                <p className="text-sm">
                  <span className="font-semibold">Student:</span> {studentName || '-'}
                </p>
              </div>

              <div className="flex gap-3 pt-4 border-t">
                <button onClick={() => setStep('review')} className="btn-secondary flex items-center gap-2">
                  <IconChevronLeft className="w-4 h-4" /> Back
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting || !studentName.trim()}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all ${
                    !submitting && studentName.trim()
                      ? 'bg-primary hover:bg-primary-dark text-white shadow-md'
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  <IconDeviceFloppy className="w-4 h-4" />
                  {submitting ? 'Saving...' : 'Save Result'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
