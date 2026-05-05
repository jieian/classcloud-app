"use client";

import React from "react";
import { Button, Group } from "@mantine/core";

interface WizardNavigationButtonsProps {
  onCancel: () => void;
  onPrimary: () => void;
  showPrevious?: boolean;
  onPrevious?: () => void;
  cancelLabel?: string;
  previousLabel?: string;
  primaryLabel: string;
  primaryDisabled?: boolean;
  primaryLoading?: boolean;
  primaryColor?: string;
  colorWhenEnabledOnly?: boolean;
  mt?: number | string;
  leftExtra?: React.ReactNode;
}

export default function WizardNavigationButtons({
  onCancel,
  onPrimary,
  showPrevious = false,
  onPrevious,
  cancelLabel = "Cancel",
  previousLabel = "Previous",
  primaryLabel,
  primaryDisabled = false,
  primaryLoading = false,
  primaryColor = "#4EAE4A",
  colorWhenEnabledOnly = true,
  mt = "xl",
  leftExtra,
}: WizardNavigationButtonsProps) {
  const useColor = colorWhenEnabledOnly ? !primaryDisabled : true;

  return (
    <Group justify="flex-end" mt={mt}>
      {leftExtra}
      <Button variant="default" onClick={onCancel}>
        {cancelLabel}
      </Button>

      {showPrevious && onPrevious && (
        <Button variant="outline" onClick={onPrevious}>
          {previousLabel}
        </Button>
      )}

      <Button
        onClick={onPrimary}
        disabled={primaryDisabled}
        loading={primaryLoading}
        style={useColor ? { backgroundColor: primaryColor } : undefined}
      >
        {primaryLabel}
      </Button>
    </Group>
  );
}
