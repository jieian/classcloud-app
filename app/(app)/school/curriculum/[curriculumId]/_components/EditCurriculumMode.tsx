"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Checkbox,
  Collapse,
  Divider,
  Group,
  Modal,
  Pagination,
  Paper,
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
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { useForm } from "@mantine/form";
import { modals } from "@mantine/modals";
import { notify } from "@/components/notificationIcon/notificationIcon";
import {
  IconBook,
  IconCalendar,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconChevronUp,
  IconFileDescription,
  IconInfoCircle,
  IconPencil,
  IconPlus,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import BackButton from "@/components/BackButton";
import { getSupabase } from "@/lib/supabase/client";
import { SearchBar } from "@/components/searchBar/SearchBar";
import EmptySearchState from "@/components/EmptySearchState";
import { generateSuggestions } from "../../_lib/subjectGroupSuggestions";
import type { CreateCurriculumForm, GradeLevel, WizardSubject, WizardSubjectGroup } from "../../create/_lib/types";
import type { CurriculumDetail } from "../../_lib/curriculumService";

// ── Validation ─────────────────────────────────────────────────────────────────
function validateName(v: string): string | null {
  if (!v.trim()) return "Curriculum name is required.";
  if (v.trim().length < 3) return "Must be at least 3 characters.";
  if (v.trim().length > 50) return "Must be 50 characters or less.";
  if (/^\d+$/.test(v.trim())) return "Name can't be only numbers.";
  if (/^\.+$/.test(v.trim())) return "Name can't be only dots.";
  if (!/^[A-Za-z0-9\s\-'()]+$/.test(v.trim()))
    return "Only letters, numbers, spaces, hyphens, apostrophes, and parentheses are allowed.";
  return null;
}

function validateDescription(v: string): string | null {
  if (!v.trim()) return "Description is required.";
  if (v.trim().length < 10) return "Must be at least 10 characters.";
  if (v.trim().length > 500) return "Must be 500 characters or less.";
  if (/^\d+$/.test(v.trim())) return "Description can't be only numbers.";
  if (/^\.+$/.test(v.trim())) return "Description can't be only dots.";
  return null;
}

// ── Map existing curriculum data → form values ─────────────────────────────────
function toFormValues(curriculum: CurriculumDetail): CreateCurriculumForm {
  const csIdToTempId = new Map<number, string>();
  const subjects: WizardSubject[] = [];

  for (const gl of curriculum.grade_levels) {
    for (const cs of gl.subjects) {
      const tempId = crypto.randomUUID();
      csIdToTempId.set(cs.curriculum_subject_id, tempId);
      subjects.push({
        source: "existing" as const,
        tempId,
        subject_id: cs.subject_id,
        code: cs.code,
        name: cs.name,
        description: cs.description,
        subject_type: cs.subject_type,
        grade_level_id: gl.grade_level_id,
      });
    }
  }

  const subject_groups: WizardSubjectGroup[] = curriculum.subject_groups.map((sg) => ({
    tempId: crypto.randomUUID(),
    name: sg.name,
    description: sg.description ?? "",
    memberTempIds: sg.members
      .map((m) => csIdToTempId.get(m.curriculum_subject_id))
      .filter((id): id is string => id !== undefined),
  }));

  return { name: curriculum.name, description: curriculum.description ?? "", subjects, subject_groups, activeStep: 0 };
}

// ── Shared types / constants ───────────────────────────────────────────────────
interface CurriculumOption { value: string; label: string; }
interface SourceSubject { subject_id: number; code: string; name: string; description: string | null; subject_type: "BOTH" | "SSES"; }
interface ConflictSubject { subject_id: number; code: string; name: string; description: string | null; subject_type: "BOTH" | "SSES"; }

const SUBJECTS_PER_PAGE = 5;

function toTitleCase(str: string) {
  return str.trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

const greenTh: React.CSSProperties = {
  backgroundColor: "#4EAE4A",
  color: "#fff",
  fontWeight: 600,
  padding: "8px 12px",
  textAlign: "left",
  fontSize: 13,
};

// ── Shared UI helpers ──────────────────────────────────────────────────────────
function SubjectCodeBadge({ code, name, subject_type }: { code: string; name: string; subject_type: "BOTH" | "SSES" }) {
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

function EnterToConfirm({ onEnter }: { onEnter: () => void }) {
  useEffect(() => {
    function handler(e: KeyboardEvent) { if (e.key === "Enter") onEnter(); }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

// ── CollapsibleSection ─────────────────────────────────────────────────────────
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
      <UnstyledButton onClick={() => setOpen((v) => !v)} style={{ width: "100%", padding: "12px 16px" }}>
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

// ── Mobile subject row (edit mode) ─────────────────────────────────────────────
function SubjectMobileRow({
  s,
  locked,
  onEdit,
  onRemove,
}: {
  s: WizardSubject;
  locked: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const [opened, { toggle }] = useDisclosure(false);
  const lockedTooltip = "This subject has records (exams or teacher assignments) and cannot be modified or removed.";
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
              <Text fw={500} fz="sm" ff="monospace" style={{ flexShrink: 0 }}>{s.code}</Text>
              {s.subject_type === "SSES" && (
                <Badge variant="filled" size="xs" radius="xl" style={{ backgroundColor: "#70A2FF", color: "#fff", cursor: "default" }}>
                  SSES
                </Badge>
              )}
            </Group>
          </UnstyledButton>
          <Group gap={4} wrap="nowrap">
            {s.source !== "existing" && (
              <Tooltip label={locked ? lockedTooltip : "Edit"} withArrow multiline w={220} disabled={!locked}>
                <ActionIcon size="sm" variant="subtle" color="gray" disabled={locked} onClick={onEdit}>
                  <IconPencil size={14} />
                </ActionIcon>
              </Tooltip>
            )}
            <Tooltip label={locked ? lockedTooltip : "Remove"} withArrow multiline w={220} disabled={!locked}>
              <ActionIcon size="sm" variant="subtle" color="red" disabled={locked} onClick={onRemove}>
                <IconTrash size={14} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      </div>
      <Collapse in={opened}>
        <Box pb="md" pl={28} pr={4}>
          <Text size="xs" c="dimmed" fw={600} tt="uppercase" mb={2} style={{ letterSpacing: "0.04em" }}>Name</Text>
          <Text fz="sm" c="dimmed" mb="sm">{s.name}</Text>
          {s.description && (
            <>
              <Text size="xs" c="dimmed" fw={600} tt="uppercase" mb={2} style={{ letterSpacing: "0.04em" }}>Description</Text>
              <Text fz="sm" c="dimmed" mb="sm">{s.description}</Text>
            </>
          )}
        </Box>
      </Collapse>
      <Divider />
    </>
  );
}

// ── Mobile group card (edit mode) ──────────────────────────────────────────────
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
              <Text fw={600} fz="sm" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {g.name}
              </Text>
              <Text fz="xs" c="dimmed" style={{ flexShrink: 0 }}>
                {g.memberTempIds.length} member{g.memberTempIds.length !== 1 ? "s" : ""}
              </Text>
            </Group>
          </UnstyledButton>
          <Group gap={4} wrap="nowrap">
            <ActionIcon size="sm" variant="subtle" color="gray" onClick={onEdit}><IconPencil size={14} /></ActionIcon>
            <ActionIcon size="sm" variant="subtle" color="red" onClick={onRemove}><IconTrash size={14} /></ActionIcon>
          </Group>
        </Group>
      </div>
      <Collapse in={opened}>
        <Box pb="sm" pl={28} pr={4}>
          {g.description && (
            <>
              <Text size="xs" c="dimmed" fw={600} tt="uppercase" mb={2} style={{ letterSpacing: "0.04em" }}>Description</Text>
              <Text fz="sm" c="dimmed" mb="xs">{g.description}</Text>
            </>
          )}
          <Text size="xs" c="dimmed" fw={600} tt="uppercase" mb={4} style={{ letterSpacing: "0.04em" }}>Members</Text>
          <Group gap={4} wrap="wrap">
            {g.memberTempIds.map((tid) => {
              const s = subjectByTempId.get(tid);
              return s ? <SubjectCodeBadge key={tid} code={s.code} name={s.name} subject_type={s.subject_type} /> : null;
            })}
          </Group>
        </Box>
      </Collapse>
      <Divider />
    </>
  );
}

// ── Flow A: pick from another curriculum ──────────────────────────────────────
function FlowExisting({ gradeLevelId, gradeLevelName, existingSubjectIds, curricula, loadingCurricula, onAdd, onBack }: {
  gradeLevelId: number; gradeLevelName: string; existingSubjectIds: number[];
  curricula: CurriculumOption[]; loadingCurricula: boolean;
  onAdd: (subjects: Omit<Extract<WizardSubject, { source: "existing" }>, "tempId" | "grade_level_id">[]) => void;
  onBack: () => void;
}) {
  const [selectedCurriculumId, setSelectedCurriculumId] = useState<string | null>(null);
  const [sourceSubjects, setSourceSubjects] = useState<SourceSubject[]>([]);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [checked, setChecked] = useState<number[]>([]);

  useEffect(() => {
    if (!selectedCurriculumId) { setSourceSubjects([]); return; }
    setLoadingSubjects(true);
    getSupabase()
      .from("curriculum_subjects")
      .select("subject_id, subjects!inner(code, name, description, subject_type)")
      .eq("curriculum_id", Number(selectedCurriculumId))
      .eq("grade_level_id", gradeLevelId)
      .is("deleted_at", null)
      .then(({ data }: { data: Array<{ subject_id: number; subjects: { code: string; name: string; description: string | null; subject_type: "BOTH" | "SSES" } }> | null }) => {
        setSourceSubjects((data ?? []).map((r) => ({ subject_id: r.subject_id, code: r.subjects.code, name: r.subjects.name, description: r.subjects.description ?? null, subject_type: r.subjects.subject_type })));
        setLoadingSubjects(false); setPage(1); setSearch(""); setChecked([]);
      });
  }, [selectedCurriculumId, gradeLevelId]);

  const filtered = useMemo(() => {
    const addedSet = new Set(existingSubjectIds);
    const q = search.toLowerCase().trim();
    const base = q
      ? sourceSubjects.filter((s) => s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q))
      : [...sourceSubjects];
    return base.sort((a, b) => {
      const aAdded = addedSet.has(a.subject_id) ? 0 : 1;
      const bAdded = addedSet.has(b.subject_id) ? 0 : 1;
      if (aAdded !== bAdded) return aAdded - bAdded;
      const aSSES = a.subject_type === "SSES" ? 0 : 1;
      const bSSES = b.subject_type === "SSES" ? 0 : 1;
      if (aSSES !== bSSES) return aSSES - bSSES;
      return a.code.localeCompare(b.code);
    });
  }, [sourceSubjects, search, existingSubjectIds]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / SUBJECTS_PER_PAGE));
  const paginated = filtered.slice((page - 1) * SUBJECTS_PER_PAGE, page * SUBJECTS_PER_PAGE);

  return (
    <Stack gap="md">
      <BackButton onClick={onBack} mb={4}>Back</BackButton>
      <Text size="sm" c="dimmed">
        Importing into <strong>{gradeLevelName}</strong>. Select a curriculum, then choose the subjects to add.
      </Text>
      {loadingCurricula ? <Skeleton height={36} radius="sm" /> : (
        <Select label="Curriculum" placeholder="Select a curriculum..." data={curricula} value={selectedCurriculumId} onChange={setSelectedCurriculumId} searchable />
      )}
      {selectedCurriculumId && (
        <>
          <SearchBar
            placeholder="Search by code or name..."
            value={search}
            onChange={(e) => { setSearch(e.currentTarget.value); setPage(1); }}
          />
          {loadingSubjects ? (
            <Stack gap="xs">{[1, 2, 3].map((i) => <Skeleton key={i} height={44} radius="sm" />)}</Stack>
          ) : sourceSubjects.length === 0 ? (
            <Text size="sm" c="dimmed">No subjects found for {gradeLevelName} in this curriculum.</Text>
          ) : filtered.length === 0 ? (
            <EmptySearchState />
          ) : (
            <>
              <Stack gap={4}>
                {paginated.map((s, i) => {
                  const alreadyAdded = existingSubjectIds.includes(s.subject_id);
                  const isChecked = checked.includes(s.subject_id);
                  const toggle = () => {
                    if (alreadyAdded) return;
                    setChecked((p) => p.includes(s.subject_id) ? p.filter((id) => id !== s.subject_id) : [...p, s.subject_id]);
                  };
                  return (
                    <Tooltip key={s.subject_id} label="Already added to this grade level" disabled={!alreadyAdded} position="right" withArrow>
                      <Box
                        component="label"
                        htmlFor={`sub-${s.subject_id}`}
                        style={{
                          display: "block",
                          border: "1px solid",
                          borderColor: isChecked ? "#4EAE4A" : "#e9ecef",
                          borderRadius: 6,
                          padding: "10px 12px",
                          opacity: alreadyAdded ? 0.5 : 1,
                          backgroundColor: isChecked ? "#f0f7ee" : i % 2 === 0 ? "#fff" : "#fafafa",
                          cursor: alreadyAdded ? "not-allowed" : "pointer",
                          transition: "border-color 0.15s, background-color 0.15s",
                        }}
                      >
                        <Group gap="sm" wrap="nowrap">
                          <Checkbox
                            id={`sub-${s.subject_id}`}
                            checked={isChecked}
                            onChange={toggle}
                            disabled={alreadyAdded}
                            color="#4EAE4A"
                            style={{ pointerEvents: "none" }}
                          />
                          <Text size="xs" fw={600} ff="monospace" c="gray.6" style={{ flexShrink: 0 }}>{s.code}</Text>
                          <Text size="sm" style={{ flex: 1 }}>{s.name}</Text>
                          {s.subject_type === "SSES" && (
                            <Badge variant="filled" size="xs" radius="xl" style={{ backgroundColor: "#70A2FF", color: "#fff", cursor: "default" }}>SSES</Badge>
                          )}
                        </Group>
                      </Box>
                    </Tooltip>
                  );
                })}
              </Stack>
              {totalPages > 1 && (
                <Group justify="center">
                  <Pagination value={page} onChange={setPage} total={totalPages} size="sm" color="#4EAE4A" />
                </Group>
              )}
            </>
          )}
          <Group justify="flex-end">
            <Button
              color="#4EAE4A"
              disabled={checked.length === 0}
              onClick={() => {
                onAdd(sourceSubjects.filter((s) => checked.includes(s.subject_id)).map((s) => ({
                  source: "existing" as const,
                  subject_id: s.subject_id,
                  code: s.code,
                  name: s.name,
                  description: s.description,
                  subject_type: s.subject_type,
                })));
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
function FlowNew({ gradeLevelName, initial, onAdd, onAddExisting, onBack }: {
  gradeLevelName: string;
  initial?: { code: string; name: string; description: string; subject_type: "BOTH" | "SSES" };
  onAdd: (subject: { code: string; name: string; description: string; subject_type: "BOTH" | "SSES" }) => void;
  onAddExisting: (subject: ConflictSubject) => void;
  onBack: () => void;
}) {
  const [checkingCode, setCheckingCode] = useState(false);
  const [conflictSubject, setConflictSubject] = useState<ConflictSubject | null>(null);

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
        if (!/^[A-Za-z0-9 ]+$/.test(v.trim())) return "Only letters, numbers, and spaces are allowed.";
        return null;
      },
      name: (v) => {
        if (!v.trim()) return "Name is required.";
        if (v.trim().length < 3) return "Must be at least 3 characters.";
        if (v.trim().length > 100) return "Must be 100 characters or less.";
        if (!/^[A-Za-z0-9\s,]+$/.test(v.trim())) return "Name must not contain symbols.";
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
    const code = form.values.code.trim().toUpperCase().replace(/\s+/g, " ").replace(/\s/g, "");
    if (!initial || initial.code.replace(/\s/g, "") !== code) {
      setCheckingCode(true);
      const res = await fetch("/api/curriculum/check-subject-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, section_type: form.values.isSses ? "SSES" : "REGULAR" }),
      });
      setCheckingCode(false);
      if (res.status === 409) { const data = await res.json(); setConflictSubject(data.existingSubject ?? null); return; }
      if (!res.ok) { form.setFieldError("code", "Failed to verify subject code. Please try again."); return; }
    }
    onAdd({ code, name: toTitleCase(form.values.name), description: form.values.description.trim(), subject_type: form.values.isSses ? "SSES" : "BOTH" });
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
      <Stack gap="md">
        <BackButton onClick={onBack} mb={4}>Back</BackButton>
        <Text size="sm" c="dimmed">
          {initial ? "Edit subject" : "Create a subject"} for <strong>{gradeLevelName}</strong>.
        </Text>
        <TextInput
          label="Subject Code"
          placeholder="e.g. MATH1"
          required
          {...form.getInputProps("code")}
          onChange={(e) => { setConflictSubject(null); form.getInputProps("code").onChange(e); }}
        />
        {conflictSubject && (
          <Box
            style={{
              border: "1px solid rgba(34, 139, 230, 0.45)",
              borderLeftWidth: 6,
              borderLeftColor: "#228be6",
              borderRadius: 6,
              padding: "12px 14px",
              backgroundColor: "#fff",
            }}
          >
            <Group gap="xs" mb={8} align="center">
              <IconInfoCircle size={14} color="#228be6" style={{ flexShrink: 0 }} />
              <Text size="sm" fw={700}>Subject code already registered</Text>
            </Group>
            <Box mb={10} p="xs" style={{ backgroundColor: "#f8f9fa", borderRadius: 4, border: "1px solid #e9ecef" }}>
              <Group gap="xs" mb={conflictSubject.name ? 2 : 0}>
                <Text size="sm" fw={600} ff="monospace">{conflictSubject.code}</Text>
                {conflictSubject.subject_type === "SSES" && (
                  <Badge variant="filled" size="xs" radius="xl" style={{ backgroundColor: "#70A2FF", color: "#fff", cursor: "default" }}>SSES</Badge>
                )}
              </Group>
              {conflictSubject.name && <Text size="sm" c="dimmed">{conflictSubject.name}</Text>}
            </Box>
            <Group gap="sm">
              <Button size="xs" color="#4EAE4A" onClick={() => onAddExisting(conflictSubject)}>Use existing subject</Button>
              <Button size="xs" variant="default" onClick={() => setConflictSubject(null)}>Dismiss</Button>
            </Group>
          </Box>
        )}
        <TextInput
          label="Name"
          placeholder="e.g. Mathematics 1"
          required
          {...form.getInputProps("name")}
          onBlur={() => { if (form.values.name.trim()) form.setFieldValue("name", toTitleCase(form.values.name)); }}
        />
        <Textarea label="Description" placeholder="Briefly describe the subject" required autosize minRows={3} {...form.getInputProps("description")} />
        <Checkbox
          label={
            <Group gap={4} align="center">
              <span>SSES Exclusive</span>
              <Tooltip label="Check this if the subject is exclusive to SSES sections only." withArrow position="right" multiline w={240}>
                <IconInfoCircle size={14} color="#808898" style={{ cursor: "help", display: "block" }} />
              </Tooltip>
            </Group>
          }
          checked={form.values.isSses}
          onChange={(e) => form.setFieldValue("isSses", e.currentTarget.checked)}
        />
        <Group justify="flex-end">
          <Tooltip
            label="This subject code is already registered. Use the existing subject below or change the code above."
            disabled={!conflictSubject}
            withArrow
            multiline
            w={260}
          >
            <span>
              <Button type="submit" color="#4EAE4A" loading={checkingCode} disabled={!!conflictSubject}>
                {initial ? "Save Changes" : "Create Subject"}
              </Button>
            </span>
          </Tooltip>
        </Group>
      </Stack>
    </form>
  );
}

// ── Subject modal ──────────────────────────────────────────────────────────────
type ModalScreen = "choice" | "existing" | "new";

function SubjectModal({ opened, onClose, gradeLevelId, gradeLevelName, existingSubjectIds, editingSubject, curricula, loadingCurricula, onAddSubjects, onEditSubject, onReplaceWithExisting }: {
  opened: boolean; onClose: () => void; gradeLevelId: number; gradeLevelName: string;
  existingSubjectIds: number[]; editingSubject: Extract<WizardSubject, { source: "new" }> | null;
  curricula: CurriculumOption[]; loadingCurricula: boolean;
  onAddSubjects: (subjects: WizardSubject[]) => void;
  onEditSubject: (tempId: string, updated: { code: string; name: string; description: string; subject_type: "BOTH" | "SSES" }) => void;
  onReplaceWithExisting: (tempId: string, s: ConflictSubject) => void;
}) {
  const [screen, setScreen] = useState<ModalScreen>("choice");
  const skipChoice = !loadingCurricula && curricula.length === 0;
  useEffect(() => { if (opened) setScreen(editingSubject || skipChoice ? "new" : "choice"); }, [opened, editingSubject, skipChoice]);

  const addExisting = (s: ConflictSubject) => {
    if (editingSubject) { onReplaceWithExisting(editingSubject.tempId, s); }
    else { onAddSubjects([{ source: "existing", tempId: crypto.randomUUID(), subject_id: s.subject_id, code: s.code, name: s.name, description: s.description, subject_type: s.subject_type, grade_level_id: gradeLevelId }]); }
    onClose();
  };

  return (
    <Modal opened={opened} onClose={onClose} title={editingSubject ? "Edit Subject" : screen === "new" ? "Create a Subject" : "Add a Subject"} centered size="md" overlayProps={{ backgroundOpacity: 0.5 }}>
      {screen === "choice" && (
        <Stack gap="md">
          <Text size="sm" c="dimmed">How would you like to add a subject to <strong>{gradeLevelName}</strong>?</Text>
          <Box style={{ border: "1px solid #dee2e6", borderRadius: 8, padding: "14px 16px", cursor: "pointer" }} onClick={() => setScreen("existing")}>
            <Text fw={600} size="sm" mb={4}>From another curriculum</Text>
            <Text size="xs" c="dimmed">Import subjects already defined in an existing curriculum.</Text>
          </Box>
          <Box style={{ border: "1px solid #dee2e6", borderRadius: 8, padding: "14px 16px", cursor: "pointer" }} onClick={() => setScreen("new")}>
            <Text fw={600} size="sm" mb={4}>Create a subject</Text>
            <Text size="xs" c="dimmed">Define a brand new subject that doesn't exist yet.</Text>
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
            onAddSubjects(subjects.map((s) => ({ ...s, tempId: crypto.randomUUID(), grade_level_id: gradeLevelId }) as WizardSubject));
            onClose();
          }}
          onBack={() => setScreen("choice")}
        />
      )}
      {screen === "new" && (
        <FlowNew
          gradeLevelName={gradeLevelName}
          initial={editingSubject ? { code: editingSubject.code, name: editingSubject.name, description: editingSubject.description, subject_type: editingSubject.subject_type } : undefined}
          onAdd={(s) => {
            if (editingSubject) { onEditSubject(editingSubject.tempId, s); }
            else { onAddSubjects([{ ...s, source: "new", tempId: crypto.randomUUID(), grade_level_id: gradeLevelId }]); }
            onClose();
          }}
          onAddExisting={addExisting}
          onBack={editingSubject || skipChoice ? onClose : () => setScreen("choice")}
        />
      )}
    </Modal>
  );
}

// ── Member block (inside group modal) ─────────────────────────────────────────
function MemberBlock({ label, subjects, checkedTempIds, occupiedMap, onToggle }: {
  label: string; subjects: WizardSubject[]; checkedTempIds: string[];
  occupiedMap: Map<string, string>; onToggle: (tempId: string) => void;
}) {
  const [opened, setOpened] = useState(false);
  return (
    <Box mb="xs">
      <UnstyledButton
        onClick={() => setOpened((o) => !o)}
        style={{ width: "100%", backgroundColor: "#f0f7ee", padding: "7px 12px", borderRadius: 4 }}
      >
        <Group justify="space-between">
          <Text fw={600} size="sm" c="gray.7">{label}</Text>
          {opened ? <IconChevronUp size={13} color="#808898" /> : <IconChevronDown size={13} color="#808898" />}
        </Group>
      </UnstyledButton>
      <Collapse in={opened}>
        <Box py="xs">
          {subjects.map((s, i) => {
            const inGroup = occupiedMap.get(s.tempId);
            const isChecked = checkedTempIds.includes(s.tempId);
            return (
              <Tooltip key={s.tempId} label={inGroup ? `Already in: ${inGroup}` : undefined} disabled={!inGroup} position="right" withArrow>
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
                    <Text size="xs" fw={600} ff="monospace" c="gray.6" style={{ flexShrink: 0 }}>{s.code}</Text>
                    <Text size="sm" style={{ flex: 1 }}>{s.name}</Text>
                    {s.subject_type === "SSES" && (
                      <Badge variant="filled" size="xs" radius="xl" style={{ backgroundColor: "#70A2FF", color: "#fff", cursor: "default" }}>SSES</Badge>
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

// ── Group modal ────────────────────────────────────────────────────────────────
function GroupModal({ opened, onClose, initial, prefill, existingGroupNames, allSubjects, gradeLevelNames, occupiedMap, onSave }: {
  opened: boolean; onClose: () => void; initial: WizardSubjectGroup | null;
  prefill?: { name: string; memberTempIds: string[] };
  existingGroupNames: string[]; allSubjects: WizardSubject[];
  gradeLevelNames: Map<number, string>; occupiedMap: Map<string, string>;
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
        const dup = existingGroupNames
          .filter((n) => n.toLowerCase() !== (initial?.name ?? "").toLowerCase())
          .some((n) => n.toLowerCase() === lower);
        if (dup) return "A group with this name already exists.";
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
    for (const s of allSubjects) { const arr = map.get(s.grade_level_id) ?? []; arr.push(s); map.set(s.grade_level_id, arr); }
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        const aOccupied = occupiedMap.has(a.tempId) ? 1 : 0;
        const bOccupied = occupiedMap.has(b.tempId) ? 1 : 0;
        if (aOccupied !== bOccupied) return aOccupied - bOccupied;
        const aSSES = a.subject_type === "SSES" ? 0 : 1;
        const bSSES = b.subject_type === "SSES" ? 0 : 1;
        if (aSSES !== bSSES) return aSSES - bSSES;
        return a.code.localeCompare(b.code);
      });
    }
    return map;
  }, [allSubjects, occupiedMap]);

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
    form.setFieldValue("memberTempIds", cur.includes(tempId) ? cur.filter((id) => id !== tempId) : [...cur, tempId]);
  };

  return (
    <Modal opened={opened} onClose={onClose} title={initial ? "Edit Subject Group" : "Create Subject Group"} centered size="md" overlayProps={{ backgroundOpacity: 0.5 }}>
      <Stack gap="md">
        <TextInput label="Subject Group Name" placeholder="e.g. Mathematics" required maxLength={50} description={`${form.values.name.length}/50 characters`} {...form.getInputProps("name")} />
        <Textarea label="Description" placeholder="Describe what this group represents" required autosize minRows={3} maxLength={300} {...form.getInputProps("description")} />
        <Box>
          <Group gap={4} mb={4}>
            <Text size="sm" fw={500}>Members <Text span c="red">*</Text></Text>
          </Group>
          {form.errors.memberTempIds && <Text size="xs" c="red" mb={4}>{form.errors.memberTempIds}</Text>}
          <Box style={{ border: "1px solid #dee2e6", borderRadius: 6, padding: "6px 0", maxHeight: 260, overflowY: "auto" }}>
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
          <Button variant="default" onClick={onClose}>Cancel</Button>
          <Button
            color="#4EAE4A"
            onClick={() => {
              if (form.validate().hasErrors) return;
              onSave({ tempId: initial?.tempId ?? crypto.randomUUID(), name: form.values.name.trim(), description: form.values.description.trim(), memberTempIds: form.values.memberTempIds });
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

// ── Main component ─────────────────────────────────────────────────────────────
interface Props {
  curriculum: CurriculumDetail;
  gradeLevels: GradeLevel[];
  lockedSubjectIds: number[];
  onCancel: () => void;
  onSaved: () => void;
}

export default function EditCurriculumMode({ curriculum, gradeLevels, lockedSubjectIds, onCancel, onSaved }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [checkingName, setCheckingName] = useState(false);
  const busyRef = useRef(false);
  const verifiedNameRef = useRef<string>(curriculum.name.trim());

  const initialValues = useMemo(() => toFormValues(curriculum), []);

  const form = useForm<CreateCurriculumForm>({
    validateInputOnChange: true,
    initialValues,
    validate: { name: validateName, description: validateDescription },
  });

  const yearCreated = new Date(curriculum.created_at).getFullYear();

  const isMobile = useMediaQuery("(max-width: 768px)");
  const confirmModalProps = isMobile
    ? {
        styles: {
          inner: { alignItems: "flex-end", paddingBottom: "20px" },
          content: { width: "100%", maxWidth: "100%", borderRadius: "12px 12px 0 0" },
        },
      }
    : {};

  // Warn before browser close/refresh when dirty
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (form.isDirty()) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [form.isDirty()]);

  // Intercept NavBar / Back link clicks when dirty
  useEffect(() => {
    if (!form.isDirty()) return;
    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest("a[href]");
      if (!anchor) return;
      const href = anchor.getAttribute("href")!;
      if (/^(https?:|#|mailto:|tel:)/.test(href)) return;
      e.preventDefault();
      e.stopPropagation();
      modals.openConfirmModal({
        title: "Discard changes?",
        children: <Text size="sm">You have unsaved changes. Are you sure you want to leave?</Text>,
        labels: { confirm: "Discard", cancel: "Stay" },
        confirmProps: { color: "red" },
        onConfirm: () => router.push(href),
        ...confirmModalProps,
      });
    };
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [form.isDirty(), isMobile]);

  const gradeLevelNames = useMemo(() => {
    const map = new Map<number, string>();
    for (const gl of gradeLevels) map.set(gl.grade_level_id, gl.display_name);
    return map;
  }, [gradeLevels]);

  // ── Curricula for FlowExisting ────────────────────────────────────────────
  const [curricula, setCurricula] = useState<CurriculumOption[]>([]);
  const [loadingCurricula, setLoadingCurricula] = useState(true);
  useEffect(() => {
    getSupabase()
      .from("curriculums")
      .select("curriculum_id, name")
      .is("deleted_at", null)
      .neq("curriculum_id", curriculum.curriculum_id)
      .order("created_at", { ascending: false })
      .then(({ data }: { data: Array<{ curriculum_id: number; name: string }> | null }) => {
        setCurricula((data ?? []).map((c) => ({ value: String(c.curriculum_id), label: c.name })));
        setLoadingCurricula(false);
      });
  }, []);

  // ── Derived state ─────────────────────────────────────────────────────────
  const subjectsByGl = useMemo(() => {
    const map = new Map<number, WizardSubject[]>();
    for (const s of form.values.subjects) { const arr = map.get(s.grade_level_id) ?? []; arr.push(s); map.set(s.grade_level_id, arr); }
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        const aSSES = a.subject_type === "SSES" ? 0 : 1;
        const bSSES = b.subject_type === "SSES" ? 0 : 1;
        if (aSSES !== bSSES) return aSSES - bSSES;
        return a.code.localeCompare(b.code);
      });
    }
    return map;
  }, [form.values.subjects]);

  const missingGls = useMemo(
    () => gradeLevels.filter((gl) => !subjectsByGl.has(gl.grade_level_id)),
    [gradeLevels, subjectsByGl],
  );

  const subjectByTempId = useMemo(() => {
    const map = new Map<string, WizardSubject>();
    for (const s of form.values.subjects) map.set(s.tempId, s);
    return map;
  }, [form.values.subjects]);

  const occupiedTempIds = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of form.values.subject_groups) for (const tid of g.memberTempIds) map.set(tid, g.name);
    return map;
  }, [form.values.subject_groups]);

  const unassigned = useMemo(
    () => form.values.subjects.filter((s) => !occupiedTempIds.has(s.tempId)),
    [form.values.subjects, occupiedTempIds],
  );

  const allSuggestions = useMemo(() => generateSuggestions(form.values.subjects), [form.values.subjects]);

  const sortedGroups = useMemo(
    () => [...form.values.subject_groups].sort((a, b) => a.name.localeCompare(b.name)),
    [form.values.subject_groups],
  );

  // ── Subject modal state ───────────────────────────────────────────────────
  const [activeGl, setActiveGl] = useState<GradeLevel | null>(null);
  const [editingSubject, setEditingSubject] = useState<Extract<WizardSubject, { source: "new" }> | null>(null);

  // ── Group modal state ─────────────────────────────────────────────────────
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [groupModalKey, setGroupModalKey] = useState(0);
  const [editingGroup, setEditingGroup] = useState<WizardSubjectGroup | null>(null);
  const [suggestionPrefill, setSuggestionPrefill] = useState<{ name: string; memberTempIds: string[] } | null>(null);
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(new Set());

  const activeSuggestions = allSuggestions.filter(
    (s) =>
      !dismissedSuggestions.has(s.tempId) &&
      s.memberTempIds.every((tid) => form.values.subjects.some((sub) => sub.tempId === tid) && !occupiedTempIds.has(tid)),
  );

  const occupiedForModal = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of form.values.subject_groups) {
      if (g.tempId === editingGroup?.tempId) continue;
      for (const tid of g.memberTempIds) map.set(tid, g.name);
    }
    return map;
  }, [form.values.subject_groups, editingGroup]);

  // ── Subject handlers ──────────────────────────────────────────────────────
  const handleAddSubjects = (toAdd: WizardSubject[]) =>
    form.setFieldValue("subjects", [...form.values.subjects, ...toAdd]);

  const handleEditSubject = (tempId: string, updated: { code: string; name: string; description: string; subject_type: "BOTH" | "SSES" }) =>
    form.setFieldValue("subjects", form.values.subjects.map((s) => (s.tempId === tempId ? { ...s, ...updated } : s)));

  const handleReplaceWithExisting = (tempId: string, s: ConflictSubject) =>
    form.setFieldValue("subjects", form.values.subjects.map((sub) =>
      sub.tempId === tempId
        ? { source: "existing" as const, tempId, subject_id: s.subject_id, code: s.code, name: s.name, description: s.description, subject_type: s.subject_type, grade_level_id: sub.grade_level_id }
        : sub,
    ));

  const handleRemoveSubject = (tempId: string) => {
    form.setFieldValue("subjects", form.values.subjects.filter((s) => s.tempId !== tempId));
    form.setFieldValue("subject_groups", form.values.subject_groups.map((g) => ({ ...g, memberTempIds: g.memberTempIds.filter((id) => id !== tempId) })));
  };

  const confirmRemoveSubject = (s: WizardSubject, glName: string) => {
    let modalId!: string;
    modalId = modals.openConfirmModal({
      title: "Remove subject?",
      children: (
        <>
          <EnterToConfirm onEnter={() => { handleRemoveSubject(s.tempId); modals.close(modalId); }} />
          <Text size="sm">
            Remove <strong>{s.name}</strong> (<Text span ff="monospace">{s.code}</Text>) from {glName}?
            {s.source === "existing" ? " This will also unassign it from any subject group." : " Any unsaved changes will be lost."}
          </Text>
        </>
      ),
      labels: { confirm: "Remove", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: () => handleRemoveSubject(s.tempId),
      ...confirmModalProps,
    });
  };

  // ── Group handlers ────────────────────────────────────────────────────────
  const handleSaveGroup = (group: WizardSubjectGroup) => {
    if (editingGroup) {
      form.setFieldValue("subject_groups", form.values.subject_groups.map((g) => (g.tempId === editingGroup.tempId ? group : g)));
      notify({ type: "success", title: "Group Updated", message: `${group.name} has been updated.` });
    } else {
      form.setFieldValue("subject_groups", [...form.values.subject_groups, group]);
      notify({ type: "success", title: "Group Created", message: `${group.name} has been created.` });
    }
    setEditingGroup(null);
    setSuggestionPrefill(null);
  };

  const confirmRemoveGroup = (g: WizardSubjectGroup) => {
    let modalId!: string;
    modalId = modals.openConfirmModal({
      title: "Remove subject group?",
      children: (
        <>
          <EnterToConfirm onEnter={() => {
            form.setFieldValue("subject_groups", form.values.subject_groups.filter((x) => x.tempId !== g.tempId));
            notify({ type: "success", title: "Group Removed", message: `${g.name} has been removed.` });
            modals.close(modalId);
          }} />
          <Text size="sm">Remove <strong>{g.name}</strong>? Subjects in this group will become unassigned.</Text>
        </>
      ),
      labels: { confirm: "Remove", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: () => {
        form.setFieldValue("subject_groups", form.values.subject_groups.filter((x) => x.tempId !== g.tempId));
        notify({ type: "success", title: "Group Removed", message: `${g.name} has been removed.` });
      },
      ...confirmModalProps,
    });
  };

  const existingSubjectIdsForGl = (glId: number): number[] =>
    (subjectsByGl.get(glId) ?? [])
      .filter((s): s is Extract<WizardSubject, { source: "existing" }> => s.source === "existing")
      .map((s) => s.subject_id);

  // ── Validation + save ─────────────────────────────────────────────────────
  const validate = async (): Promise<boolean> => {
    const result = form.validate();
    if (result.errors.name || result.errors.description) {
      notify({ type: "error", title: "Validation Error", message: "Please fix all errors before saving." });
      return false;
    }
    if (form.values.subjects.length === 0) {
      notify({ type: "error", title: "No Subjects", message: "Add at least one subject before saving." });
      return false;
    }
    if (missingGls.length > 0) {
      notify({ type: "error", title: "Missing Subjects", message: `Every grade level needs at least one subject. Missing: ${missingGls.map((gl) => gl.display_name).join(", ")}`, autoClose: 7000 });
      return false;
    }
    if (form.values.subject_groups.length === 0) {
      notify({ type: "error", title: "No Subject Groups", message: "Create at least one subject group before saving." });
      return false;
    }
    const occupiedSet = new Set(form.values.subject_groups.flatMap((g) => g.memberTempIds));
    const unassignedCount = form.values.subjects.filter((s) => !occupiedSet.has(s.tempId)).length;
    if (unassignedCount > 0) {
      notify({ type: "error", title: "Unassigned Subjects", message: `All subjects must be in a group. ${unassignedCount} subject(s) still unassigned.` });
      return false;
    }
    const trimmedName = form.values.name.trim();
    if (verifiedNameRef.current !== trimmedName) {
      if (busyRef.current) return false;
      busyRef.current = true;
      setCheckingName(true);
      try {
        const res = await fetch("/api/curriculum/check-name", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: trimmedName, exclude_id: curriculum.curriculum_id }) });
        const data = await res.json();
        if (!data.available) {
          form.setFieldError("name", "A curriculum with this name already exists.");
          notify({ type: "error", title: "Name Taken", message: "Please choose a different curriculum name." });
          return false;
        }
        verifiedNameRef.current = trimmedName;
      } catch {
        notify({ type: "error", title: "Error", message: "Failed to verify curriculum name." });
        return false;
      } finally {
        busyRef.current = false;
        setCheckingName(false);
      }
    }
    return true;
  };

  const handleSave = async () => {
    if (!(await validate())) return;
    modals.openConfirmModal({
      title: "Save changes?",
      children: <Text size="sm">Save changes to <strong>{form.values.name.trim()}</strong>?</Text>,
      labels: { confirm: "Save Changes", cancel: "Cancel" },
      confirmProps: { style: { backgroundColor: "#4EAE4A" } },
      onConfirm: submitSave,
      ...confirmModalProps,
    });
  };

  const submitSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/curriculum/update-full", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ curriculum_id: curriculum.curriculum_id, name: form.values.name.trim(), description: form.values.description.trim(), subjects: form.values.subjects, subject_groups: form.values.subject_groups }),
      });
      const data = await res.json();
      if (!res.ok) { notify({ type: "error", title: "Error", message: data.error ?? "Failed to save changes." }); return; }
      notify({ type: "success", title: "Saved", message: "Curriculum updated successfully." });
      onSaved();
    } catch {
      notify({ type: "error", title: "Error", message: "Network error. Please try again." });
    } finally {
      setSaving(false);
    }
  };

  const handleRevert = () => {
    modals.openConfirmModal({
      title: "Revert changes?",
      children: <Text size="sm">All unsaved changes will be lost and the form will return to its original state.</Text>,
      labels: { confirm: "Revert", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: () => { form.setValues(initialValues); form.resetDirty(initialValues); verifiedNameRef.current = curriculum.name.trim(); },
      ...confirmModalProps,
    });
  };

  const handleCancel = () => {
    if (form.isDirty()) {
      modals.openConfirmModal({
        title: "Discard changes?",
        children: <Text size="sm">You have unsaved changes. Are you sure you want to cancel?</Text>,
        labels: { confirm: "Discard", cancel: "Stay" },
        confirmProps: { color: "red" },
        onConfirm: onCancel,
        ...confirmModalProps,
      });
    } else {
      onCancel();
    }
  };

  return (
    <Stack gap="md">

      {/* About — editable */}
      <Paper withBorder p="md" radius="md" w={{ base: "100%", md: "50%" }}>
        <Text fw={700} size="md" mb="sm">About</Text>
        <Stack gap="xs">
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <IconBook size={16} color="#808898" style={{ flexShrink: 0, marginTop: 8 }} />
            <Text size="sm" style={{ flexShrink: 0, marginTop: 8 }}>Name:</Text>
            <Stack gap={2} style={{ flex: 1 }}>
              <TextInput size="sm" required maxLength={50} {...form.getInputProps("name")} onChange={(e) => { verifiedNameRef.current = ""; form.getInputProps("name").onChange(e); }} />
              <Text size="xs" c="dimmed">{form.values.name.length}/50 characters</Text>
            </Stack>
            {curriculum.is_active && (
              <Badge color="#4EAE4A" variant="light" size="sm" style={{ flexShrink: 0, marginTop: 8 }}>Active</Badge>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <IconFileDescription size={16} color="#808898" style={{ flexShrink: 0, marginTop: 8 }} />
            <Text size="sm" style={{ flexShrink: 0, marginTop: 8 }}>Description:</Text>
            <Stack gap={2} style={{ flex: 1 }}>
              <Textarea size="sm" required autosize minRows={2} maxLength={500} {...form.getInputProps("description")} />
              <Text size="xs" c="dimmed">{form.values.description.length}/500 characters</Text>
            </Stack>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <IconCalendar size={16} color="#808898" style={{ flexShrink: 0 }} />
            <Text size="sm">Year Created: {yearCreated}</Text>
          </div>
        </Stack>
      </Paper>

      {/* Subject Groups */}
      <CollapsibleSection title="Subject Groups" defaultOpen>

        {/* Unassigned / all-assigned banner */}
        {unassigned.length > 0 ? (
          <Box
            mb="md"
            style={{ border: "1px solid #e03131", borderRadius: 6, padding: "8px 14px", backgroundColor: "#fff5f5" }}
          >
            <Group gap="xs" mb="xs">
              <Badge color="red" variant="light" size="sm">{unassigned.length}</Badge>
              <Text size="sm" fw={600} c="red">{unassigned.length} subject{unassigned.length > 1 ? "s" : ""} not yet assigned to a group</Text>
            </Group>
            <Group gap={5} wrap="wrap">
              {unassigned.map((s) => (
                <SubjectCodeBadge key={s.tempId} code={s.code} name={s.name} subject_type={s.subject_type} />
              ))}
            </Group>
          </Box>
        ) : (
          <Box mb="md" style={{ border: "1px solid #4EAE4A", borderRadius: 6, padding: "8px 14px", backgroundColor: "#f6fff6" }}>
            <Group gap="xs">
              <IconCheck size={15} color="#4EAE4A" />
              <Text size="sm" fw={600} c="#4EAE4A">All subjects assigned</Text>
            </Group>
          </Box>
        )}

        {/* Suggestions */}
        {activeSuggestions.length > 0 && (
          <Box
            mb="md"
            p="md"
            style={{ border: "1px solid #d0e4cc", borderRadius: "8px", backgroundColor: "#f7fbf7" }}
          >
            <Group gap="xs" mb="sm" align="center">
              <Text size="sm" fw={600} c="gray.7">Suggested Groups</Text>
              <Tooltip label="Based on naming patterns in your subjects." position="right" withArrow multiline w={260}>
                <IconInfoCircle size={14} color="#808898" style={{ cursor: "help" }} />
              </Tooltip>
            </Group>
            <Stack gap="xs">
              {activeSuggestions.map((sug) => (
                <Box
                  key={sug.tempId}
                  style={{ border: "1px solid #d0e4cc", borderLeft: "3px solid #4EAE4A", borderRadius: 6, overflow: "hidden", backgroundColor: "#fff" }}
                >
                  <Group justify="space-between" wrap="nowrap" gap="sm" px="md" py="sm" style={{ backgroundColor: "#f0f7ee" }}>
                    <Text size="sm" fw={600} c="gray.8" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
                      {sug.name}
                    </Text>
                    <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
                      <Button
                        size="xs"
                        variant="filled"
                        color="#4EAE4A"
                        onClick={() => {
                          setEditingGroup(null);
                          setSuggestionPrefill({ name: sug.name, memberTempIds: sug.memberTempIds });
                          setDismissedSuggestions((p) => new Set([...p, sug.tempId]));
                          setGroupModalKey((k) => k + 1);
                          setGroupModalOpen(true);
                        }}
                      >
                        Accept
                      </Button>
                      <Tooltip label="Dismiss suggestion" withArrow position="top">
                        <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => setDismissedSuggestions((p) => new Set([...p, sug.tempId]))}>
                          <IconX size={12} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Group>
                  <Group px="md" py="sm" gap={5} wrap="wrap">
                    {sug.memberTempIds.map((tid) => {
                      const s = subjectByTempId.get(tid);
                      return s ? <SubjectCodeBadge key={tid} code={s.code} name={s.name} subject_type={s.subject_type} /> : null;
                    })}
                  </Group>
                </Box>
              ))}
            </Stack>
          </Box>
        )}

        {/* Groups table */}
        {sortedGroups.length > 0 && (
          <Box style={{ border: "1px solid #dee2e6", borderRadius: 6, overflow: "hidden" }} mb="sm">
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
                  {sortedGroups.map((g) => (
                    <tr key={g.tempId} style={{ borderTop: "1px solid #dee2e6" }}>
                      <td style={{ padding: "8px 12px" }}><Text size="sm" fw={500}>{g.name}</Text></td>
                      <td style={{ padding: "8px 12px" }}><Text size="sm" c="dimmed">{g.description || "—"}</Text></td>
                      <td style={{ padding: "8px 12px" }}>
                        <Group gap={5} wrap="wrap">
                          {g.memberTempIds.length === 0 ? (
                            <Text size="xs" c="dimmed">No members</Text>
                          ) : (
                            g.memberTempIds.map((tid) => {
                              const s = subjectByTempId.get(tid);
                              return s ? <SubjectCodeBadge key={tid} code={s.code} name={s.name} subject_type={s.subject_type} /> : null;
                            })
                          )}
                        </Group>
                      </td>
                      <td style={{ padding: "8px 12px" }}>
                        <Group gap={4} wrap="nowrap">
                          <Tooltip label="Edit" withArrow>
                            <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => { setEditingGroup(g); setSuggestionPrefill(null); setGroupModalOpen(true); }}>
                              <IconPencil size={16} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label="Remove" withArrow>
                            <ActionIcon size="sm" variant="subtle" color="red" onClick={() => confirmRemoveGroup(g)}>
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
              <Box px="xs">
                {sortedGroups.map((g) => (
                  <GroupMobileCard
                    key={g.tempId}
                    g={g}
                    subjectByTempId={subjectByTempId}
                    onEdit={() => { setEditingGroup(g); setSuggestionPrefill(null); setGroupModalOpen(true); }}
                    onRemove={() => confirmRemoveGroup(g)}
                  />
                ))}
              </Box>
            </div>
          </Box>
        )}

        {/* Add button */}
        <Box style={{ border: "1px solid #4EAE4A", borderRadius: "6px" }}>
          <Button
            variant="subtle"
            color="#4EAE4A"
            size="sm"
            fullWidth
            leftSection={<IconPlus size={14} />}
            onClick={() => { setEditingGroup(null); setSuggestionPrefill(null); setGroupModalKey((k) => k + 1); setGroupModalOpen(true); }}
          >
            Add a subject group
          </Button>
        </Box>

        <GroupModal
          key={editingGroup?.tempId ?? (suggestionPrefill ? `prefill-${groupModalKey}` : `new-${groupModalKey}`)}
          opened={groupModalOpen}
          onClose={() => {
            if (suggestionPrefill) {
              setDismissedSuggestions((p) => {
                const next = new Set(p);
                const sug = activeSuggestions.find((s) => s.name === suggestionPrefill.name);
                if (sug) next.delete(sug.tempId);
                return next;
              });
            }
            setGroupModalOpen(false);
            setEditingGroup(null);
            setSuggestionPrefill(null);
          }}
          initial={editingGroup}
          prefill={suggestionPrefill ?? undefined}
          existingGroupNames={form.values.subject_groups.map((g) => g.name)}
          allSubjects={form.values.subjects}
          gradeLevelNames={gradeLevelNames}
          occupiedMap={occupiedForModal}
          onSave={handleSaveGroup}
        />
      </CollapsibleSection>

      {/* Grade level sections */}
      {gradeLevels.map((gl) => {
        const glSubjects = subjectsByGl.get(gl.grade_level_id) ?? [];
        return (
          <CollapsibleSection key={gl.grade_level_id} title={gl.display_name}>
            <Stack gap="sm">
              {glSubjects.length > 0 && (
                <>
                  {/* Desktop */}
                  <div className="hidden sm:block">
                    <Table withColumnBorders withTableBorder fz="sm" style={{ "--table-border-color": "#ced4da" } as React.CSSProperties}>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th style={{ ...greenTh, width: 130 }}>Subject Code</Table.Th>
                          <Table.Th style={{ ...greenTh, width: 210 }}>Title</Table.Th>
                          <Table.Th style={greenTh}>Description</Table.Th>
                          <Table.Th style={{ ...greenTh, width: 80 }}></Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {glSubjects.map((s) => {
                          const locked = s.source === "existing" && lockedSubjectIds.includes(s.subject_id);
                          const lockedTooltip = "This subject has records (exams or teacher assignments) and cannot be modified or removed.";
                          return (
                            <Table.Tr key={s.tempId}>
                              <Table.Td>
                                <Group gap={4}>
                                  <Text size="sm" fw={500} ff="monospace">{s.code}</Text>
                                  {s.subject_type === "SSES" && (
                                    <Badge variant="filled" size="xs" radius="xl" style={{ backgroundColor: "#70A2FF", color: "#fff", cursor: "default" }}>SSES</Badge>
                                  )}
                                </Group>
                              </Table.Td>
                              <Table.Td><Text size="sm">{s.name}</Text></Table.Td>
                              <Table.Td><Text size="sm" c="dimmed">{s.description ?? ""}</Text></Table.Td>
                              <Table.Td>
                                <Group gap={4} wrap="nowrap" justify="flex-end">
                                  <Tooltip label={locked ? lockedTooltip : s.source === "existing" ? "Imported subjects cannot be edited" : "Edit"} withArrow multiline w={220}>
                                    <ActionIcon
                                      size="sm" variant="subtle" color="gray"
                                      disabled={locked || s.source === "existing"}
                                      onClick={() => {
                                        if (!locked && s.source === "new") {
                                          setEditingSubject(s as Extract<WizardSubject, { source: "new" }>);
                                          setActiveGl(gl);
                                        }
                                      }}
                                    >
                                      <IconPencil size={16} />
                                    </ActionIcon>
                                  </Tooltip>
                                  <Tooltip label={locked ? lockedTooltip : "Remove"} withArrow multiline w={220}>
                                    <ActionIcon size="sm" variant="subtle" color="red" disabled={locked} onClick={() => !locked && confirmRemoveSubject(s, gl.display_name)}>
                                      <IconTrash size={16} />
                                    </ActionIcon>
                                  </Tooltip>
                                </Group>
                              </Table.Td>
                            </Table.Tr>
                          );
                        })}
                      </Table.Tbody>
                    </Table>
                  </div>
                  {/* Mobile */}
                  <div className="sm:hidden">
                    {glSubjects.map((s) => {
                      const locked = s.source === "existing" && lockedSubjectIds.includes(s.subject_id);
                      return (
                        <SubjectMobileRow
                          key={s.tempId}
                          s={s}
                          locked={locked}
                          onEdit={() => {
                            if (!locked && s.source === "new") {
                              setEditingSubject(s as Extract<WizardSubject, { source: "new" }>);
                              setActiveGl(gl);
                            }
                          }}
                          onRemove={() => !locked && confirmRemoveSubject(s, gl.display_name)}
                        />
                      );
                    })}
                  </div>
                </>
              )}
              <Box style={{ border: "1px solid #4EAE4A", borderRadius: "6px" }}>
                <Button variant="subtle" color="#4EAE4A" size="sm" fullWidth onClick={() => { setEditingSubject(null); setActiveGl(gl); }}>
                  + Add a subject
                </Button>
              </Box>
            </Stack>
          </CollapsibleSection>
        );
      })}

      {/* Actions */}
      <Group justify="flex-end" mt="sm">
        <Button variant="default" onClick={handleCancel}>Cancel</Button>
        <Button variant="outline" color="red" onClick={handleRevert} disabled={!form.isDirty()}>Revert Changes</Button>
        <Button color="#4EAE4A" loading={saving || checkingName} onClick={handleSave}>Save Changes</Button>
      </Group>

      {/* Subject modal */}
      {activeGl && (
        <SubjectModal
          opened
          onClose={() => { setActiveGl(null); setEditingSubject(null); }}
          gradeLevelId={activeGl.grade_level_id}
          gradeLevelName={activeGl.display_name}
          existingSubjectIds={existingSubjectIdsForGl(activeGl.grade_level_id)}
          editingSubject={editingSubject}
          curricula={curricula}
          loadingCurricula={loadingCurricula}
          onAddSubjects={handleAddSubjects}
          onEditSubject={handleEditSubject}
          onReplaceWithExisting={handleReplaceWithExisting}
        />
      )}
    </Stack>
  );
}
