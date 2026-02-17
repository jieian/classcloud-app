"use client";
import { Card, Divider, Text, Button, Group, Badge } from "@mantine/core";
import { IconSettings } from "@tabler/icons-react";

interface SchoolYearCardProps {
  year_range: string;
  is_active: boolean;
  sy_id: number;
}

export default function SchoolYearCard({
  year_range,
  is_active,
  sy_id,
}: SchoolYearCardProps) {
  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder w="100%">
      <Group justify="space-between" mt="md" mb="xs">
        <Text fw={550} size="lg">
          {year_range}
        </Text>

        <Badge color={is_active ? "#4EAE4A" : "gray"} variant="light" size="md">
          {is_active ? "Active" : "Closed"}
        </Badge>
      </Group>

      <Divider my="sm" />

      <Text size="sm" c="dimmed" mb="md">
        This academic period is currently{" "}
        {is_active ? "accepting" : "closed to"} new enrollments and grading.
      </Text>

      <Button
        color="#4A72AE"
        fullWidth
        radius="md"
        leftSection={<IconSettings size={16} />}
        onClick={() => console.log(`Managing school year ID: ${sy_id}`)}
      >
        Manage School Year
      </Button>
    </Card>
  );
}
