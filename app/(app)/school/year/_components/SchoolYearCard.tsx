"use client";
import { Card, Divider, Text, Group, Badge, Button } from "@mantine/core";
import { IconEye, IconSettings } from "@tabler/icons-react";
import Link from "next/link";

interface SchoolYearCardProps {
  sy_id: number;
  start_year: number;
  end_year: number;
  is_active: boolean;
  hasExams: boolean;
}

export default function SchoolYearCard({
  sy_id,
  start_year,
  end_year,
  is_active,
  hasExams,
}: SchoolYearCardProps) {
  const canManage = is_active && !hasExams;

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder w="100%">
      <Group justify="space-between" mt="md" mb="xs">
        <Text fw={550} size="lg">
          S.Y. {start_year}–{end_year}
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
        leftSection={canManage ? <IconSettings size={16} /> : <IconEye size={16} />}
        component={Link}
        href={`/school/year/${sy_id}`}
      >
        {canManage ? "Manage School Year" : "View School Year"}
      </Button>
    </Card>
  );
}
