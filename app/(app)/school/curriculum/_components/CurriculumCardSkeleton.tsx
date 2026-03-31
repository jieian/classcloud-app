import { Card, Divider, Group, Skeleton, SimpleGrid } from "@mantine/core";

export default function CurriculumCardSkeleton() {
  return (
    <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md" mt="md">
      {Array(3)
        .fill(0)
        .map((_, i) => (
          <Card key={i} shadow="sm" padding="lg" radius="md" withBorder>
            <Group justify="space-between" mb="xs">
              <Skeleton height={20} width="55%" radius="sm" />
              <Skeleton height={20} width={52} radius="xl" />
            </Group>
            <Divider my="sm" />
            <Skeleton height={14} width="40%" radius="sm" mb="md" />
            <Skeleton height={34} radius="md" />
          </Card>
        ))}
    </SimpleGrid>
  );
}
