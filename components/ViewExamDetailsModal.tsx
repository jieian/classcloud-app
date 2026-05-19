'use client';

import { Modal, Text, Tooltip } from '@mantine/core';
import type { ExamWithRelations, AnswerKeyJsonb, LearningObjective } from '@/lib/exam-supabase';

interface ViewExamDetailsModalProps {
  exam: ExamWithRelations | null;
  opened: boolean;
  onClose: () => void;
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

export default function ViewExamDetailsModal({ exam, opened, onClose }: ViewExamDetailsModalProps) {
  if (!exam) return null;

  const answerKey = exam.answer_key as AnswerKeyJsonb | null;
  const objectives = (exam.objectives ?? []) as LearningObjective[];
  const totalItems = answerKey?.total_questions ?? exam.total_items ?? 0;
  const numChoices = answerKey?.num_choices ?? 4;
  const answers = answerKey?.answers ?? {};
  const choices = ALL_CHOICES.slice(0, numChoices);
  const half = Math.ceil(totalItems / 2);

  const objectiveIndexForItem = (qNum: number): number => {
    for (let i = 0; i < objectives.length; i++) {
      const o = objectives[i];
      if (qNum >= o.start_item && qNum <= o.end_item) return i;
    }
    return -1;
  };

  const renderTable = (startIdx: number, endIdx: number) => (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-xs text-white border-b border-[#3f8f3b] bg-[#4EAE4A]">
          <th className="sticky top-0 text-left py-2 px-3 font-semibold w-10 bg-[#4EAE4A] z-10">No.</th>
          <th className="sticky top-0 text-left py-2 px-3 font-semibold w-14 bg-[#4EAE4A] z-10">Answer</th>
          <th className="sticky top-0 text-left py-2 px-3 font-semibold bg-[#4EAE4A] z-10">Objective</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50">
        {Array.from({ length: endIdx - startIdx }, (_, i) => {
          const qNum = startIdx + i + 1;
          const answer = answers[qNum] ?? '-';
          const objIdx = objectiveIndexForItem(qNum);
          const color = objIdx >= 0 ? OBJECTIVE_PALETTE[objIdx % OBJECTIVE_PALETTE.length] : null;
          const objLabel = objIdx >= 0 ? objectives[objIdx].objective : null;
          return (
            <tr key={qNum} className="hover:bg-gray-50">
              <td className="py-1.5 px-3 font-semibold text-gray-500">{qNum}</td>
              <td className="py-1.5 px-3">
                <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${answer !== '-' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
                  {answer}
                </span>
              </td>
              <td className="py-1.5 px-3">
                {color && objLabel ? (
                  <Tooltip
                    label={objLabel}
                    withArrow
                    multiline
                    w={220}
                    disabled={objLabel.length <= 24}
                    styles={{ tooltip: { wordBreak: 'break-all' } }}
                  >
                    <span
                      className="inline-block max-w-[8rem] truncate px-2 py-1 rounded text-xs font-medium border"
                      style={{ background: color.bg, borderColor: color.border, color: color.text }}
                    >
                      {objLabel}
                    </span>
                  </Tooltip>
                ) : (
                  <span className="text-xs text-gray-300">-</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="View Exam Details"
      size={780}
      centered
      styles={{ header: { paddingBottom: 8 }, body: { paddingTop: 8 } }}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {[
            ['Exam Name', exam.title],
            ['Items', String(totalItems)],
            ['Choices', `${numChoices} (${choices.join('/')})`],
          ].map(([label, value]) => (
            <div key={label}>
              <Text size="sm" fw={700} mb={2}>{label}</Text>
              <Text size="sm" style={{ whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>{value}</Text>
            </div>
          ))}
        </div>

        <div className="border border-gray-200 overflow-hidden">
          {/* Single scroll container — both columns scroll together */}
          <div className="overflow-y-auto overflow-x-hidden" style={{ maxHeight: '520px' }}>
            <div className="grid grid-cols-2 divide-x divide-gray-100">
              <div>{renderTable(0, half)}</div>
              <div>{renderTable(half, totalItems)}</div>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
