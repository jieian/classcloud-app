'use client';

import { useState, useEffect } from 'react';
import { IconX, IconDeviceFloppy, IconAlertTriangle, IconPlus, IconMinus } from '@tabler/icons-react';
import Image from 'next/image';
import { saveAnswerKey } from '@/lib/services/examService';
import type { ExamWithRelations, AnswerKeyJsonb } from '@/lib/exam-supabase';

interface CreateAnswerKeyModalProps {
  exam: ExamWithRelations;
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
}

const ALL_CHOICES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

export default function CreateAnswerKeyModal({ exam, onClose, onSuccess }: CreateAnswerKeyModalProps) {
  const [answers, setAnswers] = useState<{ [key: number]: string | null }>({});
  const [totalQuestions, setTotalQuestions] = useState(exam.total_items || 30);
  const [inputValue, setInputValue] = useState(String(exam.total_items || 30));
  const [numChoices, setNumChoices] = useState(4);
  const [loading, setLoading] = useState(false);
  const [loadingAnswers, setLoadingAnswers] = useState(true);
  const [showIncompleteWarning, setShowIncompleteWarning] = useState(false);
  const [triedToSave, setTriedToSave] = useState(false);

  const choices = ALL_CHOICES.slice(0, numChoices);

  // Get assigned section names for display
  const assignedSections = exam.exam_assignments
    ?.map(a => a.sections?.name)
    .filter(Boolean) ?? [];

  useEffect(() => {
    // Load existing answer key from the JSONB column
    const existing = exam.answer_key as AnswerKeyJsonb | null;
    if (existing?.answers) {
      setAnswers(existing.answers);
      if (existing.total_questions) {
        setTotalQuestions(existing.total_questions);
        setInputValue(String(existing.total_questions));
      }
      if (existing.num_choices) {
        setNumChoices(Math.max(4, existing.num_choices));
      }
    }
    setLoadingAnswers(false);
  }, [exam]);

  const applyTotal = (val: number) => {
    const clamped = Math.max(10, Math.min(200, val));
    setTotalQuestions(clamped);
    setInputValue(String(clamped));
    setAnswers(prev => {
      const updated = { ...prev };
      for (let i = clamped + 1; i <= 200; i++) delete updated[i];
      return updated;
    });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setInputValue(raw);
    const parsed = parseInt(raw);
    if (!isNaN(parsed)) applyTotal(parsed);
  };

  const handleNumChoicesChange = (newNum: number) => {
    const clamped = Math.max(2, Math.min(ALL_CHOICES.length, newNum));
    setNumChoices(clamped);
    const validChoices = ALL_CHOICES.slice(0, clamped);
    setAnswers(prev => {
      const updated = { ...prev };
      Object.keys(updated).forEach(k => {
        const key = parseInt(k);
        if (updated[key] && !validChoices.includes(updated[key] as string)) {
          updated[key] = null;
        }
      });
      return updated;
    });
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

  const handleSubmit = async (e: React.FormEvent) => {
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

      await onSuccess();
      onClose();
    } catch (error) {
      console.error('Error saving answer key:', error);
      alert('Failed to save answer key. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const questionsPerColumn = 10;
  const columns = Math.ceil(totalQuestions / questionsPerColumn);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto animate-slide-in">

        {/* Sticky Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 p-6 z-10">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 relative flex-shrink-0">
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
          {assignedSections.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mb-3">
              <p className="text-xs text-blue-700">
                <span className="font-semibold">Shared answer key</span> — applies to:{' '}
                <span className="font-semibold">{assignedSections.join(', ')}</span>
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
          {loadingAnswers ? (
            <div className="text-center py-12">
              <div className="inline-block w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-gray-500 mt-4">Loading answer key...</p>
            </div>
          ) : (
            <>
              {/* Controls Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">

                {/* Number of Items */}
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                  <p className="text-sm font-semibold text-gray-700 mb-3 text-center">Number of Items</p>
                  <div className="flex items-center justify-center gap-3">
                    <button type="button" onClick={() => applyTotal(totalQuestions - 1)} disabled={totalQuestions <= 10}
                      className={`w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all ${totalQuestions <= 10 ? 'border-gray-200 text-gray-300 cursor-not-allowed' : 'border-red-300 text-red-500 hover:bg-red-50 active:scale-95'}`}>
                      <IconMinus className="w-4 h-4" />
                    </button>
                    <div className="flex items-center gap-2">
                      <input type="number" min={10} max={200} value={inputValue}
                        onChange={handleInputChange}
                        onBlur={() => applyTotal(parseInt(inputValue) || 30)}
                        className="w-20 text-center text-2xl font-bold text-gray-900 border-2 border-gray-300 rounded-xl px-2 py-1.5 focus:outline-none focus:border-primary" />
                      <span className="text-sm text-gray-400">items</span>
                    </div>
                    <button type="button" onClick={() => applyTotal(totalQuestions + 1)} disabled={totalQuestions >= 200}
                      className={`w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all ${totalQuestions >= 200 ? 'border-gray-200 text-gray-300 cursor-not-allowed' : 'border-green-300 text-green-600 hover:bg-green-50 active:scale-95'}`}>
                      <IconPlus className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 text-center mt-2">Min: 10 · Max: 200</p>
                </div>

                {/* Choices per item */}
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                  <p className="text-sm font-semibold text-gray-700 mb-3 text-center">Choices per Item</p>
                  <div className="flex items-center justify-center gap-3">
                    <button type="button" onClick={() => handleNumChoicesChange(numChoices - 1)} disabled={numChoices <= 2}
                      className={`w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all ${numChoices <= 2 ? 'border-gray-200 text-gray-300 cursor-not-allowed' : 'border-red-300 text-red-500 hover:bg-red-50 active:scale-95'}`}>
                      <IconMinus className="w-4 h-4" />
                    </button>
                    <div className="flex items-center gap-2">
                      <div className="w-20 text-center py-1.5">
                        <p className="text-2xl font-bold text-gray-900">{numChoices}</p>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm text-gray-400">choices</span>
                        <span className="text-xs font-semibold text-primary">{choices.join(' · ')}</span>
                      </div>
                    </div>
                    <button type="button" onClick={() => handleNumChoicesChange(numChoices + 1)} disabled={numChoices >= ALL_CHOICES.length}
                      className={`w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all ${numChoices >= ALL_CHOICES.length ? 'border-gray-200 text-gray-300 cursor-not-allowed' : 'border-green-300 text-green-600 hover:bg-green-50 active:scale-95'}`}>
                      <IconPlus className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 text-center mt-2">Min: 2 (A·B) · Max: 8 (A–H)</p>
                </div>
              </div>

              {/* Incomplete Warning */}
              {showIncompleteWarning && !isComplete && (
                <div id="incomplete-warning" className="bg-orange-50 border-2 border-orange-300 rounded-xl p-4 mb-6 animate-fade-in">
                  <div className="flex items-start gap-3">
                    <IconAlertTriangle className="w-5 h-5 text-orange-500 mt-0.5 flex-shrink-0" />
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
                      return (
                        <div key={qNum}
                          className={`flex items-center gap-2 py-1.5 px-2 rounded-lg transition-all ${isUnanswered ? 'bg-orange-50 border border-orange-200' : 'hover:bg-gray-50'}`}>
                          <span className={`text-sm font-semibold w-7 text-right flex-shrink-0 ${isUnanswered ? 'text-orange-600' : 'text-gray-700'}`}>
                            {qNum}
                          </span>
                          <div className="flex gap-1 flex-wrap">
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
