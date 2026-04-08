import { Group, Paper, Skeleton, Stack } from "@mantine/core";

export default function CurriculumDetailLoading() {
  return (
    <>
      {/* Back button */}
      <Skeleton height={28} width={80} radius="sm" mb="md" />

      {/* Curriculum name + badge + action buttons */}
      <Group justify="space-between" mb="xs" align="flex-start">
        <Stack gap={6}>
          <Skeleton height={28} width={260} radius="sm" />
          <Skeleton height={14} width={180} radius="sm" />
        </Stack>
        <Group gap="xs">
          <Skeleton height={34} width={90} radius="md" />
          <Skeleton height={34} width={90} radius="md" />
        </Group>
      </Group>

      {/* Grade level sections */}
      <Stack gap="md" mt="md">
        {[1, 2, 3].map((i) => (
          <Paper key={i} withBorder radius="md" p="md">
            <Skeleton height={20} width={120} radius="sm" mb="md" />
            <Stack gap="xs">
              {[1, 2, 3, 4].map((j) => (
                <Skeleton key={j} height={16} radius="sm" />
              ))}
            </Stack>
          </Paper>
        ))}
      </Stack>
    </>
  );
}
