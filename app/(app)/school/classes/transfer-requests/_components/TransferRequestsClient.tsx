"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Chip,
  Divider,
  Group,
  Modal,
  Pagination,
  Paper,
  Skeleton,
  Stack,
  Text,
  Textarea,
  Tooltip,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import {
  IconAlertCircle,
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconClock,
  IconRefresh,
  IconX,
} from "@tabler/icons-react";
import { useAuth } from "@/context/AuthContext";
import {
  approveTransferRequest,
  cancelTransferRequest,
  fetchIncomingTransferRequests,
  fetchOutgoingTransferRequests,
  rejectTransferRequest,
  type CancellationReason,
  type TransferRequestItem,
  type TransferRequestStatus,
} from "../../_lib/classService";

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 5;

const STATUS_CONFIG: Record<
  TransferRequestStatus | "ALL",
  { label: string; color: string }
> = {
  ALL: { label: "All", color: "gray" },
  PENDING: { label: "Pending", color: "yellow" },
  APPROVED: { label: "Approved", color: "green" },
  REJECTED: { label: "Rejected", color: "red" },
  CANCELLED: { label: "Cancelled", color: "gray" },
};

const FILTER_ORDER: Array<TransferRequestStatus | "ALL"> = [
  "ALL",
  "PENDING",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
];

const CANCELLATION_LABELS: Record<CancellationReason, string> = {
  STUDENT_UNENROLLED: "Student was unenrolled",
  SECTION_DELETED: "Section was archived",
  REQUESTER_DEACTIVATED: "Requester was deactivated",
  PERMISSION_REVOKED: "Permission was revoked",
  MOVED_BY_ADMIN: "Student was moved directly by an admin",
  EXPIRED: "Request expired",
  MANUAL: "Cancelled manually",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function daysUntil(dateStr: string): number {
  return Math.ceil(
    (new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SectionSkeleton() {
  return (
    <Stack gap="xs">
      <Group gap="xs" mb={4}>
        {[80, 95, 90, 95, 100].map((w, i) => (
          <Skeleton key={i} height={26} width={w} radius="xl" />
        ))}
      </Group>
      {[0, 1, 2].map((i) => (
        <Paper key={i} withBorder p="md" radius="md">
          <Stack gap="xs">
            <Group justify="space-between">
              <Skeleton height={16} width={180} radius="sm" />
              <Skeleton height={20} width={70} radius="xl" />
            </Group>
            <Skeleton height={13} width={260} radius="sm" />
            <Skeleton height={13} width={200} radius="sm" />
          </Stack>
        </Paper>
      ))}
    </Stack>
  );
}

// ─── Status Filter Chips ──────────────────────────────────────────────────────

function StatusChips({
  items,
  value,
  onChange,
}: {
  items: TransferRequestItem[];
  value: string;
  onChange: (v: string) => void;
}) {
  const counts = useMemo(() => {
    const map: Record<string, number> = { ALL: items.length };
    for (const r of items) {
      map[r.status] = (map[r.status] ?? 0) + 1;
    }
    return map;
  }, [items]);

  const visibleFilters = FILTER_ORDER.filter(
    (s) => s === "ALL" || (counts[s] ?? 0) > 0,
  );

  return (
    <Chip.Group multiple={false} value={value} onChange={onChange}>
      <Group gap="xs" mb="xs">
        {visibleFilters.map((s) => (
          <Chip
            key={s}
            value={s}
            size="xs"
            color={STATUS_CONFIG[s].color}
            variant="light"
          >
            {STATUS_CONFIG[s].label} (
            {s === "ALL" ? counts.ALL : (counts[s] ?? 0)})
          </Chip>
        ))}
      </Group>
    </Chip.Group>
  );
}

// ─── Request Card ─────────────────────────────────────────────────────────────

function RequestCard({
  item,
  direction,
  actioning,
  onApprove,
  onReject,
  onCancel,
}: {
  item: TransferRequestItem;
  direction: "incoming" | "outgoing";
  actioning: boolean;
  onApprove: (item: TransferRequestItem) => void;
  onReject: (item: TransferRequestItem) => void;
  onCancel: (item: TransferRequestItem) => void;
}) {
  const { color, label } = STATUS_CONFIG[item.status];
  const days = item.status === "PENDING" ? daysUntil(item.expires_at) : 0;
  const isExpiringSoon = item.status === "PENDING" && days <= 3;

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap={6}>
        {/* Header: student name + status badges */}
        <Group
          justify="space-between"
          align="flex-start"
          wrap="nowrap"
          gap="xs"
        >
          <Stack gap={2} style={{ minWidth: 0 }}>
            <Text fw={700} size="sm" style={{ wordBreak: "break-word" }}>
              {item.student_full_name.toUpperCase()}
            </Text>
            <Text size="xs" c="dimmed">
              {item.student_sex === "M" ? "Male" : "Female"}
            </Text>
          </Stack>
          <Group gap={6} style={{ flexShrink: 0 }}>
            {isExpiringSoon && (
              <Tooltip
                label={`Expires in ${days} day${days !== 1 ? "s" : ""}`}
                withArrow
              >
                <Badge
                  color="red"
                  size="sm"
                  variant="light"
                  leftSection={<IconClock size={10} />}
                >
                  {days}d left
                </Badge>
              </Tooltip>
            )}
            <Badge color={color} size="sm" variant="light">
              {label}
            </Badge>
          </Group>
        </Group>

        {/* Transfer route */}
        <Group gap={4} wrap="nowrap" align="center">
          <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
            {item.from_grade_level_display} – {item.from_section_name}
          </Text>
          <IconArrowRight
            size={12}
            color="var(--mantine-color-dimmed)"
            style={{ flexShrink: 0 }}
          />
          <Text
            size="xs"
            c="dimmed"
            style={{ minWidth: 0, wordBreak: "break-word" }}
          >
            {item.to_grade_level_display} – {item.to_section_name}
          </Text>
        </Group>

        {/* Status-specific metadata */}
        {direction === "incoming" && (
          <Text size="xs" c="dimmed">
            Requested by{" "}
            <Text span fw={500} c="var(--mantine-color-text)">
              {item.requester_name}
            </Text>{" "}
            · {formatRelativeTime(item.requested_at)}
          </Text>
        )}
        {direction === "outgoing" && item.status === "PENDING" && (
          <Text size="xs" c="dimmed">
            {item.from_adviser_name ? (
              <>
                Awaiting approval from{" "}
                <Text span fw={500} c="var(--mantine-color-text)">
                  {item.from_adviser_name}
                </Text>
              </>
            ) : (
              "Pending approval"
            )}{" "}
            · {formatRelativeTime(item.requested_at)}
          </Text>
        )}
        {direction === "outgoing" && item.status !== "PENDING" && (
          <Text size="xs" c="dimmed">
            Submitted {formatRelativeTime(item.requested_at)}
          </Text>
        )}

        {/* Review time */}
        {(item.status === "APPROVED" || item.status === "REJECTED") &&
          item.reviewed_at && (
            <Text size="xs" c="dimmed">
              {item.status === "APPROVED" ? "Approved" : "Rejected"}{" "}
              {formatRelativeTime(item.reviewed_at)}
            </Text>
          )}

        {/* Rejection reason */}
        {item.status === "REJECTED" && item.notes && (
          <Text
            size="xs"
            c="dimmed"
            fs="italic"
            style={{
              borderLeft: "2px solid var(--mantine-color-red-3)",
              paddingLeft: 8,
            }}
          >
            &ldquo;{item.notes}&rdquo;
          </Text>
        )}

        {/* Cancellation reason */}
        {item.status === "CANCELLED" && item.cancellation_reason && (
          <Text size="xs" c="dimmed">
            {CANCELLATION_LABELS[item.cancellation_reason] ??
              item.cancellation_reason}
          </Text>
        )}

        {/* Actions */}
        {direction === "incoming" && item.status === "PENDING" && (
          <Group gap="xs" justify="flex-end" mt={4}>
            <Button
              size="xs"
              variant="light"
              color="red"
              leftSection={<IconX size={13} />}
              disabled={actioning}
              onClick={() => onReject(item)}
            >
              Reject
            </Button>
            <Button
              size="xs"
              color="#4EAE4A"
              leftSection={<IconCheck size={13} />}
              loading={actioning}
              disabled={actioning}
              onClick={() => onApprove(item)}
            >
              Approve
            </Button>
          </Group>
        )}

        {direction === "outgoing" && item.status === "PENDING" && (
          <Group justify="flex-end" mt={4}>
            <Button
              size="xs"
              variant="subtle"
              color="gray"
              leftSection={<IconX size={13} />}
              disabled={actioning}
              onClick={() => onCancel(item)}
            >
              Cancel Request
            </Button>
          </Group>
        )}
      </Stack>
    </Paper>
  );
}

// ─── Section Component ────────────────────────────────────────────────────────

function RequestSection({
  title,
  description,
  items,
  loading,
  error,
  direction,
  filter,
  onFilterChange,
  actioning,
  onApprove,
  onReject,
  onCancel,
  emptyMessage,
}: {
  title: string;
  description: string;
  items: TransferRequestItem[];
  loading: boolean;
  error: string | null;
  direction: "incoming" | "outgoing";
  filter: string;
  onFilterChange: (v: string) => void;
  actioning: Set<string>;
  onApprove: (item: TransferRequestItem) => void;
  onReject: (item: TransferRequestItem) => void;
  onCancel: (item: TransferRequestItem) => void;
  emptyMessage: string;
}) {
  const [page, setPage] = useState(1);

  const filtered = useMemo(
    () => (filter === "ALL" ? items : items.filter((r) => r.status === filter)),
    [items, filter],
  );

  // Reset to page 1 whenever the filter changes
  useEffect(() => {
    setPage(1);
  }, [filter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // If items disappear (e.g. after an action), clamp to the last available page
  const safePage = Math.min(page, totalPages);
  const paginatedItems = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );
  const rangeStart = filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(safePage * PAGE_SIZE, filtered.length);

  return (
    <Box>
      <Text fw={700} size="lg" mb={4}>
        {title}
      </Text>
      <Text size="xs" c="dimmed" mb="sm">
        {description}
      </Text>

      {loading ? (
        <SectionSkeleton />
      ) : error ? (
        <Alert color="red" icon={<IconAlertCircle size={16} />}>
          {error}
        </Alert>
      ) : items.length === 0 ? (
        <Text size="sm" c="dimmed" ta="center" py="lg">
          {emptyMessage}
        </Text>
      ) : (
        <>
          <StatusChips items={items} value={filter} onChange={onFilterChange} />
          {filtered.length === 0 ? (
            <Text size="sm" c="dimmed" ta="center" py="md">
              No requests match the selected filter.
            </Text>
          ) : (
            <Stack gap="xs">
              {filtered.length > PAGE_SIZE && (
                <Text size="xs" c="dimmed" ta="right">
                  Showing {rangeStart}–{rangeEnd} of {filtered.length}
                </Text>
              )}
              {paginatedItems.map((item) => (
                <RequestCard
                  key={item.request_id}
                  item={item}
                  direction={direction}
                  actioning={actioning.has(item.request_id)}
                  onApprove={onApprove}
                  onReject={onReject}
                  onCancel={onCancel}
                />
              ))}
              {totalPages > 1 && (
                <Group justify="center" mt="xs">
                  <Pagination
                    value={safePage}
                    onChange={setPage}
                    total={totalPages}
                    size="sm"
                    radius="md"
                  />
                </Group>
              )}
            </Stack>
          )}
        </>
      )}
    </Box>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TransferRequestsClient() {
  const { user, permissions } = useAuth();

  const canSeeIncoming =
    permissions.includes("full_access_student_management") ||
    permissions.includes("partial_access_student_management");
  const canSeeOutgoing = permissions.includes(
    "partial_access_student_management",
  );

  const [incoming, setIncoming] = useState<TransferRequestItem[]>([]);
  const [outgoing, setOutgoing] = useState<TransferRequestItem[]>([]);
  const [loadingIncoming, setLoadingIncoming] = useState(canSeeIncoming);
  const [loadingOutgoing, setLoadingOutgoing] = useState(canSeeOutgoing);
  const [errorIncoming, setErrorIncoming] = useState<string | null>(null);
  const [errorOutgoing, setErrorOutgoing] = useState<string | null>(null);
  const [incomingFilter, setIncomingFilter] = useState("ALL");
  const [outgoingFilter, setOutgoingFilter] = useState("ALL");
  const [actioning, setActioning] = useState<Set<string>>(new Set());

  // Reject modal
  const [rejectTarget, setRejectTarget] = useState<TransferRequestItem | null>(
    null,
  );
  const [rejectNotes, setRejectNotes] = useState("");
  const [rejecting, setRejecting] = useState(false);

  const refresh = useCallback(() => {
    if (canSeeIncoming) {
      setLoadingIncoming(true);
      setErrorIncoming(null);
      fetchIncomingTransferRequests()
        .then(setIncoming)
        .catch((e: Error) => setErrorIncoming(e.message))
        .finally(() => setLoadingIncoming(false));
    }
    if (canSeeOutgoing) {
      setLoadingOutgoing(true);
      setErrorOutgoing(null);
      fetchOutgoingTransferRequests()
        .then(setOutgoing)
        .catch((e: Error) => setErrorOutgoing(e.message))
        .finally(() => setLoadingOutgoing(false));
    }
  }, [canSeeIncoming, canSeeOutgoing]);

  useEffect(() => {
    if (!user) return;
    refresh();
  }, [user, refresh]);

  // ── Approve ────────────────────────────────────────────────────────────────

  function handleApprove(item: TransferRequestItem) {
    modals.openConfirmModal({
      title: "Approve transfer?",
      centered: true,
      children: (
        <Stack gap="xs">
          <Text size="sm">
            Approve the transfer of{" "}
            <strong>{item.student_full_name.toUpperCase()}</strong> from{" "}
            <strong>
              {item.from_grade_level_display} – {item.from_section_name}
            </strong>{" "}
            to{" "}
            <strong>
              {item.to_grade_level_display} – {item.to_section_name}
            </strong>
            ?
          </Text>
          <Text size="xs" c="dimmed">
            The student will be moved to the new class immediately.
          </Text>
        </Stack>
      ),
      labels: { confirm: "Approve", cancel: "Cancel" },
      confirmProps: { color: "#4EAE4A" },
      onConfirm: () => void submitApprove(item),
    });
  }

  async function submitApprove(item: TransferRequestItem) {
    setActioning((prev) => new Set(prev).add(item.request_id));
    const optimistic: TransferRequestItem = {
      ...item,
      status: "APPROVED",
      reviewed_at: new Date().toISOString(),
    };
    setIncoming((prev) =>
      prev.map((r) => (r.request_id === item.request_id ? optimistic : r)),
    );

    try {
      await approveTransferRequest(item.request_id);
      notifications.show({
        title: "Transfer Approved",
        message: `${item.student_full_name.toUpperCase()} has been moved to ${item.to_grade_level_display} – ${item.to_section_name}.`,
        color: "green",
      });
    } catch (e) {
      setIncoming((prev) =>
        prev.map((r) => (r.request_id === item.request_id ? item : r)),
      );
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("REQUEST_NOT_PENDING")) {
        notifications.show({
          title: "Already actioned",
          message: "This request was already approved or rejected. Refreshing…",
          color: "orange",
        });
        refresh();
      } else {
        notifications.show({
          title: "Approval failed",
          message: "Could not approve the transfer. Please try again.",
          color: "red",
        });
      }
    } finally {
      setActioning((prev) => {
        const next = new Set(prev);
        next.delete(item.request_id);
        return next;
      });
    }
  }

  // ── Reject ─────────────────────────────────────────────────────────────────

  function handleReject(item: TransferRequestItem) {
    setRejectNotes("");
    setRejectTarget(item);
  }

  async function submitReject() {
    if (!rejectTarget) return;
    const item = rejectTarget;
    const trimmedNotes = rejectNotes.trim();
    setRejecting(true);
    setRejectTarget(null);
    setActioning((prev) => new Set(prev).add(item.request_id));

    const optimistic: TransferRequestItem = {
      ...item,
      status: "REJECTED",
      reviewed_at: new Date().toISOString(),
      notes: trimmedNotes || null,
    };
    setIncoming((prev) =>
      prev.map((r) => (r.request_id === item.request_id ? optimistic : r)),
    );

    try {
      await rejectTransferRequest(item.request_id, trimmedNotes || undefined);
      notifications.show({
        title: "Transfer Rejected",
        message: `The transfer request for ${item.student_full_name.toUpperCase()} has been rejected.`,
        color: "orange",
      });
    } catch (e) {
      setIncoming((prev) =>
        prev.map((r) => (r.request_id === item.request_id ? item : r)),
      );
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("REQUEST_NOT_PENDING")) {
        notifications.show({
          title: "Already actioned",
          message: "This request is no longer pending. Refreshing…",
          color: "orange",
        });
        refresh();
      } else {
        notifications.show({
          title: "Rejection failed",
          message: "Could not reject the transfer. Please try again.",
          color: "red",
        });
      }
    } finally {
      setRejecting(false);
      setActioning((prev) => {
        const next = new Set(prev);
        next.delete(item.request_id);
        return next;
      });
    }
  }

  // ── Cancel ─────────────────────────────────────────────────────────────────

  function handleCancel(item: TransferRequestItem) {
    modals.openConfirmModal({
      title: "Cancel transfer request?",
      centered: true,
      children: (
        <Text size="sm">
          Cancel the transfer request for{" "}
          <strong>{item.student_full_name.toUpperCase()}</strong>? This cannot
          be undone.
        </Text>
      ),
      labels: { confirm: "Cancel Request", cancel: "Keep" },
      confirmProps: { color: "red" },
      onConfirm: () => void submitCancel(item),
    });
  }

  async function submitCancel(item: TransferRequestItem) {
    setActioning((prev) => new Set(prev).add(item.request_id));
    const optimistic: TransferRequestItem = {
      ...item,
      status: "CANCELLED",
      cancellation_reason: "MANUAL",
      reviewed_at: new Date().toISOString(),
    };
    setOutgoing((prev) =>
      prev.map((r) => (r.request_id === item.request_id ? optimistic : r)),
    );

    try {
      await cancelTransferRequest(item.request_id);
      notifications.show({
        title: "Request Cancelled",
        message: `Transfer request for ${item.student_full_name.toUpperCase()} has been cancelled.`,
        color: "gray",
      });
    } catch (e) {
      setOutgoing((prev) =>
        prev.map((r) => (r.request_id === item.request_id ? item : r)),
      );
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("REQUEST_NOT_PENDING")) {
        notifications.show({
          title: "Already actioned",
          message: "This request is no longer pending. Refreshing…",
          color: "orange",
        });
        refresh();
      } else {
        notifications.show({
          title: "Cancellation failed",
          message: "Could not cancel the request. Please try again.",
          color: "red",
        });
      }
    } finally {
      setActioning((prev) => {
        const next = new Set(prev);
        next.delete(item.request_id);
        return next;
      });
    }
  }

  const isRefreshing = loadingIncoming || loadingOutgoing;

  return (
    <>
      {/* Page header */}
      <Button
        variant="light"
        color="#597D37"
        leftSection={<IconArrowLeft size={16} />}
        mb="md"
        component={Link}
        href="/school/classes"
        size="md"
      >
        Back to Classes
      </Button>
      <Group mb="xs" align="center" gap="xs">
        <Text size="xl" fw={700}>
          Transfer Requests
        </Text>
        <Box style={{ marginLeft: "auto" }}>
          <Tooltip label="Refresh" position="bottom" withArrow>
            <ActionIcon
              variant="outline"
              color="#808898"
              size="lg"
              radius="xl"
              onClick={refresh}
              loading={isRefreshing}
              aria-label="Refresh transfer requests"
            >
              <IconRefresh size={18} stroke={1.5} />
            </ActionIcon>
          </Tooltip>
        </Box>
      </Group>
      <p className="mb-6 text-sm text-[#808898]">
        Track and manage classes/sections transfer requests. Incoming requests
        are from students in your class; outgoing are requests you&apos;ve
        submitted.
      </p>

      <Stack gap="xl">
        {canSeeIncoming && (
          <RequestSection
            title="Incoming Requests"
            description="Transfer requests from students in your class that require your approval."
            items={incoming}
            loading={loadingIncoming}
            error={errorIncoming}
            direction="incoming"
            filter={incomingFilter}
            onFilterChange={setIncomingFilter}
            actioning={actioning}
            onApprove={handleApprove}
            onReject={handleReject}
            onCancel={() => {}}
            emptyMessage="No incoming transfer requests."
          />
        )}

        {canSeeIncoming && canSeeOutgoing && <Divider />}

        {canSeeOutgoing && (
          <RequestSection
            title="My Requests"
            description="Transfer requests you've submitted for students in other classes."
            items={outgoing}
            loading={loadingOutgoing}
            error={errorOutgoing}
            direction="outgoing"
            filter={outgoingFilter}
            onFilterChange={setOutgoingFilter}
            actioning={actioning}
            onApprove={() => {}}
            onReject={() => {}}
            onCancel={handleCancel}
            emptyMessage="You haven't submitted any transfer requests yet."
          />
        )}
      </Stack>

      {/* Reject modal — separate Modal so Textarea has its own controlled state */}
      <Modal
        opened={rejectTarget !== null}
        onClose={() => {
          if (!rejecting) setRejectTarget(null);
        }}
        title="Reject transfer request"
        centered
        size="sm"
        closeOnClickOutside={!rejecting}
        closeOnEscape={!rejecting}
        withCloseButton={!rejecting}
      >
        {rejectTarget && (
          <Stack gap="sm">
            <Text size="sm">
              Reject the transfer request for{" "}
              <strong>{rejectTarget.student_full_name.toUpperCase()}</strong>?
            </Text>
            <Textarea
              label="Reason (optional)"
              placeholder="Enter a reason for rejection…"
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.currentTarget.value)}
              autosize
              minRows={2}
              maxRows={5}
              maxLength={500}
              description={`${rejectNotes.length}/500`}
              disabled={rejecting}
            />
            <Group justify="flex-end" mt="xs">
              <Button
                variant="default"
                onClick={() => setRejectTarget(null)}
                disabled={rejecting}
              >
                Cancel
              </Button>
              <Button
                color="red"
                loading={rejecting}
                onClick={() => void submitReject()}
              >
                Reject
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </>
  );
}
