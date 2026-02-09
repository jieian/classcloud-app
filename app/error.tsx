"use client";

/**
 * Error Boundary for authenticated routes
 * Catches React errors and provides recovery options
 * Next.js 16 + React 19 compatible
 */

import { useEffect } from "react";
import { Button, Container, Title, Text, Group, Stack } from "@mantine/core";
import { IconRefresh, IconHome, IconAlertTriangle } from "@tabler/icons-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error to console in development
    if (process.env.NODE_ENV === "development") {
      console.error("Error boundary caught:", error);
    }

    // TODO: Log to error monitoring service (Sentry, Datadog, etc.)
    // logErrorToService(error);
  }, [error]);

  // Determine error type and provide specific guidance
  const isHydrationError = error.message.includes("Hydration") ||
    error.message.includes("hydration");
  const isNetworkError = error.message.includes("fetch") ||
    error.message.includes("network");

  return (
    <Container size="sm" py="xl">
      <Stack align="center" gap="xl">
        <IconAlertTriangle size={80} color="var(--mantine-color-red-6)" />

        <Title order={1} ta="center">
          Oops! Something went wrong
        </Title>

        <Text size="lg" c="dimmed" ta="center">
          {isHydrationError
            ? "We detected a rendering inconsistency. Please refresh the page."
            : isNetworkError
              ? "We're having trouble connecting. Please check your internet connection."
              : "An unexpected error occurred. Our team has been notified."}
        </Text>

        {process.env.NODE_ENV === "development" && (
          <Stack gap="xs" w="100%">
            <Text size="sm" fw={600}>
              Error Details (Development Only):
            </Text>
            <Text
              size="xs"
              c="red"
              style={{
                whiteSpace: "pre-wrap",
                fontFamily: "monospace",
                padding: "1rem",
                backgroundColor: "var(--mantine-color-red-0)",
                borderRadius: "4px",
              }}
            >
              {error.message}
            </Text>
            {error.digest && (
              <Text size="xs" c="dimmed">
                Error ID: {error.digest}
              </Text>
            )}
          </Stack>
        )}

        <Group>
          <Button
            leftSection={<IconRefresh size={16} />}
            onClick={reset}
            size="lg"
          >
            Try Again
          </Button>
          <Button
            leftSection={<IconHome size={16} />}
            variant="outline"
            onClick={() => (window.location.href = "/")}
            size="lg"
          >
            Go to Home
          </Button>
        </Group>

        <Text size="sm" c="dimmed" ta="center">
          If this problem persists, please contact your system administrator.
        </Text>
      </Stack>
    </Container>
  );
}
