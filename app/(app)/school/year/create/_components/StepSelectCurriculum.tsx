"use client";

import { useEffect, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Collapse,
  Divider,
  Group,
  Paper,
  Select,
  Skeleton,
  Stack,
  Table,
  Text,
  ThemeIcon,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  IconBook,
  IconCalendar,
  IconChevronDown,
  IconChevronRight,
  IconChevronUp,
  IconFileDescription,
  IconSchool,
} from "@tabler/icons-react";
import type { UseFormReturnType } from "@mantine/form";
import type {
  CreateSchoolYearForm,
  WizardCurriculumDetail,
  WizardCurriculumListItem,
} from "../_lib/types";
import { fetchWizardCurricula } from "../_lib/wizardService";

interface StepSelectCurriculumProps {
  form: UseFormReturnType<CreateSchoolYearForm>;
  curricula: WizardCurriculumListItem[];
  prevSyCurriculumId: number | null;
  curriculumDetail: WizardCurriculumDetail | null;
  loadingCurriculum: boolean;
  onCurriculaRefresh: (list: WizardCurriculumListItem[]) => void;
}

const greenTh: React.CSSProperties = {
  backgroundColor: "#4EAE4A",
  color: "#fff",
  fontWeight: 600,
  padding: "10px 16px",
};

export default function StepSelectCurriculum({
  form,
  curricula: initialCurricula,
  prevSyCurriculumId,
  curriculumDetail,
  loadingCurriculum,
  onCurriculaRefresh,
}: StepSelectCurriculumProps) {
  const [curricula, setCurricula] =
    useState<WizardCurriculumListItem[]>(initialCurricula);

  // ── BroadcastChannel — auto-refresh on new curriculum creation in another tab ──
  useEffect(() => {
    let channel: BroadcastChannel;
    try {
      channel = new BroadcastChannel("curriculum_created");
      channel.onmessage = (e) => {
        if (e.data?.type !== "CURRICULUM_CREATED") return;
        fetchWizardCurricula()
          .then((list) => {
            setCurricula(list);
            onCurriculaRefresh(list);
            if (e.data.curriculum_id) {
              form.setFieldValue("curriculum_id", e.data.curriculum_id);
            }
            notifications.show({
              title: "Curriculum ready",
              message: e.data.name
                ? `"${e.data.name}" has been created and selected.`
                : "New curriculum created and selected.",
              color: "green",
            });
          })
          .catch(() => {
            // Silently ignore — user can manually select from dropdown
          });
      };
    } catch {
      // BroadcastChannel unavailable (e.g. test environments) — ignore
    }
    return () => {
      try {
        channel?.close();
      } catch {
        /* ignore */
      }
    };
  }, []);

  // Build Select options: last-used curriculum pinned first, then alphabetical
  const selectData = (() => {
    const pinned = prevSyCurriculumId
      ? curricula.find((c) => c.curriculum_id === prevSyCurriculumId)
      : null;
    const rest = curricula.filter(
      (c) => c.curriculum_id !== prevSyCurriculumId,
    );
    const items = [];
    if (pinned) {
      items.push({
        value: String(pinned.curriculum_id),
        label: `${pinned.name} (last used)`,
      });
    }
    for (const c of rest) {
      items.push({ value: String(c.curriculum_id), label: c.name });
    }
    return items;
  })();

  if (curricula.length === 0) {
    return (
      <Box>
        <Text size="xl" fw={700} mb="md" c="#298925">
          Select Curriculum
        </Text>

        <Box
          p="lg"
          style={{
            border: "1px solid #B8B8B8",
            borderRadius: "8px",
          }}
        >
          <Stack gap="lg" align="center" py="xl">
            <ThemeIcon size={64} radius="xl" variant="light" color="gray">
              <IconSchool size={36} />
            </ThemeIcon>
            <Text fw={600} size="lg" ta="center">
              No Curriculum yet created.
            </Text>
            <Text size="sm" c="dimmed" ta="center" maw={400}>
              Create a curriculum first, then come back to set up a school year.
              This wizard will auto-detect when a curriculum is created.
            </Text>
            <Button
              component="a"
              href="/school/curriculum/create"
              target="_blank"
              rel="noopener noreferrer"
              color="#4EAE4A"
              variant="filled"
              size="sm"
            >
              Create a Curriculum
            </Button>
          </Stack>
        </Box>
      </Box>
    );
  }

  return (
    <Box>
      <Text size="xl" fw={700} mb="md" c="#298925">
        Select Curriculum
      </Text>

      <Box
        p="lg"
        style={{
          border: "1px solid #B8B8B8",
          borderRadius: "8px",
        }}
      >
        <Text size="lg" fw={700} mb="xs" c="#298925">
          Curriculum
        </Text>
        <Text size="sm" mb="lg" c="dimmed">
          Choose the curriculum this school year will follow.
        </Text>

        <Select
          label="Curriculum"
          placeholder="Select a curriculum"
          required
          labelProps={{ size: "sm", fw: 700, c: "gray.7" }}
          data={selectData}
          value={
            form.values.curriculum_id ? String(form.values.curriculum_id) : null
          }
          onChange={(val) =>
            form.setFieldValue("curriculum_id", val ? parseInt(val, 10) : null)
          }
          renderOption={({ option }) => (
            <div>
              {option.label.includes("(last used)") ? (
                <>
                  {option.label.replace(" (last used)", "")}{" "}
                  <em style={{ color: "#808898" }}>(last used)</em>
                </>
              ) : (
                option.label
              )}
            </div>
          )}
          searchable
          clearable
          mb="lg"
        />

        {loadingCurriculum && (
          <Box
            mt="lg"
            p="lg"
            style={{
              border: "1px solid #B8B8B8",
              borderRadius: "8px",
              backgroundColor: "#f9f9f9",
            }}
          >
            <Stack gap="md">
              {/* About skeleton */}
              <Paper withBorder p="md" radius="md">
                <Skeleton height={24} mb="md" width={100} />
                <Stack gap="xs">
                  <Skeleton height={16} />
                  <Skeleton height={16} width="80%" />
                </Stack>
              </Paper>

              {/* Subject Groups skeleton */}
              <Paper withBorder radius="md" p="md">
                <Skeleton height={20} mb="md" width={150} />
                <Stack gap="sm">
                  <Skeleton height={12} />
                  <Skeleton height={12} />
                  <Skeleton height={12} width="90%" />
                </Stack>
              </Paper>

              {/* Grade Levels skeletons */}
              {[1, 2].map((i) => (
                <Paper key={i} withBorder radius="md" p="md">
                  <Skeleton height={20} mb="md" width={120} />
                  <Stack gap="sm">
                    <Skeleton height={12} />
                    <Skeleton height={12} />
                    <Skeleton height={12} width="85%" />
                  </Stack>
                </Paper>
              ))}
            </Stack>
          </Box>
        )}

        {!loadingCurriculum && curriculumDetail && (
          <Box
            mt="lg"
            p="lg"
            style={{
              border: "1px solid #B8B8B8",
              borderRadius: "8px",
              backgroundColor: "#f9f9f9",
              maxHeight: 600,
              overflowY: "auto",
            }}
          >
            <CurriculumDetailPanel detail={curriculumDetail} />
          </Box>
        )}
      </Box>
    </Box>
  );
}

function SubjectGroupMobileRow({
  sg,
}: {
  sg: WizardCurriculumDetail["subject_groups"][number];
}) {
  const [opened, { toggle }] = useDisclosure(false);
  return (
    <>
      <div onClick={toggle} style={{ cursor: "pointer", padding: "12px 4px" }}>
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
            {sg.name}
          </Text>
        </Group>
      </div>
      <Collapse in={opened}>
        <Box pb="md" pl={28} pr={4}>
          {sg.description && (
            <>
              <Text
                size="xs"
                c="dimmed"
                fw={600}
                tt="uppercase"
                mb={2}
                style={{ letterSpacing: "0.04em" }}
              >
                Description
              </Text>
              <Text fz="sm" c="dimmed" mb="sm">
                {sg.description}
              </Text>
            </>
          )}
          <Text
            size="xs"
            c="dimmed"
            fw={600}
            tt="uppercase"
            mb={6}
            style={{ letterSpacing: "0.04em" }}
          >
            Members
          </Text>
          {sg.members.length === 0 ? (
            <Text fz="sm" c="dimmed" fs="italic">
              No members
            </Text>
          ) : (
            <Group gap={6} wrap="wrap">
              {sg.members.map((m) => (
                <Tooltip key={m.curriculum_subject_id} label={m.name} withArrow>
                  <Badge
                    color={m.subject_type === "SSES" ? "blue" : "gray"}
                    variant="filled"
                    size="sm"
                    radius="xl"
                    style={{ cursor: "default" }}
                  >
                    {m.code}
                  </Badge>
                </Tooltip>
              ))}
            </Group>
          )}
        </Box>
      </Collapse>
      <Divider />
    </>
  );
}

function SubjectMobileRow({
  s,
}: {
  s: WizardCurriculumDetail["grade_levels"][number]["subjects"][number];
}) {
  const [opened, { toggle }] = useDisclosure(false);
  return (
    <>
      <div onClick={toggle} style={{ cursor: "pointer", padding: "12px 4px" }}>
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
          <Text
            fz="sm"
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            c="dimmed"
          >
            {s.name}
          </Text>
        </Group>
      </div>
      <Collapse in={opened}>
        <Box pb="md" pl={28} pr={4}>
          {s.description && (
            <>
              <Text
                size="xs"
                c="dimmed"
                fw={600}
                tt="uppercase"
                mb={2}
                style={{ letterSpacing: "0.04em" }}
              >
                Description
              </Text>
              <Text fz="sm" c="dimmed" mb="sm">
                {s.description}
              </Text>
            </>
          )}
          {s.subject_type === "SSES" && (
            <>
              <Text
                size="xs"
                c="dimmed"
                fw={600}
                tt="uppercase"
                mb={6}
                style={{ letterSpacing: "0.04em" }}
              >
                Notes
              </Text>
              <Badge color="blue" variant="filled" size="sm">
                SSES Only
              </Badge>
            </>
          )}
        </Box>
      </Collapse>
      <Divider />
    </>
  );
}

function CollapsibleSection({
  title,
  children,
  headerBg,
}: {
  title: string;
  children: React.ReactNode;
  headerBg?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Paper withBorder radius="md" style={{ overflow: "hidden" }}>
      <UnstyledButton
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          padding: "12px 16px",
          backgroundColor: headerBg,
        }}
      >
        <Group justify="space-between">
          <Text fw={700} size="sm">
            {title}
          </Text>
          {open ? (
            <IconChevronUp size={16} color="#808898" />
          ) : (
            <IconChevronDown size={16} color="#808898" />
          )}
        </Group>
      </UnstyledButton>
      <Collapse in={open}>
        <div style={{ borderTop: "1px solid #ced4da", padding: "16px 20px" }}>
          {children}
        </div>
      </Collapse>
    </Paper>
  );
}

function CurriculumDetailPanel({ detail }: { detail: WizardCurriculumDetail }) {
  const yearCreated = new Date(detail.created_at).getFullYear();

  return (
    <Stack gap="md">
      {/* About */}
      <Paper withBorder p="md" radius="md">
        <Text fw={700} size="md" mb="sm">
          About
        </Text>
        <Stack gap="xs">
          <Group gap={8} wrap="nowrap">
            <IconBook size={16} color="#808898" style={{ flexShrink: 0 }} />
            <Text size="sm">
              Name:{" "}
              <Text span fw={700}>
                {detail.name}
              </Text>
            </Text>
            {detail.is_active && (
              <Badge color="#4EAE4A" variant="light" size="sm">
                Active
              </Badge>
            )}
          </Group>
          {detail.description && (
            <Group gap={8} wrap="nowrap">
              <IconFileDescription
                size={16}
                color="#808898"
                style={{ flexShrink: 0 }}
              />
              <Text size="sm" c="dimmed">
                Description: {detail.description}
              </Text>
            </Group>
          )}

          <Group gap={8} wrap="nowrap">
            <IconCalendar size={16} color="#808898" style={{ flexShrink: 0 }} />
            <Text size="sm" c="dimmed">
              Year Created: {yearCreated}
            </Text>
          </Group>
        </Stack>
      </Paper>

      {/* Subject Groups */}
      {detail.subject_groups.length > 0 && (
        <CollapsibleSection title="Subject Groups" headerBg="#F5F5F5">
          {/* Desktop */}
          <div className="hidden sm:block">
            <Table
              withColumnBorders
              withTableBorder
              fz="sm"
              style={
                { "--table-border-color": "#ced4da" } as React.CSSProperties
              }
            >
              <Table.Thead>
                <Table.Tr>
                  <Table.Th style={{ ...greenTh, width: 200 }}>
                    Subject Group Name
                  </Table.Th>
                  <Table.Th style={{ ...greenTh, width: 300 }}>
                    Description
                  </Table.Th>
                  <Table.Th style={greenTh}>Members</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {detail.subject_groups.map((sg) => (
                  <Table.Tr key={sg.subject_group_id}>
                    <Table.Td>
                      <Text size="sm" fw={500}>
                        {sg.name}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {sg.description ?? "—"}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Group gap={6} wrap="wrap">
                        {sg.members.map((m) => (
                          <Tooltip
                            key={m.curriculum_subject_id}
                            label={m.name}
                            withArrow
                          >
                            <Badge
                              color={
                                m.subject_type === "SSES" ? "blue" : "gray"
                              }
                              variant="filled"
                              size="sm"
                              radius="xl"
                              style={{ cursor: "default" }}
                            >
                              {m.code}
                            </Badge>
                          </Tooltip>
                        ))}
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </div>
          {/* Mobile */}
          <div className="sm:hidden">
            {detail.subject_groups.map((sg) => (
              <SubjectGroupMobileRow key={sg.subject_group_id} sg={sg} />
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Grade Levels */}
      {detail.grade_levels.map((gl) => (
        <CollapsibleSection key={gl.grade_level_id} title={gl.display_name}>
          {/* Desktop */}
          <div className="hidden sm:block">
            <Table
              withColumnBorders
              withTableBorder
              fz="sm"
              style={
                { "--table-border-color": "#ced4da" } as React.CSSProperties
              }
            >
              <Table.Thead>
                <Table.Tr>
                  <Table.Th style={{ ...greenTh, width: 140 }}>
                    Subject Code
                  </Table.Th>
                  <Table.Th style={{ ...greenTh, width: 240 }}>Title</Table.Th>
                  <Table.Th style={greenTh}>Description</Table.Th>
                  <Table.Th style={{ ...greenTh, width: 120 }}>Notes</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {gl.subjects.map((s) => (
                  <Table.Tr key={s.curriculum_subject_id}>
                    <Table.Td>
                      <Text size="sm" fw={500} ff="monospace">
                        {s.code}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{s.name}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {s.description ?? ""}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      {s.subject_type === "SSES" && (
                        <Badge color="blue" variant="filled" size="sm">
                          SSES Only
                        </Badge>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </div>
          {/* Mobile */}
          <div className="sm:hidden">
            {gl.subjects.map((s) => (
              <SubjectMobileRow key={s.curriculum_subject_id} s={s} />
            ))}
          </div>
        </CollapsibleSection>
      ))}
    </Stack>
  );
}
