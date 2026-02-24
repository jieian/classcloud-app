"use client";
import { Card, Divider, Text, Button, Group } from "@mantine/core";
import { IconSettings } from "@tabler/icons-react";

interface GradeLevelCardProps {
  level_number: number;
  display_name: string;
  subject_count: number;
  onManage: () => void;
}

export default function GradeLevelCard({
  display_name,
  subject_count,
  onManage,
}: GradeLevelCardProps) {
  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder w="100%">
      <Group gap={4} mt="md" mb="xs">
        <Text fw={700} size="md">
          {display_name}
        </Text>
        <Text fw={400} size="md" c="#808898">
          ({subject_count})
        </Text>
      </Group>

      <Divider my="sm" />

      <Button
        color="#4A72AE"
        fullWidth
        radius="md"
        leftSection={<IconSettings size={16} />}
        onClick={onManage}
      >
        Manage Subjects
      </Button>
    </Card>
  );
}
