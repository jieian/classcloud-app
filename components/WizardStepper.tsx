'use client';

import { useEffect, useRef } from 'react';
import { Tooltip, UnstyledButton } from '@mantine/core';

interface StepItem {
  label: string;
  description: string;
  hasError?: boolean;
}

interface WizardStepperProps {
  active: number;
  steps: StepItem[];
  maxStep?: number;
  onStepClick?: (idx: number) => void;
}

const GREEN = '#4EAE4A';
const TRANSITION = '0.35s cubic-bezier(0.4, 0, 0.2, 1)';

export default function WizardStepper({ active, steps, maxStep, onStepClick }: WizardStepperProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const circleRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const update = () => {
      requestAnimationFrame(() => {
        if (!fillRef.current || !containerRef.current) return;
        const first = circleRefs.current[0];
        const curr = circleRefs.current[active];
        if (!first || !curr) return;

        const containerTop = containerRef.current.getBoundingClientRect().top;
        const y0 = first.getBoundingClientRect().top + 24 - containerTop;
        const y1 = curr.getBoundingClientRect().top + 24 - containerTop;

        fillRef.current.style.top = `${y0}px`;
        fillRef.current.style.height = active === 0 ? '0px' : `${y1 - y0}px`;
      });
    };

    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [active, steps.length]);

  const handleClick = (idx: number) => {
    const reachable = maxStep !== undefined ? idx <= maxStep : idx < active;
    if (idx !== active && reachable && onStepClick) onStepClick(idx);
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', userSelect: 'none' }}>
      {/* Track */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 24,
          bottom: 24,
          left: 24,
          width: 2,
          background: '#e5e7eb',
          zIndex: 0,
        }}
      />
      {/* Animated fill */}
      <div
        ref={fillRef}
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 24,
          left: 24,
          width: 2,
          height: 0,
          background: GREEN,
          zIndex: 1,
          transition: `height ${TRANSITION}`,
        }}
      />

      {steps.map((step, idx) => {
        const done = idx < active;
        const current = idx === active;
        const reachable = maxStep !== undefined ? idx <= maxStep : done;
        const future = !current && !reachable;
        const error = current && !!step.hasError;
        const clickable = !current && reachable && !!onStepClick;

        // Circle styles
        const circleBorder = done
          ? `2px solid ${GREEN}`
          : error
            ? '2px solid #dc2626'
            : current
              ? `2px solid ${GREEN}`
              : '2px solid #e5e7eb';
        const circleBg = done ? GREEN : error ? '#dc2626' : '#fff';
        const circleColor = done || error ? '#fff' : current ? GREEN : '#9ca3af';

        // Text styles
        const titleColor = error ? '#dc2626' : current ? GREEN : '#111827';
        const descColor = done || current ? '#4b5563' : '#9ca3af';

        return (
          <UnstyledButton
            key={idx}
            display="flex"
            onClick={() => handleClick(idx)}
            tabIndex={clickable ? 0 : -1}
            aria-current={current ? 'step' : undefined}
            className={clickable ? 'wizard-step-hover' : undefined}
            style={{
              alignItems: 'flex-start',
              gap: 16,
              padding: '12px 0 12px 12px',
              marginLeft: -12,
              width: 'calc(100% + 12px)',
              cursor: clickable ? 'pointer' : future ? 'not-allowed' : 'default',
              borderRadius: 12,
              position: 'relative',
              zIndex: 2,
              transition: `background ${TRANSITION}`,
            }}
          >
            {/* Circle */}
            <Tooltip
              label="Complete previous steps first"
              disabled={!future}
              position="right"
              withArrow
            >
              <div
                ref={(el) => { circleRefs.current[idx] = el; }}
                className={error ? 'wizard-pulse' : undefined}
                style={{
                  flexShrink: 0,
                  width: 48,
                  height: 48,
                  borderRadius: '9999px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 600,
                  fontSize: '0.95rem',
                  border: circleBorder,
                  background: circleBg,
                  color: circleColor,
                  position: 'relative',
                  zIndex: 2,
                  transform: current && !error ? 'scale(1.05)' : 'scale(1)',
                  transition: `all ${TRANSITION}`,
                }}
              >
                {done ? (
                  <svg
                    className="wizard-check"
                    width={20}
                    height={20}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#fff"
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  idx + 1
                )}
              </div>
            </Tooltip>

            {/* Labels */}
            <div style={{ paddingTop: 4, minWidth: 0 }}>
              <p
                style={{
                  fontSize: '1rem',
                  fontWeight: 600,
                  color: titleColor,
                  margin: 0,
                  lineHeight: 1.3,
                  transition: `color ${TRANSITION}`,
                }}
              >
                {step.label}
              </p>
              <p
                style={{
                  fontSize: '0.85rem',
                  color: descColor,
                  margin: '2px 0 0',
                  transition: `color ${TRANSITION}`,
                }}
              >
                {step.description}
              </p>
            </div>
          </UnstyledButton>
        );
      })}
    </div>
  );
}
