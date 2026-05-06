"use client";

import React from "react";
import { Button, Group } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";

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
  const isMobile = useMediaQuery("(max-width: 640px)");

  return (
    <Group
      justify={isMobile ? "stretch" : "flex-end"}
      mt={mt}
      gap="sm"
      wrap="wrap"
      style={isMobile ? { width: "100%" } : undefined}
    >
      {leftExtra && (
        <div style={isMobile ? { width: "100%" } : undefined}>
          {leftExtra}
        </div>
      )}
      <Button variant="default" onClick={onCancel} fullWidth={isMobile}>
        {cancelLabel}
      </Button>

      {showPrevious && onPrevious && (
        <Button variant="outline" onClick={onPrevious} fullWidth={isMobile}>
          {previousLabel}
        </Button>
      )}

      <Button
        onClick={onPrimary}
        disabled={primaryDisabled}
        loading={primaryLoading}
        style={useColor ? { backgroundColor: primaryColor } : undefined}
        fullWidth={isMobile}
      >
        {primaryLabel}
      </Button>
    </Group>
  );
}
