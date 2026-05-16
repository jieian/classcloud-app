"use client";

import { useEffect, useState, useMemo, useRef } from "react";
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
  Pagination,
  Paper,
  Select,
  Skeleton,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Loader,
  ThemeIcon,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { useForm } from "@mantine/form";
import {
  IconAlertTriangle,
  IconChevronDown,
  IconChevronRight,
  IconChevronUp,
  IconInfoCircle,
  IconPencil,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import BackButton from "@/components/BackButton";
import { notify } from "@/components/notificationIcon/notificationIcon";
import { SearchBar } from "@/components/searchBar/SearchBar";
import EmptySearchState from "@/components/EmptySearchState";
import {
  detectSubjectPatterns,
  type SubjectSuggestionCandidate,
} from "../../_lib/subjectSuggestions";
import { getSupabase } from "@/lib/supabase/client";
import type { UseFormReturnType } from "@mantine/form";
import type {
  CreateCurriculumForm,
  GradeLevel,
  WizardSubject,
} from "../_lib/types";

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

const subjectTh: React.CSSProperties = {
  backgroundColor: "#4EAE4A",
  color: "#fff",
  fontWeight: 600,
  padding: "8px 12px",
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
        Importing into <strong>{gradeLevelName}</strong>. Select a curriculum,
        then choose the subjects to add.
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
          <SearchBar
            placeholder="Search by code or name..."
            value={search}
            onChange={(e) => {
              setSearch(e.currentTarget.value);
              setPage(1);
            }}
          />

          {loadingSubjects ? (
            <Stack gap="xs">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} height={44} radius="sm" />
              ))}
            </Stack>
          ) : sourceSubjects.length === 0 ? (
            <Text size="sm" c="dimmed">
              No subjects found for {gradeLevelName} in this curriculum.
            </Text>
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
                    setChecked((p) =>
                      p.includes(s.subject_id)
                        ? p.filter((id) => id !== s.subject_id)
                        : [...p, s.subject_id],
                    );
                  };

                  return (
                    <Tooltip
                      key={s.subject_id}
                      label="Already added to this grade level"
                      disabled={!alreadyAdded}
                      position="right"
                      withArrow
                    >
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
              </Stack>

              {totalPages > 1 && (
                <Group justify="center">
                  <Pagination
                    value={page}
                    onChange={setPage}
                    total={totalPages}
                    size="sm"
                    color="#4EAE4A"
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
                const selected = sourceSubjects.filter((s) =>
                  checked.includes(s.subject_id),
                );
                onAdd(
                  selected.map((s) => ({
                    source: "existing" as const,
                    subject_id: s.subject_id,
                    code: s.code,
                    name: s.name,
                    description: s.description,
                    subject_type: s.subject_type,
                  })),
                );
                notify({
                  type: "success",
                  title: "Subjects Added",
                  message: `${selected.length} subject${selected.length > 1 ? "s" : ""} added to ${gradeLevelName}.`,
                });
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
  currentGradeLevelId,
  wizardSubjects,
  gradeLevelNames,
  editingTempId,
  initial,
  onAdd,
  onAddExisting,
  onBack,
}: {
  gradeLevelName: string;
  currentGradeLevelId: number;
  wizardSubjects: WizardSubject[];
  gradeLevelNames: Map<number, string>;
  editingTempId?: string;
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
  onBack?: () => void;
}) {
  const [checkingCode, setCheckingCode] = useState(false);
  const [conflictSubject, setConflictSubject] =
    useState<ConflictSubject | null>(null);
  const conflictSubjectRef = useRef<ConflictSubject | null>(null);
  conflictSubjectRef.current = conflictSubject;

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
        if (!/^[A-Za-z0-9 ]+$/.test(v.trim()))
          return "Only letters, numbers, and spaces are allowed.";
        return null;
      },
      name: (v) => {
        if (!v.trim()) return "Name is required.";
        if (v.trim().length < 3) return "Must be at least 3 characters.";
        if (v.trim().length > 100) return "Must be 100 characters or less.";
        if (!/^[A-Za-z0-9\s,]+$/.test(v.trim()))
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

  // Re-evaluate when SSES toggle changes while a conflict is showing
  useEffect(() => {
    if (!conflictSubjectRef.current) return;
    const code = form.values.code.trim().toUpperCase().replace(/\s+/g, " ").replace(/\s/g, "");
    if (!code) return;
    setConflictSubject(null);
    setCheckingCode(true);
    fetch("/api/curriculum/check-subject-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, section_type: form.values.isSses ? "SSES" : "REGULAR" }),
    }).then(async (res) => {
      if (res.status === 409) {
        const data = await res.json();
        setConflictSubject(data.existingSubject ?? null);
      }
    }).catch(() => {}).finally(() => setCheckingCode(false));
  }, [form.values.isSses]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit() {
    if (form.validate().hasErrors) return;
    const code = form.values.code.trim().toUpperCase().replace(/\s+/g, " ");
    const normalizedCode = code.replace(/\s/g, "");

    // Same grade level: outright block
    const sameGlDupe = wizardSubjects.find(
      (s) =>
        s.code.toUpperCase().replace(/\s/g, "") === normalizedCode &&
        s.grade_level_id === currentGradeLevelId &&
        s.tempId !== editingTempId,
    );
    if (sameGlDupe) {
      form.setFieldError(
        "code",
        "This subject code is already added to this grade level.",
      );
      return;
    }

    // Different grade level: block — subjects are not shared across grade levels
    const diffGlConflict = wizardSubjects.find(
      (s) =>
        s.code.toUpperCase().replace(/\s/g, "") === normalizedCode &&
        s.grade_level_id !== currentGradeLevelId &&
        s.tempId !== editingTempId,
    );
    if (diffGlConflict) {
      form.setFieldError(
        "code",
        `This code is already assigned to ${gradeLevelNames.get(diffGlConflict.grade_level_id) ?? "another grade level"} in this curriculum.`,
      );
      return;
    }

    if (!initial || initial.code.replace(/\s/g, "") !== normalizedCode) {
      setCheckingCode(true);
      const res = await fetch("/api/curriculum/check-subject-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: normalizedCode,
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
      code: normalizedCode,
      name: toTitleCase(form.values.name),
      description: form.values.description.trim(),
      subject_type: form.values.isSses ? "SSES" : "BOTH",
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
    >
      <Stack gap="md">
        {onBack && (
          <BackButton onClick={onBack} mb={4}>
            Back
          </BackButton>
        )}

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
              border: "1px solid rgba(245, 159, 0, 0.45)",
              borderLeftWidth: 4,
              borderLeftColor: "#f59f00",
              borderRadius: 6,
              padding: "12px 14px",
              backgroundColor: "#fff",
            }}
          >
            <Group gap="xs" mb={8} align="center">
              <IconAlertTriangle size={14} color="#f59f00" style={{ flexShrink: 0 }} />
              <Text size="sm" fw={700}>
                Subject code already registered
              </Text>
            </Group>
            <Box
              mb={10}
              p="xs"
              style={{ backgroundColor: "#f8f9fa", borderRadius: 4, border: "1px solid #e9ecef" }}
            >
              <Group gap="xs" mb={conflictSubject.name ? 2 : 0}>
                <Text size="sm" fw={600} ff="monospace">
                  {conflictSubject.code}
                </Text>
                {conflictSubject.subject_type === "SSES" && (
                  <Badge color="blue" variant="filled" size="xs" radius="xl" style={{ cursor: "default" }}>
                    SSES
                  </Badge>
                )}
              </Group>
              {conflictSubject.name && (
                <Text size="sm" c="dimmed">{conflictSubject.name}</Text>
              )}
            </Box>
            <Group gap="sm">
              <Button size="xs" color="#4EAE4A" onClick={() => onAddExisting(conflictSubject)}>
                Use existing subject
              </Button>
              <Button size="xs" variant="default" onClick={() => setConflictSubject(null)}>
                Dismiss
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
          label={
            <Group gap={4} align="center">
              <span>SSES Exclusive</span>
              <Tooltip
                label="Check this if the subject is exclusive to SSES sections only."
                withArrow
                position="right"
                multiline
                w={240}
              >
                <IconInfoCircle
                  size={14}
                  color="#808898"
                  style={{ cursor: "help", display: "block" }}
                />
              </Tooltip>
            </Group>
          }
          checked={form.values.isSses}
          onChange={(e) =>
            form.setFieldValue("isSses", e.currentTarget.checked)
          }
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
              <Button
                type="submit"
                color="#4EAE4A"
                loading={checkingCode}
                disabled={!!conflictSubject}
              >
                {initial ? "Save Changes" : "Create Subject"}
              </Button>
            </span>
          </Tooltip>
        </Group>
      </Stack>
    </form>
  );
}

// ── Subject suggestions ───────────────────────────────────────────────────────

type SuggestionPhase =
  | { phase: "checking" }
  | { phase: "new" }
  | { phase: "existing"; existingSubject: ConflictSubject }
  | { phase: "skip" };

interface BatchItem {
  candidate: SubjectSuggestionCandidate;
  existingSubject?: ConflictSubject;
}

function SuggestedSubjects({
  candidates,
  dismissedKeys,
  onDismiss,
  onAcceptNew,
  onAcceptExisting,
  onAcceptBatch,
}: {
  candidates: SubjectSuggestionCandidate[];
  dismissedKeys: Set<string>;
  onDismiss: (key: string) => void;
  onAcceptNew: (candidate: SubjectSuggestionCandidate) => void;
  onAcceptExisting: (
    candidate: SubjectSuggestionCandidate,
    existing: ConflictSubject,
  ) => void;
  onAcceptBatch: (items: BatchItem[]) => void;
}) {
  const [statusMap, setStatusMap] = useState<Map<string, SuggestionPhase>>(
    () => new Map(),
  );
  // Tracks which keys have been checked (or are in-flight) to avoid duplicate fetches
  const checkedKeysRef = useRef(new Set<string>());

  useEffect(() => {
    const unchecked = candidates.filter(
      (c) => !checkedKeysRef.current.has(c.key),
    );
    if (unchecked.length === 0) return;

    const controller = new AbortController();
    const keys = unchecked.map((c) => c.key);

    // Mark as claimed before the async work so concurrent effects don't double-fire
    for (const key of keys) checkedKeysRef.current.add(key);

    setStatusMap((prev) => {
      const next = new Map(prev);
      for (const c of unchecked) next.set(c.key, { phase: "checking" });
      return next;
    });

    Promise.all(
      unchecked.map(async (c): Promise<[string, SuggestionPhase] | null> => {
        try {
          const res = await fetch("/api/curriculum/check-subject-code", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code: c.code, section_type: c.subject_type }),
            signal: controller.signal,
          });
          if (res.status === 409) {
            const data = await res.json();
            if (data.existingSubject) {
              return [
                c.key,
                { phase: "existing", existingSubject: data.existingSubject },
              ];
            }
            return [c.key, { phase: "skip" }];
          }
          return [c.key, res.ok ? { phase: "new" } : { phase: "skip" }];
        } catch {
          return controller.signal.aborted ? null : [c.key, { phase: "skip" }];
        }
      }),
    ).then((results) => {
      if (controller.signal.aborted) return;
      setStatusMap((prev) => {
        const next = new Map(prev);
        for (const r of results) if (r) next.set(r[0], r[1]);
        return next;
      });
    });

    return () => {
      controller.abort();
      // Release claimed keys so they re-check if candidates reappear after abort
      for (const key of keys) checkedKeysRef.current.delete(key);
    };
  }, [candidates]); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = candidates.filter(
    (c) => !dismissedKeys.has(c.key) && statusMap.get(c.key)?.phase !== "skip",
  );

  // Group visible candidates by groupName, preserving detection order
  const groups = useMemo(() => {
    const map = new Map<string, SubjectSuggestionCandidate[]>();
    for (const c of visible) {
      const arr = map.get(c.groupName) ?? [];
      arr.push(c);
      map.set(c.groupName, arr);
    }
    return Array.from(map.entries());
  }, [visible]);

  if (groups.length === 0) return null;

  return (
    <Box mb="md">
      <Group gap="xs" mb="sm" align="center">
        <Text size="sm" fw={600} c="gray.7">
          Suggested Subjects
        </Text>
        <Tooltip
          label="Detected from naming patterns across grade levels."
          position="right"
          withArrow
          multiline
          w={280}
        >
          <IconInfoCircle size={14} color="#808898" style={{ cursor: "help" }} />
        </Tooltip>
      </Group>

      <Stack gap="xs">
        {groups.map(([groupName, groupCandidates]) => (
          <SuggestionGroup
            key={groupName}
            groupName={groupName}
            candidates={groupCandidates}
            statusMap={statusMap}
            onAcceptNew={onAcceptNew}
            onAcceptExisting={onAcceptExisting}
            onAcceptBatch={onAcceptBatch}
            onDismiss={onDismiss}
          />
        ))}
      </Stack>
    </Box>
  );
}

function SuggestionGroup({
  groupName,
  candidates,
  statusMap,
  onAcceptNew,
  onAcceptExisting,
  onAcceptBatch,
  onDismiss,
}: {
  groupName: string;
  candidates: SubjectSuggestionCandidate[];
  statusMap: Map<string, SuggestionPhase>;
  onAcceptNew: (c: SubjectSuggestionCandidate) => void;
  onAcceptExisting: (
    c: SubjectSuggestionCandidate,
    existing: ConflictSubject,
  ) => void;
  onAcceptBatch: (items: BatchItem[]) => void;
  onDismiss: (key: string) => void;
}) {
  const [opened, { toggle }] = useDisclosure(false);

  const anyChecking = candidates.some((c) => {
    const s = statusMap.get(c.key);
    return !s || s.phase === "checking";
  });

  const allExisting = candidates.every(
    (c) => statusMap.get(c.key)?.phase === "existing",
  );

  function acceptAll() {
    const batch: BatchItem[] = [];
    for (const c of candidates) {
      const status = statusMap.get(c.key);
      if (!status || status.phase === "checking") continue;
      if (status.phase === "existing")
        batch.push({ candidate: c, existingSubject: status.existingSubject });
      else if (status.phase === "new") batch.push({ candidate: c });
    }
    onAcceptBatch(batch);
  }

  return (
    <Box
      style={{
        border: "1px solid #d0e4cc",
        borderLeft: "3px solid #4EAE4A",
        borderRadius: 6,
        overflow: "hidden",
        opacity: anyChecking ? 0.65 : 1,
        backgroundColor: "#fff",
        transition: "opacity 0.2s",
      }}
    >
      {/* Header */}
      <Group
        justify="space-between"
        px="md"
        py="sm"
        style={{
          backgroundColor: "#f0f7ee",
          borderBottom: opened ? "1px solid #d0e4cc" : undefined,
        }}
      >
        <UnstyledButton onClick={toggle} style={{ flex: 1, minWidth: 0 }}>
          <Group gap="sm" align="center">
            <Text size="sm" fw={600} c="gray.8">
              {groupName}
            </Text>
            <Text size="xs" c="dimmed">
              {candidates.length} grade level{candidates.length > 1 ? "s" : ""}
            </Text>
          </Group>
        </UnstyledButton>
        <Group gap="sm" wrap="nowrap">
          {candidates.length > 1 && (
            <Button
              size="xs"
              variant="filled"
              color="#4EAE4A"
              disabled={anyChecking}
              onClick={acceptAll}
            >
              {allExisting ? "Import All" : "Accept All"}
            </Button>
          )}
          <UnstyledButton onClick={toggle} style={{ lineHeight: 1 }}>
            {opened ? (
              <IconChevronUp size={14} color="#808898" />
            ) : (
              <IconChevronDown size={14} color="#808898" />
            )}
          </UnstyledButton>
        </Group>
      </Group>

      {/* Collapsible rows */}
      <Collapse in={opened}>
        <Stack gap={0}>
          {candidates.map((c, i) => {
            const status = statusMap.get(c.key);
            const isChecking = !status || status.phase === "checking";
            const isExisting = status?.phase === "existing";
            const existingSubject = isExisting
              ? (status as Extract<SuggestionPhase, { phase: "existing" }>)
                  .existingSubject
              : null;

            return (
              <Box
                key={c.key}
                px="md"
                py="sm"
                style={{
                  borderTop: i > 0 ? "1px solid #edf2ec" : undefined,
                  backgroundColor: i % 2 === 1 ? "#fafcfa" : "#fff",
                }}
              >
                <Group justify="space-between" wrap="nowrap" gap="sm">
                  {/* Left: code + name + grade level/SSES below */}
                  <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      size="xs"
                      fw={600}
                      ff="monospace"
                      c="gray.6"
                      style={{ flexShrink: 0 }}
                    >
                      {c.code}
                    </Text>
                    <Text c="gray.2" style={{ flexShrink: 0 }}>·</Text>
                    <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        size="sm"
                        c="gray.8"
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {isExisting ? existingSubject!.name : c.name}
                      </Text>
                      <Group gap={4} wrap="nowrap">
                        <Text size="xs" c="dimmed">{c.gradeLevelName}</Text>
                        {c.subject_type === "SSES" && (
                          <Badge color="blue" variant="light" size="xs">SSES</Badge>
                        )}
                      </Group>
                      {isChecking && (
                        <Group gap={4}>
                          <Loader size={9} color="gray" />
                          <Text size="xs" c="dimmed">Verifying…</Text>
                        </Group>
                      )}
                      {isExisting && (
                        <Text size="xs" c="dimmed">
                          Already exists — will be linked to the existing subject.
                        </Text>
                      )}
                    </Stack>
                  </Group>

                  {/* Right: actions only */}
                  <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }} align="center">
                    {!isChecking &&
                      (isExisting ? (
                        <Button
                          size="xs"
                          color="#4EAE4A"
                          variant="outline"
                          onClick={() => onAcceptExisting(c, existingSubject!)}
                        >
                          Import
                        </Button>
                      ) : (
                        <Button
                          size="xs"
                          color="#4EAE4A"
                          variant="outline"
                          onClick={() => onAcceptNew(c)}
                        >
                          Accept
                        </Button>
                      ))}
                    <Tooltip label="Dismiss suggestion" withArrow position="top">
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="gray"
                        disabled={isChecking}
                        onClick={() => onDismiss(c.key)}
                      >
                        <IconX size={12} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </Group>
              </Box>
            );
          })}
        </Stack>
      </Collapse>
    </Box>
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
  wizardSubjects,
  gradeLevelNames,
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
  wizardSubjects: WizardSubject[];
  gradeLevelNames: Map<number, string>;
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

  const skipChoice = !loadingCurricula && curricula.length === 0;

  useEffect(() => {
    if (!opened) return;
    setScreen(editingSubject || skipChoice ? "new" : "choice");
  }, [opened, editingSubject, skipChoice]);

  const addExisting = (s: ConflictSubject) => {
    if (editingSubject) {
      onReplaceWithExisting(editingSubject.tempId, s);
    } else {
      onAddSubjects([
        {
          source: "existing",
          tempId: crypto.randomUUID(),
          subject_id: s.subject_id,
          code: s.code,
          name: s.name,
          description: s.description,
          subject_type: s.subject_type,
          grade_level_id: gradeLevelId,
        },
      ]);
    }
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        editingSubject
          ? "Edit Subject"
          : screen === "new"
            ? "Create a Subject"
            : "Add a Subject"
      }
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
          currentGradeLevelId={gradeLevelId}
          wizardSubjects={wizardSubjects}
          gradeLevelNames={gradeLevelNames}
          editingTempId={editingSubject?.tempId}
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
          onBack={
            !editingSubject && !skipChoice
              ? () => setScreen("choice")
              : undefined
          }
        />
      )}
    </Modal>
  );
}

// ── Mobile subject row ────────────────────────────────────────────────────────
function SubjectMobileRow({
  s,
  onEdit,
  onRemove,
}: {
  s: WizardSubject;
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
              <Text fw={500} fz="sm" ff="monospace" style={{ flexShrink: 0 }}>
                {s.code}
              </Text>
              {s.subject_type === "SSES" && (
                <Badge
                  color="blue"
                  variant="filled"
                  size="xs"
                  radius="xl"
                  style={{ cursor: "default" }}
                >
                  SSES
                </Badge>
              )}
              <Text
                fz="sm"
                c="dimmed"
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {s.name}
              </Text>
            </Group>
          </UnstyledButton>
          <Group gap={4} wrap="nowrap">
            {s.source !== "existing" && (
              <ActionIcon
                size="sm"
                variant="subtle"
                color="gray"
                onClick={onEdit}
              >
                <IconPencil size={14} />
              </ActionIcon>
            )}
            <ActionIcon
              size="sm"
              variant="subtle"
              color="red"
              onClick={onRemove}
            >
              <IconTrash size={14} />
            </ActionIcon>
          </Group>
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
        </Box>
      </Collapse>
      <Divider />
    </>
  );
}

// ── Grade level block ──────────────────────────────────────────────────────────
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
  const [opened, setOpened] = useState(false);
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

  const confirmRemove = (s: WizardSubject) => {
    let modalId!: string;
    modalId = modals.openConfirmModal({
      title: "Remove subject?",
      children: (
        <>
          <EnterToConfirm
            onEnter={() => {
              onRemove(s.tempId);
              modals.close(modalId);
            }}
          />
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
        </>
      ),
      labels: { confirm: "Remove", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: () => onRemove(s.tempId),
      ...confirmModalProps,
    });
  };

  return (
    <Paper withBorder radius="md" style={{ overflow: "hidden" }}>
      <UnstyledButton
        onClick={() => setOpened((o) => !o)}
        style={{ width: "100%", padding: "12px 16px" }}
      >
        <Group justify="space-between">
          <Text fw={700} size="sm">
            {gradeLevel.display_name}{" "}
            <Text span c="dimmed" fw={400}>
              ({subjects.length})
            </Text>
          </Text>
          {opened ? (
            <IconChevronUp size={16} color="#808898" />
          ) : (
            <IconChevronDown size={16} color="#808898" />
          )}
        </Group>
      </UnstyledButton>

      <Collapse in={opened}>
        <div style={{ borderTop: "1px solid #ced4da", padding: "16px 20px" }}>
          <Stack gap="sm">
            {subjects.length > 0 && (
              <>
                {/* Desktop */}
                <div className="hidden sm:block">
                  <Table
                    withColumnBorders
                    withTableBorder
                    fz="sm"
                    style={
                      {
                        "--table-border-color": "#ced4da",
                      } as React.CSSProperties
                    }
                  >
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th style={{ ...subjectTh, width: 130 }}>
                          Subject Code
                        </Table.Th>
                        <Table.Th style={{ ...subjectTh, width: 210 }}>
                          Title
                        </Table.Th>
                        <Table.Th style={subjectTh}>Description</Table.Th>
                        <Table.Th
                          style={{ ...subjectTh, width: 80 }}
                        ></Table.Th>
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
                                <Badge
                                  color="blue"
                                  variant="filled"
                                  size="xs"
                                  radius="xl"
                                  style={{ cursor: "default" }}
                                >
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

                {/* Mobile */}
                <div className="sm:hidden">
                  {subjects.map((s) => (
                    <SubjectMobileRow
                      key={s.tempId}
                      s={s}
                      onEdit={() =>
                        s.source === "new" &&
                        onEdit(s as Extract<WizardSubject, { source: "new" }>)
                      }
                      onRemove={() => confirmRemove(s)}
                    />
                  ))}
                </div>
              </>
            )}

            <Box style={{ border: "1px solid #4EAE4A", borderRadius: "6px" }}>
              <Button
                variant="subtle"
                color="#4EAE4A"
                size="sm"
                fullWidth
                onClick={onAdd}
              >
                + Add a subject
              </Button>
            </Box>
          </Stack>
        </div>
      </Collapse>
    </Paper>
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

  const gradeLevelNames = useMemo(() => {
    const map = new Map<number, string>();
    for (const gl of gradeLevels) map.set(gl.grade_level_id, gl.display_name);
    return map;
  }, [gradeLevels]);

  const [dismissedSuggestions, setDismissedSuggestions] = useState(
    () => new Set<string>(),
  );

  const suggestionCandidates = useMemo(
    () => detectSubjectPatterns(form.values.subjects, gradeLevels),
    [form.values.subjects, gradeLevels],
  );

  function handleAcceptNewSuggestion(candidate: SubjectSuggestionCandidate) {
    handleAdd([
      {
        source: "new" as const,
        tempId: crypto.randomUUID(),
        code: candidate.code,
        name: candidate.name,
        description: candidate.description,
        subject_type: candidate.subject_type,
        grade_level_id: candidate.gradeLevelId,
      },
    ]);
    notify({
      type: "success",
      title: "Subject Accepted",
      message: `${candidate.name} (${candidate.code}) has been added to the curriculum.`,
    });
  }

  function handleAcceptExistingSuggestion(
    candidate: SubjectSuggestionCandidate,
    existingSubject: ConflictSubject,
  ) {
    const alreadyInWizard = form.values.subjects.some(
      (s) =>
        s.source === "existing" &&
        (s as Extract<WizardSubject, { source: "existing" }>).subject_id ===
          existingSubject.subject_id &&
        s.grade_level_id === candidate.gradeLevelId,
    );
    if (!alreadyInWizard) {
      handleAdd([
        {
          source: "existing" as const,
          tempId: crypto.randomUUID(),
          subject_id: existingSubject.subject_id,
          code: existingSubject.code,
          name: existingSubject.name,
          description: existingSubject.description,
          subject_type: existingSubject.subject_type,
          grade_level_id: candidate.gradeLevelId,
        },
      ]);
      notify({
        type: "success",
        title: "Subject Imported",
        message: `${existingSubject.name} (${existingSubject.code}) has been linked from an existing subject.`,
      });
    } else {
      notify({
        type: "info",
        title: "Already Added",
        message: `${existingSubject.name} (${existingSubject.code}) is already in the subject list.`,
      });
    }
  }

  function handleAcceptBatch(items: BatchItem[]) {
    const currentSubjects = form.values.subjects;
    const toAdd: WizardSubject[] = [];
    for (const { candidate, existingSubject } of items) {
      if (existingSubject) {
        const alreadyInWizard = currentSubjects.some(
          (s) =>
            s.source === "existing" &&
            (s as Extract<WizardSubject, { source: "existing" }>).subject_id ===
              existingSubject.subject_id &&
            s.grade_level_id === candidate.gradeLevelId,
        );
        if (!alreadyInWizard) {
          toAdd.push({
            source: "existing" as const,
            tempId: crypto.randomUUID(),
            subject_id: existingSubject.subject_id,
            code: existingSubject.code,
            name: existingSubject.name,
            description: existingSubject.description,
            subject_type: existingSubject.subject_type,
            grade_level_id: candidate.gradeLevelId,
          });
        }
      } else {
        toAdd.push({
          source: "new" as const,
          tempId: crypto.randomUUID(),
          code: candidate.code,
          name: candidate.name,
          description: candidate.description,
          subject_type: candidate.subject_type,
          grade_level_id: candidate.gradeLevelId,
        });
      }
    }
    if (toAdd.length > 0) {
      handleAdd(toAdd);
      const allImports = items.every((i) => i.existingSubject);
      notify({
        type: "success",
        title: allImports ? "Subjects Imported" : "Subjects Accepted",
        message: `${toAdd.length} subject${toAdd.length > 1 ? "s" : ""} ${allImports ? "imported" : "accepted"} successfully.`,
      });
    } else {
      notify({
        type: "info",
        title: "Already Added",
        message: "All subjects in this group are already in the list.",
      });
    }
  }

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
          ? {
              source: "existing" as const,
              tempId,
              subject_id: s.subject_id,
              code: s.code,
              name: s.name,
              description: s.description,
              subject_type: s.subject_type,
              grade_level_id: sub.grade_level_id,
            }
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
      <Text size="xl" fw={700} mb="md" c="#298925">
        Define Subjects per Grade Level
      </Text>

      <Box
        p="lg"
        style={{
          border: "1px solid #B8B8B8",
          borderRadius: "8px",
        }}
      >
        <Text size="lg" fw={700} mb="xs" c="#298925">
          Subjects per Grade Level
        </Text>
        <Text size="sm" mb="lg" c="dimmed">
          Define the learning areas for each grade level under this curriculum.
          You may select from existing learning areas or create new ones.
        </Text>

        <Text size="sm" fw={700} c="gray.7" mb="sm">
          Subjects{" "}
          <Text span c="red">
            *
          </Text>
        </Text>

        <Box
          mt="md"
          mb="lg"
          p="md"
          style={{
            border: "1px solid #d0e4cc",
            borderRadius: "8px",
            backgroundColor: "#f7fbf7",
          }}
        >
          <SuggestedSubjects
            candidates={suggestionCandidates}
            dismissedKeys={dismissedSuggestions}
            onDismiss={(key) =>
              setDismissedSuggestions((prev) => new Set([...prev, key]))
            }
            onAcceptNew={handleAcceptNewSuggestion}
            onAcceptExisting={handleAcceptExistingSuggestion}
            onAcceptBatch={handleAcceptBatch}
          />

          {missingGls.length > 0 && (
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
                No Subjects Assigned
              </Text>
              <Text size="sm" fs="italic">
                The following grade levels have no subjects yet:{" "}
                {missingGls.map((gl) => gl.display_name).join(", ")}
              </Text>
            </Alert>
          )}

          {loadingGradeLevels ? (
            <Stack gap="sm">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} height={44} radius="md" />
              ))}
            </Stack>
          ) : (
            <Stack gap="sm">
              {gradeLevels.map((gl) => (
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
              ))}
            </Stack>
          )}
        </Box>
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
          wizardSubjects={form.values.subjects}
          gradeLevelNames={gradeLevelNames}
          onAddSubjects={handleAdd}
          onEditSubject={handleEdit}
          onReplaceWithExisting={handleReplaceWithExisting}
        />
      )}
    </Box>
  );
}
