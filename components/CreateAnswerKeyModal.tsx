'use client';

import { useState, useEffect } from 'react';
import { IconX, IconDeviceFloppy, IconAlertTriangle, IconBookmark, IconArrowLeft } from '@tabler/icons-react';
import CreationFlowStepper from './CreationFlowStepper';
import Image from 'next/image';
import { notifications } from '@mantine/notifications';
import { saveAnswerKey, saveObjectives } from '@/lib/services/examService';
import type { ExamWithRelations, AnswerKeyJsonb, LearningObjective } from '@/lib/exam-supabase';

interface CreateAnswerKeyModalProps {
  exam: ExamWithRelations;
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
  /** When provided (creation flow), shows a "Back to Objectives" button */
  onBack?: () => void;
  /** Number of choices set during exam creation — used as default when no existing answer key */
  initialNumChoices?: number;
}

interface ObjectiveEditorRow {
  id: number;
  objective: string;
  start_item: number | string;
  end_item: number | string;
}

const ALL_CHOICES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

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

function getAutoTotalItems(levelNumber: number | null | undefined): number {
  if (!levelNumber) return 30;
  if (levelNumber <= 2) return 30;
  if (levelNumber <= 4) return 40;
  if (levelNumber <= 6) return 50;
  return 50;
}

export default function CreateAnswerKeyModal({ exam, onClose, onSuccess, onBack, initialNumChoices }: CreateAnswerKeyModalProps) {
  const detectedLevelNumber =
    exam.exam_assignments?.[0]?.sections?.grade_levels?.level_number ?? null;
  const autoTotalQuestions = getAutoTotalItems(detectedLevelNumber);

  const [answers, setAnswers] = useState<{ [key: number]: string | null }>({});
  const [totalQuestions, setTotalQuestions] = useState(autoTotalQuestions);
  const [numChoices, setNumChoices] = useState(initialNumChoices ?? 4);
  const [loading, setLoading] = useState(false);
  const [loadingAnswers, setLoadingAnswers] = useState(true);
  const [showIncompleteWarning, setShowIncompleteWarning] = useState(false);
  const [triedToSave, setTriedToSave] = useState(false);
  const [objectiveRows, setObjectiveRows] = useState<ObjectiveEditorRow[]>([]);
  const [showObjectiveEditor, setShowObjectiveEditor] = useState(false);
  const [savingObjectives, setSavingObjectives] = useState(false);
  const [showSummary, setShowSummary] = useState(false);

  const choices = ALL_CHOICES.slice(0, numChoices);

  const toObjectiveRows = (objectives: LearningObjective[] | null | undefined): ObjectiveEditorRow[] =>
    (objectives ?? []).map((o, idx) => ({
      id: idx + 1,
      objective: o.objective,
      start_item: o.start_item,
      end_item: o.end_item,
    }));

  // Get assigned section names for display
  const assignedSections = exam.exam_assignments
    ?.map(a => a.sections?.name)
    .filter(Boolean) ?? [];

  useEffect(() => {
    // Load existing answer key from the JSONB column
    const existing = exam.answer_key as AnswerKeyJsonb | null;
    const initialTotal = existing?.total_questions ?? autoTotalQuestions;
    setTotalQuestions(initialTotal);
    if (existing?.answers) {
      const nextAnswers: { [key: number]: string | null } = {};
      Object.entries(existing.answers).forEach(([k, v]) => {
        const qNum = Number(k);
        if (Number.isInteger(qNum) && qNum >= 1 && qNum <= initialTotal) {
          nextAnswers[qNum] = v;
        }
      });
      setAnswers(nextAnswers);
    }
    if (existing?.num_choices) {
      setNumChoices(Math.max(2, Math.min(ALL_CHOICES.length, existing.num_choices)));
    } else if (initialNumChoices) {
      setNumChoices(Math.max(2, Math.min(ALL_CHOICES.length, initialNumChoices)));
    }
    setObjectiveRows(toObjectiveRows(exam.objectives));
    setLoadingAnswers(false);
  }, [exam, autoTotalQuestions]);

  const addObjectiveRow = () => {
    setObjectiveRows((prev) => [
      ...prev,
      { id: Date.now(), objective: '', start_item: '', end_item: '' },
    ]);
  };

  const removeObjectiveRow = (id: number) => {
    setObjectiveRows((prev) => prev.filter((r) => r.id !== id));
  };

  const updateObjectiveRow = (
    id: number,
    field: keyof ObjectiveEditorRow,
    value: string | number,
  ) => {
    setObjectiveRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)),
    );
  };

  const validateObjectiveRows = (): string | null => {
    for (const row of objectiveRows) {
      if (!row.objective.trim()) return 'All objective rows must have a description.';
      const start = Number(row.start_item);
      const end = Number(row.end_item);
      if (!start || !end) return 'All objective rows must have valid item ranges.';
      if (start > end) return 'Objective start item must be less than or equal to end item.';
      if (start < 1 || end > totalQuestions) {
        return `Objective item ranges must be between 1 and ${totalQuestions}.`;
      }
    }
    return null;
  };

  const handleSaveObjectives = async () => {
    const err = validateObjectiveRows();
    if (err) {
      notifications.show({ title: 'Validation Error', message: err, color: 'red' });
      return;
    }

    const payload: LearningObjective[] = objectiveRows.map((r) => ({
      objective: r.objective.trim(),
      start_item: Number(r.start_item),
      end_item: Number(r.end_item),
    }));

    setSavingObjectives(true);
    const ok = await saveObjectives(exam.exam_id, payload);
    setSavingObjectives(false);

    if (!ok) {
      notifications.show({
        title: 'Save Failed',
        message: 'Could not save objectives. Please try again.',
        color: 'red',
        withBorder: true,
      });
      return;
    }

    notifications.show({
      title: 'Objectives Saved',
      message: 'Learning objectives were updated successfully.',
      color: 'teal',
      withBorder: true,
      autoClose: 2000,
    });
    await onSuccess();
    setShowObjectiveEditor(false);
  };

  const objectiveForItem = (item: number): string | null => {
    for (const row of objectiveRows) {
      const start = Number(row.start_item);
      const end = Number(row.end_item);
      if (!start || !end) continue;
      if (item >= start && item <= end && row.objective.trim()) {
        return row.objective.trim();
      }
    }
    return null;
  };

  const objectiveIndexForItem = (item: number): number => {
    for (let i = 0; i < objectiveRows.length; i++) {
      const row = objectiveRows[i];
      const start = Number(row.start_item);
      const end = Number(row.end_item);
      if (!start || !end) continue;
      if (item >= start && item <= end && row.objective.trim()) return i;
    }
    return -1;
  };

  const handleAnswerSelect = (questionNumber: number, answer: string) => {
    setAnswers(prev => ({
      ...prev,
      [questionNumber]: prev[questionNumber] === answer ? null : answer,
    }));
    if (triedToSave) setShowIncompleteWarning(false);
  };

  const unansweredQuestions = Array.from({ length: totalQuestions }, (_, i) => i + 1)
    .filter(q => !answers[q]);
  const isComplete = unansweredQuestions.length === 0;
  const answeredCount = totalQuestions - unansweredQuestions.length;
  const progressPercent = Math.round((answeredCount / totalQuestions) * 100);

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setTriedToSave(true);

    if (!isComplete) {
      setShowIncompleteWarning(true);
      setTimeout(() => {
        document.getElementById('incomplete-warning')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
      return;
    }

    setLoading(true);
    try {
      const answerKeyData: AnswerKeyJsonb = {
        total_questions: totalQuestions,
        num_choices: numChoices,
        answers: answers as { [questionNumber: number]: string | null },
      };

      const success = await saveAnswerKey(exam.exam_id, answerKeyData);
      if (!success) throw new Error('Failed to save');

      notifications.show({
        title: 'Answer Key Saved',
        message: 'Your answer key has been saved successfully.',
        color: 'teal',
        withBorder: true,
        autoClose: 2500,
      });

      if (onBack) {
        // Creation flow — show summary step before closing
        setShowSummary(true);
      } else {
        await onSuccess();
        onClose();
      }
    } catch (error) {
      console.error('Error saving answer key:', error);
      notifications.show({
        title: 'Save Failed',
        message: 'Failed to save answer key. Please try again.',
        color: 'red',
        withBorder: true,
      });
    } finally {
      setLoading(false);
    }
  };

  const questionsPerColumn = 10;
  const columns = Math.ceil(totalQuestions / questionsPerColumn);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto animate-slide-in">

        {/* Sticky Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 p-6 z-10">
          {onBack && <CreationFlowStepper activeStep={showSummary ? 3 : 2} />}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 relative shrink-0">
                <Image src="/logo.png" alt="Logo" fill className="object-contain" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Edit Answer Key</h2>
                <p className="text-gray-500 text-sm mt-0.5">{exam.title}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <IconX className="w-6 h-6 text-gray-500" />
            </button>
          </div>

          {/* Assigned sections notice */}
          {assignedSections.length > 1 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mb-3">
              <p className="text-xs text-blue-700">
                <span className="font-semibold">Shared answer key</span> — applies to:{' '}
                <span className="font-semibold">{assignedSections.join(', ')}</span>
              </p>
            </div>
          )}
          {assignedSections.length === 1 && (
            <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-3">
              <p className="text-xs text-green-700">
                <span className="font-semibold">Test for:</span>{' '}
                <span className="font-semibold">{assignedSections[0]}</span>
              </p>
            </div>
          )}

          {/* Progress Bar */}
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-500">Progress</span>
              <span className={`font-semibold ${isComplete ? 'text-green-600' : 'text-orange-500'}`}>
                {answeredCount} / {totalQuestions} answered ({progressPercent}%)
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div
                className={`h-2.5 rounded-full transition-all duration-500 ${isComplete ? 'bg-green-500' : 'bg-orange-400'}`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {showSummary ? (
            <div className="space-y-5">
              {/* Header */}
              <div className="text-center pb-2">
                <div className="text-4xl mb-2">🎉</div>
                <h3 className="text-xl font-bold text-gray-900">Examination Setup Complete!</h3>
                <p className="text-gray-500 text-sm mt-0.5">Review your answer key and objectives below.</p>
              </div>

              {/* Exam meta */}
              <div className="grid grid-cols-2 gap-2 text-sm">
                {[
                  ['Exam', exam.title],
                  ['Subject', exam.subjects?.name ?? '—'],
                  ['Grade', exam.exam_assignments?.[0]?.sections?.grade_levels?.display_name ?? '—'],
                  ['Section(s)', assignedSections.join(', ')],
                ].map(([label, value]) => (
                  <div key={label} className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
                    <p className="font-semibold text-gray-900 truncate">{value}</p>
                  </div>
                ))}
              </div>

              {/* Answer key + objectives */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Answer Key — {totalQuestions} items · {objectiveRows.length} objective{objectiveRows.length !== 1 ? 's' : ''}
                </p>
                <div className={`grid gap-x-6 gap-y-0.5 ${columns <= 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}>
                  {Array.from({ length: columns }, (_, col) => (
                    <div key={col}>
                      {Array.from({ length: questionsPerColumn }, (_, row) => {
                        const qNum = col * questionsPerColumn + row + 1;
                        if (qNum > totalQuestions) return null;
                        const answer = answers[qNum];
                        const objIdx = objectiveIndexForItem(qNum);
                        const color = objIdx >= 0 ? OBJECTIVE_PALETTE[objIdx % OBJECTIVE_PALETTE.length] : null;
                        const objectiveLabel = objIdx >= 0 ? objectiveForItem(qNum) : null;
                        return (
                          <div key={qNum} className="flex items-center gap-2 py-1 px-1.5 rounded-lg hover:bg-gray-50">
                            <span className="text-sm font-semibold w-7 text-right flex-shrink-0 text-gray-500">{qNum}</span>
                            <div className="flex gap-1 flex-shrink-0">
                              {choices.map(option => (
                                <div key={option}
                                  className={`w-7 h-7 rounded-full border-2 flex items-center justify-center font-bold text-[11px] ${
                                    answer === option
                                      ? 'bg-green-600 border-green-600 text-white shadow-sm'
                                      : 'border-gray-200 text-gray-300'
                                  }`}>
                                  {option}
                                </div>
                              ))}
                            </div>
                            {objectiveLabel && color && (
                              <div className="relative group flex-shrink-0">
                                <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold border cursor-help leading-tight"
                                  style={{ background: color.bg, borderColor: color.border, color: color.text }}>
                                  {objectiveLabel.length > 14 ? objectiveLabel.slice(0, 14) + '…' : objectiveLabel}
                                </span>
                                <div className="pointer-events-none absolute bottom-full left-0 mb-2 hidden group-hover:block z-50 w-max max-w-60">
                                  <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-xl leading-snug whitespace-normal">
                                    {objectiveLabel}
                                  </div>
                                  <div className="w-2 h-2 bg-gray-900 rotate-45 ml-2 -mt-1" />
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>

              {/* Done */}
              <div className="flex gap-3 pt-3 border-t border-gray-200">
                <button
                  type="button"
                  onClick={async () => { await onSuccess(); onClose(); }}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium bg-[#466D1D] hover:bg-[#355516] text-white transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          ) : loadingAnswers ? (
            <div className="text-center py-12">
              <div className="inline-block w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-gray-500 mt-4">Loading answer key...</p>
            </div>
          ) : (
            <>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <IconBookmark className="w-4 h-4 text-blue-600" />
                    <p className="text-sm font-semibold text-blue-800">
                      Learning Objectives ({objectiveRows.length})
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowObjectiveEditor((v) => !v)}
                    className="text-xs font-semibold text-blue-700 hover:text-blue-800"
                  >
                    {showObjectiveEditor ? 'Hide Editor' : 'Edit Objectives'}
                  </button>
                </div>
                <p className="text-xs text-blue-700 mt-1">
                  Saved objectives appear beside each item bubble below.
                </p>

                {showObjectiveEditor && (
                  <div className="mt-3 space-y-2">
                    {objectiveRows.length === 0 && (
                      <div className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs text-blue-700">
                        No objectives yet. Add one below.
                      </div>
                    )}

                    {objectiveRows.map((row, idx) => (
                      <div key={row.id} className="rounded-lg border border-blue-200 bg-white p-3">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <p className="text-xs font-semibold text-blue-700">Objective {idx + 1}</p>
                          <button
                            type="button"
                            onClick={() => removeObjectiveRow(row.id)}
                            className="text-xs font-semibold text-red-600 hover:text-red-700"
                          >
                            Remove
                          </button>
                        </div>
                        <input
                          type="text"
                          value={row.objective}
                          onChange={(e) => updateObjectiveRow(row.id, 'objective', e.currentTarget.value)}
                          placeholder="Objective description"
                          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm mb-2 focus:outline-none focus:border-blue-400"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="number"
                            min={1}
                            max={totalQuestions}
                            value={row.start_item}
                            onChange={(e) => updateObjectiveRow(row.id, 'start_item', e.currentTarget.value)}
                            placeholder="From item"
                            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:border-blue-400"
                          />
                          <input
                            type="number"
                            min={1}
                            max={totalQuestions}
                            value={row.end_item}
                            onChange={(e) => updateObjectiveRow(row.id, 'end_item', e.currentTarget.value)}
                            placeholder="To item"
                            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:border-blue-400"
                          />
                        </div>
                      </div>
                    ))}

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={addObjectiveRow}
                        className="px-3 py-1.5 rounded-md text-xs font-semibold bg-white border border-blue-300 text-blue-700 hover:bg-blue-50"
                      >
                        Add Objective
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveObjectives}
                        disabled={savingObjectives}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold ${
                          !savingObjectives
                            ? 'bg-blue-600 hover:bg-blue-700 text-white'
                            : 'bg-blue-200 text-blue-500 cursor-not-allowed'
                        }`}
                      >
                        {savingObjectives ? 'Saving...' : 'Save Objectives'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Incomplete Warning */}
              {showIncompleteWarning && !isComplete && (
                <div id="incomplete-warning" className="bg-orange-50 border-2 border-orange-300 rounded-xl p-4 mb-6 animate-fade-in">
                  <div className="flex items-start gap-3">
                    <IconAlertTriangle className="w-5 h-5 text-orange-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-bold text-orange-800">Cannot save — Answer Key is incomplete!</p>
                      <p className="text-orange-700 text-sm mt-1">
                        All <strong>{totalQuestions} questions</strong> must be answered. Missing <strong>{unansweredQuestions.length}</strong>:
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {unansweredQuestions.map(q => (
                          <span key={q} className="bg-orange-200 text-orange-900 text-xs font-bold px-2.5 py-1 rounded-md">#{q}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {isComplete && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-6 flex items-center gap-2">
                  <span className="text-green-600 text-lg">✅</span>
                  <span className="text-green-700 font-medium text-sm">
                    All {totalQuestions} questions answered — ready to save!
                  </span>
                </div>
              )}

              {/* Answer Bubbles */}
              <div className={`grid gap-6 mb-6 ${columns <= 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}>
                {Array.from({ length: columns }, (_, col) => (
                  <div key={col} className="space-y-1">
                    {Array.from({ length: questionsPerColumn }, (_, row) => {
                      const qNum = col * questionsPerColumn + row + 1;
                      if (qNum > totalQuestions) return null;
                      const isUnanswered = triedToSave && !answers[qNum];
                      const objIdx = objectiveIndexForItem(qNum);
                      const color = objIdx >= 0 ? OBJECTIVE_PALETTE[objIdx % OBJECTIVE_PALETTE.length] : null;
                      const objectiveLabel = objIdx >= 0 ? objectiveForItem(qNum) : null;
                      return (
                        <div key={qNum}
                          className={`flex items-center gap-2 py-1.5 px-2 rounded-lg transition-all ${isUnanswered ? 'bg-orange-50 border border-orange-200' : 'hover:bg-gray-50'}`}>
                          <span className={`text-sm font-semibold w-7 text-right flex-shrink-0 ${isUnanswered ? 'text-orange-600' : 'text-gray-700'}`}>{qNum}</span>
                          <div className="flex gap-1 flex-shrink-0">
                            {choices.map(option => (
                              <button key={option} type="button" onClick={() => handleAnswerSelect(qNum, option)}
                                className={`w-8 h-8 rounded-full border-2 flex items-center justify-center font-bold text-xs transition-all duration-150 hover:scale-110 ${
                                  answers[qNum] === option
                                    ? 'bg-green-600 border-green-600 text-white shadow-md'
                                    : isUnanswered
                                    ? 'border-orange-300 text-orange-400 hover:border-green-500 hover:bg-green-50'
                                    : 'border-gray-300 text-gray-500 hover:border-green-500 hover:bg-green-50'
                                }`}>
                                {option}
                              </button>
                            ))}
                          </div>
                          {objectiveLabel && color && (
                            <div className="relative group flex-shrink-0">
                              <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold border cursor-help leading-tight"
                                style={{ background: color.bg, borderColor: color.border, color: color.text }}>
                                {objectiveLabel.length > 14 ? objectiveLabel.slice(0, 14) + '…' : objectiveLabel}
                              </span>
                              <div className="pointer-events-none absolute bottom-full left-0 mb-2 hidden group-hover:block z-50 w-max max-w-60">
                                <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-xl leading-snug whitespace-normal">
                                  {objectiveLabel}
                                </div>
                                <div className="w-2 h-2 bg-gray-900 rotate-45 ml-2 -mt-1" />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>

              {!isComplete && !showIncompleteWarning && (
                <div className="bg-gray-50 rounded-lg p-3 mb-4 text-center text-sm text-gray-500">
                  {unansweredQuestions.length} question{unansweredQuestions.length > 1 ? 's' : ''} remaining —
                  <span className="font-medium text-gray-700"> all {totalQuestions} must be answered to save</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4 border-t border-gray-200">
                {onBack && (
                  <button
                    type="button"
                    onClick={onBack}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg font-medium text-white bg-[#466D1D] hover:bg-[#355516] transition-colors"
                    disabled={loading}
                  >
                    <IconArrowLeft className="w-4 h-4" />
                    Back
                  </button>
                )}
                <button type="button" onClick={onClose} className="btn-secondary flex-1" disabled={loading}>Cancel</button>
                <button type="submit" disabled={loading}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all duration-200 ${
                    isComplete ? 'bg-green-600 hover:bg-green-700 text-white shadow-md hover:shadow-lg active:scale-95' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}>
                  <IconDeviceFloppy className="w-5 h-5" />
                  {loading ? 'Saving...' : isComplete ? 'Save Answer Key' : `${unansweredQuestions.length} item${unansweredQuestions.length > 1 ? 's' : ''} missing`}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
