import Link from "next/link";
import { Badge, Card, Divider, Group, Text, Tooltip } from "@mantine/core";
import { IconPencil, IconUser, IconUsers } from "@tabler/icons-react";
import type { SectionCard } from "../_lib/classService";

interface ClassCardProps {
  section: SectionCard;
}

export default function ClassCard({ section }: ClassCardProps) {
  const badgeColor = section.section_type === "SSES" ? "blue" : "gray";

  return (
    <Card
      shadow="sm"
      padding="lg"
      radius="md"
      withBorder
      component={Link}
      href={`/school/classes/${section.section_id}`}
      style={{ cursor: "pointer", textDecoration: "none", color: "inherit" }}
    >
      <Group justify="space-between" mt="md" mb="xs">
        <Text fw={550} size="lg">
          {section.name}
        </Text>
        <Badge color={badgeColor}>{section.section_type}</Badge>
      </Group>

      <Divider my="sm" mb="lg" />

      <Text c="#969696" fw={550} mb="sm">
        About
      </Text>
      <Group mb="xs" gap="xs">
        <IconUser size={16} />
        <Text size="sm">
          Adviser:{" "}
          {section.adviser_name ?? (
            <Text span c="dimmed" size="sm">
              Unassigned
            </Text>
          )}
        </Text>
      </Group>
      <Group justify="space-between">
        <Group gap="xs">
          <IconUsers size={16} />
          {section.student_count > 0 ? (
            <Text size="sm">Students: {section.student_count}</Text>
          ) : (
            <Text size="sm" c="dimmed">
              No enrollees yet
            </Text>
          )}
        </Group>
        <Tooltip label="Edit Class Details" position="bottom" withArrow>
          <IconPencil size={16} className="cursor-pointer" />
        </Tooltip>
      </Group>
    </Card>
  );
}
