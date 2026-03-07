'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  IconX, IconUpload, IconCamera, IconCircleCheck, IconAlertTriangle,
  IconRefresh, IconDeviceFloppy, IconChevronRight, IconChevronLeft, IconSearch,
} from '@tabler/icons-react';
import Image from 'next/image';
import { processAnswerSheet } from '@/lib/services/omrService';
import { createAttempt, scoreResponses, fetchAttemptsForExam } from '@/lib/services/attemptService';
import { computeItemStatistics, saveItemStatistics } from '@/lib/services/analysisService';
import { fetchStudentRoster } from '@/app/(app)/school/classes/_lib/classService';
import type { ExamWithRelations, AnswerKeyJsonb, ExamScore } from '@/lib/exam-supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = 'students' | 'capture' | 'processing' | 'review' | 'submit';

interface DetectedAnswers { [item: number]: string | null; }

interface ScanPapersModalProps {
  exam: ExamWithRelations;
  onClose: () => void;
  onSuccess: () => void;
}

interface RosterStudent {
  enrollment_id: number;
  lrn: string;
  full_name: string;
  sex: 'M' | 'F';
  section_id: number;
  section_name: string;
  grade_level_display: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CHOICES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

function getMpl(score: number, totalItems: number): number {
  if (!totalItems) return 0;
  return Math.round((score / totalItems) * 100);
}

function getProficiency(mpl: number): string {
  if (mpl >= 90) return 'Highly Proficient';
  if (mpl >= 75) return 'Proficient';
  if (mpl >= 50) return 'Nearly';
  if (mpl >= 25) return 'Low';
  return 'Not';
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
const STEP_ORDER = ['students', 'capture', 'review', 'submit'] as const;

// ─── Component ────────────────────────────────────────────────────────────────

export default function ScanPapersModal({ exam, onClose, onSuccess }: ScanPapersModalProps) {
  const [step, setStep] = useState<Step>('students');
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [detectedAnswers, setDetectedAnswers] = useState<DetectedAnswers>({});
  const [cornersOk, setCornersOk] = useState(true);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [startingCamera, setStartingCamera] = useState(false);

  // ── Roster & attempts state ───────────────────────────────────────────────
  const [rosterStudents, setRosterStudents] = useState<RosterStudent[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [existingAttempts, setExistingAttempts] = useState<ExamScore[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<RosterStudent | null>(null);
  const [studentSearch, setStudentSearch] = useState('');
  const [sectionFilter, setSectionFilter] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoTrackRef = useRef<MediaStreamTrack | null>(null);

  const ak = exam.answer_key as AnswerKeyJsonb | null;
  const totalItems = ak?.total_questions ?? exam.total_items ?? 30;
  const numChoices = ak?.num_choices ?? 4;
  const choices = CHOICES.slice(0, numChoices);
  const answerKey: { [item: number]: string | null } = ak?.answers ?? {};

  // ── Camera management ─────────────────────────────────────────────────────

  const startCamera = async () => {
    if (startingCamera) return;
    setStartingCamera(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera API not available in this browser.');
      }

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
      alert('Camera not available or blocked. Please allow camera permission, then try again. You can also use Upload Photo.');
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

  // ── Fetch roster + existing attempts on mount ─────────────────────────────
  useEffect(() => {
    fetchAttemptsForExam(exam.exam_id)
      .then(setExistingAttempts)
      .catch(err => console.error('[ScanPapersModal] Failed to load attempts:', err));

    const sectionIds = (exam.exam_assignments ?? [])
      .map(a => a.sections?.section_id)
      .filter((id): id is number => id != null);

    if (sectionIds.length === 0) return;

    setRosterLoading(true);
    Promise.all(sectionIds.map(id => fetchStudentRoster(id)))
      .then(results => {
        const all: RosterStudent[] = results.flatMap(r =>
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
        setRosterStudents(all);
        // Auto-select the first section so the table always opens focused
        if (all.length > 0) setSectionFilter(all[0].section_id);
      })
      .catch(err => console.error('[ScanPapersModal] Failed to load roster:', err))
      .finally(() => setRosterLoading(false));
  }, [exam]);

  // ── Attempt lookup map (by enrollment_id) ────────────────────────────────
  const attemptByEnrollment = new Map<number, ExamScore>();
  for (const a of existingAttempts) {
    if (a.enrollment_id != null) attemptByEnrollment.set(a.enrollment_id, a);
  }
  const getStudentAttempt = (s: RosterStudent): ExamScore | undefined =>
    attemptByEnrollment.get(s.enrollment_id);

  // ── Unique sections for filter tabs ──────────────────────────────────────
  const sections = Array.from(
    new Map(rosterStudents.map(s => [s.section_id, { section_id: s.section_id, section_name: s.section_name, grade_level_display: s.grade_level_display }]))
      .values()
  );

  const filteredStudents = rosterStudents.filter(s => {
    const q = studentSearch.toLowerCase();
    const matchesSearch = !q || s.full_name.toLowerCase().includes(q) || s.lrn.includes(q);
    const matchesSection = sectionFilter == null || s.section_id === sectionFilter;
    return matchesSearch && matchesSection;
  });

  // ── Camera capture ────────────────────────────────────────────────────────
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
        const blob: Blob = await ic.takePhoto();
        stopCamera();
        handleFileSelected(new File([blob], 'scan.jpg', { type: blob.type || 'image/jpeg' }));
        return;
      } catch { /* fall back */ }
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

  // ── File handling ─────────────────────────────────────────────────────────
  const handleFileSelected = (file: File) => {
    setCapturedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelected(file);
  };

  // ── OMR Processing ────────────────────────────────────────────────────────
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
      setProcessingError(err instanceof Error ? err.message : 'Processing failed');
      setStep('capture');
    }
  };

  // ── Review ────────────────────────────────────────────────────────────────
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

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!selectedStudent) { alert('No student selected.'); return; }

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
      onSuccess();
      onClose();
    } else {
      alert('Failed to save. Please try again.');
    }
    setSubmitting(false);
  };

  // ── Answer bubble color ───────────────────────────────────────────────────
  const confColor = (item: number, ch: string) => {
    if (answerKey[item] === ch) return 'bg-green-200 border-green-400 text-green-900 shadow-sm ring-2 ring-green-200';
    if (detectedAnswers[item] === ch) return 'bg-gray-300 border-gray-500 text-gray-900 shadow-sm ring-2 ring-gray-200';
    return 'bg-white border-gray-300 text-gray-500 hover:border-blue-500 hover:bg-blue-50';
  };

  // ── Step indicator index ──────────────────────────────────────────────────
  const activeStep = step === 'processing' ? 'capture' : step;
  const stepIndex = STEP_ORDER.indexOf(activeStep as typeof STEP_ORDER[number]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-y-auto animate-slide-in">

        {/* Header */}
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

          {/* Step indicator */}
          <div className="hidden md:flex items-center gap-1 text-xs font-medium">
            {STEP_ORDER.map((s, i) => (
              <div key={s} className="flex items-center gap-1">
                {i > 0 && <IconChevronRight className="w-3 h-3 text-gray-300" />}
                <span className={`px-2 py-1 rounded-full ${i <= stepIndex ? 'bg-primary text-white' : 'bg-gray-100 text-gray-500'}`}>
                  {i + 1}. {STEP_LABELS[s]}
                </span>
              </div>
            ))}
          </div>

          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <IconX className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6">

          {/* ── STEP: STUDENTS ────────────────────────────────────────────── */}
          {step === 'students' && (
            <div className="space-y-4">
              {/* Exam info */}
              <div className="grid grid-cols-2 gap-x-6 text-sm">
                <div>
                  <span className="font-semibold text-gray-600">Examination Name</span>
                  <p className="text-gray-800 mt-0.5">{exam.title}</p>
                </div>
                <div>
                  <span className="font-semibold text-gray-600">Subject</span>
                  <p className="text-gray-800 mt-0.5">{exam.subjects?.name ?? '—'}</p>
                </div>
              </div>

              <hr />

              {/* Section selector cards */}
              {sections.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Select Section</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {sections.map(sec => {
                      const secStudents = rosterStudents.filter(s => s.section_id === sec.section_id);
                      const scannedCount = secStudents.filter(s => getStudentAttempt(s) != null).length;
                      const isActive = sectionFilter === sec.section_id;
                      return (
                        <button
                          key={sec.section_id}
                          onClick={() => { setSectionFilter(sec.section_id); setStudentSearch(''); }}
                          className={`text-left p-3 rounded-xl border-2 transition-all ${
                            isActive
                              ? 'border-primary bg-primary/5'
                              : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          <p className={`text-sm font-bold leading-tight ${isActive ? 'text-primary' : 'text-gray-800'}`}>
                            {sec.section_name}
                          </p>
                          <p className={`text-xs mt-0.5 ${isActive ? 'text-primary/70' : 'text-gray-400'}`}>
                            {sec.grade_level_display}
                          </p>
                          <p className="text-xs text-gray-400 mt-1">
                            {scannedCount} / {secStudents.length} scanned
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <p className="text-sm font-semibold text-gray-700">Students</p>

              {/* Search */}
              <div className="relative">
                <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  className="input-field pl-9 w-full"
                  placeholder="Search students…"
                  value={studentSearch}
                  onChange={e => setStudentSearch(e.target.value)}
                />
              </div>

              {/* Student table */}
              {rosterLoading ? (
                <div className="text-center py-12">
                  <div className="inline-block w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-3" />
                  <p className="text-sm text-gray-400">Loading students…</p>
                </div>
              ) : rosterStudents.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-xl border border-gray-200">
                  <p className="text-sm font-semibold text-gray-600">No students found</p>
                  <p className="text-xs text-gray-400 mt-1">No roster is linked to the sections assigned to this exam.</p>
                </div>
              ) : (
                <div className="rounded-xl border border-gray-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr className="text-left text-gray-500 text-xs font-semibold uppercase tracking-wide">
                        <th className="px-4 py-3">Name of Pupil</th>
                        <th className="px-4 py-3 text-center">Test Score</th>
                        <th className="px-4 py-3 text-center">MPL</th>
                        <th className="px-4 py-3 text-center">Level of Proficiency</th>
                        <th className="px-4 py-3 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredStudents.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-400">No matching students</td>
                        </tr>
                      ) : filteredStudents.map(student => {
                        const attempt = getStudentAttempt(student);
                        const mpl = attempt ? getMpl(attempt.calculated_score, totalItems) : null;
                        const proficiency = mpl != null ? getProficiency(mpl) : null;
                        const hasScanned = attempt != null;

                        return (
                          <tr key={student.enrollment_id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3">
                              <p className="font-medium text-gray-800">{student.full_name}</p>
                              {sectionFilter == null && (
                                <p className="text-xs text-gray-400 mt-0.5">
                                  {student.grade_level_display} – {student.section_name}
                                </p>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center font-medium text-gray-700">
                              {attempt ? `${attempt.calculated_score} / ${totalItems}` : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-4 py-3 text-center font-medium text-gray-700">
                              {mpl != null ? mpl : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {proficiency ? (
                                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${proficiencyBadge(mpl!)}`}>
                                  {proficiency}
                                </span>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button
                                onClick={() => {
                                  setSelectedStudent(student);
                                  setCapturedFile(null);
                                  setPreviewUrl(null);
                                  setDetectedAnswers({});
                                  setProcessingError(null);
                                  setStep('capture');
                                }}
                                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                                  hasScanned
                                    ? 'bg-amber-400 hover:bg-amber-500 text-white'
                                    : 'bg-green-500 hover:bg-green-600 text-white'
                                }`}
                              >
                                {hasScanned ? 'Rescan' : 'Scan'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── STEP: CAPTURE ─────────────────────────────────────────────── */}
          {step === 'capture' && (
            <div className="space-y-5">
              {/* Selected student banner */}
              {selectedStudent && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center gap-3">
                  <IconCircleCheck className="w-5 h-5 text-blue-500 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-blue-800">{selectedStudent.full_name}</p>
                    <p className="text-xs text-blue-500">
                      {selectedStudent.grade_level_display} – {selectedStudent.section_name} · LRN: {selectedStudent.lrn}
                    </p>
                  </div>
                </div>
              )}

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
                <p className="font-semibold mb-1">Tips for best results:</p>
                <ul className="space-y-0.5 list-disc list-inside text-xs">
                  <li>Place sheet on a dark, flat surface with good lighting</li>
                  <li>Keep the entire sheet visible — all 4 corners must be in frame</li>
                  <li>Avoid glare and shadows; hold camera directly above the sheet</li>
                  <li>Ensure student has filled bubbles darkly and completely</li>
                </ul>
              </div>

              {(cameraActive || startingCamera) && (
                <div>
                  <video ref={videoRef} autoPlay playsInline className="w-full rounded-xl border border-gray-300 bg-black" />
                  {startingCamera && <p className="text-xs text-gray-500 mt-2">Initializing camera…</p>}
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
                    <button onClick={() => { setPreviewUrl(null); setCapturedFile(null); }} className="btn-secondary flex items-center gap-2">
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
                      <p className="text-xs text-gray-400 mt-0.5">JPG, PNG from gallery</p>
                    </div>
                  </button>
                  <button
                    onClick={startCamera}
                    disabled={startingCamera}
                    className="flex flex-col items-center gap-3 p-8 border-2 border-dashed border-gray-300 hover:border-primary rounded-xl hover:bg-green-50 transition-all"
                  >
                    <IconCamera className="w-8 h-8 text-gray-400" />
                    <div className="text-center">
                      <p className="font-semibold text-gray-700">{startingCamera ? 'Starting camera…' : 'Use Camera'}</p>
                      <p className="text-xs text-gray-400 mt-0.5">Phone or webcam</p>
                    </div>
                  </button>
                </div>
              )}

              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileInput} />

              <div className="pt-2 border-t">
                <button onClick={() => setStep('students')} className="btn-secondary flex items-center gap-2">
                  <IconChevronLeft className="w-4 h-4" /> Back to Students
                </button>
              </div>
            </div>
          )}

          {/* ── STEP: PROCESSING ──────────────────────────────────────────── */}
          {step === 'processing' && (
            <div className="text-center py-16">
              <div className="inline-block w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-lg font-semibold text-gray-700">Processing answer sheet…</p>
              <p className="text-sm text-gray-400 mt-2">Detecting corners → Correcting perspective → Reading bubbles</p>
            </div>
          )}

          {/* ── STEP: REVIEW ──────────────────────────────────────────────── */}
          {step === 'review' && (
            <div className="space-y-5">
              {selectedStudent && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center gap-3">
                  <IconCircleCheck className="w-5 h-5 text-blue-500 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-blue-800">{selectedStudent.full_name}</p>
                    <p className="text-xs text-blue-500">{selectedStudent.grade_level_display} – {selectedStudent.section_name}</p>
                  </div>
                </div>
              )}

              <div className={`rounded-xl p-3 flex items-start gap-3 text-sm ${cornersOk ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'}`}>
                {cornersOk
                  ? <IconCircleCheck className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  : <IconAlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0" />}
                <p className={cornersOk ? 'text-green-700' : 'text-yellow-700'}>
                  {cornersOk
                    ? 'Corner markers detected automatically — high confidence detection.'
                    : 'Corner markers not found — results may be less accurate. Review and correct any wrong answers.'}
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

              <p className="text-xs text-gray-500 text-center">
                Student answer is gray. Correct answer key is light green. Click any bubble to correct.
              </p>

              <div className={`grid gap-4 ${totalItems > 20 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
                {[1, 2].map(col => {
                  const start = col === 1 ? 1 : 21;
                  const end = col === 1 ? Math.min(20, totalItems) : totalItems;
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
                              {detected && correct ? (isRight ? '✅' : '❌') : detected ? '•' : '—'}
                            </span>
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

          {/* ── STEP: SUBMIT ──────────────────────────────────────────────── */}
          {step === 'submit' && (
            <div className="space-y-5">
              {/* Student info */}
              {selectedStudent && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
                  <p className="text-xs font-semibold text-blue-400 uppercase tracking-wide mb-1">Student</p>
                  <p className="text-base font-bold text-blue-800">{selectedStudent.full_name}</p>
                  <p className="text-xs text-blue-500 mt-0.5">
                    LRN: {selectedStudent.lrn} · {selectedStudent.grade_level_display} – {selectedStudent.section_name}
                  </p>
                </div>
              )}

              {/* Score summary */}
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                <p className="text-3xl font-bold text-green-700">{score} / {totalItems}</p>
                <p className="text-green-600 text-sm mt-1">
                  MPL: {scoreMpl}% — {getProficiency(scoreMpl)} · {answeredCount} bubbles detected
                </p>
              </div>

              {/* Answer table */}
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

              <div className="flex gap-3 pt-4 border-t">
                <button onClick={() => setStep('review')} className="btn-secondary flex items-center gap-2">
                  <IconChevronLeft className="w-4 h-4" /> Back
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all ${
                    !submitting ? 'bg-green-600 hover:bg-green-700 text-white shadow-md' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  <IconDeviceFloppy className="w-4 h-4" />
                  {submitting ? 'Saving…' : 'Save Result'}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
