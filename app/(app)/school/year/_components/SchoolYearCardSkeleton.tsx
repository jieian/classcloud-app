import { Skeleton, Card, Divider, Group } from "@mantine/core";

export default function UsersTableSkeleton() {
  // Create 5 skeleton cards
  const skeletonCards = Array(5)
    .fill(0)
    .map((_, index) => (
      <Card
        key={index}
        shadow="sm"
        padding="lg"
        radius="md"
        withBorder
        w="100%"
      >
        <Group justify="space-between" mt="md" mb="xs">
          <Skeleton height={24} width="40%" radius="sm" />
          <Skeleton height={20} width={60} radius="xl" />
        </Group>
        <Divider my="sm" />
        <Skeleton height={36} radius="md" />
      </Card>
    ));

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {skeletonCards}
    </div>
  );
}
