import { Skeleton, Stack } from "@mantine/core";

export default function SubjectTableSkeleton() {
  return (
    <Stack gap="xs">
      <Skeleton height={36} radius="sm" />
      <Skeleton height={36} radius="sm" />
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} height={48} radius="sm" />
      ))}
    </Stack>
  );
}
