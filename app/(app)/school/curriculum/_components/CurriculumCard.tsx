"use client";

import { Badge, Button, Card, Divider, Group, Text } from "@mantine/core";
import { IconCalendar, IconSettings } from "@tabler/icons-react";

interface CurriculumCardProps {
  name: string;
  is_active: boolean;
  created_at: string;
  onManage: () => void;
}

export default function CurriculumCard({
  name,
  is_active,
  created_at,
  onManage,
}: CurriculumCardProps) {
  const yearCreated = new Date(created_at).getFullYear();

  return (
    <Card
      shadow={is_active ? "lg" : "sm"}
      padding="lg"
      radius="md"
      withBorder
      w={{ base: "100%", sm: 480 }}

      style={
        is_active
          ? {
              transform: "translateY(-2px)",
              boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            }
          : undefined
      }
    >
      <Group justify="space-between" mb="xs">
        <Text fw={600} size="md" style={{ flex: 1 }}>
          {name}
        </Text>
        {is_active && (
          <Badge color="#4EAE4A" variant="light" size="md">
            Active
          </Badge>
        )}
      </Group>

      <Divider my="sm" />

      <Group gap="xs" mb="md">
        <IconCalendar size={14} color="#808898" />
        <Text size="sm" c="dimmed">
          Year Created: {yearCreated}
        </Text>
      </Group>

      <Button
        color="#4A72AE"
        fullWidth
        radius="md"
        leftSection={<IconSettings size={16} />}
        onClick={onManage}
      >
        Manage Curriculum
      </Button>
    </Card>
  );
}
