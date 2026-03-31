"use client";

import { useMemo, useState } from "react";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Checkbox,
  Collapse,
  Group,
  Modal,
  Stack,
  Text,
  Textarea,
  TextInput,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import {
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconInfoCircle,
  IconPencil,
  IconPlus,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { modals } from "@mantine/modals";
import type { UseFormReturnType } from "@mantine/form";
import type { CreateCurriculumForm, WizardSubject, WizardSubjectGroup } from "../_lib/types";
import { generateSuggestions } from "../../_lib/subjectGroupSuggestions";

const greenTh: React.CSSProperties = {
  backgroundColor: "#4EAE4A",
  color: "#fff",
  fontWeight: 600,
  padding: "8px 12px",
  textAlign: "left",
  fontSize: 13,
};

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
  const [opened, setOpened] = useState(true);
  return (
    <Box mb="xs">
      <UnstyledButton
        onClick={() => setOpened((o) => !o)}
        style={{ width: "100%", backgroundColor: "#f8f9fa", padding: "7px 12px", borderRadius: 5 }}
      >
        <Group justify="space-between">
          <Text fw={600} size="sm">{label}</Text>
          {opened ? <IconChevronUp size={13} /> : <IconChevronDown size={13} />}
        </Group>
      </UnstyledButton>
      <Collapse in={opened}>
        <Box pl="sm" py="xs">
          {subjects.map((s) => {
            const inGroup = occupiedMap.get(s.tempId);
            return (
              <Tooltip key={s.tempId} label={inGroup ? `Already in: ${inGroup}` : undefined} disabled={!inGroup} position="right" withArrow>
                <Group gap="sm" mb={5}>
                  <Checkbox
                    checked={checkedTempIds.includes(s.tempId)}
                    disabled={!!inGroup}
                    onChange={() => !inGroup && onToggle(s.tempId)}
                    label={
                      <Text size="sm">
                        <Text span fw={500} ff="monospace">{s.code}</Text> — {s.name}
                        {s.subject_type === "SSES" && <Badge ml={6} color="blue" variant="light" size="xs">SSES</Badge>}
                      </Text>
                    }
                  />
                </Group>
              </Tooltip>
            );
          })}
        </Box>
      </Collapse>
    </Box>
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
          .filter((n) => n.toLowerCase() !== (initial?.name ?? "").toLowerCase())
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
      memberTempIds: (v) => (v.length === 0 ? "Select at least one member." : null),
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

  const handleToggle = (tempId: string) => {
    const cur = form.values.memberTempIds;
    form.setFieldValue("memberTempIds", cur.includes(tempId) ? cur.filter((id) => id !== tempId) : [...cur, tempId]);
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
            <Text size="sm" fw={500}>Members <Text span c="red">*</Text></Text>
          </Group>
          {form.errors.memberTempIds && <Text size="xs" c="red" mb={4}>{form.errors.memberTempIds}</Text>}
          <Box style={{ border: "1px solid #dee2e6", borderRadius: 6, padding: "6px 0", maxHeight: 260, overflowY: "auto" }}>
            {Array.from(subjectsByGl.entries()).map(([glId, subjects]) => (
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
          <Button variant="default" onClick={onClose}>Cancel</Button>
          <Button color="#4EAE4A" onClick={() => {
            if (form.validate().hasErrors) return;
            onSave({ tempId: initial?.tempId ?? crypto.randomUUID(), name: form.values.name.trim(), description: form.values.description.trim(), memberTempIds: form.values.memberTempIds });
            onClose();
          }}>
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

export default function StepCurriculumSubjectGroups({ form, gradeLevelNames }: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<WizardSubjectGroup | null>(null);
  const [suggestionPrefill, setSuggestionPrefill] = useState<{ name: string; memberTempIds: string[] } | null>(null);
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(new Set());

  const { subjects, subject_groups: groups } = form.values;

  const occupiedTempIds = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of groups) for (const tid of g.memberTempIds) map.set(tid, g.name);
    return map;
  }, [groups]);

  const unassigned = useMemo(
    () => subjects.filter((s) => !occupiedTempIds.has(s.tempId)),
    [subjects, occupiedTempIds]
  );

  const allSuggestions = useMemo(() => generateSuggestions(subjects), [subjects]);
  const activeSuggestions = allSuggestions.filter(
    (s) =>
      !dismissedSuggestions.has(s.tempId) &&
      s.memberTempIds.every((tid) => subjects.some((sub) => sub.tempId === tid) && !occupiedTempIds.has(tid))
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
      form.setFieldValue("subject_groups", groups.map((g) => (g.tempId === editingGroup.tempId ? group : g)));
    } else {
      form.setFieldValue("subject_groups", [...groups, group]);
    }
    setEditingGroup(null);
    setSuggestionPrefill(null);
  };

  const openCreateModal = () => {
    setEditingGroup(null);
    setSuggestionPrefill(null);
    setModalOpen(true);
  };

  const openEditModal = (g: WizardSubjectGroup) => {
    setEditingGroup(g);
    setSuggestionPrefill(null);
    setModalOpen(true);
  };

  const openFromSuggestion = (sug: { tempId: string; name: string; memberTempIds: string[] }) => {
    setEditingGroup(null);
    setSuggestionPrefill({ name: sug.name, memberTempIds: sug.memberTempIds });
    setDismissedSuggestions((p) => new Set([...p, sug.tempId]));
    setModalOpen(true);
  };

  return (
    <Box>
      <Text size="lg" fw={700} mb="md" c="#4EAE4A">
        Define Subject Groups
      </Text>

      <Box p="lg" style={{ border: "1px solid #e0e0e0", borderRadius: "8px" }}>
        <Text size="sm" c="dimmed" mb="md">
          Group learning areas that are monitored together for reporting purposes. Subject coordinators will be
          assigned per group.
        </Text>

        {/* Unassigned subjects panel */}
        <Box
          mb="md"
          style={{
            border: `1px solid ${unassigned.length > 0 ? "#e03131" : "#4EAE4A"}`,
            borderRadius: 6,
            padding: "8px 14px",
            backgroundColor: unassigned.length > 0 ? "#fff5f5" : "#f6fff6",
          }}
        >
          <Group gap="xs" mb={unassigned.length > 0 ? "xs" : 0}>
            {unassigned.length > 0 ? (
              <>
                <Badge color="red" variant="light" size="sm">{unassigned.length}</Badge>
                <Text size="sm" fw={600} c="red">
                  {unassigned.length} subject{unassigned.length > 1 ? "s" : ""} not yet assigned to a group
                </Text>
              </>
            ) : (
              <>
                <IconCheck size={15} color="#4EAE4A" />
                <Text size="sm" fw={600} c="#4EAE4A">All subjects assigned</Text>
              </>
            )}
          </Group>
          {unassigned.length > 0 && (
            <Group gap={5} wrap="wrap">
              {unassigned.map((s) => (
                <Badge key={s.tempId} color="gray" variant="outline" size="xs">{s.code}</Badge>
              ))}
            </Group>
          )}
        </Box>

        {/* Ghost suggestions */}
        {activeSuggestions.length > 0 && (
          <Box mb="md">
            <Group gap="xs" mb="sm">
              <Text size="sm" fw={700}>Suggested Groups</Text>
              <Tooltip
                label="Based on naming patterns in your subjects. Subjects sharing a common base name (e.g. 'Mathematics') are suggested as a group."
                position="right"
                withArrow
                multiline
                w={260}
              >
                <IconInfoCircle size={15} color="#808898" style={{ cursor: "help" }} />
              </Tooltip>
            </Group>
            <Stack gap="sm">
              {activeSuggestions.map((sug) => (
                <Box
                  key={sug.tempId}
                  style={{ border: "1px dashed #adb5bd", borderRadius: 6, padding: "10px 14px", opacity: 0.7 }}
                >
                  <Group justify="space-between" mb="xs">
                    <Text size="sm" fw={600}>{sug.name}</Text>
                    <Group gap="xs">
                      <Button size="xs" color="#4EAE4A" onClick={() => openFromSuggestion(sug)}>
                        Accept
                      </Button>
                      <ActionIcon size="sm" variant="subtle" color="gray"
                        onClick={() => setDismissedSuggestions((p) => new Set([...p, sug.tempId]))}>
                        <IconX size={13} />
                      </ActionIcon>
                    </Group>
                  </Group>
                  <Group gap={5} wrap="wrap">
                    {sug.memberTempIds.map((tid) => {
                      const s = subjectByTempId.get(tid);
                      return s ? <Badge key={tid} color="blue" variant="light" size="sm">{s.code}</Badge> : null;
                    })}
                  </Group>
                </Box>
              ))}
            </Stack>
          </Box>
        )}

        {/* Subject groups table */}
        <Box style={{ border: "1px solid #dee2e6", borderRadius: 6, overflow: "hidden" }}>
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
                    <Text size="sm" fw={500}>{g.name}</Text>
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    <Text size="sm" c="dimmed">{g.description}</Text>
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    <Group gap={5} wrap="wrap">
                      {g.memberTempIds.map((tid) => {
                        const s = subjectByTempId.get(tid);
                        return s ? (
                          <Tooltip key={tid} label={s.name} withArrow position="top">
                            <Badge color="blue" variant="filled" size="sm" radius="xl" style={{ cursor: "default" }}>
                              {s.code}
                            </Badge>
                          </Tooltip>
                        ) : null;
                      })}
                    </Group>
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    <Group gap={4} wrap="nowrap">
                      <Tooltip label="Edit" withArrow>
                        <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => openEditModal(g)}>
                          <IconPencil size={16} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Remove" withArrow>
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          color="red"
                          onClick={() =>
                            modals.openConfirmModal({
                              title: "Remove subject group?",
                              children: (
                                <Text size="sm">
                                  Remove <strong>{g.name}</strong>? Subjects in this group will become unassigned.
                                </Text>
                              ),
                              labels: { confirm: "Remove", cancel: "Cancel" },
                              confirmProps: { color: "red" },
                              onConfirm: () =>
                                form.setFieldValue("subject_groups", groups.filter((x) => x.tempId !== g.tempId)),
                            })
                          }
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </td>
                </tr>
              ))}
              <tr style={{ borderTop: "1px solid #dee2e6", backgroundColor: "#f8f9fa" }}>
                <td colSpan={4} style={{ padding: 0 }}>
                  <UnstyledButton onClick={openCreateModal} style={{ width: "100%", padding: "8px 12px" }}>
                    <Group gap={6} justify="center">
                      <IconPlus size={13} color="#4EAE4A" />
                      <Text size="sm" c="#4EAE4A" fw={500}>Add a subject group</Text>
                    </Group>
                  </UnstyledButton>
                </td>
              </tr>
            </tbody>
          </table>
        </Box>
      </Box>

      <GroupModal
        key={editingGroup?.tempId ?? (suggestionPrefill ? `prefill-${suggestionPrefill.name}` : "new")}
        opened={modalOpen}
        onClose={() => { setModalOpen(false); setEditingGroup(null); setSuggestionPrefill(null); }}
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
