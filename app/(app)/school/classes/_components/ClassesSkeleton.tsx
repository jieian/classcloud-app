import { Group, Skeleton, Stack } from "@mantine/core";

export default function ClassesSkeleton() {
  return (
    <>
      {/* Buttons row: Transfer Requests + Create a Class */}
      <Group justify="flex-end" mb="md" gap="xs">
        <Skeleton height={34} width={160} radius="md" />
        <Skeleton height={34} width={130} radius="md" />
      </Group>

      {/* Search + refresh */}
      <Group mb="md" wrap="nowrap" align="flex-end" gap="sm">
        <Skeleton height={36} style={{ flex: 1, maxWidth: 700 }} radius="md" />
        <Skeleton height={36} width={36} radius="xl" />
      </Group>

      {/* Filters */}
      <Group mb="md" gap="sm">
        <Skeleton height={36} width={200} radius="md" />
        <Skeleton height={36} width={200} radius="md" />
      </Group>

      {/* Accordion sections */}
      <Stack gap="md">
        <Skeleton height={220} radius="md" />
        <Skeleton height={220} radius="md" />
        <Skeleton height={220} radius="md" />
      </Stack>
    </>
  );
}
