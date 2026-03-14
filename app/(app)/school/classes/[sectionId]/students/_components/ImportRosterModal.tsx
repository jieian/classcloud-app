"use client";

import { useEffect, useRef, useState } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Divider,
  Group,
  Loader,
  Modal,
  Paper,
  ScrollArea,
  Select,
  Skeleton,
  Stack,
  Table,
  TableScrollContainer,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
  Text,
  TextInput,
  ThemeIcon,
  Tooltip,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import {
  IconAlertCircle,
  IconCheck,
  IconCircleCheck,
  IconDownload,
  IconPencil,
  IconTrash,
  IconUpload,
  IconX,
} from "@tabler/icons-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ImportRowStatus =
  | "will_add"
  | "will_enroll"
  | "will_restore"
  | "will_move"
  | "already_enrolled"
  | "transfer_required"
  | "pending_request"
  | "format_error"
  | "duplicate_lrn"
  | "checking";

interface ReviewRow {
  rowNum: number;
  lrn: string;
  rawName: string;
  rawSex: string;
  status: ImportRowStatus;
  action?: "new" | "enroll" | "restore_enroll" | "move";
  last_name?: string;
  first_name?: string;
  middle_name?: string;
  sex?: "M" | "F";
  dbName?: string;
  errorMessage?: string;
}

interface ImportResult {
  lrn: string;
  success: boolean;
  error?: string;
}

type Step = "upload" | "reviewing" | "review" | "submitting" | "done";

// ─── Constants ────────────────────────────────────────────────────────────────

const ACTIONABLE: ImportRowStatus[] = ["will_add", "will_enroll", "will_restore", "will_move"];

const STATUS_CONFIG: Record<
  ImportRowStatus,
  { label: string; color: string }
> = {
  will_add:          { label: "Will add",              color: "green"  },
  will_enroll:       { label: "Will enroll",           color: "green"  },
  will_restore:      { label: "Will restore & enroll", color: "yellow" },
  will_move:         { label: "Will move here",        color: "yellow" },
  already_enrolled:  { label: "Already enrolled",      color: "gray"   },
  transfer_required: { label: "Transfer required",     color: "red"    },
  pending_request:   { label: "Transfer pending",      color: "orange" },
  format_error:      { label: "Invalid format",        color: "red"    },
  duplicate_lrn:     { label: "Duplicate LRN",         color: "red"    },
  checking:          { label: "Checking…",             color: "blue"   },
};

const NAME_RE = /^[a-zA-Z\u00C0-\u024F][a-zA-Z\u00C0-\u024F']*(?:\s[a-zA-Z\u00C0-\u024F][a-zA-Z\u00C0-\u024F']*)*$/;

function nameError(value: string, required: boolean): string | null {
  const t = value.trim();
  if (!t) return required ? "Required" : null;
  if (t.length < 2) return "Min 2 characters";
  if (t.length > 100) return "Max 100 characters";
  if (!NAME_RE.test(t)) return "Letters and apostrophes only";
  return null;
}

function toTitleCase(str: string): string {
  return str
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  opened: boolean;
  sectionId: number;
  hasFullAccess: boolean;
  onClose: () => void;
  onImported: () => void;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ImportRowStatus }) {
  const cfg = STATUS_CONFIG[status];
  if (status === "checking") {
    return (
      <Group gap={4} wrap="nowrap">
        <Loader size={12} />
        <Text size="xs" c="dimmed">
          Checking…
        </Text>
      </Group>
    );
  }
  return (
    <Badge size="sm" color={cfg.color} variant="light">
      {cfg.label}
    </Badge>
  );
}

// ─── Reviewing skeleton ───────────────────────────────────────────────────────

function ReviewSkeleton() {
  return (
    <Stack gap="xs">
      <Skeleton height={24} radius="sm" width={220} />
      <Skeleton height={36} radius="sm" />
      {[1, 2, 3, 4, 5].map((i) => (
        <Skeleton key={i} height={44} radius="sm" />
      ))}
    </Stack>
  );
}

// ─── Inline row editor ────────────────────────────────────────────────────────

interface EditDraft {
  lrn: string;
  last_name: string;
  first_name: string;
  middle_name: string;
  sex: "M" | "F";
}

function EditableRow({
  row,
  sectionId,
  onSave,
  onCancel,
}: {
  row: ReviewRow;
  sectionId: number;
  onSave: (updated: ReviewRow) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<EditDraft>({
    // Strip non-digits, but do not clamp length. Let teachers correct invalid
    // lengths themselves and keep validation feedback explicit.
    lrn: row.lrn.replace(/\D/g, ""),
    last_name: row.last_name ?? "",
    first_name: row.first_name ?? "",
    middle_name: row.middle_name ?? "",
    sex: row.sex ?? "M",
  });
  const [checking, setChecking] = useState(false);
  const [checkedRow, setCheckedRow] = useState<ReviewRow | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // On mount: if the (possibly truncated) draft LRN is already valid,
  // run an initial check so the status badge is correct without the user
  // having to touch the LRN field first.
  useEffect(() => {
    const initialLrn = row.lrn.replace(/\D/g, "");
    if (/^\d{12}$/.test(initialLrn)) {
      setChecking(true);
      debounceRef.current = setTimeout(() => {
        void recheck(initialLrn);
      }, 0);
    }
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Validation
  const lrnErr = /^\d{12}$/.test(draft.lrn) ? null : "Must be exactly 12 digits";
  const lastErr = nameError(draft.last_name, true);
  const firstErr = nameError(draft.first_name, true);
  const midErr = nameError(draft.middle_name, false);
  const sexErr = draft.sex ? null : "Required";
  const hasErrors = !!(lrnErr || lastErr || firstErr || midErr || sexErr);

  function handleLrnChange(raw: string) {
    const cleaned = raw.replace(/\D/g, "");
    setDraft((d) => ({ ...d, lrn: cleaned }));
    setCheckedRow(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (/^\d{12}$/.test(cleaned)) {
      setChecking(true);
      debounceRef.current = setTimeout(() => {
        void recheck(cleaned);
      }, 300);
    }
  }

  async function recheck(lrn: string) {
    try {
      const res = await fetch(
        `/api/classes/${sectionId}/students/check-lrn?lrn=${encodeURIComponent(lrn)}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Check failed");

      // Map check-lrn result to a ReviewRow status
      let status: ImportRowStatus = "format_error";
      let action: ReviewRow["action"];
      let dbName: string | undefined;
      let errorMessage: string | undefined;

      switch (data.status) {
        case "not_found":
          status = "will_add";
          action = "new";
          break;
        case "active":
          status = "will_enroll";
          action = "enroll";
          dbName = data.student?.full_name;
          break;
        case "deleted":
          status = "will_restore";
          action = "restore_enroll";
          dbName = data.student?.full_name;
          break;
        case "already_enrolled":
          status = "already_enrolled";
          dbName = data.student?.full_name;
          break;
        case "enrolled_elsewhere": {
          const cs = data.current_section ?? {};
          const canMoveDirect =
            !cs.has_adviser || cs.self_adviser;
          if (canMoveDirect) {
            status = "will_move";
            action = "move";
          } else if (cs.has_pending_request) {
            status = "pending_request";
            errorMessage = "A transfer request for this student is already pending.";
          } else {
            status = "transfer_required";
            errorMessage =
              "Student is enrolled in another class. Use Add Student to send a transfer request.";
          }
          dbName = data.student?.full_name;
          break;
        }
      }

      setCheckedRow({
        ...row,
        lrn,
        status,
        action,
        dbName,
        errorMessage,
        last_name: draft.last_name,
        first_name: draft.first_name,
        middle_name: draft.middle_name,
        sex: draft.sex,
      });
    } catch {
      setCheckedRow(null);
    } finally {
      setChecking(false);
    }
  }

  function handleSave() {
    if (hasErrors) return;

    const base = checkedRow ?? row;
    const updated: ReviewRow = {
      ...base,
      lrn: draft.lrn,
      last_name: draft.last_name ? toTitleCase(draft.last_name) : draft.last_name,
      first_name: draft.first_name ? toTitleCase(draft.first_name) : draft.first_name,
      middle_name: draft.middle_name ? toTitleCase(draft.middle_name) : draft.middle_name,
      sex: draft.sex,
    };
    onSave(updated);
  }

  return (
    <TableTr style={{ backgroundColor: "var(--mantine-color-blue-0)" }}>
      <TableTd colSpan={6} p="xs">
        <Stack gap="xs">
          <Group gap="xs" grow>
            <TextInput
              label="LRN"
              value={draft.lrn}
              onChange={(e) => handleLrnChange(e.currentTarget.value)}
              error={lrnErr}
              size="xs"
              rightSection={
                checking ? (
                  <Loader size={12} />
                ) : checkedRow && !lrnErr ? (
                  <IconCheck size={14} color="var(--mantine-color-green-6)" />
                ) : null
              }
              style={{ flex: 1, minWidth: 120 }}
            />
            <TextInput
              label="Last Name"
              value={draft.last_name}
              onChange={(e) =>
                setDraft((d) => ({ ...d, last_name: e.currentTarget.value }))
              }
              maxLength={100}
              error={lastErr}
              size="xs"
              style={{ flex: 1.5 }}
            />
            <TextInput
              label="First Name"
              value={draft.first_name}
              onChange={(e) =>
                setDraft((d) => ({ ...d, first_name: e.currentTarget.value }))
              }
              maxLength={100}
              error={firstErr}
              size="xs"
              style={{ flex: 1.5 }}
            />
            <TextInput
              label="Middle Name"
              placeholder="Optional"
              value={draft.middle_name}
              onChange={(e) =>
                setDraft((d) => ({ ...d, middle_name: e.currentTarget.value }))
              }
              maxLength={100}
              error={midErr}
              size="xs"
              style={{ flex: 1.2 }}
            />
            <Select
              label="Sex"
              value={draft.sex}
              onChange={(v) =>
                setDraft((d) => ({ ...d, sex: (v ?? "M") as "M" | "F" }))
              }
              data={[
                { value: "M", label: "Male" },
                { value: "F", label: "Female" },
              ]}
              allowDeselect={false}
              size="xs"
              style={{ flex: 0.8 }}
            />
          </Group>

          {/* Re-check status preview */}
          {checkedRow && !checking && (
            <Group gap="xs">
              <Text size="xs" c="dimmed">
                New status:
              </Text>
              <StatusBadge status={checkedRow.status} />
              {checkedRow.dbName && (
                <Text size="xs" c="dimmed">
                  DB: {checkedRow.dbName}
                </Text>
              )}
            </Group>
          )}

          <Group gap="xs" justify="flex-end">
            <Button
              size="xs"
              variant="subtle"
              color="gray"
              leftSection={<IconX size={12} />}
              onClick={onCancel}
            >
              Cancel
            </Button>
            <Button
              size="xs"
              color="#4EAE4A"
              leftSection={<IconCheck size={12} />}
              disabled={hasErrors || checking}
              onClick={handleSave}
            >
              Save
            </Button>
          </Group>
        </Stack>
      </TableTd>
    </TableTr>
  );
}

// ─── Read-only row ────────────────────────────────────────────────────────────

function ReadOnlyRow({
  row,
  editingRowNum,
  onEdit,
  onRemove,
}: {
  row: ReviewRow;
  editingRowNum: number | null;
  onEdit: (rowNum: number) => void;
  onRemove: (rowNum: number) => void;
}) {
  const displayName =
    row.dbName ||
    [row.last_name, row.first_name, row.middle_name]
      .filter(Boolean)
      .join(", ") ||
    row.rawName;

  const displaySex = row.sex ?? (row.rawSex || "—");
  const isEditing = editingRowNum === row.rowNum;

  return (
    <TableTr
      style={{
        opacity: isEditing ? 0.4 : 1,
        transition: "opacity 0.15s",
      }}
    >
      <TableTd>
        <Text size="xs" c="dimmed">
          {row.rowNum}
        </Text>
      </TableTd>
      <TableTd>
        <Text size="xs" ff="monospace">
          {row.lrn}
        </Text>
      </TableTd>
      <TableTd>
        <Stack gap={2}>
          <Text size="xs">{displayName}</Text>
          {row.dbName && row.rawName && row.dbName !== row.rawName && (
            <Text size="xs" c="dimmed" fs="italic">
              (file: {row.rawName})
            </Text>
          )}
        </Stack>
      </TableTd>
      <TableTd>
        <Text size="xs">{displaySex === "M" ? "Male" : displaySex === "F" ? "Female" : displaySex}</Text>
      </TableTd>
      <TableTd>
        <Stack gap={2}>
          <StatusBadge status={row.status} />
          {row.errorMessage && (
            <Text size="xs" c="dimmed" maw={240} lineClamp={2}>
              {row.errorMessage}
            </Text>
          )}
        </Stack>
      </TableTd>
      <TableTd>
        <Group gap={4} justify="flex-end" wrap="nowrap">
          <Tooltip label="Edit row" withArrow>
            <ActionIcon
              size="sm"
              variant="subtle"
              color="gray"
              onClick={() => onEdit(row.rowNum)}
              disabled={isEditing}
            >
              <IconPencil size={13} stroke={1.5} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Remove row" withArrow>
            <ActionIcon
              size="sm"
              variant="subtle"
              color="red"
              onClick={() => onRemove(row.rowNum)}
            >
              <IconTrash size={13} stroke={1.5} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </TableTd>
    </TableTr>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ImportRosterModal({
  opened,
  sectionId,
  hasFullAccess,
  onClose,
  onImported,
}: Props) {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [editingRowNum, setEditingRowNum] = useState<number | null>(null);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset when modal closes
  useEffect(() => {
    if (!opened) {
      setStep("upload");
      setFile(null);
      setRows([]);
      setEditingRowNum(null);
      setResults([]);
      setError(null);
      setDragOver(false);
    }
  }, [opened]);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const actionableRows = rows.filter((r) => ACTIONABLE.includes(r.status));
  const skippedRows = rows.filter(
    (r) => r.status === "already_enrolled",
  );
  const issueRows = rows.filter(
    (r) =>
      r.status === "format_error" ||
      r.status === "duplicate_lrn" ||
      r.status === "transfer_required" ||
      r.status === "pending_request",
  );
  const actionableCount = actionableRows.length;

  // ── Handlers ─────────────────────────────────────────────────────────────────

  async function handleDownloadTemplate() {
    setDownloading(true);
    try {
      const res = await fetch(
        `/api/classes/${sectionId}/students/import/template`,
      );
      if (!res.ok) throw new Error("Failed to download template.");
      const blob = await res.blob();
      const disposition = res.headers.get("content-disposition") ?? "";
      const nameMatch = /filename="([^"]+)"/.exec(disposition);
      const filename = nameMatch?.[1] ?? "Roster Template.xlsx";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      notifications.show({
        title: "Error",
        message:
          e instanceof Error ? e.message : "Failed to download template.",
        color: "red",
      });
    } finally {
      setDownloading(false);
    }
  }

  function acceptFile(f: File | null) {
    if (!f) return;
    if (
      f.type ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      f.name.endsWith(".xlsx")
    ) {
      setFile(f);
      setError(null);
    } else {
      setError("Please upload a valid .xlsx file.");
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0] ?? null;
    acceptFile(dropped);
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    // Only clear if leaving the drop zone entirely (not a child element)
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOver(false);
    }
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    acceptFile(e.target.files?.[0] ?? null);
    // Reset so re-selecting the same file triggers onChange again
    e.target.value = "";
  }

  async function handleReview() {
    if (!file) return;
    setStep("reviewing");
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(
        `/api/classes/${sectionId}/students/import/review`,
        { method: "POST", body: formData },
      );
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Failed to process file.");
        setStep("upload");
        return;
      }

      setRows((data.rows as ReviewRow[]) ?? []);
      setStep("review");
    } catch {
      setError("Network error. Please try again.");
      setStep("upload");
    }
  }

  async function handleSubmit() {
    if (actionableCount === 0) return;
    setStep("submitting");

    const payload = actionableRows.map((r) => {
      const base = { lrn: r.lrn, action: r.action! };
      if (r.action === "new") {
        return {
          ...base,
          last_name: r.last_name,
          first_name: r.first_name,
          middle_name: r.middle_name ?? "",
          sex: r.sex,
        };
      }
      return base;
    });

    try {
      const res = await fetch(`/api/classes/${sectionId}/students/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ students: payload }),
      });
      const data = await res.json();

      if (!res.ok) {
        notifications.show({
          title: "Import failed",
          message: data.error ?? "An error occurred.",
          color: "red",
        });
        setStep("review");
        return;
      }

      setResults((data.results as ImportResult[]) ?? []);
      setStep("done");
    } catch {
      notifications.show({
        title: "Network error",
        message: "Failed to import students. Please try again.",
        color: "red",
      });
      setStep("review");
    }
  }

  function handleClose() {
    if (step === "submitting") return;

    if (step === "review" || step === "reviewing") {
      modals.openConfirmModal({
        title: "Discard import?",
        centered: true,
        children: (
          <Text size="sm">
            The review data will be lost. Are you sure you want to close?
          </Text>
        ),
        labels: { confirm: "Discard", cancel: "Keep reviewing" },
        confirmProps: { color: "red" },
        onConfirm: onClose,
      });
      return;
    }

    if (step === "done") {
      onImported();
    }

    onClose();
  }

  // ── Row editing ──────────────────────────────────────────────────────────────

  function handleEditRow(rowNum: number) {
    setEditingRowNum(rowNum);
  }

  function handleSaveRow(updated: ReviewRow) {
    setRows((prev) =>
      prev.map((r) => (r.rowNum === updated.rowNum ? updated : r)),
    );
    setEditingRowNum(null);
  }

  function handleCancelEdit() {
    setEditingRowNum(null);
  }

  function handleRemoveRow(rowNum: number) {
    setRows((prev) => prev.filter((r) => r.rowNum !== rowNum));
    if (editingRowNum === rowNum) setEditingRowNum(null);
  }

  // ── Results derived ──────────────────────────────────────────────────────────
  const successCount = results.filter((r) => r.success).length;
  const failedResults = results.filter((r) => !r.success);

  // ── Render ───────────────────────────────────────────────────────────────────
  const isBusy = step === "reviewing" || step === "submitting";

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title="Import Roster"
      centered
      size={step === "review" || step === "reviewing" ? "xl" : "md"}
      closeOnClickOutside={!isBusy}
      closeOnEscape={!isBusy && step !== "review"}
      withCloseButton={!isBusy}
      overlayProps={{ backgroundOpacity: 0.5, blur: 4 }}
    >
      {/* ── Step: Upload ── */}
      {step === "upload" && (
        <Stack gap="md">
          {error && (
            <Alert color="red" icon={<IconAlertCircle size={16} />}>
              {error}
            </Alert>
          )}

          {/* Step 1 */}
          <Paper withBorder radius="md" p="md">
            <Group gap="xs" mb="xs">
              <ThemeIcon size="sm" radius="xl" color="#4EAE4A" variant="filled">
                <Text size="xs" fw={700} c="white">1</Text>
              </ThemeIcon>
              <Text fw={600} size="sm">
                Download the template
              </Text>
            </Group>
            <Text size="xs" c="dimmed" mb="sm">
              Use the official template to ensure your data is formatted correctly.
            </Text>
            <Button
              variant="outline"
              color="#4EAE4A"
              size="xs"
              leftSection={<IconDownload size={14} />}
              loading={downloading}
              onClick={handleDownloadTemplate}
            >
              Download Template
            </Button>
          </Paper>

          {/* Step 2 */}
          <Paper withBorder radius="md" p="md">
            <Group gap="xs" mb="xs">
              <ThemeIcon size="sm" radius="xl" color="#4EAE4A" variant="filled">
                <Text size="xs" fw={700} c="white">2</Text>
              </ThemeIcon>
              <Text fw={600} size="sm">
                Fill in the template
              </Text>
            </Group>
            <Stack gap={4}>
              <Text size="xs" c="dimmed">
                • <strong>Column A — LRN:</strong> 12-digit Learner Reference Number
              </Text>
              <Text size="xs" c="dimmed">
                • <strong>Column B — Name:</strong> Last Name, First Name[, Middle Name]
              </Text>
              <Text size="xs" c="dimmed">
                • <strong>Column C — Sex:</strong> M or F
              </Text>
              <Text size="xs" c="dimmed" mt={4}>
                One student per row. Start from row 4.
              </Text>
            </Stack>
          </Paper>

          {/* Step 3 */}
          <Paper withBorder radius="md" p="md">
            <Group gap="xs" mb="xs">
              <ThemeIcon size="sm" radius="xl" color="#4EAE4A" variant="filled">
                <Text size="xs" fw={700} c="white">3</Text>
              </ThemeIcon>
              <Text fw={600} size="sm">
                Upload the completed file
              </Text>
            </Group>

            {/* Hidden native file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              style={{ display: "none" }}
              onChange={handleFileInputChange}
            />

            {/* Drop zone */}
            <Box
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${dragOver ? "#4EAE4A" : file ? "#4EAE4A" : "var(--mantine-color-gray-4)"}`,
                borderRadius: "var(--mantine-radius-md)",
                backgroundColor: dragOver
                  ? "rgba(78,174,74,0.06)"
                  : file
                    ? "rgba(78,174,74,0.03)"
                    : "transparent",
                padding: "24px 16px",
                cursor: "pointer",
                textAlign: "center",
                transition: "border-color 0.15s, background-color 0.15s",
                userSelect: "none",
              }}
            >
              {file ? (
                <Stack gap={6} align="center">
                  <IconCheck size={28} color="#4EAE4A" />
                  <Text size="sm" fw={500} c="#4EAE4A">
                    {file.name}
                  </Text>
                  <Text size="xs" c="dimmed">
                    Click to choose a different file
                  </Text>
                </Stack>
              ) : (
                <Stack gap={6} align="center">
                  <IconUpload
                    size={28}
                    color={dragOver ? "#4EAE4A" : "var(--mantine-color-gray-5)"}
                  />
                  <Text size="sm" fw={500} c={dragOver ? "#4EAE4A" : "dimmed"}>
                    {dragOver ? "Drop it here" : "Drag & drop your .xlsx file here"}
                  </Text>
                  <Text size="xs" c="dimmed">
                    or{" "}
                    <Text span c="#4EAE4A" fw={500}>
                      click to browse
                    </Text>
                  </Text>
                </Stack>
              )}
            </Box>

            {/* Clear button */}
            {file && (
              <Group justify="flex-end" mt="xs">
                <Button
                  size="xs"
                  variant="subtle"
                  color="gray"
                  leftSection={<IconX size={12} />}
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                  }}
                >
                  Clear
                </Button>
              </Group>
            )}
          </Paper>

          <Divider />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button
              color="#4EAE4A"
              disabled={!file}
              onClick={handleReview}
            >
              Review →
            </Button>
          </Group>
        </Stack>
      )}

      {/* ── Step: Reviewing (loading) ── */}
      {step === "reviewing" && <ReviewSkeleton />}

      {/* ── Step: Review ── */}
      {step === "review" && (
        <Stack gap="md">
          {/* Summary */}
          <Group gap="xs" wrap="wrap">
            {actionableCount > 0 && (
              <Badge color="green" variant="light" size="sm">
                {actionableCount} will be imported
              </Badge>
            )}
            {skippedRows.length > 0 && (
              <Badge color="gray" variant="light" size="sm">
                {skippedRows.length} already enrolled
              </Badge>
            )}
            {issueRows.length > 0 && (
              <Badge color="red" variant="light" size="sm">
                {issueRows.length} issue{issueRows.length !== 1 ? "s" : ""}
              </Badge>
            )}
            {rows.length === 0 && (
              <Badge color="gray" variant="light" size="sm">
                No rows found
              </Badge>
            )}
          </Group>

          {issueRows.length > 0 && (
            <Alert color="yellow" icon={<IconAlertCircle size={16} />}>
              <Text size="sm">
                {issueRows.length} row{issueRows.length !== 1 ? "s have" : " has"} issues and will be skipped. You can edit or remove them below.
              </Text>
            </Alert>
          )}

          {rows.length === 0 ? (
            <Text size="sm" c="dimmed" ta="center" py="md">
              No rows found in the uploaded file.
            </Text>
          ) : (
            <ScrollArea mah={440} type="auto">
              <TableScrollContainer minWidth={640}>
                <Table verticalSpacing={6} withColumnBorders={false}>
                  <TableThead>
                    <TableTr>
                      <TableTh w={40}>Row</TableTh>
                      <TableTh w={130}>LRN</TableTh>
                      <TableTh>Name</TableTh>
                      <TableTh w={70}>Sex</TableTh>
                      <TableTh w={170}>Status</TableTh>
                      <TableTh w={72} />
                    </TableTr>
                  </TableThead>
                  <TableTbody>
                    {rows.map((row) =>
                      editingRowNum === row.rowNum ? (
                        <EditableRow
                          key={row.rowNum}
                          row={row}
                          sectionId={sectionId}
                          onSave={handleSaveRow}
                          onCancel={handleCancelEdit}
                        />
                      ) : (
                        <ReadOnlyRow
                          key={row.rowNum}
                          row={row}
                          editingRowNum={editingRowNum}
                          onEdit={handleEditRow}
                          onRemove={handleRemoveRow}
                        />
                      ),
                    )}
                  </TableTbody>
                </Table>
              </TableScrollContainer>
            </ScrollArea>
          )}

          {actionableCount === 0 && rows.length > 0 && (
            <Alert color="orange" icon={<IconAlertCircle size={16} />}>
              <Text size="sm">
                No students can be imported. All rows are either already enrolled, have issues, or need individual transfer requests.
              </Text>
            </Alert>
          )}

          <Divider />
          <Group justify="space-between">
            <Button
              variant="subtle"
              color="gray"
              onClick={() => {
                setStep("upload");
                setRows([]);
                setEditingRowNum(null);
              }}
            >
              ← Back
            </Button>
            <Group gap="xs">
              <Button variant="default" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                color="#4EAE4A"
                disabled={actionableCount === 0 || editingRowNum !== null}
                onClick={handleSubmit}
              >
                Submit ({actionableCount})
              </Button>
            </Group>
          </Group>
        </Stack>
      )}

      {/* ── Step: Submitting ── */}
      {step === "submitting" && (
        <Stack gap="md" align="center" py="xl">
          <Loader size="lg" color="#4EAE4A" />
          <Text fw={500}>Importing students…</Text>
          <Text size="sm" c="dimmed">
            Please wait while we add students to the roster.
          </Text>
        </Stack>
      )}

      {/* ── Step: Done ── */}
      {step === "done" && (
        <Stack gap="md" align="center" py="sm">
          <ThemeIcon size={56} radius="xl" color="green" variant="light">
            <IconCircleCheck size={32} stroke={1.5} />
          </ThemeIcon>
          <Stack gap={4} align="center">
            <Text fw={700} size="lg" ta="center">
              Import complete
            </Text>
            <Text size="sm" c="dimmed" ta="center">
              {successCount} of {results.length} student
              {results.length !== 1 ? "s" : ""} imported successfully.
            </Text>
          </Stack>

          {failedResults.length > 0 && (
            <Alert
              color="red"
              icon={<IconAlertCircle size={16} />}
              title={`${failedResults.length} student${failedResults.length !== 1 ? "s" : ""} could not be imported`}
              w="100%"
            >
              <Stack gap={4} mt="xs">
                {failedResults.map((r) => (
                  <Text key={r.lrn} size="xs">
                    <Text span ff="monospace" fw={600}>
                      {r.lrn}
                    </Text>{" "}
                    — {r.error}
                  </Text>
                ))}
              </Stack>
            </Alert>
          )}

          <Button
            color="#4EAE4A"
            onClick={() => {
              onImported();
              onClose();
            }}
          >
            Close & Refresh Roster
          </Button>
        </Stack>
      )}
    </Modal>
  );
}
