"use client";

import { Box, Group, Paper, Skeleton, Stack } from "@mantine/core";

export default function SchoolYearDetailSkeleton() {
  return (
    <>
      {/* Title row */}
      <Group justify="space-between" align="center" mb="lg">
        <Group gap="sm">
          <Skeleton height={28} width={160} radius="sm" />
          <Skeleton height={22} width={64} radius="xl" />
        </Group>
        <Skeleton height={32} width={148} radius="sm" />
      </Group>

      <Stack gap="lg">
        {/* About */}
        <Paper withBorder p="lg" radius="md">
          <Skeleton height={20} width={60} radius="sm" mb="md" />
          <Stack gap={10}>
            <Group wrap="wrap" style={{ columnGap: 48, rowGap: 8 }}>
              <Box>
                <Skeleton height={14} width={110} radius="sm" mb={6} />
                <Skeleton height={16} width={130} radius="sm" />
              </Box>
              <Box>
                <Skeleton height={14} width={110} radius="sm" mb={6} />
                <Skeleton height={16} width={130} radius="sm" />
              </Box>
            </Group>
            <Box>
              <Skeleton height={14} width={80} radius="sm" mb={6} />
              <Skeleton height={16} width={200} radius="sm" />
            </Box>
          </Stack>
        </Paper>

        {/* Quarters */}
        <Paper withBorder p="lg" radius="md">
          <Skeleton height={20} width={80} radius="sm" mb="md" />
          <Stack gap="xs">
            {[1, 2, 3, 4].map((i) => (
              <Group key={i} gap="sm" align="center">
                <Skeleton height={20} width={36} radius="xl" />
                <Skeleton height={16} width={120} radius="sm" />
              </Group>
            ))}
          </Stack>
        </Paper>

        {/* Subject Coordinators */}
        <Paper withBorder p="lg" radius="md">
          <Skeleton height={20} width={180} radius="sm" mb="md" />
          <Stack gap="xs">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} height={40} radius="sm" />
            ))}
          </Stack>
        </Paper>

        {/* Classes & Faculty */}
        <Paper withBorder p="lg" radius="md">
          <Skeleton height={20} width={280} radius="sm" mb="md" />
          <Stack gap="xs">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} height={44} radius="md" />
            ))}
          </Stack>
        </Paper>
      </Stack>
    </>
  );
}
