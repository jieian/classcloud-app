"use client";

import { useEffect, useRef, useState } from "react";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import {
  ActionIcon,
  Alert,
  Box,
  Button,
  Collapse,
  Divider,
  Group,
  Loader,
  Modal,
  ScrollArea,
  Select,
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
  Tooltip,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { notify } from "@/components/notificationIcon/notificationIcon";
import {
  IconAlertCircle,
  IconArrowsTransferUp,
  IconCheck,
  IconChevronRight,
  IconChevronsRight,
  IconExclamationCircle,
  IconInfoCircle,
  IconPencil,
  IconTrash,
  IconUpload,
  IconUserExclamation,
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

const EDIT_DISABLED_REASON: Partial<Record<ImportRowStatus, string>> = {
  will_add:          "New student \u2014 no edits needed before import",
  will_move:         "Student will be moved from another class automatically",
  will_restore:      "Student data exists in DB \u2014 no edits needed",
  already_enrolled:  "Already enrolled \u2014 this row will be skipped",
  transfer_required: "Use Add Student to send a transfer request instead",
  pending_request:   "A transfer request for this student is already pending",
};

const EDIT_ROW_BACKGROUND = "rgba(78, 174, 74, 0.08)";

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

function notifyRowCannotEdit(reason?: string) {
  notify({
    type: "info",
    title: "Row cannot be edited",
    message:
      reason ??
      "This row is locked because its import status must be resolved outside inline editing.",
  });
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

function StatusIcon({
  status,
  errorMessage,
}: {
  status: ImportRowStatus;
  errorMessage?: string;
}) {
  if (status === "checking") {
    return (
      <div style={{ width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader size={12} />
      </div>
    );
  }

  type Cfg = { icon: React.ReactNode; bg: string; label: string };
  const cfg: Cfg = ((): Cfg => {
    switch (status) {
      case "will_add":
      case "will_enroll":
      case "will_restore":
        return { icon: <IconCheck size={13} stroke={2.5} color="#fff" />, bg: "#4EAE4A", label: "Will be added." };
      case "will_move":
        return { icon: <IconChevronsRight size={13} stroke={2.5} color="#fff" />, bg: "#4EAE4A", label: "From another class. Will be moved." };
      case "already_enrolled":
        return { icon: <IconUserExclamation size={13} stroke={2} color="#fff" />, bg: "#FF6666", label: "Already Enrolled." };
      case "transfer_required":
        return { icon: <IconArrowsTransferUp size={13} stroke={2} color="#fff" />, bg: "#FAB005", label: "Transfer Request Required." };
      case "pending_request":
        return { icon: <IconArrowsTransferUp size={13} stroke={2} color="#fff" />, bg: "#F76707", label: "Transfer Request Pending." };
      default:
        return { icon: <IconExclamationCircle size={13} stroke={2} color="#fff" />, bg: "#FF6666", label: errorMessage ?? "Invalid row." };
    }
  })();

  return (
    <Tooltip
      label={cfg.label}
      withArrow
      position="top"
      multiline
      maw={220}
      events={{ hover: true, focus: true, touch: true }}
    >
      <div
        style={{
          width: 24,
          height: 24,
          borderRadius: "50%",
          backgroundColor: cfg.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "default",
          flexShrink: 0,
        }}
      >
        {cfg.icon}
      </div>
    </Tooltip>
  );
}

// ─── Processing animation ─────────────────────────────────────────────────────

function ProcessingAnimation() {
  // Outer ring: r=50, C≈314 → 75% arc = 236, gap = 78
  // Inner ring: r=40, C≈251 → 25% arc = 63,  gap = 188
  return (
    <>
      <style>{`
        @keyframes cc-spin     { to { transform: rotate(360deg);  } }
        @keyframes cc-spin-rev { to { transform: rotate(-360deg); } }
        @keyframes cc-breathe  {
          0%, 100% { opacity: 1;    transform: translate(-50%, -50%) scale(1);    }
          50%       { opacity: 0.82; transform: translate(-50%, -50%) scale(0.94); }
        }
        @keyframes cc-dot {
          0%, 80%, 100% { opacity: 0.25; transform: scale(0.75); }
          40%            { opacity: 1;    transform: scale(1);    }
        }
      `}</style>

      <Stack align="center" gap="xl" py={56}>
        {/* Ring + logo */}
        <div style={{ position: "relative", width: 160, height: 160 }}>
          {/* Outer spinning arc */}
          <svg
            width={160}
            height={160}
            style={{
              position: "absolute",
              inset: 0,
              animation: "cc-spin 2s linear infinite",
            }}
          >
            <circle
              cx={80}
              cy={80}
              r={76}
              fill="none"
              stroke="#4EAE4A"
              strokeWidth={3}
              strokeDasharray="358 120"
              strokeLinecap="round"
            />
          </svg>

          {/* Inner counter-rotating arc */}
          <svg
            width={160}
            height={160}
            style={{
              position: "absolute",
              inset: 0,
              animation: "cc-spin-rev 3s linear infinite",
            }}
          >
            <circle
              cx={80}
              cy={80}
              r={64}
              fill="none"
              stroke="#597D37"
              strokeWidth={2}
              strokeDasharray="100 302"
              strokeLinecap="round"
              opacity={0.55}
            />
          </svg>

          {/* Breathing logo */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt=""
            aria-hidden
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              width: 100,
              height: "auto",
              animation: "cc-breathe 2.5s ease-in-out infinite",
            }}
          />
        </div>

        {/* Labels */}
        <Stack align="center" gap={4}>
          <Text fw={600} size="md" c="#1f2937">
            Processing file
          </Text>
          <Text size="sm" c="dimmed">
            Extracting student data…
          </Text>
        </Stack>

        {/* Staggered dots */}
        <Group gap={8}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                backgroundColor: "#4EAE4A",
                animation: `cc-dot 1.4s ease-in-out ${i * 0.18}s infinite`,
              }}
            />
          ))}
        </Group>
      </Stack>
    </>
  );
}


// ─── Inline row editor ────────────────────────────────────────────────────────

function normalizeOptionalMiddleName(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  return /^[-–—]+$/.test(trimmed) ? "" : trimmed;
}

function reviewDisplayName(row: ReviewRow) {
  const name =
    row.dbName ||
    [row.last_name, row.first_name, normalizeOptionalMiddleName(row.middle_name)]
      .filter(Boolean)
      .join(", ") ||
    row.rawName.trim();

  return name || "No name";
}

interface EditDraft {
  lrn: string;
  last_name: string;
  first_name: string;
  middle_name: string;
  sex: "M" | "F";
}

function InlineFieldError({ message }: { message: string | null }) {
  return (
    <Text
      size="10px"
      c="red"
      mt={3}
      lh={1.15}
      style={{
        minHeight: 12,
        visibility: message ? "visible" : "hidden",
      }}
    >
      {message ?? " "}
    </Text>
  );
}

function EditableRow({
  row,
  sectionId,
  onSave,
  onCancel,
  mobile,
}: {
  row: ReviewRow;
  sectionId: number;
  onSave: (updated: ReviewRow) => void;
  onCancel: () => void;
  mobile?: boolean;
}) {
  const [draft, setDraft] = useState<EditDraft>({
    // Strip non-digits, but do not clamp length. Let teachers correct invalid
    // lengths themselves and keep validation feedback explicit.
    lrn: row.lrn.replace(/\D/g, ""),
    last_name: row.last_name ?? "",
    first_name: row.first_name ?? "",
    middle_name: normalizeOptionalMiddleName(row.middle_name),
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
        middle_name: normalizeOptionalMiddleName(draft.middle_name),
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
      middle_name: normalizeOptionalMiddleName(draft.middle_name)
        ? toTitleCase(normalizeOptionalMiddleName(draft.middle_name))
        : "",
      sex: draft.sex,
    };
    onSave(updated);
  }

  const formContent = (
    <Stack gap="xs">
      <Group gap="xs" align="flex-start" grow>
        <Box style={{ flex: 1, minWidth: 120 }}>
          <TextInput
            label="LRN"
            value={draft.lrn}
            onChange={(e) => handleLrnChange(e.currentTarget.value)}
            error={!!lrnErr}
            size="xs"
            rightSection={
              checking ? (
                <Loader size={12} />
              ) : checkedRow && !lrnErr ? (
                <IconCheck size={14} color="var(--mantine-color-green-6)" />
              ) : null
            }
          />
          <InlineFieldError message={lrnErr} />
        </Box>
        <Box style={{ flex: 1.5 }}>
          <TextInput
            label="Last Name"
            value={draft.last_name}
            onChange={(e) => {
              const value = e.currentTarget.value;
              setDraft((d) => ({ ...d, last_name: value }));
            }}
            maxLength={100}
            error={!!lastErr}
            size="xs"
          />
          <InlineFieldError message={lastErr} />
        </Box>
        <Box style={{ flex: 1.5 }}>
          <TextInput
            label="First Name"
            value={draft.first_name}
            onChange={(e) => {
              const value = e.currentTarget.value;
              setDraft((d) => ({ ...d, first_name: value }));
            }}
            maxLength={100}
            error={!!firstErr}
            size="xs"
          />
          <InlineFieldError message={firstErr} />
        </Box>
        <Box style={{ flex: 1.2 }}>
          <TextInput
            label="Middle Name"
            placeholder="Optional"
            value={draft.middle_name}
            onChange={(e) => {
              const value = e.currentTarget.value;
              setDraft((d) => ({ ...d, middle_name: value }));
            }}
            maxLength={100}
            error={!!midErr}
            size="xs"
          />
          <InlineFieldError message={midErr} />
        </Box>
        <Box style={{ flex: 0.8 }}>
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
            error={!!sexErr}
            size="xs"
          />
          <InlineFieldError message={sexErr} />
        </Box>
      </Group>

      {hasErrors && (
        <Text size="xs" c="dimmed">
          Complete the required fields to preview the import status.
        </Text>
      )}

      {!hasErrors && checkedRow && !checking && (
        <Group gap="xs" align="center">
          <Text size="xs" c="dimmed">Import status:</Text>
          <StatusIcon status={checkedRow.status} errorMessage={checkedRow.errorMessage} />
          {checkedRow.dbName && (
            <Text size="xs" c="dimmed">DB: {checkedRow.dbName}</Text>
          )}
        </Group>
      )}

      <Group gap="xs" justify="flex-end">
        <Button
          size="xs"
          variant="default"
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          size="xs"
          color="#4EAE4A"
          disabled={hasErrors || checking}
          onClick={handleSave}
        >
          Save
        </Button>
      </Group>
    </Stack>
  );

  if (mobile) {
    return (
      <Box
        p="sm"
        style={{ backgroundColor: EDIT_ROW_BACKGROUND, borderRadius: 8 }}
      >
        <Stack gap="sm">
          {/* LRN — full width */}
          <Box>
            <TextInput
              label="LRN"
              value={draft.lrn}
              onChange={(e) => handleLrnChange(e.currentTarget.value)}
              error={!!lrnErr}
              rightSection={
                checking ? (
                  <Loader size={14} />
                ) : checkedRow && !lrnErr ? (
                  <IconCheck size={15} color="var(--mantine-color-green-6)" />
                ) : null
              }
            />
            <InlineFieldError message={lrnErr} />
          </Box>

          {/* Last + First side by side */}
          <Group gap="sm" grow align="flex-start">
            <Box>
              <TextInput
                label="Last Name"
                value={draft.last_name}
                onChange={(e) => { const v = e.currentTarget.value; setDraft((d) => ({ ...d, last_name: v })); }}
                maxLength={100}
                error={!!lastErr}
              />
              <InlineFieldError message={lastErr} />
            </Box>
            <Box>
              <TextInput
                label="First Name"
                value={draft.first_name}
                onChange={(e) => { const v = e.currentTarget.value; setDraft((d) => ({ ...d, first_name: v })); }}
                maxLength={100}
                error={!!firstErr}
              />
              <InlineFieldError message={firstErr} />
            </Box>
          </Group>

          {/* Middle Name + Sex side by side */}
          <Group gap="sm" grow align="flex-start">
            <Box>
              <TextInput
                label="Middle Name"
                placeholder="Optional"
                value={draft.middle_name}
                onChange={(e) => { const v = e.currentTarget.value; setDraft((d) => ({ ...d, middle_name: v })); }}
                maxLength={100}
                error={!!midErr}
              />
              <InlineFieldError message={midErr} />
            </Box>
            <Box>
              <Select
                label="Sex"
                value={draft.sex}
                onChange={(v) => setDraft((d) => ({ ...d, sex: (v ?? "M") as "M" | "F" }))}
                data={[
                  { value: "M", label: "Male" },
                  { value: "F", label: "Female" },
                ]}
                allowDeselect={false}
                error={!!sexErr}
              />
              <InlineFieldError message={sexErr} />
            </Box>
          </Group>

          {/* Status preview */}
          {hasErrors && (
            <Text size="sm" c="dimmed">Complete the required fields to preview the import status.</Text>
          )}
          {!hasErrors && checkedRow && !checking && (
            <Group gap="xs" align="center">
              <Text size="sm" c="dimmed">Import status:</Text>
              <StatusIcon status={checkedRow.status} errorMessage={checkedRow.errorMessage} />
              {checkedRow.dbName && (
                <Text size="sm" c="dimmed">DB: {checkedRow.dbName}</Text>
              )}
            </Group>
          )}

          {/* Actions */}
          <Group gap="xs" justify="flex-end">
            <Button variant="default" size="sm" onClick={onCancel}>Cancel</Button>
            <Button size="sm" color="#4EAE4A" disabled={hasErrors || checking} onClick={handleSave}>Save</Button>
          </Group>
        </Stack>
      </Box>
    );
  }

  return (
    <TableTr style={{ backgroundColor: EDIT_ROW_BACKGROUND }}>
      <TableTd colSpan={6} p="xs">
        {formContent}
      </TableTd>
    </TableTr>
  );
}

// ─── Read-only row ────────────────────────────────────────────────────────────

function ReadOnlyRow({
  row,
  displayIndex,
  editingRowNum,
  selectedRowNum,
  onEdit,
  onSelect,
  onRemove,
}: {
  row: ReviewRow;
  displayIndex: number;
  editingRowNum: number | null;
  selectedRowNum: number | null;
  onEdit: (rowNum: number) => void;
  onSelect: (rowNum: number) => void;
  onRemove: (rowNum: number) => void;
}) {
  const displayName = reviewDisplayName(row);
  const isNoName = displayName === "No name";

  const displaySex = row.sex ?? (row.rawSex || "—");
  const isEditing = editingRowNum === row.rowNum;
  const isSelected = selectedRowNum === row.rowNum;
  const editDisabledReason = EDIT_DISABLED_REASON[row.status];
  const canEdit = !editDisabledReason;
  const isIssue =
    row.status === "format_error" ||
    row.status === "duplicate_lrn" ||
    row.status === "transfer_required" ||
    row.status === "pending_request";

  function handleEditAttempt() {
    if (isEditing) return;
    if (canEdit) {
      onEdit(row.rowNum);
      return;
    }

    notifyRowCannotEdit(editDisabledReason);
  }

  return (
    <TableTr
      onClick={() => onSelect(row.rowNum)}
      onDoubleClick={handleEditAttempt}
      style={{
        cursor: isEditing ? "default" : "pointer",
        backgroundColor: isSelected ? EDIT_ROW_BACKGROUND : isIssue ? "rgba(255,102,102,0.07)" : undefined,
        opacity: isEditing ? 0.4 : 1,
        transition: "opacity 0.15s, background-color 0.15s",
        borderLeft: isIssue ? "3px solid #FF6666" : "3px solid transparent",
      }}
    >
      <TableTd>
        <Text size="xs" c="dimmed">
          {displayIndex}
        </Text>
      </TableTd>
      <TableTd>
        <Text size="xs" ff="monospace">
          {row.lrn}
        </Text>
      </TableTd>
      <TableTd>
        <Stack gap={2}>
          <Text size="xs" fs={isNoName ? "italic" : undefined} c={isNoName ? "dimmed" : undefined}>
            {displayName}
          </Text>
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
        <StatusIcon status={row.status} errorMessage={row.errorMessage} />
      </TableTd>
      <TableTd onClick={(e) => e.stopPropagation()}>
        <Group gap={4} justify="flex-end" wrap="nowrap">
          <Tooltip
            label={editDisabledReason ?? "Edit row"}
            withArrow
            events={{ hover: true, focus: true, touch: true }}
          >
            <span style={{ display: "inline-flex" }}>
              <ActionIcon
                size="sm"
                variant={canEdit ? "subtle" : "default"}
                color="gray"
                onClick={handleEditAttempt}
                disabled={isEditing}
                aria-disabled={!canEdit}
                style={{
                  cursor: canEdit ? "pointer" : "not-allowed",
                  opacity: canEdit ? 1 : 0.45,
                  backgroundColor: canEdit ? undefined : "var(--mantine-color-gray-1)",
                  borderColor: canEdit ? undefined : "var(--mantine-color-gray-4)",
                  color: canEdit ? undefined : "var(--mantine-color-gray-6)",
                }}
              >
                <IconPencil size={13} stroke={1.5} />
              </ActionIcon>
            </span>
          </Tooltip>
          <Tooltip label="Remove row" withArrow>
            <ActionIcon
              size="sm"
              variant="subtle"
              color="red"
              onClick={() =>
                modals.openConfirmModal({
                  title: "Remove row?",
                  children: (
                    <Text size="sm">
                      Row #{displayIndex} will be removed from the import list.
                    </Text>
                  ),
                  labels: { confirm: "Remove", cancel: "Cancel" },
                  confirmProps: { color: "red" },
                  onConfirm: () => onRemove(row.rowNum),
                })
              }
            >
              <IconTrash size={13} stroke={1.5} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </TableTd>
    </TableTr>
  );
}

// ─── Mobile accordion row ─────────────────────────────────────────────────────

function MobileReviewRow({
  row,
  displayIndex,
  editingRowNum,
  selectedRowNum,
  sectionId,
  onEdit,
  onSelect,
  onSave,
  onCancelEdit,
  onRemove,
}: {
  row: ReviewRow;
  displayIndex: number;
  editingRowNum: number | null;
  selectedRowNum: number | null;
  sectionId: number;
  onEdit: (rowNum: number) => void;
  onSelect: (rowNum: number) => void;
  onSave: (updated: ReviewRow) => void;
  onCancelEdit: () => void;
  onRemove: (rowNum: number) => void;
}) {
  const [opened, { toggle }] = useDisclosure(false);
  const isEditing = editingRowNum === row.rowNum;
  const isOtherEditing = editingRowNum !== null && editingRowNum !== row.rowNum;
  const isSelected = selectedRowNum === row.rowNum;
  const isIssue =
    row.status === "format_error" ||
    row.status === "duplicate_lrn" ||
    row.status === "transfer_required" ||
    row.status === "pending_request";

  const displayName = reviewDisplayName(row);
  const isNoName = displayName === "No name";

  const displaySex = row.sex ?? (row.rawSex || "—");
  const editDisabledReason = EDIT_DISABLED_REASON[row.status];
  const canEdit = !editDisabledReason;

  function handleEditAttempt() {
    if (isOtherEditing) return;
    if (canEdit) {
      onEdit(row.rowNum);
      return;
    }

    notifyRowCannotEdit(editDisabledReason);
  }

  function handleRowClick() {
    if (isOtherEditing) return;
    onSelect(row.rowNum);
    toggle();
  }

  if (isEditing) {
    return (
      <>
        <EditableRow
          row={row}
          sectionId={sectionId}
          onSave={onSave}
          onCancel={onCancelEdit}
          mobile
        />
        <Divider />
      </>
    );
  }

  return (
    <>
      <div
        onClick={handleRowClick}
        onDoubleClick={handleEditAttempt}
        style={{
          cursor: isOtherEditing ? "default" : "pointer",
          backgroundColor: isSelected ? EDIT_ROW_BACKGROUND : isIssue ? "rgba(255,102,102,0.07)" : undefined,
          borderRadius: 8,
          padding: "12px 4px",
          paddingLeft: isIssue ? "9px" : "4px",
          borderLeft: isIssue ? "3px solid #FF6666" : "3px solid transparent",
          opacity: isOtherEditing ? 0.4 : 1,
          transition: "opacity 0.15s, background-color 0.15s",
        }}
      >
        <Group justify="space-between" wrap="nowrap" align="center">
          <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
            <IconChevronRight
              size={16}
              style={{
                transform: opened ? "rotate(90deg)" : "rotate(0deg)",
                transition: "transform 200ms ease",
                flexShrink: 0,
                color: "#808898",
              }}
            />
            <StatusIcon status={row.status} errorMessage={row.errorMessage} />
            <Text
              fw={500}
              fz="sm"
              fs={isNoName ? "italic" : undefined}
              c={isNoName ? "dimmed" : undefined}
              style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {displayName}
            </Text>
          </Group>
          <div onClick={(e) => e.stopPropagation()}>
            <Group gap={4} wrap="nowrap">
              <Tooltip
                label={editDisabledReason ?? "Edit row"}
                withArrow
                events={{ hover: true, focus: true, touch: true }}
              >
                <span style={{ display: "inline-flex" }}>
                  <ActionIcon
                    size="sm"
                    variant={canEdit ? "subtle" : "default"}
                    color="gray"
                    onClick={handleEditAttempt}
                    disabled={isOtherEditing}
                    aria-disabled={!canEdit}
                    style={{
                      cursor: canEdit ? "pointer" : "not-allowed",
                      opacity: canEdit ? 1 : 0.45,
                      backgroundColor: canEdit ? undefined : "var(--mantine-color-gray-1)",
                      borderColor: canEdit ? undefined : "var(--mantine-color-gray-4)",
                      color: canEdit ? undefined : "var(--mantine-color-gray-6)",
                    }}
                  >
                    <IconPencil size={13} stroke={1.5} />
                  </ActionIcon>
                </span>
              </Tooltip>
              <ActionIcon
                size="sm"
                variant="subtle"
                color="red"
                disabled={isOtherEditing}
                onClick={(e) => {
                  e.stopPropagation();
                  modals.openConfirmModal({
                    title: "Remove row?",
                    children: (
                      <Text size="sm">
                        Row #{displayIndex} will be removed from the import list.
                      </Text>
                    ),
                    labels: { confirm: "Remove", cancel: "Cancel" },
                    confirmProps: { color: "red" },
                    onConfirm: () => onRemove(row.rowNum),
                  });
                }}
              >
                <IconTrash size={13} stroke={1.5} />
              </ActionIcon>
            </Group>
          </div>
        </Group>
      </div>

      <Collapse in={opened}>
        <Box pb="md" pl={28} pr={4}>
          <Text size="xs" c="dimmed" fw={600} tt="uppercase" mb={2} style={{ letterSpacing: "0.04em" }}>
            Row
          </Text>
          <Text fz="sm" mb="xs">#{displayIndex}</Text>

          <Text size="xs" c="dimmed" fw={600} tt="uppercase" mb={2} style={{ letterSpacing: "0.04em" }}>
            LRN
          </Text>
          <Text fz="sm" ff="monospace" mb="xs">{row.lrn}</Text>

          <Text size="xs" c="dimmed" fw={600} tt="uppercase" mb={2} style={{ letterSpacing: "0.04em" }}>
            Name
          </Text>
          <Text fz="sm" mb="xs">{displayName}</Text>

          <Text size="xs" c="dimmed" fw={600} tt="uppercase" mb={2} style={{ letterSpacing: "0.04em" }}>
            Sex
          </Text>
          <Text fz="sm">
            {displaySex === "M" ? "Male" : displaySex === "F" ? "Female" : displaySex}
          </Text>

          {row.dbName && row.rawName && row.dbName !== row.rawName && (
            <>
              <Text size="xs" c="dimmed" fw={600} tt="uppercase" mt="xs" mb={2} style={{ letterSpacing: "0.04em" }}>
                File Name
              </Text>
              <Text fz="sm" c="dimmed" fs="italic">{row.rawName}</Text>
            </>
          )}
        </Box>
      </Collapse>
      <Divider />
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ImportRosterModal({
  opened,
  sectionId,
  onClose,
  onImported,
}: Props) {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const isMobile = useMediaQuery("(max-width: 768px)");
  const confirmModalProps = isMobile
    ? {
        styles: {
          inner: { alignItems: "flex-end", paddingBottom: "20px" },
          content: { width: "100%", maxWidth: "100%", borderRadius: "12px 12px 0 0" },
        },
      }
    : {};
  const [editingRowNum, setEditingRowNum] = useState<number | null>(null);
  const [selectedRowNum, setSelectedRowNum] = useState<number | null>(null);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const reviewRowsRef = useRef<HTMLDivElement>(null);

  // Reset when modal closes
  useEffect(() => {
    if (!opened) {
      const resetTimer = window.setTimeout(() => {
        setStep("upload");
        setFile(null);
        setRows([]);
        setEditingRowNum(null);
        setSelectedRowNum(null);
        setResults([]);
        setError(null);
        setDragOver(false);
      }, 0);

      return () => window.clearTimeout(resetTimer);
    }
  }, [opened]);

  useEffect(() => {
    if (selectedRowNum === null || step !== "review") return;

    function handlePointerDown(event: PointerEvent) {
      if (!reviewRowsRef.current?.contains(event.target as Node)) {
        setSelectedRowNum(null);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [selectedRowNum, step]);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const actionableRows = rows.filter((r) => ACTIONABLE.includes(r.status));
  const issueRows = rows.filter(
    (r) =>
      r.status === "format_error" ||
      r.status === "duplicate_lrn" ||
      r.status === "transfer_required" ||
      r.status === "pending_request",
  );
  const actionableCount = actionableRows.length;

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function acceptFile(f: File | null) {
    if (!f) return;
    const isXlsx =
      f.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      f.name.endsWith(".xlsx");
    const isXls =
      f.type === "application/vnd.ms-excel" ||
      f.name.endsWith(".xls");
    if (isXlsx || isXls) {
      setFile(f);
      setError(null);
    } else {
      setError("Please upload a valid .xls or .xlsx file.");
      notify({ type: "error", title: "Invalid file", message: "Please upload a valid .xls or .xlsx file." });
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
        const msg = data.error ?? "Failed to process file.";
        setError(msg);
        notify({ type: "error", title: "File error", message: msg });
        setStep("upload");
        return;
      }

      setRows((data.rows as ReviewRow[]) ?? []);
      setSelectedRowNum(null);
      setStep("review");
    } catch {
      const msg = "Network error. Please try again.";
      setError(msg);
      notify({ type: "error", title: "Network error", message: msg });
      setStep("upload");
    }
  }

  async function doSubmit() {
    setStep("submitting");

    const payload = actionableRows.map((r) => {
      const base = { lrn: r.lrn, action: r.action! };
      if (r.action === "new") {
        return {
          ...base,
          last_name: r.last_name,
          first_name: r.first_name,
          middle_name: normalizeOptionalMiddleName(r.middle_name),
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
        notify({
          type: "error",
          title: "Import failed",
          message: data.error ?? "An error occurred.",
        });
        setStep("review");
        return;
      }

      setResults((data.results as ImportResult[]) ?? []);
      setStep("done");
    } catch {
      notify({
        type: "error",
        title: "Network error",
        message: "Failed to import students. Please try again.",
      });
      setStep("review");
    }
  }

  function handleSubmit() {
    if (actionableCount === 0 || issueRows.length > 0) return;
    void doSubmit();
  }

  function handleClose() {
    if (step === "submitting") return;

    if (step === "review" || step === "reviewing") {
      modals.openConfirmModal({
        title: "Discard import?",
        children: (
          <Text size="sm">
            The review data will be lost. Are you sure you want to close?
          </Text>
        ),
        labels: { confirm: "Discard", cancel: "Keep reviewing" },
        confirmProps: { color: "red" },
        onConfirm: onClose,
        ...confirmModalProps,
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
    setSelectedRowNum(rowNum);
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
    if (selectedRowNum === rowNum) setSelectedRowNum(null);
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
      size={step === "review" || step === "reviewing" ? "min(96vw, 1160px)" : "md"}
      closeOnClickOutside={!isBusy}
      closeOnEscape={!isBusy && step !== "review"}
      withCloseButton={!isBusy}
      overlayProps={{ backgroundOpacity: 0.5, blur: 4 }}
    >
      {/* ── Step: Upload ── */}
      {step === "upload" && (
        <Stack gap="md">
          {error && (
            <Alert
              variant="filled"
              radius="md"
              icon={<IconAlertCircle size={16} />}
              styles={{
                root: { backgroundColor: "#FF6666" },
                icon: { alignSelf: "center", marginTop: 0 },
              }}
            >
              {error}
            </Alert>
          )}

          <Text size="sm" c="dimmed">
            Upload the official DepEd School Form 1 (SF1) to import the class
            student list directly.
          </Text>

          {/* SF1 info */}
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
            <Group gap="xs" mb={6} align="center">
              <IconInfoCircle
                size={14}
                color="#228be6"
                style={{ flexShrink: 0 }}
              />
              <Text size="sm" fw={700}>
                What is SF1?
              </Text>
            </Group>
            <Text size="xs" c="dimmed">
              SF1, or School Register, is the official class enrollment record
              used by the Department of Education (DepEd). It contains the
              complete list of enrolled learners with their LRNs, full names,
              and sex.
            </Text>
          </Box>

          {/* Hidden native file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
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
              padding: "32px 16px",
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
                  size={32}
                  color={
                    dragOver ? "#4EAE4A" : "var(--mantine-color-gray-5)"
                  }
                />
                <Text
                  size="sm"
                  fw={500}
                  c={dragOver ? "#4EAE4A" : "dimmed"}
                >
                  {dragOver ? "Drop it here" : "Drag & drop your SF1 here"}
                </Text>
                <Text size="xs" c="dimmed">
                  or{" "}
                  <Text span c="#4EAE4A" fw={500}>
                    click to browse
                  </Text>
                </Text>
                <Text size="xs" c="dimmed">.xls or .xlsx</Text>
              </Stack>
            )}
          </Box>

          {file && (
            <Group justify="flex-end">
              <Button
                size="sm"
                variant="default"
                leftSection={<IconX size={14} />}
                onClick={(e) => {
                  e.stopPropagation();
                  setFile(null);
                }}
              >
                Clear
              </Button>
            </Group>
          )}

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
              Review
            </Button>
          </Group>
        </Stack>
      )}

      {/* ── Step: Reviewing (loading) ── */}
      {step === "reviewing" && <ProcessingAnimation />}

      {/* ── Step: Review ── */}
      {step === "review" && (
        <Stack gap="md">
          {issueRows.length > 0 && (
            <Alert
              variant="filled"
              radius="md"
              icon={<IconAlertCircle size={16} />}
              styles={{
                root: { backgroundColor: "#FF6666" },
                icon: { alignSelf: "center", marginTop: 0 },
              }}
            >
              <Text size="sm" fw={600}>
                {issueRows.length} row{issueRows.length !== 1 ? "s" : ""} need attention before you can submit.
              </Text>
              <Text size="sm">
                Fix rows with format errors, or remove rows that require a transfer request.
              </Text>
            </Alert>
          )}

          {rows.length === 0 ? (
            <Text size="sm" c="dimmed" ta="center" py="md">
              No rows found in the uploaded file.
            </Text>
          ) : (
            <div ref={reviewRowsRef}>
              {/* Desktop table */}
              <div className="hidden sm:block">
                <ScrollArea.Autosize mah="62vh" type="auto" offsetScrollbars scrollbarSize={8}>
                  <TableScrollContainer minWidth={580} type="native">
                    <Table
                      verticalSpacing={6}
                      withColumnBorders={false}
                      style={{ width: "100%", tableLayout: "fixed" }}
                    >
                      <colgroup>
                        <col style={{ width: 40 }} />
                        <col style={{ width: 130 }} />
                        <col />
                        <col style={{ width: 68 }} />
                        <col style={{ width: 48 }} />
                        <col style={{ width: 76 }} />
                      </colgroup>
                      <TableThead>
                        <TableTr>
                          <TableTh>Row</TableTh>
                          <TableTh>LRN</TableTh>
                          <TableTh>Name</TableTh>
                          <TableTh>Sex</TableTh>
                          <TableTh>Status</TableTh>
                          <TableTh />
                        </TableTr>
                      </TableThead>
                      <TableTbody>
                        {rows.map((row, idx) =>
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
                              displayIndex={idx + 1}
                              editingRowNum={editingRowNum}
                              selectedRowNum={selectedRowNum}
                              onEdit={handleEditRow}
                              onSelect={setSelectedRowNum}
                              onRemove={handleRemoveRow}
                            />
                          ),
                        )}
                      </TableTbody>
                    </Table>
                  </TableScrollContainer>
                </ScrollArea.Autosize>
              </div>

              {/* Mobile accordion */}
              <div className="sm:hidden">
                <ScrollArea.Autosize mah="60vh" type="auto">
                  <Divider />
                  {rows.map((row, idx) => (
                    <MobileReviewRow
                      key={row.rowNum}
                      row={row}
                      displayIndex={idx + 1}
                      editingRowNum={editingRowNum}
                      selectedRowNum={selectedRowNum}
                      sectionId={sectionId}
                      onEdit={handleEditRow}
                      onSelect={setSelectedRowNum}
                      onSave={handleSaveRow}
                      onCancelEdit={handleCancelEdit}
                      onRemove={handleRemoveRow}
                    />
                  ))}
                </ScrollArea.Autosize>
              </div>
            </div>
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
              variant="default"
              onClick={() => {
                setStep("upload");
                setRows([]);
                setEditingRowNum(null);
                setSelectedRowNum(null);
              }}
            >
              Back
            </Button>
            <Group gap="xs">
              <Button variant="default" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                color="#4EAE4A"
                disabled={actionableCount === 0 || editingRowNum !== null || issueRows.length > 0}
                onClick={handleSubmit}
              >
                Submit
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
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              backgroundColor: "#4EAE4A",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <IconCheck size={28} stroke={2.5} color="#fff" />
          </div>
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
