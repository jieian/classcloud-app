'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { IconX, IconUpload, IconCamera, IconCircleCheck, IconAlertTriangle, IconRefresh, IconDeviceFloppy, IconChevronRight, IconChevronLeft } from '@tabler/icons-react';
import Image from 'next/image';
import { processAnswerSheet } from '@/lib/services/omrService';
import { createAttempt, scoreResponses } from '@/lib/services/attemptService';
import { computeItemStatistics, saveItemStatistics } from '@/lib/services/analysisService';
import { fetchAttemptsForExam } from '@/lib/services/attemptService';
import type { ExamWithRelations, AnswerKeyJsonb } from '@/lib/exam-supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = 'capture' | 'processing' | 'review' | 'submit';

interface DetectedAnswers { [item: number]: string | null; }

interface ScanPapersModalProps {
  exam: ExamWithRelations;
  onClose: () => void;
  onSuccess: () => void;
}

const CHOICES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

// ─── Component ────────────────────────────────────────────────────────────────

export default function ScanPapersModal({ exam, onClose, onSuccess }: ScanPapersModalProps) {
  const [step, setStep] = useState<Step>('capture');
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [detectedAnswers, setDetectedAnswers] = useState<DetectedAnswers>({});
  const [confidence, setConfidence] = useState<{ [item: number]: { [ch: string]: number } }>({});
  const [cornersOk, setCornersOk] = useState(true);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [studentName, setStudentName] = useState('');
  const [studentLrn, setStudentLrn] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const ak = exam.answer_key as AnswerKeyJsonb | null;
  const totalItems = ak?.total_questions ?? exam.total_items ?? 30;
  const numChoices = ak?.num_choices ?? 4;
  const choices = CHOICES.slice(0, numChoices);
  const answerKey: { [item: number]: string | null } = ak?.answers ?? {};

  // ── Camera management ─────────────────────────────────────────────────────

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraActive(true);
    } catch {
      alert('Camera not available. Please use the upload option instead.');
    }
  };

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCameraActive(false);
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const captureFromCamera = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext('2d')!.drawImage(videoRef.current, 0, 0);
    canvas.toBlob(blob => {
      if (!blob) return;
      const file = new File([blob], 'scan.jpg', { type: 'image/jpeg' });
      stopCamera();
      handleFileSelected(file);
    }, 'image/jpeg', 0.92);
  };

  // ── File handling ─────────────────────────────────────────────────────────

  const handleFileSelected = (file: File) => {
    setCapturedFile(file);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
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
      setConfidence(result.confidence);
      setCornersOk(result.cornersAutoDetected);
      setStep('review');
    } catch (err: any) {
      setProcessingError(err?.message ?? 'Processing failed');
      setStep('capture');
    }
  };

  // ── Review: manual answer override ────────────────────────────────────────

  const toggleAnswer = (item: number, choice: string) => {
    setDetectedAnswers(prev => ({
      ...prev,
      [item]: prev[item] === choice ? null : choice,
    }));
  };

  const answeredCount = Object.values(detectedAnswers).filter(Boolean).length;
  const score = scoreResponses(
    Object.fromEntries(Object.entries(detectedAnswers).filter(([, v]) => v)) as { [k: number]: string },
    answerKey
  );

  // ── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!studentName.trim()) { alert('Please enter the student name.'); return; }
    setSubmitting(true);

    const cleanedResponses: { [item: number]: string } = {};
    Object.entries(detectedAnswers).forEach(([k, v]) => {
      if (v) cleanedResponses[parseInt(k)] = v;
    });

    const attempt = await createAttempt({
      exam_id: exam.exam_id,
      student_name: studentName.trim(),
      student_lrn: studentLrn.trim() || null,
      responses: cleanedResponses,
      score,
      total_items: totalItems,
    });

    if (attempt) {
      // Recompute item statistics with all attempts including this one
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

  // ── Confidence indicator color ────────────────────────────────────────────

  const confColor = (item: number, ch: string) => {
    const c = confidence[item]?.[ch] ?? 0;
    if (detectedAnswers[item] === ch) {
      return c > 0.5 ? 'bg-primary border-primary text-white shadow' : 'bg-yellow-400 border-yellow-400 text-white';
    }
    return 'border-gray-300 text-gray-500 hover:border-primary hover:bg-green-50';
  };

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
              <h2 className="text-xl font-bold text-gray-900">Scan Answer Sheet</h2>
              <p className="text-gray-500 text-xs mt-0.5">{exam.title}</p>
            </div>
          </div>

          {/* Step indicator */}
          <div className="hidden md:flex items-center gap-1 text-xs font-medium">
            {(['capture', 'review', 'submit'] as const).map((s, i) => (
              <div key={s} className="flex items-center gap-1">
                {i > 0 && <IconChevronRight className="w-3 h-3 text-gray-300" />}
                <span className={`px-2 py-1 rounded-full ${step === s || (step === 'processing' && s === 'capture') ? 'bg-primary text-white' : 'bg-gray-100 text-gray-500'}`}>
                  {i + 1}. {s.charAt(0).toUpperCase() + s.slice(1)}
                </span>
              </div>
            ))}
          </div>

          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <IconX className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6">

          {/* ── STEP: CAPTURE ─────────────────────────────────────────────── */}
          {(step === 'capture') && (
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

              {/* Tip banner */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700">
                <p className="font-semibold mb-1">📷 Tips for best results:</p>
                <ul className="space-y-0.5 list-disc list-inside text-xs">
                  <li>Place sheet on a dark, flat surface with good lighting</li>
                  <li>Keep the entire sheet visible — all 4 corners must be in frame</li>
                  <li>Avoid glare and shadows; hold camera directly above the sheet</li>
                  <li>Ensure student has filled bubbles darkly and completely</li>
                </ul>
              </div>

              {/* Camera feed */}
              {cameraActive && (
                <div className="relative">
                  <video ref={videoRef} autoPlay playsInline className="w-full rounded-xl border border-gray-300 bg-black" />
                  <div className="mt-3 flex gap-3">
                    <button onClick={captureFromCamera} className="flex-1 btn-primary flex items-center justify-center gap-2">
                      <IconCamera className="w-4 h-4" /> Capture
                    </button>
                    <button onClick={stopCamera} className="btn-secondary">
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Preview of uploaded/captured image */}
              {previewUrl && !cameraActive && (
                <div className="space-y-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewUrl} alt="Captured sheet" className="w-full rounded-xl border border-gray-200 max-h-64 object-contain bg-gray-50" />
                  <div className="flex gap-3">
                    <button
                      onClick={() => { setPreviewUrl(null); setCapturedFile(null); }}
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

              {/* Upload / Camera buttons */}
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
                    className="flex flex-col items-center gap-3 p-8 border-2 border-dashed border-gray-300 hover:border-primary rounded-xl hover:bg-green-50 transition-all"
                  >
                    <IconCamera className="w-8 h-8 text-gray-400" />
                    <div className="text-center">
                      <p className="font-semibold text-gray-700">Use Camera</p>
                      <p className="text-xs text-gray-400 mt-0.5">Phone or webcam</p>
                    </div>
                  </button>
                </div>
              )}

              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileInput} />
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
              {/* Detection quality notice */}
              <div className={`rounded-xl p-3 flex items-start gap-3 text-sm ${cornersOk ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'}`}>
                {cornersOk
                  ? <IconCircleCheck className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  : <IconAlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0" />}
                <p className={cornersOk ? 'text-green-700' : 'text-yellow-700'}>
                  {cornersOk
                    ? 'Corner markers detected automatically — high confidence detection.'
                    : 'Corner markers not found — results may be less accurate. Review carefully and correct any wrong answers.'}
                </p>
              </div>

              {/* Progress summary */}
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

              <p className="text-xs text-gray-400 text-center">
                Click a bubble to correct a detected answer. Yellow = low confidence.
              </p>

              {/* Answer grid */}
              <div className={`grid gap-4 ${totalItems > 20 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
                {[1, 2].map(col => {
                  const start = col === 1 ? 1 : 21;
                  const end = col === 1 ? Math.min(20, totalItems) : totalItems;
                  if (start > totalItems) return null;
                  return (
                    <div key={col} className="space-y-0.5">
                      {/* Column header */}
                      <div className="flex items-center gap-2 pb-1 border-b border-gray-100">
                        <span className="text-xs font-semibold text-gray-400 w-7">#</span>
                        {choices.map(ch => (
                          <span key={ch} className="text-xs font-bold text-gray-500 w-8 text-center">{ch}</span>
                        ))}
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
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                <p className="text-3xl font-bold text-green-700">{score} / {totalItems}</p>
                <p className="text-green-600 text-sm mt-1">
                  {Math.round((score / totalItems) * 100)}% — {answeredCount} bubbles detected
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Student Name *</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="e.g., Juan Dela Cruz"
                    value={studentName}
                    onChange={e => setStudentName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    LRN <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="12-digit Learner Reference Number"
                    value={studentLrn}
                    onChange={e => setStudentLrn(e.target.value)}
                  />
                </div>
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
