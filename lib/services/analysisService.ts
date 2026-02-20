/**
 * analysisService.ts
 *
 * Computes item-level statistics from a set of exam attempts.
 *
 * Metrics:
 *  - Difficulty Index (p-value): proportion of students who answered correctly.
 *    Range 0–1. Good items: 0.30–0.70.
 *
 *  - Discrimination Index (D):  difference in pass rate between top 27% and
 *    bottom 27% of scorers. Range -1 to 1. Good items: D ≥ 0.30.
 *
 *  - Choice Frequencies: how many students chose each option (including omit).
 *
 * Usage:
 *   const stats = computeItemStatistics(attempts, answerKey);
 *   await saveItemStatistics(examId, stats);
 */

import { supabase } from '@/lib/exam-supabase';
import type { ExamAttempt, ItemStatistic } from '@/lib/exam-supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ComputedItemStat {
  item_number: number;
  difficulty_index: number;
  discrimination_index: number;
  choice_frequencies: { [choice: string]: number };
  total_responses: number;
  correct_count: number;
}

export interface ExamSummary {
  total_attempts: number;
  average_score: number;
  highest_score: number;
  lowest_score: number;
  pass_count: number;         // score >= 50% of total items
  pass_rate: number;          // 0–1
  score_distribution: { [score: number]: number }; // score → frequency
  average_difficulty: number; // mean p-value across all items
  average_discrimination: number;
}

// ─── Core Computation ─────────────────────────────────────────────────────────

/**
 * Computes item statistics from a list of attempts and the correct answer key.
 * @param attempts   Array of ExamAttempt rows
 * @param answerKey  Correct answers: { 1: 'A', 2: 'C', ... }
 * @param totalItems Number of items (some may have no responses)
 */
export function computeItemStatistics(
  attempts: ExamAttempt[],
  answerKey: { [item: number]: string | null },
  totalItems: number
): ComputedItemStat[] {
  if (attempts.length === 0) return [];

  // Sort attempts by score ascending (needed for discrimination index)
  const sorted = [...attempts].sort((a, b) => a.score - b.score);
  const n = sorted.length;

  // Top 27% and bottom 27% groups
  const groupSize = Math.max(1, Math.round(n * 0.27));
  const bottomGroup = sorted.slice(0, groupSize);
  const topGroup = sorted.slice(n - groupSize);

  const stats: ComputedItemStat[] = [];

  for (let item = 1; item <= totalItems; item++) {
    const correctAnswer = answerKey[item];
    const freq: { [ch: string]: number } = {};
    let correctCount = 0;
    let totalResponses = 0;

    // Tally choice frequencies across all attempts
    for (const attempt of attempts) {
      const resp = attempt.responses[item];
      if (resp) {
        freq[resp] = (freq[resp] ?? 0) + 1;
        totalResponses++;
        if (correctAnswer && resp === correctAnswer) correctCount++;
      } else {
        freq['*omit*'] = (freq['*omit*'] ?? 0) + 1;
      }
    }

    const difficultyIndex = attempts.length > 0 ? correctCount / attempts.length : 0;

    // Discrimination index: (correct in top group) / topGroupSize - (correct in bottomGroup) / bottomGroupSize
    const topCorrect = topGroup.filter(a =>
      correctAnswer && a.responses[item] === correctAnswer
    ).length;
    const botCorrect = bottomGroup.filter(a =>
      correctAnswer && a.responses[item] === correctAnswer
    ).length;
    const discriminationIndex = topCorrect / groupSize - botCorrect / groupSize;

    stats.push({
      item_number: item,
      difficulty_index: parseFloat(difficultyIndex.toFixed(4)),
      discrimination_index: parseFloat(discriminationIndex.toFixed(4)),
      choice_frequencies: freq,
      total_responses: totalResponses,
      correct_count: correctCount,
    });
  }

  return stats;
}

/**
 * Computes overall exam summary statistics from a list of attempts.
 */
export function computeExamSummary(
  attempts: ExamAttempt[],
  itemStats: ComputedItemStat[],
  totalItems: number
): ExamSummary {
  if (attempts.length === 0) {
    return {
      total_attempts: 0, average_score: 0, highest_score: 0,
      lowest_score: 0, pass_count: 0, pass_rate: 0,
      score_distribution: {}, average_difficulty: 0, average_discrimination: 0,
    };
  }

  const scores = attempts.map(a => a.score);
  const passMark = totalItems * 0.5;
  const passCount = scores.filter(s => s >= passMark).length;

  const scoreDist: { [score: number]: number } = {};
  scores.forEach(s => { scoreDist[s] = (scoreDist[s] ?? 0) + 1; });

  const avgDifficulty = itemStats.length > 0
    ? itemStats.reduce((sum, s) => sum + s.difficulty_index, 0) / itemStats.length
    : 0;
  const avgDiscrimination = itemStats.length > 0
    ? itemStats.reduce((sum, s) => sum + s.discrimination_index, 0) / itemStats.length
    : 0;

  return {
    total_attempts: attempts.length,
    average_score: parseFloat((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)),
    highest_score: Math.max(...scores),
    lowest_score: Math.min(...scores),
    pass_count: passCount,
    pass_rate: parseFloat((passCount / attempts.length).toFixed(4)),
    score_distribution: scoreDist,
    average_difficulty: parseFloat(avgDifficulty.toFixed(4)),
    average_discrimination: parseFloat(avgDiscrimination.toFixed(4)),
  };
}

// ─── DB Operations ────────────────────────────────────────────────────────────

/**
 * Upserts computed item statistics into the item_statistics table.
 */
export async function saveItemStatistics(
  examId: number,
  stats: ComputedItemStat[]
): Promise<void> {
  const rows = stats.map(s => ({
    exam_id: examId,
    item_number: s.item_number,
    difficulty_index: s.difficulty_index,
    discrimination_index: s.discrimination_index,
    choice_frequencies: s.choice_frequencies,
    total_responses: s.total_responses,
    computed_at: new Date().toISOString(),
  }));

  await supabase
    .from('item_statistics')
    .upsert(rows, { onConflict: 'exam_id,item_number' });
}

/**
 * Fetches item statistics for a given exam from the database.
 */
export async function fetchItemStatistics(examId: number): Promise<ItemStatistic[]> {
  const { data, error } = await supabase
    .from('item_statistics')
    .select('*')
    .eq('exam_id', examId)
    .order('item_number');

  if (error) {
    console.error('[analysisService] fetchItemStatistics error:', error.message);
    return [];
  }
  return data ?? [];
}

/**
 * Helper: classify difficulty index into a readable label.
 */
export function difficultyLabel(p: number): { label: string; color: string } {
  if (p >= 0.80) return { label: 'Very Easy', color: 'text-blue-500' };
  if (p >= 0.60) return { label: 'Easy',      color: 'text-green-600' };
  if (p >= 0.40) return { label: 'Average',   color: 'text-yellow-600' };
  if (p >= 0.20) return { label: 'Hard',      color: 'text-orange-500' };
  return               { label: 'Very Hard',  color: 'text-red-600' };
}

/**
 * Helper: classify discrimination index into a readable label.
 */
export function discriminationLabel(d: number): { label: string; color: string } {
  if (d >= 0.40) return { label: 'Excellent', color: 'text-green-600' };
  if (d >= 0.30) return { label: 'Good',      color: 'text-blue-500' };
  if (d >= 0.20) return { label: 'Fair',      color: 'text-yellow-600' };
  if (d >= 0.10) return { label: 'Poor',      color: 'text-orange-500' };
  return               { label: 'Revise',     color: 'text-red-600' };
}
