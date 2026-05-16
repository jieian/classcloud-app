"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Checkbox,
  Collapse,
  Divider,
  Group,
  Modal,
  Stack,
  Text,
  Textarea,
  TextInput,
  ThemeIcon,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { useForm } from "@mantine/form";
import {
  IconAlertTriangle,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconChevronUp,
  IconInfoCircle,
  IconPencil,
  IconPlus,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { modals } from "@mantine/modals";
import { notify } from "@/components/notificationIcon/notificationIcon";
import type { UseFormReturnType } from "@mantine/form";
import type {
  CreateCurriculumForm,
  WizardSubject,
  WizardSubjectGroup,
} from "../_lib/types";
import { generateSuggestions } from "../../_lib/subjectGroupSuggestions";

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

const greenTh: React.CSSProperties = {
  backgroundColor: "#4EAE4A",
  color: "#fff",
  fontWeight: 600,
  padding: "8px 12px",
  textAlign: "left",
  fontSize: 13,
};

// ── Enter key confirmation helper ──────────────────────────────────────────────
function EnterToConfirm({ onEnter }: { onEnter: () => void }) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Enter") onEnter();
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

// ── Member picker inside modal ─────────────────────────────────────────────────
function MemberBlock({
  label,
  subjects,
  checkedTempIds,
  occupiedMap,
  onToggle,
}: {
  label: string;
  subjects: WizardSubject[];
  checkedTempIds: string[];
  occupiedMap: Map<string, string>;
  onToggle: (tempId: string) => void;
}) {
  const [opened, setOpened] = useState(false);
  return (
    <Box mb="xs">
      <UnstyledButton
        onClick={() => setOpened((o) => !o)}
        style={{
          width: "100%",
          backgroundColor: "#f0f7ee",
          padding: "7px 12px",
          borderRadius: 4,
        }}
      >
        <Group justify="space-between">
          <Text fw={600} size="sm" c="gray.7">
            {label}
          </Text>
          {opened ? (
            <IconChevronUp size={13} color="#808898" />
          ) : (
            <IconChevronDown size={13} color="#808898" />
          )}
        </Group>
      </UnstyledButton>
      <Collapse in={opened}>
        <Box py="xs">
          {subjects.map((s, i) => {
            const inGroup = occupiedMap.get(s.tempId);
            const isChecked = checkedTempIds.includes(s.tempId);
            return (
              <Tooltip
                key={s.tempId}
                label={inGroup ? `Already in: ${inGroup}` : undefined}
                disabled={!inGroup}
                position="right"
                withArrow
              >
                <Box
                  component="label"
                  htmlFor={`member-${s.tempId}`}
                  style={{
                    display: "block",
                    border: "1px solid",
                    borderColor: isChecked ? "#4EAE4A" : "#e9ecef",
                    borderRadius: 6,
                    padding: "10px 12px",
                    opacity: inGroup ? 0.5 : 1,
                    backgroundColor: isChecked ? "#f0f7ee" : i % 2 === 0 ? "#fff" : "#fafafa",
                    cursor: inGroup ? "not-allowed" : "pointer",
                    transition: "border-color 0.15s, background-color 0.15s",
                  }}
                >
                  <Group gap="sm" wrap="nowrap">
                    <Checkbox
                      id={`member-${s.tempId}`}
                      checked={isChecked}
                      disabled={!!inGroup}
                      onChange={() => !inGroup && onToggle(s.tempId)}
                      color="#4EAE4A"
                      style={{ pointerEvents: "none" }}
                    />
                    <Text size="xs" fw={600} ff="monospace" c="gray.6" style={{ flexShrink: 0 }}>
                      {s.code}
                    </Text>
                    <Text size="sm" style={{ flex: 1 }}>
                      {s.name}
                    </Text>
                    {s.subject_type === "SSES" && (
                      <Badge color="blue" variant="light" size="xs">
                        SSES
                      </Badge>
                    )}
                  </Group>
                </Box>
              </Tooltip>
            );
          })}
        </Box>
      </Collapse>
    </Box>
  );
}

// ── Mobile card for a single group ────────────────────────────────────────────
function GroupMobileCard({
  g,
  subjectByTempId,
  onEdit,
  onRemove,
}: {
  g: WizardSubjectGroup;
  subjectByTempId: Map<string, WizardSubject>;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const [opened, { toggle }] = useDisclosure(false);
  return (
    <>
      <div style={{ padding: "10px 4px" }}>
        <Group justify="space-between" wrap="nowrap">
          <UnstyledButton onClick={toggle} style={{ flex: 1, minWidth: 0 }}>
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
                fw={600}
                fz="sm"
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {g.name}
              </Text>
              <Text fz="xs" c="dimmed" style={{ flexShrink: 0 }}>
                {g.memberTempIds.length} member
                {g.memberTempIds.length !== 1 ? "s" : ""}
              </Text>
            </Group>
          </UnstyledButton>
          <Group gap={4} wrap="nowrap">
            <ActionIcon size="sm" variant="subtle" color="gray" onClick={onEdit}>
              <IconPencil size={14} />
            </ActionIcon>
            <ActionIcon size="sm" variant="subtle" color="red" onClick={onRemove}>
              <IconTrash size={14} />
            </ActionIcon>
          </Group>
        </Group>
      </div>
      <Collapse in={opened}>
        <Box pb="sm" pl={28} pr={4}>
          {g.description && (
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
              <Text fz="sm" c="dimmed" mb="xs">
                {g.description}
              </Text>
            </>
          )}
          <Text
            size="xs"
            c="dimmed"
            fw={600}
            tt="uppercase"
            mb={4}
            style={{ letterSpacing: "0.04em" }}
          >
            Members
          </Text>
          <Group gap={4} wrap="wrap">
            {g.memberTempIds.map((tid) => {
              const s = subjectByTempId.get(tid);
              return s ? (
                <SubjectCodeBadge
                  key={tid}
                  code={s.code}
                  name={s.name}
                  subject_type={s.subject_type}
                />
              ) : null;
            })}
          </Group>
        </Box>
      </Collapse>
      <Divider />
    </>
  );
}

// ── Create/Edit group modal ────────────────────────────────────────────────────
function GroupModal({
  opened,
  onClose,
  initial,
  prefill,
  existingGroupNames,
  allSubjects,
  gradeLevelNames,
  occupiedMap,
  onSave,
}: {
  opened: boolean;
  onClose: () => void;
  initial: WizardSubjectGroup | null;
  prefill?: { name: string; memberTempIds: string[] };
  existingGroupNames: string[];
  allSubjects: WizardSubject[];
  gradeLevelNames: Map<number, string>;
  occupiedMap: Map<string, string>;
  onSave: (group: WizardSubjectGroup) => void;
}) {
  const form = useForm({
    initialValues: {
      name: initial?.name ?? prefill?.name ?? "",
      description: initial?.description ?? "",
      memberTempIds: initial?.memberTempIds ?? prefill?.memberTempIds ?? [],
    },
    validate: {
      name: (v) => {
        if (!v.trim()) return "Group name is required.";
        if (v.trim().length < 3) return "Must be at least 3 characters.";
        if (v.trim().length > 50) return "Must be 50 characters or less.";
        const lower = v.trim().toLowerCase();
        const duplicate = existingGroupNames
          .filter(
            (n) => n.toLowerCase() !== (initial?.name ?? "").toLowerCase(),
          )
          .some((n) => n.toLowerCase() === lower);
        if (duplicate) return "A group with this name already exists.";
        return null;
      },
      description: (v) => {
        if (!v.trim()) return "Description is required.";
        if (/^\d+$/.test(v.trim())) return "Description can't be only numbers.";
        if (/^\.+$/.test(v.trim())) return "Description can't be only dots.";
        if (v.trim().length > 300) return "Must be 300 characters or less.";
        return null;
      },
      memberTempIds: (v) =>
        v.length === 0 ? "Select at least one member." : null,
    },
  });

  const subjectsByGl = useMemo(() => {
    const map = new Map<number, WizardSubject[]>();
    for (const s of allSubjects) {
      const arr = map.get(s.grade_level_id) ?? [];
      arr.push(s);
      map.set(s.grade_level_id, arr);
    }
    return map;
  }, [allSubjects]);

  // Sort grade levels numerically by the number in their display name (Grade 1 → Grade 6)
  const sortedGlEntries = useMemo(() => {
    return Array.from(subjectsByGl.entries()).sort(([aId], [bId]) => {
      const aName = gradeLevelNames.get(aId) ?? "";
      const bName = gradeLevelNames.get(bId) ?? "";
      const aNum = parseInt(aName.replace(/\D/g, ""), 10) || 0;
      const bNum = parseInt(bName.replace(/\D/g, ""), 10) || 0;
      return aNum - bNum;
    });
  }, [subjectsByGl, gradeLevelNames]);

  const handleToggle = (tempId: string) => {
    const cur = form.values.memberTempIds;
    form.setFieldValue(
      "memberTempIds",
      cur.includes(tempId)
        ? cur.filter((id) => id !== tempId)
        : [...cur, tempId],
    );
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={initial ? "Edit Subject Group" : "Create Subject Group"}
      centered
      size="md"
      overlayProps={{ backgroundOpacity: 0.5 }}
    >
      <Stack gap="md">
        <TextInput
          label="Subject Group Name"
          placeholder="e.g. Mathematics"
          required
          maxLength={50}
          description={`${form.values.name.length}/50 characters`}
          {...form.getInputProps("name")}
        />
        <Textarea
          label="Description"
          placeholder="Describe what this group represents"
          required
          autosize
          minRows={3}
          maxLength={300}
          {...form.getInputProps("description")}
        />
        <Box>
          <Group gap={4} mb={4}>
            <Text size="sm" fw={500}>
              Members{" "}
              <Text span c="red">
                *
              </Text>
            </Text>
          </Group>
          {form.errors.memberTempIds && (
            <Text size="xs" c="red" mb={4}>
              {form.errors.memberTempIds}
            </Text>
          )}
          <Box
            style={{
              border: "1px solid #dee2e6",
              borderRadius: 6,
              padding: "6px 0",
              maxHeight: 260,
              overflowY: "auto",
            }}
          >
            {sortedGlEntries.map(([glId, subjects]) => (
              <MemberBlock
                key={glId}
                label={gradeLevelNames.get(glId) ?? `Grade Level ${glId}`}
                subjects={subjects}
                checkedTempIds={form.values.memberTempIds}
                occupiedMap={occupiedMap}
                onToggle={handleToggle}
              />
            ))}
          </Box>
        </Box>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button
            color="#4EAE4A"
            onClick={() => {
              if (form.validate().hasErrors) return;
              onSave({
                tempId: initial?.tempId ?? crypto.randomUUID(),
                name: form.values.name.trim(),
                description: form.values.description.trim(),
                memberTempIds: form.values.memberTempIds,
              });
              onClose();
            }}
          >
            {initial ? "Save Changes" : "Create Group"}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

// ── Main step ─────────────────────────────────────────────────────────────────
interface Props {
  form: UseFormReturnType<CreateCurriculumForm>;
  gradeLevelNames: Map<number, string>;
}

export default function StepCurriculumSubjectGroups({
  form,
  gradeLevelNames,
}: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [modalKey, setModalKey] = useState(0);
  const [editingGroup, setEditingGroup] = useState<WizardSubjectGroup | null>(null);
  const [suggestionPrefill, setSuggestionPrefill] = useState<{
    tempId: string;
    name: string;
    memberTempIds: string[];
  } | null>(null);
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(
    new Set(),
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

  const { subjects, subject_groups: groups } = form.values;

  const occupiedTempIds = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of groups)
      for (const tid of g.memberTempIds) map.set(tid, g.name);
    return map;
  }, [groups]);

  const unassigned = useMemo(
    () => subjects.filter((s) => !occupiedTempIds.has(s.tempId)),
    [subjects, occupiedTempIds],
  );

  const allSuggestions = useMemo(
    () => generateSuggestions(subjects),
    [subjects],
  );
  const activeSuggestions = allSuggestions.filter(
    (s) =>
      !dismissedSuggestions.has(s.tempId) &&
      s.memberTempIds.every(
        (tid) =>
          subjects.some((sub) => sub.tempId === tid) &&
          !occupiedTempIds.has(tid),
      ),
  );

  const occupiedForModal = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of groups) {
      if (g.tempId === editingGroup?.tempId) continue;
      for (const tid of g.memberTempIds) map.set(tid, g.name);
    }
    return map;
  }, [groups, editingGroup]);

  const subjectByTempId = useMemo(() => {
    const map = new Map<string, WizardSubject>();
    for (const s of subjects) map.set(s.tempId, s);
    return map;
  }, [subjects]);

  const handleSaveGroup = (group: WizardSubjectGroup) => {
    if (editingGroup) {
      form.setFieldValue(
        "subject_groups",
        groups.map((g) => (g.tempId === editingGroup.tempId ? group : g)),
      );
      notify({
        type: "success",
        title: "Group Updated",
        message: `${group.name} has been updated.`,
      });
    } else {
      form.setFieldValue("subject_groups", [...groups, group]);
      notify({
        type: "success",
        title: "Group Created",
        message: `${group.name} has been created.`,
      });
    }
    setEditingGroup(null);
    setSuggestionPrefill(null);
  };

  const openCreateModal = () => {
    setEditingGroup(null);
    setSuggestionPrefill(null);
    setModalKey((k) => k + 1);
    setModalOpen(true);
  };

  const openEditModal = (g: WizardSubjectGroup) => {
    setEditingGroup(g);
    setSuggestionPrefill(null);
    setModalOpen(true);
  };

  const openFromSuggestion = (sug: {
    tempId: string;
    name: string;
    memberTempIds: string[];
  }) => {
    setEditingGroup(null);
    setSuggestionPrefill({ tempId: sug.tempId, name: sug.name, memberTempIds: sug.memberTempIds });
    setDismissedSuggestions((p) => new Set([...p, sug.tempId]));
    setModalKey((k) => k + 1);
    setModalOpen(true);
  };

  const confirmDelete = (g: WizardSubjectGroup) => {
    let modalId!: string;
    modalId = modals.openConfirmModal({
      title: "Remove subject group?",
      children: (
        <>
          <EnterToConfirm
            onEnter={() => {
              form.setFieldValue(
                "subject_groups",
                groups.filter((x) => x.tempId !== g.tempId),
              );
              notify({
                type: "success",
                title: "Group Removed",
                message: `${g.name} has been removed.`,
              });
              modals.close(modalId);
            }}
          />
          <Text size="sm">
            Remove <strong>{g.name}</strong>? Subjects in this group will become
            unassigned.
          </Text>
        </>
      ),
      labels: { confirm: "Remove", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: () => {
        form.setFieldValue(
          "subject_groups",
          groups.filter((x) => x.tempId !== g.tempId),
        );
        notify({
          type: "success",
          title: "Group Removed",
          message: `${g.name} has been removed.`,
        });
      },
      ...confirmModalProps,
    });
  };

  return (
    <Box>
      <Text size="xl" fw={700} mb="md" c="#298925">
        Define Subject Groups
      </Text>

      <Box p="lg" style={{ border: "1px solid #B8B8B8", borderRadius: "8px" }}>
        <Text size="lg" fw={700} mb="xs" c="#298925">
          Subject Groups
        </Text>
        <Text size="sm" c="dimmed" mb="md">
          Group learning areas that are monitored together for reporting
          purposes. Subject coordinators will be assigned per group.
        </Text>

        {/* Unassigned subjects panel */}
        {unassigned.length > 0 ? (
          <Alert
            variant="filled"
            radius="md"
            mb="md"
            styles={{
              root: { backgroundColor: "#FF6666" },
              icon: { alignSelf: "center", marginTop: 0 },
            }}
            icon={
              <ThemeIcon color="white" variant="transparent" size="md">
                <IconAlertTriangle size={20} />
              </ThemeIcon>
            }
          >
            <Text fw={700} size="sm">
              Unassigned Subjects
            </Text>
            <Text size="sm" fs="italic" mb="xs">
              The following subject{unassigned.length > 1 ? "s are" : " is"} not
              yet assigned to a group:
            </Text>
            <Group gap={5} wrap="wrap">
              {unassigned.map((s) => (
                <SubjectCodeBadge
                  key={s.tempId}
                  code={s.code}
                  name={s.name}
                  subject_type={s.subject_type}
                />
              ))}
            </Group>
          </Alert>
        ) : (
          <Box
            mb="md"
            style={{
              border: "1px solid #4EAE4A",
              borderRadius: 6,
              padding: "8px 14px",
              backgroundColor: "#f6fff6",
            }}
          >
            <Group gap="xs">
              <IconCheck size={15} color="#4EAE4A" />
              <Text size="sm" fw={600} c="#4EAE4A">
                All subjects assigned
              </Text>
            </Group>
          </Box>
        )}

        {/* Suggested groups */}
        {activeSuggestions.length > 0 && (
          <Box
            mb="md"
            p="md"
            style={{
              border: "1px solid #d0e4cc",
              borderRadius: "8px",
              backgroundColor: "#f7fbf7",
            }}
          >
            <Group gap="xs" mb="sm" align="center">
              <Text size="sm" fw={600} c="gray.7">
                Suggested Groups
              </Text>
              <Tooltip
                label="Based on naming patterns in your subjects."
                position="right"
                withArrow
                multiline
                w={260}
              >
                <IconInfoCircle
                  size={14}
                  color="#808898"
                  style={{ cursor: "help" }}
                />
              </Tooltip>
            </Group>
            <Stack gap="xs">
              {activeSuggestions.map((sug) => (
                <Box
                  key={sug.tempId}
                  style={{
                    border: "1px solid #d0e4cc",
                    borderLeft: "3px solid #4EAE4A",
                    borderRadius: 6,
                    overflow: "hidden",
                    backgroundColor: "#fff",
                  }}
                >
                  <Group
                    justify="space-between"
                    wrap="nowrap"
                    gap="sm"
                    px="md"
                    py="sm"
                    style={{ backgroundColor: "#f0f7ee" }}
                  >
                    <Text
                      size="sm"
                      fw={600}
                      c="gray.8"
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        flex: 1,
                        minWidth: 0,
                      }}
                    >
                      {sug.name}
                    </Text>
                    <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
                      <Button
                        size="xs"
                        variant="filled"
                        color="#4EAE4A"
                        onClick={() => openFromSuggestion(sug)}
                      >
                        Accept
                      </Button>
                      <Tooltip
                        label="Dismiss suggestion"
                        withArrow
                        position="top"
                      >
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          color="gray"
                          onClick={() =>
                            setDismissedSuggestions(
                              (p) => new Set([...p, sug.tempId]),
                            )
                          }
                        >
                          <IconX size={12} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Group>
                  <Group px="md" py="sm" gap={5} wrap="wrap">
                    {sug.memberTempIds.map((tid) => {
                      const s = subjectByTempId.get(tid);
                      return s ? (
                        <SubjectCodeBadge
                          key={tid}
                          code={s.code}
                          name={s.name}
                          subject_type={s.subject_type}
                        />
                      ) : null;
                    })}
                  </Group>
                </Box>
              ))}
            </Stack>
          </Box>
        )}

        {/* Subject groups table */}
        {groups.length > 0 && <Box
          style={{
            border: "1px solid #dee2e6",
            borderRadius: 6,
            overflow: "hidden",
          }}
        >
          {/* Desktop */}
          <div className="hidden sm:block">
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ ...greenTh, width: 200 }}>Subject Group Name</th>
                  <th style={{ ...greenTh, width: 240 }}>Description</th>
                  <th style={greenTh}>Members</th>
                  <th style={{ ...greenTh, width: 70 }}></th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.tempId} style={{ borderTop: "1px solid #dee2e6" }}>
                    <td style={{ padding: "8px 12px" }}>
                      <Text size="sm" fw={500}>
                        {g.name}
                      </Text>
                    </td>
                    <td style={{ padding: "8px 12px" }}>
                      <Text size="sm" c="dimmed">
                        {g.description}
                      </Text>
                    </td>
                    <td style={{ padding: "8px 12px" }}>
                      <Group gap={5} wrap="wrap">
                        {g.memberTempIds.map((tid) => {
                          const s = subjectByTempId.get(tid);
                          return s ? (
                            <SubjectCodeBadge
                              key={tid}
                              code={s.code}
                              subject_type={s.subject_type}
                              name={s.name}
                            />
                          ) : null;
                        })}
                      </Group>
                    </td>
                    <td style={{ padding: "8px 12px" }}>
                      <Group gap={4} wrap="nowrap">
                        <Tooltip label="Edit" withArrow>
                          <ActionIcon
                            size="sm"
                            variant="subtle"
                            color="gray"
                            onClick={() => openEditModal(g)}
                          >
                            <IconPencil size={16} />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label="Remove" withArrow>
                          <ActionIcon
                            size="sm"
                            variant="subtle"
                            color="red"
                            onClick={() => confirmDelete(g)}
                          >
                            <IconTrash size={16} />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <div className="sm:hidden">
            {groups.length > 0 && (
              <Box px="xs">
                {groups.map((g) => (
                  <GroupMobileCard
                    key={g.tempId}
                    g={g}
                    subjectByTempId={subjectByTempId}
                    onEdit={() => openEditModal(g)}
                    onRemove={() => confirmDelete(g)}
                  />
                ))}
              </Box>
            )}
          </div>
        </Box>}

        {/* Add button — matches StepCurriculumSubjects style */}
        <Box mt="sm" style={{ border: "1px solid #4EAE4A", borderRadius: "6px" }}>
          <Button
            variant="subtle"
            color="#4EAE4A"
            size="sm"
            fullWidth
            leftSection={<IconPlus size={14} />}
            onClick={openCreateModal}
          >
            Add a subject group
          </Button>
        </Box>
      </Box>

      <GroupModal
        key={
          editingGroup?.tempId ??
          (suggestionPrefill
            ? `prefill-${modalKey}`
            : `new-${modalKey}`)
        }
        opened={modalOpen}
        onClose={() => {
          if (suggestionPrefill) {
            setDismissedSuggestions((p) => {
              const next = new Set(p);
              next.delete(suggestionPrefill.tempId);
              return next;
            });
          }
          setModalOpen(false);
          setEditingGroup(null);
          setSuggestionPrefill(null);
        }}
        initial={editingGroup}
        prefill={suggestionPrefill ?? undefined}
        existingGroupNames={groups.map((g) => g.name)}
        allSubjects={subjects}
        gradeLevelNames={gradeLevelNames}
        occupiedMap={occupiedForModal}
        onSave={handleSaveGroup}
      />
    </Box>
  );
}
