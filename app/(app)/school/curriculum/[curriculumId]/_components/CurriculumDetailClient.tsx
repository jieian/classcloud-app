"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import {
  Badge,
  Button,
  Collapse,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  Title,
  Tooltip,
  UnstyledButton,
  Table,
} from "@mantine/core";
import {
  IconBook,
  IconCalendar,
  IconChevronDown,
  IconChevronUp,
  IconFileDescription,
  IconPencil,
  IconTrash,
} from "@tabler/icons-react";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { useRouter } from "next/navigation";
import BackButton from "@/components/BackButton";
import { type CurriculumDetail, type CurriculumSubject } from "../../_lib/curriculumService";
import type { GradeLevel } from "../../create/_lib/types";

const EditCurriculumMode = dynamic(() => import("./EditCurriculumMode"), {
  ssr: false,
  loading: () => (
    <Group justify="center" py="xl">
      <Loader size="sm" color="#4EAE4A" />
    </Group>
  ),
});

const SUBJECTS_DEFAULT_SHOW = 3;

const greenTh: React.CSSProperties = {
  backgroundColor: "#4EAE4A",
  color: "#fff",
  fontWeight: 600,
  padding: "10px 16px",
};

function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
  headerBg,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  headerBg?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Paper withBorder radius="md" style={{ overflow: "hidden" }}>
      <UnstyledButton
        onClick={() => setOpen((v) => !v)}
        style={{ width: "100%", padding: "14px 20px", backgroundColor: headerBg }}
      >
        <Group justify="space-between">
          <Text fw={700} size="md">{title}</Text>
          {open ? <IconChevronUp size={16} color="#808898" /> : <IconChevronDown size={16} color="#808898" />}
        </Group>
      </UnstyledButton>
      <Collapse in={open}>
        <div style={{ borderTop: "1px solid #ced4da", padding: "16px 20px" }}>{children}</div>
      </Collapse>
    </Paper>
  );
}

function GradeLevelTable({ subjects }: { subjects: CurriculumSubject[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? subjects : subjects.slice(0, SUBJECTS_DEFAULT_SHOW);
  const hasMore = subjects.length > SUBJECTS_DEFAULT_SHOW;

  return (
    <>
      <Table withColumnBorders withTableBorder fz="sm" style={{ "--table-border-color": "#ced4da" } as React.CSSProperties}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th style={{ ...greenTh, width: 140 }}>Subject Code</Table.Th>
            <Table.Th style={{ ...greenTh, width: 240 }}>Title</Table.Th>
            <Table.Th style={greenTh}>Description</Table.Th>
            <Table.Th style={{ ...greenTh, width: 120 }}>Notes</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {visible.map((s) => (
            <Table.Tr key={s.curriculum_subject_id}>
              <Table.Td><Text size="sm" fw={500} ff="monospace">{s.code}</Text></Table.Td>
              <Table.Td><Text size="sm">{s.name}</Text></Table.Td>
              <Table.Td><Text size="sm" c="dimmed">{s.description ?? ""}</Text></Table.Td>
              <Table.Td>
                {s.subject_type === "SSES" && (
                  <Badge color="blue" variant="light" size="sm">SSES Only</Badge>
                )}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      {hasMore && (
        <Group justify="center" mt="sm">
          <UnstyledButton onClick={() => setExpanded((v) => !v)}>
            <Text size="sm" c="dimmed">{expanded ? "See less" : "See more"}</Text>
          </UnstyledButton>
        </Group>
      )}
    </>
  );
}

interface Props {
  initialData: CurriculumDetail;
  canDelete: boolean;
  gradeLevels: GradeLevel[];
  lockedSubjectIds: number[];
}

export default function CurriculumDetailClient({ initialData: curriculum, canDelete, gradeLevels, lockedSubjectIds }: Props) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const yearCreated = new Date(curriculum.created_at).getFullYear();

  const handleDelete = () => {
    modals.openConfirmModal({
      title: "Delete curriculum?",
      children: (
        <Text size="sm">
          Permanently delete <strong>{curriculum.name}</strong>? This will also remove all its
          subjects and subject groups. This action cannot be undone.
        </Text>
      ),
      labels: { confirm: "Delete", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        setDeleting(true);
        try {
          const res = await fetch("/api/curriculum/delete", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ curriculum_id: curriculum.curriculum_id }),
          });
          const data = await res.json();
          if (!res.ok) {
            notifications.show({ title: "Error", message: data.error ?? "Failed to delete curriculum.", color: "red" });
            return;
          }
          notifications.show({ title: "Deleted", message: `"${curriculum.name}" has been deleted.`, color: "green" });
          router.replace("/school/curriculum");
          router.refresh();
        } catch {
          notifications.show({ title: "Error", message: "Network error. Please try again.", color: "red" });
        } finally {
          setDeleting(false);
        }
      },
    });
  };

  return (
    <Stack gap="md">
      <div>
        <BackButton href="/school/curriculum" mb="md" size="sm">Back to Curriculum Menu</BackButton>
        <Group justify="space-between" align="center">
          <Title order={3} fw={700}>{curriculum.name}</Title>
          {!isEditing && canDelete && (
            <Group gap="xs">
              <Button
                variant="outline"
                color="gray"
                size="sm"
                leftSection={<IconPencil size={15} />}
                onClick={() => setIsEditing(true)}
              >
                Edit Curriculum
              </Button>
              <Button
                color="red"
                variant="outline"
                size="sm"
                leftSection={<IconTrash size={15} />}
                loading={deleting}
                onClick={handleDelete}
              >
                Delete Curriculum
              </Button>
            </Group>
          )}
        </Group>
      </div>

      {isEditing ? (
        <EditCurriculumMode
          curriculum={curriculum}
          gradeLevels={gradeLevels}
          lockedSubjectIds={lockedSubjectIds}
          onCancel={() => setIsEditing(false)}
          onSaved={() => {
            setIsEditing(false);
            router.refresh();
          }}
        />
      ) : (
        <>
          <Paper withBorder p="md" radius="md" w={{ base: "100%", md: "50%" }}>
            <Text fw={700} size="md" mb="sm">About</Text>
            <Stack gap="xs">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <IconBook size={16} color="#808898" style={{ flexShrink: 0 }} />
                <Text size="sm">Name: <Text span fw={700}>{curriculum.name}</Text></Text>
                {curriculum.is_active && (
                  <Badge color="#4EAE4A" variant="light" size="sm" style={{ flexShrink: 0 }}>Active</Badge>
                )}
              </div>
              {curriculum.description && (
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <IconFileDescription size={16} color="#808898" style={{ flexShrink: 0, marginTop: 2 }} />
                  <Text size="sm" style={{ flex: 1 }}>Description: {curriculum.description}</Text>
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <IconCalendar size={16} color="#808898" style={{ flexShrink: 0 }} />
                <Text size="sm">Year Created: {yearCreated}</Text>
              </div>
            </Stack>
          </Paper>
          {!canDelete && (
            <Paper withBorder p="md" radius="md" w={{ base: "100%", md: "50%" }}>
              <Text size="sm" c="dimmed">
                <Text span fw={600} c="dimmed">Note: </Text>
                {curriculum.is_active
                  ? "This curriculum is currently active and cannot be edited or deleted."
                  : "This curriculum has been used in a school year and cannot be edited or deleted."}
              </Text>
            </Paper>
          )}

          <CollapsibleSection title="Subject Groups" defaultOpen={false} headerBg="#F5F5F5">
            {curriculum.subject_groups.length === 0 ? (
              <Text c="dimmed" size="sm">No subject groups defined for this curriculum.</Text>
            ) : (
              <Table withColumnBorders withTableBorder fz="sm" style={{ "--table-border-color": "#ced4da" } as React.CSSProperties}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th style={{ ...greenTh, width: 200 }}>Subject Group Name</Table.Th>
                    <Table.Th style={{ ...greenTh, width: 300 }}>Description</Table.Th>
                    <Table.Th style={greenTh}>Members</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {curriculum.subject_groups.map((sg) => (
                    <Table.Tr key={sg.subject_group_id}>
                      <Table.Td><Text size="sm" fw={500}>{sg.name}</Text></Table.Td>
                      <Table.Td><Text size="sm" c="dimmed">{sg.description ?? "—"}</Text></Table.Td>
                      <Table.Td>
                        <Group gap={6} wrap="wrap">
                          {sg.members.length === 0 ? (
                            <Text size="xs" c="dimmed">No members</Text>
                          ) : (
                            sg.members.map((m) => (
                              <Tooltip key={m.curriculum_subject_id} label={m.subjects?.name ?? `#${m.curriculum_subject_id}`} withArrow position="top">
                                <Badge color="blue" variant="filled" size="sm" radius="xl" style={{ cursor: "default" }}>
                                  {m.subjects?.code ?? `#${m.curriculum_subject_id}`}
                                </Badge>
                              </Tooltip>
                            ))
                          )}
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </CollapsibleSection>

          {curriculum.grade_levels.length === 0 ? (
            <Text c="dimmed" size="sm">No subjects assigned to this curriculum.</Text>
          ) : (
            curriculum.grade_levels.map((gl) => (
              <CollapsibleSection key={gl.grade_level_id} title={gl.display_name} defaultOpen={false}>
                <GradeLevelTable subjects={gl.subjects} />
              </CollapsibleSection>
            ))
          )}
        </>
      )}
    </Stack>
  );
}
