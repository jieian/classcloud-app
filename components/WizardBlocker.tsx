"use client";

import type { ReactNode } from "react";
import { Alert, Container, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import BackButton from "@/components/BackButton";

interface WizardBlockerProps {
  icon: ReactNode;
  title: string;
  description: string;
  hint: string;
  actionLabel?: string;
  onAction?: () => void;
  href?: string;
}

export default function WizardBlocker({
  icon,
  title,
  description,
  hint,
  actionLabel = "Back",
  onAction,
  href,
}: WizardBlockerProps) {
  return (
    <Container fluid py="xl">
      <Stack align="center" gap="md" py={48} maw={460} mx="auto">
        <ThemeIcon size={64} radius="xl" color="gray" variant="light">
          {icon}
        </ThemeIcon>
        <Title order={4} ta="center">
          {title}
        </Title>
        <Text size="sm" c="dimmed" ta="center">
          {description}
        </Text>
        <Alert
          color="blue"
          variant="light"
          icon={<IconInfoCircle size={16} />}
          w="100%"
        >
          {hint}
        </Alert>
        {(onAction || href) && (
          <BackButton onClick={onAction} href={href}>
            {actionLabel}
          </BackButton>
        )}
      </Stack>
    </Container>
  );
}
