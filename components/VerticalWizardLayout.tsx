"use client";

import type { ReactNode } from "react";
import { rem, Stepper } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";

export interface VerticalWizardStep {
  label: string;
  description: string;
  content?: ReactNode;
}

interface VerticalWizardLayoutProps {
  active: number;
  steps: VerticalWizardStep[];
  children?: ReactNode;
  color?: string;
  sidebarWidth?: string;
}

export default function VerticalWizardLayout({
  active,
  steps,
  children,
  color = "#4EAE4A",
  sidebarWidth = "20%",
}: VerticalWizardLayoutProps) {
  const isMobile = useMediaQuery("(max-width: 768px)");

  if (isMobile) {
    return (
      <Stepper active={active} color={color} orientation="vertical">
        {steps.map((step) => (
          <Stepper.Step
            key={`${step.label}-${step.description}`}
            label={step.label}
            description={step.description}
          >
            {step.content}
          </Stepper.Step>
        ))}
      </Stepper>
    );
  }

  return (
    <div style={{ display: "flex", gap: rem(32), height: "100%" }}>
      <div style={{ flexShrink: 0, width: sidebarWidth }}>
        <Stepper active={active} color={color} orientation="vertical">
          {steps.map((step) => (
            <Stepper.Step
              key={`${step.label}-${step.description}`}
              label={step.label}
              description={step.description}
            />
          ))}
        </Stepper>
      </div>
      <div style={{ width: `calc(100% - ${sidebarWidth})` }}>{children}</div>
    </div>
  );
}
