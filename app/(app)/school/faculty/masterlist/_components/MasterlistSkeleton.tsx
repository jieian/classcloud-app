"use client";

import { Box, Group, Skeleton, Stack } from "@mantine/core";

function PanelSkeleton() {
  return (
    <Box
      style={{
        border: "1px solid var(--mantine-color-gray-3)",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      {/* Collapsible header */}
      <Box px="md" py={14} style={{ backgroundColor: "#f8f9fa" }}>
        <Skeleton height={16} width={80} radius="sm" />
      </Box>
    </Box>
  );
}

export default function MasterlistSkeleton() {
  return (
    <Stack gap="sm">
      {/* Simulate 6 grade level panels */}
      {Array.from({ length: 6 }).map((_, i) => (
        <PanelSkeleton key={i} />
      ))}

      {/* Action bar skeleton */}
      <Group justify="flex-end" mt="sm" gap="sm">
        <Skeleton height={36} width={140} radius="md" />
        <Skeleton height={36} width={80} radius="md" />
      </Group>
    </Stack>
  );
}
