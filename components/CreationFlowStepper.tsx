'use client';

import { IconCheck } from '@tabler/icons-react';

const STEPS = ['Create Exam', 'Learning Objectives', 'Answer Key', 'Summary'];

export default function CreationFlowStepper({ activeStep }: { activeStep: number }) {
  return (
    <div className="flex items-center mb-5">
      {STEPS.map((label, idx) => {
        const done = idx < activeStep;
        const active = idx === activeStep;
        return (
          <div key={idx} className="flex items-center" style={{ flex: idx < STEPS.length - 1 ? '1' : 'none' }}>
            <div className="flex flex-col items-center">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors
                ${done ? 'bg-[#466D1D] border-[#466D1D] text-white'
                  : active ? 'bg-white border-[#466D1D] text-[#466D1D]'
                  : 'bg-white border-gray-300 text-gray-400'}`}
              >
                {done ? <IconCheck size={13} strokeWidth={3} /> : idx + 1}
              </div>
              <span className={`text-[10px] mt-1 font-semibold whitespace-nowrap
                ${done || active ? 'text-[#466D1D]' : 'text-gray-400'}`}
              >
                {label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div className={`h-0.5 flex-1 mx-2 mb-4 transition-colors ${done ? 'bg-[#466D1D]' : 'bg-gray-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
