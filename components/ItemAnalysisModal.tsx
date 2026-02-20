'use client';

import { useState, useEffect } from 'react';
import { IconX, IconRefresh, IconTrash, IconTrendingUp, IconTrendingDown, IconUsers, IconTarget } from '@tabler/icons-react';
import Image from 'next/image';
import { fetchAttemptsForExam, deleteAttempt } from '@/lib/services/attemptService';
import {
  computeItemStatistics, computeExamSummary, saveItemStatistics,
  fetchItemStatistics, difficultyLabel, discriminationLabel,
  ComputedItemStat,
} from '@/lib/services/analysisService';
import type { ExamWithRelations, ExamAttempt, AnswerKeyJsonb } from '@/lib/exam-supabase';

interface ItemAnalysisModalProps {
  exam: ExamWithRelations;
  onClose: () => void;
}

export default function ItemAnalysisModal({ exam, onClose }: ItemAnalysisModalProps) {
  const [attempts, setAttempts] = useState<ExamAttempt[]>([]);
  const [itemStats, setItemStats] = useState<ComputedItemStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'summary' | 'items' | 'students'>('summary');

  const ak = exam.answer_key as AnswerKeyJsonb | null;
  const totalItems = ak?.total_questions ?? exam.total_items ?? 30;
  const answerKey: { [item: number]: string | null } = ak?.answers ?? {};

  const loadData = async () => {
    setLoading(true);
    const [att] = await Promise.all([fetchAttemptsForExam(exam.exam_id)]);
    setAttempts(att);

    if (att.length > 0) {
      const computed = computeItemStatistics(att, answerKey, totalItems);
      setItemStats(computed);
      await saveItemStatistics(exam.exam_id, computed);
    } else {
      setItemStats([]);
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const summary = computeExamSummary(attempts, itemStats, totalItems);

  const handleDeleteAttempt = async (attemptId: number) => {
    if (!confirm('Remove this student\'s result?')) return;
    await deleteAttempt(attemptId);
    loadData();
  };

  // ── Mini bar component ────────────────────────────────────────────────────
  const Bar = ({ value, color, max = 1 }: { value: number; color: string; max?: number }) => (
    <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${color}`}
        style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%` }}
      />
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-y-auto animate-slide-in">

        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 p-5 z-10">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 relative flex-shrink-0">
                <Image src="/logo.png" alt="Logo" fill className="object-contain" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Item Analysis</h2>
                <p className="text-gray-500 text-xs mt-0.5">{exam.title}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={loadData} className="p-2 hover:bg-gray-100 rounded-lg transition-colors" title="Refresh">
                <IconRefresh className="w-4 h-4 text-gray-500" />
              </button>
              <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <IconX className="w-5 h-5 text-gray-500" />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
            {(['summary', 'items', 'students'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-1.5 px-3 rounded-lg text-sm font-medium transition-all capitalize ${
                  activeTab === tab ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="text-center py-16">
              <div className="inline-block w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-gray-400 mt-3 text-sm">Loading analysis...</p>
            </div>
          ) : attempts.length === 0 ? (
            <div className="text-center py-16">
              <IconTarget className="w-14 h-14 text-gray-200 mx-auto mb-4" />
              <p className="text-gray-500 font-medium">No scanned papers yet</p>
              <p className="text-gray-400 text-sm mt-1">Use "Scan Papers" to add student results.</p>
            </div>
          ) : (

            <>
              {/* ── SUMMARY TAB ─────────────────────────────────────────────── */}
              {activeTab === 'summary' && (
                <div className="space-y-6">
                  {/* KPI cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { icon: IconUsers, label: 'Total Papers', value: summary.total_attempts, color: 'bg-blue-50 text-blue-700' },
                      { icon: IconTrendingUp, label: 'Average Score', value: `${summary.average_score}/${totalItems}`, color: 'bg-green-50 text-green-700' },
                      { icon: IconTarget, label: 'Pass Rate', value: `${Math.round(summary.pass_rate * 100)}%`, color: 'bg-purple-50 text-purple-700' },
                      { icon: IconTrendingDown, label: 'Avg Difficulty', value: summary.average_difficulty.toFixed(2), color: 'bg-orange-50 text-orange-700' },
                    ].map(({ icon: Icon, label, value, color }) => (
                      <div key={label} className={`rounded-xl p-4 ${color.split(' ')[0]}`}>
                        <Icon className={`w-5 h-5 ${color.split(' ')[1]} mb-2`} />
                        <p className={`text-2xl font-bold ${color.split(' ')[1]}`}>{value}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Score range */}
                  <div className="bg-gray-50 rounded-xl p-4">
                    <p className="text-sm font-semibold text-gray-700 mb-3">Score Range</p>
                    <div className="flex items-center gap-4">
                      <div className="text-center">
                        <p className="text-2xl font-bold text-red-500">{summary.lowest_score}</p>
                        <p className="text-xs text-gray-400">Lowest</p>
                      </div>
                      <div className="flex-1 h-4 bg-gradient-to-r from-red-200 via-yellow-200 to-green-200 rounded-full relative">
                        {/* Range indicator */}
                        <div
                          className="absolute top-0 h-full bg-primary rounded-full opacity-40"
                          style={{
                            left: `${(summary.lowest_score / totalItems) * 100}%`,
                            width: `${((summary.highest_score - summary.lowest_score) / totalItems) * 100}%`,
                          }}
                        />
                        <div
                          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-primary rounded-full border-2 border-white shadow"
                          style={{ left: `${(summary.average_score / totalItems) * 100}%` }}
                        />
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-green-600">{summary.highest_score}</p>
                        <p className="text-xs text-gray-400">Highest</p>
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 text-center mt-2">
                      Average: <strong className="text-primary">{summary.average_score}</strong> / {totalItems}
                    </p>
                  </div>

                  {/* Score distribution */}
                  <div className="bg-gray-50 rounded-xl p-4">
                    <p className="text-sm font-semibold text-gray-700 mb-3">Score Distribution</p>
                    <div className="space-y-1.5">
                      {Object.entries(summary.score_distribution)
                        .sort(([a], [b]) => parseInt(b) - parseInt(a))
                        .map(([score, count]) => (
                          <div key={score} className="flex items-center gap-3">
                            <span className="text-xs text-gray-500 w-8 text-right">{score}</span>
                            <div className="flex-1 h-4 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary rounded-full"
                                style={{ width: `${(count / summary.total_attempts) * 100}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-500 w-6">{count}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ── ITEMS TAB ───────────────────────────────────────────────── */}
              {activeTab === 'items' && (
                <div>
                  <div className="flex gap-4 text-xs text-gray-500 mb-3">
                    <span>🔵 Difficulty: proportion correct (higher = easier)</span>
                    <span>🟢 Discrimination: separates high/low scorers (D ≥ 0.30 is good)</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-gray-500 border-b border-gray-200">
                          <th className="text-left py-2 px-2 font-semibold">Item</th>
                          <th className="text-left py-2 px-2 font-semibold">Key</th>
                          <th className="text-left py-2 px-2 font-semibold">Difficulty</th>
                          <th className="text-left py-2 px-2 font-semibold">Discrimination</th>
                          <th className="text-left py-2 px-2 font-semibold">Choices (A/B/C/D...)</th>
                          <th className="text-left py-2 px-2 font-semibold">n</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {itemStats.map(stat => {
                          const dl = difficultyLabel(stat.difficulty_index);
                          const disc = discriminationLabel(stat.discrimination_index);
                          const freq = stat.choice_frequencies ?? {};
                          const allChoices = Object.keys(freq).filter(k => k !== '*omit*').sort();
                          const maxFreq = Math.max(1, ...Object.values(freq));
                          return (
                            <tr key={stat.item_number} className="hover:bg-gray-50">
                              <td className="py-2 px-2 font-bold text-gray-700">{stat.item_number}</td>
                              <td className="py-2 px-2">
                                <span className="bg-primary/10 text-primary font-bold px-2 py-0.5 rounded text-xs">
                                  {answerKey[stat.item_number] ?? '?'}
                                </span>
                              </td>
                              <td className="py-2 px-2">
                                <div className="flex flex-col gap-1">
                                  <div className="flex items-center gap-2">
                                    <Bar value={stat.difficulty_index} color="bg-blue-400" />
                                    <span className="text-xs text-gray-500">{(stat.difficulty_index * 100).toFixed(0)}%</span>
                                  </div>
                                  <span className={`text-xs font-medium ${dl.color}`}>{dl.label}</span>
                                </div>
                              </td>
                              <td className="py-2 px-2">
                                <div className="flex flex-col gap-1">
                                  <div className="flex items-center gap-2">
                                    <Bar
                                      value={stat.discrimination_index + 1}
                                      color={stat.discrimination_index >= 0.3 ? 'bg-green-400' : stat.discrimination_index >= 0 ? 'bg-yellow-400' : 'bg-red-400'}
                                      max={2}
                                    />
                                    <span className="text-xs text-gray-500">{stat.discrimination_index.toFixed(2)}</span>
                                  </div>
                                  <span className={`text-xs font-medium ${disc.color}`}>{disc.label}</span>
                                </div>
                              </td>
                              <td className="py-2 px-2">
                                <div className="flex gap-1">
                                  {allChoices.map(ch => {
                                    const count = freq[ch] ?? 0;
                                    const isCorrect = ch === answerKey[stat.item_number];
                                    const pct = Math.round((count / stat.total_responses) * 100) || 0;
                                    return (
                                      <div key={ch} className="flex flex-col items-center">
                                        <div className="w-8 h-8 flex flex-col justify-end bg-gray-100 rounded overflow-hidden">
                                          <div
                                            className={`w-full ${isCorrect ? 'bg-green-400' : 'bg-gray-400'}`}
                                            style={{ height: `${(count / maxFreq) * 100}%` }}
                                          />
                                        </div>
                                        <span className={`text-xs font-bold mt-0.5 ${isCorrect ? 'text-green-600' : 'text-gray-500'}`}>{ch}</span>
                                        <span className="text-xs text-gray-400">{pct}%</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </td>
                              <td className="py-2 px-2 text-xs text-gray-400">{stat.total_responses}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── STUDENTS TAB ─────────────────────────────────────────────── */}
              {activeTab === 'students' && (
                <div className="space-y-3">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-gray-500 border-b border-gray-200">
                          <th className="text-left py-2 px-3 font-semibold">Student</th>
                          <th className="text-left py-2 px-3 font-semibold">LRN</th>
                          <th className="text-left py-2 px-3 font-semibold">Score</th>
                          <th className="text-left py-2 px-3 font-semibold">%</th>
                          <th className="text-left py-2 px-3 font-semibold">Scanned</th>
                          <th className="py-2 px-3" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {[...attempts]
                          .sort((a, b) => b.score - a.score)
                          .map(attempt => {
                            const pct = Math.round((attempt.score / totalItems) * 100);
                            return (
                              <tr key={attempt.attempt_id} className="hover:bg-gray-50">
                                <td className="py-2.5 px-3 font-medium text-gray-800">{attempt.student_name ?? '—'}</td>
                                <td className="py-2.5 px-3 text-gray-400 text-xs font-mono">{attempt.student_lrn ?? '—'}</td>
                                <td className="py-2.5 px-3">
                                  <span className={`font-bold ${pct >= 75 ? 'text-green-600' : pct >= 50 ? 'text-yellow-600' : 'text-red-500'}`}>
                                    {attempt.score}/{totalItems}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3">
                                  <div className="flex items-center gap-2">
                                    <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                      <div
                                        className={`h-full rounded-full ${pct >= 75 ? 'bg-green-400' : pct >= 50 ? 'bg-yellow-400' : 'bg-red-400'}`}
                                        style={{ width: `${pct}%` }}
                                      />
                                    </div>
                                    <span className="text-xs text-gray-500">{pct}%</span>
                                  </div>
                                </td>
                                <td className="py-2.5 px-3 text-xs text-gray-400">
                                  {new Date(attempt.scanned_at).toLocaleDateString()}
                                </td>
                                <td className="py-2.5 px-3">
                                  <button
                                    onClick={() => handleDeleteAttempt(attempt.attempt_id)}
                                    className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                                    title="Remove"
                                  >
                                    <IconTrash className="w-4 h-4" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
