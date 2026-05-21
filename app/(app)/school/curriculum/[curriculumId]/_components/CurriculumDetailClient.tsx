"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  Badge,
  Box,
  Button,
  Collapse,
  Divider,
  Group,
  Loader,
  Paper,
  Stack,
  Table,
  TableScrollContainer,
  Text,
  Title,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import {
  IconBook,
  IconCalendar,
  IconChevronDown,
  IconChevronRight,
  IconChevronUp,
  IconFileDescription,
  IconPencil,
  IconTrash,
} from "@tabler/icons-react";
import { modals } from "@mantine/modals";
import { notify } from "@/components/notificationIcon/notificationIcon";
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
  padding: "8px 12px",
  textAlign: "left",
  fontSize: 13,
};

function SubjectCodeBadge({
  code,
  name,
  subject_type,
}: {
  code: string;
  name: string;
  subject_type: "BOTH" | "SSES";
}) {
  return (
    <Tooltip label={name} withArrow position="top" maw={220}>
      <Badge
        variant="filled"
        radius="xl"
        style={{
          cursor: "default",
          backgroundColor: subject_type === "SSES" ? "#70A2FF" : "#B3B4B4",
          color: "#FFFFFF",
          minWidth: 48,
          justifyContent: "center",
        }}
      >
        {code}
      </Badge>
    </Tooltip>
  );
}

function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Paper withBorder radius="md" style={{ overflow: "hidden" }}>
      <UnstyledButton
        onClick={() => setOpen((v) => !v)}
        style={{ width: "100%", padding: "12px 16px" }}
      >
        <Group justify="space-between">
          <Text fw={700} size="sm">{title}</Text>
          {open ? <IconChevronUp size={16} color="#808898" /> : <IconChevronDown size={16} color="#808898" />}
        </Group>
      </UnstyledButton>
      <Collapse in={open}>
        <div style={{ borderTop: "1px solid #ced4da", padding: "16px 20px" }}>{children}</div>
      </Collapse>
    </Paper>
  );
}

function SubjectMobileRow({ s }: { s: CurriculumSubject }) {
  const [opened, { toggle }] = useDisclosure(false);
  return (
    <>
      <div style={{ padding: "10px 4px" }}>
        <UnstyledButton onClick={toggle} style={{ width: "100%" }}>
          <Group gap="xs" wrap="nowrap">
            <IconChevronRight
              size={16}
              style={{
                transform: opened ? "rotate(90deg)" : "rotate(0deg)",
                transition: "transform 200ms ease",
                flexShrink: 0,
                color: "#808898",
              }}
            />
            <Text fw={500} fz="sm" ff="monospace" style={{ flexShrink: 0 }}>
              {s.code}
            </Text>
            {s.subject_type === "SSES" && (
              <Badge variant="filled" size="xs" radius="xl" style={{ backgroundColor: "#70A2FF", color: "#fff", cursor: "default" }}>
                SSES
              </Badge>
            )}
          </Group>
        </UnstyledButton>
      </div>
      <Collapse in={opened}>
        <Box pb="md" pl={28} pr={4}>
          <Text size="xs" c="dimmed" fw={600} tt="uppercase" mb={2} style={{ letterSpacing: "0.04em" }}>
            Name
          </Text>
          <Text fz="sm" c="dimmed" mb="sm">{s.name}</Text>
          {s.description && (
            <>
              <Text size="xs" c="dimmed" fw={600} tt="uppercase" mb={2} style={{ letterSpacing: "0.04em" }}>
                Description
              </Text>
              <Text fz="sm" c="dimmed" mb="sm">{s.description}</Text>
            </>
          )}
        </Box>
      </Collapse>
      <Divider />
    </>
  );
}

type SubjectGroupMember = CurriculumDetail["subject_groups"][number]["members"][number];

function GroupMobileRow({
  name,
  description,
  members,
}: {
  name: string;
  description: string | null;
  members: SubjectGroupMember[];
}) {
  const [opened, { toggle }] = useDisclosure(false);
  return (
    <>
      <div style={{ padding: "10px 4px" }}>
        <UnstyledButton onClick={toggle} style={{ width: "100%" }}>
          <Group gap="xs" wrap="nowrap">
            <IconChevronRight
              size={16}
              style={{
                transform: opened ? "rotate(90deg)" : "rotate(0deg)",
                transition: "transform 200ms ease",
                flexShrink: 0,
                color: "#808898",
              }}
            />
            <Text
              fw={500}
              fz="sm"
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {name}
            </Text>
          </Group>
        </UnstyledButton>
      </div>
      <Collapse in={opened}>
        <Box pb="md" pl={28} pr={4}>
          {description && (
            <>
              <Text size="xs" c="dimmed" fw={600} tt="uppercase" mb={2} style={{ letterSpacing: "0.04em" }}>
                Description
              </Text>
              <Text fz="sm" c="dimmed" mb="sm">{description}</Text>
            </>
          )}
          <Text size="xs" c="dimmed" fw={600} tt="uppercase" mb={4} style={{ letterSpacing: "0.04em" }}>
            Members
          </Text>
          {members.length === 0 ? (
            <Text fz="sm" c="dimmed" fs="italic">None</Text>
          ) : (
            <Group gap={6} wrap="wrap">
              {members.map((m) => (
                <SubjectCodeBadge
                  key={m.curriculum_subject_id}
                  code={m.subjects?.code ?? `#${m.curriculum_subject_id}`}
                  subject_type={m.subjects?.subject_type ?? "BOTH"}
                  name={m.subjects?.name ?? `#${m.curriculum_subject_id}`}
                />
              ))}
            </Group>
          )}
        </Box>
      </Collapse>
      <Divider />
    </>
  );
}

function GradeLevelTable({ subjects }: { subjects: CurriculumSubject[] }) {
  const [expanded, setExpanded] = useState(false);
  const sorted = useMemo(() => [...subjects].sort((a, b) => {
    const aSSES = a.subject_type === "SSES" ? 0 : 1;
    const bSSES = b.subject_type === "SSES" ? 0 : 1;
    if (aSSES !== bSSES) return aSSES - bSSES;
    return a.code.localeCompare(b.code);
  }), [subjects]);
  const visible = expanded ? sorted : sorted.slice(0, SUBJECTS_DEFAULT_SHOW);
  const hasMore = sorted.length > SUBJECTS_DEFAULT_SHOW;

  return (
    <>
      {/* Desktop */}
      <div className="hidden sm:block">
        <TableScrollContainer minWidth={400}>
          <Table withColumnBorders withTableBorder fz="sm" style={{ "--table-border-color": "#ced4da" } as React.CSSProperties}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th style={{ ...greenTh, width: 140 }}>Subject Code</Table.Th>
                <Table.Th style={{ ...greenTh, width: 240 }}>Title</Table.Th>
                <Table.Th style={greenTh}>Description</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {visible.map((s) => (
                <Table.Tr key={s.curriculum_subject_id}>
                  <Table.Td>
                    <Group gap={4}>
                      <Text size="sm" fw={500} ff="monospace">{s.code}</Text>
                      {s.subject_type === "SSES" && (
                        <Badge variant="filled" size="xs" radius="xl" style={{ backgroundColor: "#70A2FF", color: "#fff", cursor: "default" }}>
                          SSES
                        </Badge>
                      )}
                    </Group>
                  </Table.Td>
                  <Table.Td><Text size="sm">{s.name}</Text></Table.Td>
                  <Table.Td><Text size="sm" c="dimmed">{s.description ?? ""}</Text></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </TableScrollContainer>
        {hasMore && (
          <Group justify="center" mt="sm">
            <UnstyledButton onClick={() => setExpanded((v) => !v)}>
              <Text size="sm" c="dimmed">{expanded ? "See Less" : "See More"}</Text>
            </UnstyledButton>
          </Group>
        )}
      </div>

      {/* Mobile */}
      <div className="sm:hidden">
        {visible.map((s) => (
          <SubjectMobileRow key={s.curriculum_subject_id} s={s} />
        ))}
        {hasMore && (
          <Group justify="center" mt="xs">
            <UnstyledButton onClick={() => setExpanded((v) => !v)}>
              <Text size="sm" c="dimmed">{expanded ? "See Less" : "See More"}</Text>
            </UnstyledButton>
          </Group>
        )}
      </div>
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
  const sortedGroups = useMemo(
    () => [...curriculum.subject_groups].sort((a, b) => a.name.localeCompare(b.name)),
    [curriculum.subject_groups],
  );

  const isMobile = useMediaQuery("(max-width: 768px)");
  const confirmModalProps = isMobile
    ? {
        styles: {
          inner: { alignItems: "flex-end", paddingBottom: "20px" },
          content: {
            width: "100%",
            maxWidth: "100%",
            borderRadius: "12px 12px 0 0",
          },
        },
      }
    : {};

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
            notify({ type: "error", title: "Error", message: data.error ?? "Failed to delete curriculum." });
            return;
          }
          notify({ type: "success", title: "Deleted", message: `"${curriculum.name}" has been deleted.` });
          router.replace("/school/curriculum");
          router.refresh();
        } catch {
          notify({ type: "error", title: "Error", message: "Network error. Please try again." });
        } finally {
          setDeleting(false);
        }
      },
      ...confirmModalProps,
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
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <IconBook size={16} color="#808898" style={{ flexShrink: 0, marginTop: 2 }} />
                <Group gap={6} align="center" wrap="wrap" style={{ flex: 1, minWidth: 0 }}>
                  <Text size="sm">Name: <Text span fw={700}>{curriculum.name}</Text></Text>
                  {curriculum.is_active && (
                    <Badge color="#4EAE4A" variant="light" size="sm">Active</Badge>
                  )}
                </Group>
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

          <CollapsibleSection title="Subject Groups" defaultOpen={false}>
            {sortedGroups.length === 0 ? (
              <Text c="dimmed" size="sm">No subject groups defined for this curriculum.</Text>
            ) : (
              <>
                {/* Desktop */}
                <div className="hidden sm:block">
                  <Box style={{ border: "1px solid #dee2e6", borderRadius: 6, overflow: "hidden" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          <th style={{ ...greenTh, width: 200 }}>Subject Group Name</th>
                          <th style={{ ...greenTh, width: 260 }}>Description</th>
                          <th style={greenTh}>Members</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedGroups.map((sg) => (
                          <tr key={sg.subject_group_id} style={{ borderTop: "1px solid #dee2e6" }}>
                            <td style={{ padding: "8px 12px" }}>
                              <Text size="sm" fw={500}>{sg.name}</Text>
                            </td>
                            <td style={{ padding: "8px 12px" }}>
                              <Text size="sm" c="dimmed">{sg.description ?? "—"}</Text>
                            </td>
                            <td style={{ padding: "8px 12px" }}>
                              <Group gap={5} wrap="wrap">
                                {sg.members.length === 0 ? (
                                  <Text size="xs" c="dimmed">No members</Text>
                                ) : (
                                  sg.members.map((m) => (
                                    <SubjectCodeBadge
                                      key={m.curriculum_subject_id}
                                      code={m.subjects?.code ?? `#${m.curriculum_subject_id}`}
                                      subject_type={m.subjects?.subject_type ?? "BOTH"}
                                      name={m.subjects?.name ?? `#${m.curriculum_subject_id}`}
                                    />
                                  ))
                                )}
                              </Group>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Box>
                </div>

                {/* Mobile */}
                <div className="sm:hidden">
                  {sortedGroups.map((sg) => (
                    <GroupMobileRow
                      key={sg.subject_group_id}
                      name={sg.name}
                      description={sg.description}
                      members={sg.members}
                    />
                  ))}
                </div>
              </>
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
