"use client";

import React from "react";
import { Button, Group, Text, UnstyledButton } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";

interface WizardNavigationButtonsProps {
  onCancel: () => void;
  onPrimary: () => void;
  showPrevious?: boolean;
  onPrevious?: () => void;
  previousDisabled?: boolean;
  cancelLabel?: string;
  previousLabel?: string;
  primaryLabel: string;
  primaryDisabled?: boolean;
  primaryLoading?: boolean;
  primaryColor?: string;
  colorWhenEnabledOnly?: boolean;
  mt?: number | string;
  leftExtra?: React.ReactNode;
  stickyMobile?: boolean;
}

export default function WizardNavigationButtons({
  onCancel,
  onPrimary,
  showPrevious = false,
  onPrevious,
  previousDisabled = false,
  cancelLabel = "Cancel",
  previousLabel = "Previous",
  primaryLabel,
  primaryDisabled = false,
  primaryLoading = false,
  primaryColor = "#4EAE4A",
  colorWhenEnabledOnly = true,
  mt = "xl",
  leftExtra,
  stickyMobile = false,
}: WizardNavigationButtonsProps) {
  const isMobile = useMediaQuery("(max-width: 768px)");
  const useColor = colorWhenEnabledOnly ? !primaryDisabled : true;
  const isSticky = stickyMobile && isMobile;

  const buttons = (
    <Group justify="flex-end" wrap="nowrap" style={{ width: "100%" }}>
      {leftExtra && leftExtra}
      <UnstyledButton onClick={onCancel} style={{ color: "#000", cursor: "pointer" }}>
        <Text size="sm" fw={600}>{cancelLabel}</Text>
      </UnstyledButton>

      {showPrevious && onPrevious && (
        <Button variant="default" onClick={onPrevious} disabled={previousDisabled} radius="md">
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

  if (isSticky) {
    return (
      <>
        {/* Spacer so content isn't hidden behind the fixed bar */}
        <div style={{ height: 72 }} />
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 200,
            backgroundColor: "#fff",
            borderTop: "1px solid #e9ecef",
            padding: "12px 16px",
            paddingBottom: "calc(12px + env(safe-area-inset-bottom))",
          }}
        >
          {buttons}
        </div>
      </>
    );
  }

  return (
    <Group justify="flex-end" mt={mt} wrap="nowrap">
      {leftExtra && leftExtra}
      <UnstyledButton onClick={onCancel} style={{ color: "#000", cursor: "pointer" }}>
        <Text size="sm" fw={600}>{cancelLabel}</Text>
      </UnstyledButton>

      {showPrevious && onPrevious && (
        <Button variant="default" onClick={onPrevious} disabled={previousDisabled} radius="md">
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
