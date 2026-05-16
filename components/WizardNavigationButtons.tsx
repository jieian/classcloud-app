"use client";

import React from "react";
import { Button, Group, Text, UnstyledButton } from "@mantine/core";

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
    <Group justify="flex-end" mt={mt} gap="sm" wrap="wrap">
      {leftExtra && leftExtra}
      <UnstyledButton onClick={onCancel} style={{ color: "#000", cursor: "pointer" }}>
        <Text size="sm" fw={600}>{cancelLabel}</Text>
      </UnstyledButton>

      {showPrevious && onPrevious && (
        <Button variant="default" onClick={onPrevious} radius="md">
          {previousLabel}
        </Button>
      )}

      <Button
        onClick={onPrimary}
        disabled={primaryDisabled}
        loading={primaryLoading}
        radius="md"
        style={useColor ? { backgroundColor: primaryColor } : undefined}
      >
        {primaryLabel}
      </Button>
    </Group>
  );
}
