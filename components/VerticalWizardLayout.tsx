"use client";

import type { ReactNode } from "react";
import { rem } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import MobileStepIndicator from "@/components/MobileStepIndicator";
import WizardStepper from "@/components/WizardStepper";

export interface VerticalWizardStep {
  label: string;
  description: string;
  content?: ReactNode;
  hasError?: boolean;
}

interface VerticalWizardLayoutProps {
  active: number;
  steps: VerticalWizardStep[];
  children?: ReactNode;
  sidebarWidth?: string;
  maxStep?: number;
  onStepClick?: (idx: number) => void;
}

export default function VerticalWizardLayout({
  active,
  steps,
  children,
  sidebarWidth = "20%",
  maxStep,
  onStepClick,
}: VerticalWizardLayoutProps) {
  const isMobile = useMediaQuery("(max-width: 768px)");

  if (isMobile) {
    return (
      <div style={{ width: "100%", minWidth: 0 }}>
        <MobileStepIndicator
          activeStep={active}
          totalSteps={steps.length}
          stepDescription={steps[active]?.description ?? ""}
          hasError={steps[active]?.hasError}
        />
        {steps[active]?.content}
        {children && <div style={{ marginTop: rem(20), minWidth: 0 }}>{children}</div>}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: rem(32), height: "100%" }}>
      <div style={{ flexShrink: 0, width: sidebarWidth }}>
        <WizardStepper active={active} steps={steps} maxStep={maxStep} onStepClick={onStepClick} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}
