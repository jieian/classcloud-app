"use client";

import { useEffect, useState, useMemo } from "react";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Checkbox,
  Collapse,
  Group,
  Modal,
  Pagination,
  Select,
  Skeleton,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { useForm } from "@mantine/form";
import {
  IconChevronDown,
  IconChevronUp,
  IconPencil,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import BackButton from "@/components/BackButton";
import { getSupabase } from "@/lib/supabase/client";
import type { UseFormReturnType } from "@mantine/form";
import type {
  CreateCurriculumForm,
  GradeLevel,
  WizardSubject,
} from "../_lib/types";

interface CurriculumOption {
  value: string;
  label: string;
}

interface SourceSubject {
  subject_id: number;
  code: string;
  name: string;
  description: string | null;
  subject_type: "BOTH" | "SSES";
}

const SUBJECTS_PER_PAGE = 5;

function toTitleCase(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const greenTh: React.CSSProperties = {
  backgroundColor: "#4EAE4A",
  color: "#fff",
  fontWeight: 600,
  padding: "10px 16px",
};

// ── Flow A: pick from another curriculum ──────────────────────────────────────
function FlowExisting({
  gradeLevelId,
  gradeLevelName,
  existingSubjectIds,
  curricula,
  loadingCurricula,
  onAdd,
  onBack,
}: {
  gradeLevelId: number;
  gradeLevelName: string;
  existingSubjectIds: number[];
  curricula: CurriculumOption[];
  loadingCurricula: boolean;
  onAdd: (
    subjects: Omit<
      Extract<WizardSubject, { source: "existing" }>,
      "tempId" | "grade_level_id"
    >[],
  ) => void;
  onBack: () => void;
}) {
  const [selectedCurriculumId, setSelectedCurriculumId] = useState<
    string | null
  >(null);
  const [sourceSubjects, setSourceSubjects] = useState<SourceSubject[]>([]);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [checked, setChecked] = useState<number[]>([]);

  useEffect(() => {
    if (!selectedCurriculumId) {
      setSourceSubjects([]);
      return;
    }
    setLoadingSubjects(true);
    getSupabase()
      .from("curriculum_subjects")
      .select(
        "subject_id, subjects!inner(code, name, description, subject_type)",
      )
      .eq("curriculum_id", Number(selectedCurriculumId))
      .eq("grade_level_id", gradeLevelId)
      .is("deleted_at", null)
      .then(
        ({
          data,
        }: {
          data: Array<{
            subject_id: number;
            subjects: {
              code: string;
              name: string;
              description: string | null;
              subject_type: "BOTH" | "SSES";
            };
          }> | null;
        }) => {
          setSourceSubjects(
            (data ?? []).map((r) => ({
              subject_id: r.subject_id,
              code: r.subjects.code,
              name: r.subjects.name,
              description: r.subjects.description ?? null,
              subject_type: r.subjects.subject_type,
            })),
          );
          setLoadingSubjects(false);
          setPage(1);
          setSearch("");
          setChecked([]);
        },
      );
  }, [selectedCurriculumId, gradeLevelId]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return sourceSubjects;
    return sourceSubjects.filter(
      (s) =>
        s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q),
    );
  }, [sourceSubjects, search]);

  const totalPages = Math.max(
    1,
    Math.ceil(filtered.length / SUBJECTS_PER_PAGE),
  );
  const paginated = filtered.slice(
    (page - 1) * SUBJECTS_PER_PAGE,
    page * SUBJECTS_PER_PAGE,
  );

  return (
    <Stack gap="md">
      <BackButton onClick={onBack} mb={4}>
        Back
      </BackButton>

      <Text size="sm" c="dimmed">
        Importing into <strong>{gradeLevelName}</strong>. Select a curriculum
        below, then choose the subjects to add.
      </Text>

      {loadingCurricula ? (
        <Skeleton height={36} radius="sm" />
      ) : (
        <Select
          label="Curriculum"
          placeholder="Select a curriculum..."
          data={curricula}
          value={selectedCurriculumId}
          onChange={setSelectedCurriculumId}
          searchable
        />
      )}

      {selectedCurriculumId && (
        <>
          <TextInput
            placeholder="Search by code or name..."
            value={search}
            onChange={(e) => {
              setSearch(e.currentTarget.value);
              setPage(1);
            }}
            size="sm"
          />
          {loadingSubjects ? (
            <Stack gap="xs">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} height={32} radius="sm" />
              ))}
            </Stack>
          ) : filtered.length === 0 ? (
            <Text size="sm" c="dimmed">
              No subjects found for {gradeLevelName} in this curriculum.
            </Text>
          ) : (
            <>
              <Stack gap={6}>
                {paginated.map((s) => {
                  const alreadyAdded = existingSubjectIds.includes(
                    s.subject_id,
                  );
                  return (
                    <Tooltip
                      key={s.subject_id}
                      label="Already added"
                      disabled={!alreadyAdded}
                      position="right"
                      withArrow
                    >
                      <Group
                        gap="sm"
                        style={{
                          border: "1px solid #e9ecef",
                          borderRadius: 6,
                          padding: "8px 12px",
                          opacity: alreadyAdded ? 0.5 : 1,
                          backgroundColor: "#fafafa",
                        }}
                      >
                        <Checkbox
                          checked={checked.includes(s.subject_id)}
                          onChange={() =>
                            !alreadyAdded &&
                            setChecked((p) =>
                              p.includes(s.subject_id)
                                ? p.filter((id) => id !== s.subject_id)
                                : [...p, s.subject_id],
                            )
                          }
                          disabled={alreadyAdded}
                        />
                        <Text size="sm" fw={500} ff="monospace">
                          {s.code}
                        </Text>
                        <Text size="sm">{s.name}</Text>
                        {s.subject_type === "SSES" && (
                          <Badge color="blue" variant="light" size="xs">
                            SSES
                          </Badge>
                        )}
                      </Group>
                    </Tooltip>
                  );
                })}
              </Stack>
              {totalPages > 1 && (
                <Group justify="center">
                  <Pagination
                    value={page}
                    onChange={setPage}
                    total={totalPages}
                    size="sm"
                  />
                </Group>
              )}
            </>
          )}

          <Group justify="flex-end">
            <Button
              color="#4EAE4A"
              disabled={checked.length === 0}
              onClick={() => {
                onAdd(
                  sourceSubjects
                    .filter((s) => checked.includes(s.subject_id))
                    .map((s) => ({
                      source: "existing" as const,
                      subject_id: s.subject_id,
                      code: s.code,
                      name: s.name,
                      description: s.description,
                      subject_type: s.subject_type,
                    })),
                );
              }}
            >
              Add Selected ({checked.length})
            </Button>
          </Group>
        </>
      )}
    </Stack>
  );
}

// ── Flow B: new subject form ───────────────────────────────────────────────────
interface ConflictSubject {
  subject_id: number;
  code: string;
  name: string;
  description: string | null;
  subject_type: "BOTH" | "SSES";
}

function FlowNew({
  gradeLevelName,
  initial,
  onAdd,
  onAddExisting,
  onBack,
}: {
  gradeLevelName: string;
  initial?: {
    code: string;
    name: string;
    description: string;
    subject_type: "BOTH" | "SSES";
  };
  onAdd: (subject: {
    code: string;
    name: string;
    description: string;
    subject_type: "BOTH" | "SSES";
  }) => void;
  onAddExisting: (subject: ConflictSubject) => void;
  onBack: () => void;
}) {
  const [checkingCode, setCheckingCode] = useState(false);
  const [conflictSubject, setConflictSubject] =
    useState<ConflictSubject | null>(null);

  const form = useForm({
    initialValues: {
      code: initial?.code ?? "",
      name: initial?.name ?? "",
      description: initial?.description ?? "",
      isSses: initial?.subject_type === "SSES",
    },
    validate: {
      code: (v) => {
        if (!v.trim()) return "Subject code is required.";
        if (!/^[A-Za-z0-9]+$/.test(v.trim()))
          return "Code must be letters and numbers only, no spaces or symbols.";
        return null;
      },
      name: (v) => {
        if (!v.trim()) return "Name is required.";
        if (v.trim().length < 3) return "Must be at least 3 characters.";
        if (v.trim().length > 100) return "Must be 100 characters or less.";
        if (!/^[A-Za-z0-9\s]+$/.test(v.trim()))
          return "Name must not contain symbols.";
        return null;
      },
      description: (v) => {
        if (!v.trim()) return "Description is required.";
        if (v.trim().length < 10) return "Must be at least 10 characters.";
        if (v.trim().length > 300) return "Must be 300 characters or less.";
        return null;
      },
    },
  });

  async function handleSubmit() {
    if (form.validate().hasErrors) return;
    const code = form.values.code.trim().toUpperCase();

    if (!initial || initial.code !== code) {
      setCheckingCode(true);
      const res = await fetch("/api/curriculum/check-subject-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          section_type: form.values.isSses ? "SSES" : "REGULAR",
        }),
      });
      setCheckingCode(false);

      if (res.status === 409) {
        const data = await res.json();
        setConflictSubject(data.existingSubject ?? null);
        return;
      }
      if (!res.ok) {
        form.setFieldError(
          "code",
          "Failed to verify subject code. Please try again.",
        );
        return;
      }
    }

    onAdd({
      code,
      name: toTitleCase(form.values.name),
      description: form.values.description.trim(),
      subject_type: form.values.isSses ? "SSES" : "BOTH",
    });
  }

  return (
    <Stack gap="md">
      <BackButton onClick={onBack} mb={4}>
        Back
      </BackButton>

      <Text size="sm" c="dimmed">
        {initial ? "Edit subject" : "Create a subject"} for{" "}
        <strong>{gradeLevelName}</strong>.
      </Text>

      <TextInput
        label="Subject Code"
        placeholder="e.g. MATH1"
        required
        {...form.getInputProps("code")}
        onChange={(e) => {
          setConflictSubject(null);
          form.getInputProps("code").onChange(e);
        }}
      />

      {conflictSubject && (
        <Box
          style={{
            border: "1px solid #fab005",
            borderRadius: 6,
            padding: "12px 14px",
            backgroundColor: "#fffbea",
          }}
        >
          <Text size="sm" fw={600} mb={4}>
            This code is already registered
          </Text>
          <Text size="sm" mb={2}>
            <Text span fw={500} ff="monospace">
              {conflictSubject.code}
            </Text>{" "}
            — {conflictSubject.name}
          </Text>
          {conflictSubject.description && (
            <Text size="sm" c="dimmed" mb="xs">
              {conflictSubject.description}
            </Text>
          )}
          <Text size="sm" c="dimmed" mb="sm">
            Were you trying to add this subject? You can import it as an
            existing subject instead of creating a new one.
          </Text>
          <Group gap="sm">
            <Button
              size="xs"
              color="#4EAE4A"
              onClick={() => onAddExisting(conflictSubject)}
            >
              Use existing subject
            </Button>
            <Button
              size="xs"
              variant="default"
              onClick={() => setConflictSubject(null)}
            >
              Cancel
            </Button>
          </Group>
        </Box>
      )}

      <TextInput
        label="Name"
        placeholder="e.g. Mathematics 1"
        required
        {...form.getInputProps("name")}
        onBlur={() => {
          if (form.values.name.trim())
            form.setFieldValue("name", toTitleCase(form.values.name));
        }}
      />
      <Textarea
        label="Description"
        placeholder="Briefly describe the subject"
        required
        autosize
        minRows={3}
        {...form.getInputProps("description")}
      />
      <Checkbox
        label="SSES Exclusive"
        description="Check if this subject is only for SSES sections"
        checked={form.values.isSses}
        onChange={(e) => form.setFieldValue("isSses", e.currentTarget.checked)}
      />
      <Group justify="flex-end">
        <Button
          color="#4EAE4A"
          loading={checkingCode}
          onClick={handleSubmit}
        >
          {initial ? "Save Changes" : "Create Subject"}
        </Button>
      </Group>
    </Stack>
  );
}

// ── Add/Edit subject modal ─────────────────────────────────────────────────────
type ModalScreen = "choice" | "existing" | "new";

function SubjectModal({
  opened,
  onClose,
  gradeLevelId,
  gradeLevelName,
  existingSubjectIds,
  editingSubject,
  curricula,
  loadingCurricula,
  onAddSubjects,
  onEditSubject,
  onReplaceWithExisting,
}: {
  opened: boolean;
  onClose: () => void;
  gradeLevelId: number;
  gradeLevelName: string;
  existingSubjectIds: number[];
  editingSubject: Extract<WizardSubject, { source: "new" }> | null;
  curricula: CurriculumOption[];
  loadingCurricula: boolean;
  onAddSubjects: (subjects: WizardSubject[]) => void;
  onEditSubject: (
    tempId: string,
    updated: {
      code: string;
      name: string;
      description: string;
      subject_type: "BOTH" | "SSES";
    },
  ) => void;
  onReplaceWithExisting: (tempId: string, s: ConflictSubject) => void;
}) {
  const [screen, setScreen] = useState<ModalScreen>("choice");

  useEffect(() => {
    if (opened) setScreen(editingSubject ? "new" : "choice");
  }, [opened, editingSubject]);

  const addExisting = (s: ConflictSubject) => {
    if (editingSubject) {
      // Replace the subject being edited in-place so group memberships stay intact
      onReplaceWithExisting(editingSubject.tempId, s);
    } else {
      onAddSubjects([{
        source: "existing",
        tempId: crypto.randomUUID(),
        subject_id: s.subject_id,
        code: s.code,
        name: s.name,
        description: s.description,
        subject_type: s.subject_type,
        grade_level_id: gradeLevelId,
      }]);
    }
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={editingSubject ? "Edit Subject" : screen === "new" ? "Create a Subject" : "Add a Subject"}
      centered
      size="md"
      overlayProps={{ backgroundOpacity: 0.5 }}
    >
      {screen === "choice" && (
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            How would you like to add a subject to{" "}
            <strong>{gradeLevelName}</strong>?
          </Text>
          <Box
            style={{
              border: "1px solid #dee2e6",
              borderRadius: 8,
              padding: "14px 16px",
              cursor: "pointer",
            }}
            onClick={() => setScreen("existing")}
          >
            <Text fw={600} size="sm" mb={4}>
              From another curriculum
            </Text>
            <Text size="xs" c="dimmed">
              Import subjects already defined in an existing curriculum.
            </Text>
          </Box>
          <Box
            style={{
              border: "1px solid #dee2e6",
              borderRadius: 8,
              padding: "14px 16px",
              cursor: "pointer",
            }}
            onClick={() => setScreen("new")}
          >
            <Text fw={600} size="sm" mb={4}>
              Create a subject
            </Text>
            <Text size="xs" c="dimmed">
              Define a brand new subject that doesn't exist yet.
            </Text>
          </Box>
        </Stack>
      )}

      {screen === "existing" && (
        <FlowExisting
          gradeLevelId={gradeLevelId}
          gradeLevelName={gradeLevelName}
          existingSubjectIds={existingSubjectIds}
          curricula={curricula}
          loadingCurricula={loadingCurricula}
          onAdd={(subjects) => {
            onAddSubjects(
              subjects.map(
                (s) =>
                  ({
                    ...s,
                    tempId: crypto.randomUUID(),
                    grade_level_id: gradeLevelId,
                  }) as WizardSubject,
              ),
            );
            onClose();
          }}
          onBack={() => setScreen("choice")}
        />
      )}

      {screen === "new" && (
        <FlowNew
          gradeLevelName={gradeLevelName}
          initial={
            editingSubject
              ? {
                  code: editingSubject.code,
                  name: editingSubject.name,
                  description: editingSubject.description,
                  subject_type: editingSubject.subject_type,
                }
              : undefined
          }
          onAdd={(s) => {
            if (editingSubject) {
              onEditSubject(editingSubject.tempId, s);
            } else {
              onAddSubjects([
                {
                  ...s,
                  source: "new",
                  tempId: crypto.randomUUID(),
                  grade_level_id: gradeLevelId,
                },
              ]);
            }
            onClose();
          }}
          onAddExisting={addExisting}
          onBack={editingSubject ? onClose : () => setScreen("choice")}
        />
      )}
    </Modal>
  );
}

// ── Grade level table block ────────────────────────────────────────────────────
function GradeLevelBlock({
  gradeLevel,
  subjects,
  onAdd,
  onEdit,
  onRemove,
}: {
  gradeLevel: GradeLevel;
  subjects: WizardSubject[];
  onAdd: () => void;
  onEdit: (subject: Extract<WizardSubject, { source: "new" }>) => void;
  onRemove: (tempId: string) => void;
}) {
  const [opened, setOpened] = useState(true);

  const confirmRemove = (s: WizardSubject) => {
    modals.openConfirmModal({
      title: "Remove subject?",
      children: (
        <Text size="sm">
          Remove <strong>{s.name}</strong> (
          <Text span ff="monospace">
            {s.code}
          </Text>
          ) from {gradeLevel.display_name}?
          {s.source === "existing"
            ? " This will also unassign it from any subject group."
            : " Any unsaved changes will be lost."}
        </Text>
      ),
      labels: { confirm: "Remove", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: () => onRemove(s.tempId),
    });
  };

  return (
    <Box
      mb="sm"
      style={{
        border: "1px solid #dee2e6",
        borderRadius: 6,
        overflow: "hidden",
      }}
    >
      <UnstyledButton
        onClick={() => setOpened((o) => !o)}
        style={{ width: "100%", padding: "10px 14px", backgroundColor: "#fff" }}
      >
        <Group justify="space-between">
          <Text fw={600} size="sm">
            {gradeLevel.display_name}
            {subjects.length > 0 && (
              <Text span c="#4EAE4A" fw={700}>
                {" "}
                ({subjects.length})
              </Text>
            )}
          </Text>
          {opened ? (
            <IconChevronUp size={14} color="#808898" />
          ) : (
            <IconChevronDown size={14} color="#808898" />
          )}
        </Group>
      </UnstyledButton>

      <Collapse in={opened}>
        {subjects.length > 0 ? (
          <>
            <div
              style={{ borderTop: "1px solid #ced4da", padding: "16px 20px" }}
            >
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
                    <Table.Th style={{ ...greenTh, width: 130 }}>
                      Subject Code
                    </Table.Th>
                    <Table.Th style={{ ...greenTh, width: 210 }}>
                      Title
                    </Table.Th>
                    <Table.Th style={greenTh}>Description</Table.Th>
                    <Table.Th style={{ ...greenTh, width: 80 }}></Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {subjects.map((s) => (
                    <Table.Tr key={s.tempId}>
                      <Table.Td>
                        <Group gap={4}>
                          <Text size="sm" fw={500} ff="monospace">
                            {s.code}
                          </Text>
                          {s.subject_type === "SSES" && (
                            <Badge color="blue" variant="light" size="xs">
                              SSES
                            </Badge>
                          )}
                        </Group>
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
                        <Group gap={4} wrap="nowrap" justify="flex-end">
                          <Tooltip
                            label={
                              s.source === "existing"
                                ? "Imported subjects cannot be edited"
                                : "Edit"
                            }
                            withArrow
                          >
                            <ActionIcon
                              size="sm"
                              variant="subtle"
                              color="gray"
                              disabled={s.source === "existing"}
                              onClick={() =>
                                s.source === "new" &&
                                onEdit(
                                  s as Extract<
                                    WizardSubject,
                                    { source: "new" }
                                  >,
                                )
                              }
                            >
                              <IconPencil size={16} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label="Remove" withArrow>
                            <ActionIcon
                              size="sm"
                              variant="subtle"
                              color="red"
                              onClick={() => confirmRemove(s)}
                            >
                              <IconTrash size={16} />
                            </ActionIcon>
                          </Tooltip>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </div>
            <div
              style={{
                borderTop: "1px solid #dee2e6",
                backgroundColor: "#DFDFDF",
              }}
            >
              <UnstyledButton
                onClick={onAdd}
                style={{ width: "100%", padding: "8px 12px" }}
              >
                <Group gap={6} justify="center">
                  <IconPlus size={13} color="#4EAE4A" />
                  <Text size="sm" c="#4EAE4A" fw={500}>
                    Add a subject
                  </Text>
                </Group>
              </UnstyledButton>
            </div>
          </>
        ) : (
          <Group
            justify="center"
            style={{ borderTop: "1px solid #dee2e6", padding: "14px 20px" }}
          >
            <Button
              variant="subtle"
              color="#4EAE4A"
              size="sm"
              leftSection={<IconPlus size={14} />}
              onClick={onAdd}
            >
              Add a subject
            </Button>
          </Group>
        )}
      </Collapse>
    </Box>
  );
}

// ── Main step ─────────────────────────────────────────────────────────────────
interface Props {
  form: UseFormReturnType<CreateCurriculumForm>;
  gradeLevels: GradeLevel[];
  loadingGradeLevels: boolean;
}

export default function StepCurriculumSubjects({
  form,
  gradeLevels,
  loadingGradeLevels,
}: Props) {
  const [activeGl, setActiveGl] = useState<GradeLevel | null>(null);

  // Fetch curricula once on mount so Flow A doesn't re-fetch every modal open
  const [curricula, setCurricula] = useState<CurriculumOption[]>([]);
  const [loadingCurricula, setLoadingCurricula] = useState(true);
  useEffect(() => {
    getSupabase()
      .from("curriculums")
      .select("curriculum_id, name")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .then(
        ({
          data,
        }: {
          data: Array<{ curriculum_id: number; name: string }> | null;
        }) => {
          setCurricula(
            (data ?? []).map((c) => ({
              value: String(c.curriculum_id),
              label: c.name,
            })),
          );
          setLoadingCurricula(false);
        },
      );
  }, []);
  const [editingSubject, setEditingSubject] = useState<Extract<
    WizardSubject,
    { source: "new" }
  > | null>(null);

  const subjectsByGl = useMemo(() => {
    const map = new Map<number, WizardSubject[]>();
    for (const s of form.values.subjects) {
      const arr = map.get(s.grade_level_id) ?? [];
      arr.push(s);
      map.set(s.grade_level_id, arr);
    }
    return map;
  }, [form.values.subjects]);

  const existingSubjectIdsForGl = (glId: number): number[] =>
    (subjectsByGl.get(glId) ?? [])
      .filter(
        (s): s is Extract<WizardSubject, { source: "existing" }> =>
          s.source === "existing",
      )
      .map((s) => s.subject_id);

  const handleAdd = (toAdd: WizardSubject[]) => {
    form.setFieldValue("subjects", [...form.values.subjects, ...toAdd]);
  };

  const handleEdit = (
    tempId: string,
    updated: {
      code: string;
      name: string;
      description: string;
      subject_type: "BOTH" | "SSES";
    },
  ) => {
    form.setFieldValue(
      "subjects",
      form.values.subjects.map((s) =>
        s.tempId === tempId ? { ...s, ...updated } : s,
      ),
    );
  };

  const handleReplaceWithExisting = (tempId: string, s: ConflictSubject) => {
    form.setFieldValue(
      "subjects",
      form.values.subjects.map((sub) =>
        sub.tempId === tempId
          ? { source: "existing" as const, tempId, subject_id: s.subject_id, code: s.code, name: s.name, description: s.description, subject_type: s.subject_type, grade_level_id: sub.grade_level_id }
          : sub,
      ),
    );
  };

  const handleRemove = (tempId: string) => {
    form.setFieldValue(
      "subjects",
      form.values.subjects.filter((s) => s.tempId !== tempId),
    );
    form.setFieldValue(
      "subject_groups",
      form.values.subject_groups.map((g) => ({
        ...g,
        memberTempIds: g.memberTempIds.filter((id) => id !== tempId),
      })),
    );
  };

  const missingGls = useMemo(
    () => gradeLevels.filter((gl) => !subjectsByGl.has(gl.grade_level_id)),
    [gradeLevels, subjectsByGl],
  );

  return (
    <Box>
      <Text size="lg" fw={700} mb="md" c="#4EAE4A">
        Define Subjects per Grade Level
      </Text>

      <Box p="lg" style={{ border: "1px solid #e0e0e0", borderRadius: "8px" }}>
        <Text size="md" fw={700} mb="xs" c="#4EAE4A">
          Subjects per Grade Level
        </Text>
        <Text size="sm" c="dimmed" mb="md">
          Define the learning areas for each grade level under this curriculum.
          You may select from existing learning areas or create new ones.
        </Text>

        {missingGls.length > 0 && (
          <Box
            mb="md"
            style={{
              background: "#fff8e1",
              border: "1px solid #ffe082",
              borderRadius: 6,
              padding: "8px 14px",
            }}
          >
            <Text size="sm" c="orange" fw={500}>
              No subjects assigned for:{" "}
              {missingGls.map((gl) => gl.display_name).join(", ")}
            </Text>
          </Box>
        )}

        {loadingGradeLevels ? (
          <Stack gap="sm">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} height={44} radius="md" />
            ))}
          </Stack>
        ) : (
          gradeLevels.map((gl) => (
            <GradeLevelBlock
              key={gl.grade_level_id}
              gradeLevel={gl}
              subjects={subjectsByGl.get(gl.grade_level_id) ?? []}
              onAdd={() => {
                setEditingSubject(null);
                setActiveGl(gl);
              }}
              onEdit={(s) => {
                setEditingSubject(s);
                setActiveGl(gl);
              }}
              onRemove={handleRemove}
            />
          ))
        )}
      </Box>

      {activeGl && (
        <SubjectModal
          opened={activeGl !== null}
          onClose={() => {
            setActiveGl(null);
            setEditingSubject(null);
          }}
          gradeLevelId={activeGl.grade_level_id}
          gradeLevelName={activeGl.display_name}
          existingSubjectIds={existingSubjectIdsForGl(activeGl.grade_level_id)}
          editingSubject={editingSubject}
          curricula={curricula}
          loadingCurricula={loadingCurricula}
          onAddSubjects={handleAdd}
          onEditSubject={handleEdit}
          onReplaceWithExisting={handleReplaceWithExisting}
        />
      )}
    </Box>
  );
}
