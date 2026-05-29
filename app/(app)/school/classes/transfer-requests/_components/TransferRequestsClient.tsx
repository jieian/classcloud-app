"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useMediaQuery } from "@mantine/hooks";
import BackButton from "@/components/BackButton";
import {
  Accordion,
  Alert,
  Badge,
  Box,
  Button,
  Center,
  Divider,
  Group,
  Modal,
  Paper,
  Select,
  Skeleton,
  Stack,
  Text,
  Textarea,
  ThemeIcon,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { notify } from "@/components/notificationIcon/notificationIcon";
import {
  IconAlertCircle,
  IconArrowRight,
  IconClock,
  IconMailDown,
  IconMailOff,
  IconMailUp,
} from "@tabler/icons-react";
import { useAuth } from "@/context/AuthContext";
import {
  approveTransferRequest,
  cancelTransferRequest,
  fetchIncomingTransferRequests,
  fetchNotifications,
  fetchOutgoingTransferRequests,
  markAllNotificationsRead,
  markNotificationsRead,
  rejectTransferRequest,
  type CancellationReason,
  type NotificationItem,
  type TransferRequestItem,
  type TransferRequestStatus,
} from "@/lib/services/classService";

// ─── Constants ────────────────────────────────────────────────────────────────

const PREVIEW_SIZE = 3;

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

// ─── Status Filter Select ─────────────────────────────────────────────────────

function StatusSelect({
  items,
  value,
  onChange,
  icon,
}: {
  items: TransferRequestItem[];
  value: string;
  onChange: (v: string) => void;
  icon: React.ReactNode;
}) {
  const counts = useMemo(() => {
    const map: Record<string, number> = { ALL: items.length };
    for (const r of items) {
      map[r.status] = (map[r.status] ?? 0) + 1;
    }
    return map;
  }, [items]);

  const data = FILTER_ORDER.filter(
    (s) => s === "ALL" || (counts[s] ?? 0) > 0,
  ).map((s) => ({
    value: s,
    label:
      s === "ALL"
        ? `All Requests (${counts.ALL})`
        : `${STATUS_CONFIG[s].label} (${counts[s] ?? 0})`,
  }));

  return (
    <Select
      data={data}
      value={value}
      onChange={(v) => v && onChange(v)}
      leftSection={icon}
      w={200}
      clearable={false}
      mb="xs"
    />
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
            Awaiting admin approval · {formatRelativeTime(item.requested_at)}
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
              color="red"
              disabled={actioning}
              onClick={() => onReject(item)}
            >
              Reject
            </Button>
            <Button
              size="xs"
              color="#4EAE4A"
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
              variant="default"
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
  icon,
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
  icon: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);

  const filtered = useMemo(() => {
    const base = filter === "ALL" ? items : items.filter((r) => r.status === filter);
    return [...base].sort(
      (a, b) => new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime(),
    );
  }, [items, filter]);

  useEffect(() => {
    setExpanded(false);
  }, [filter]);

  const visibleItems = expanded ? filtered : filtered.slice(0, PREVIEW_SIZE);
  const hiddenCount = filtered.length - PREVIEW_SIZE;

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
        <Center
          py={36}
          px="md"
          style={{
            border: "1px solid var(--mantine-color-gray-3)",
            borderRadius: "8px",
            backgroundColor: "#FFFFFF",
          }}
        >
          <Stack gap={10} align="center">
            <ThemeIcon size={48} radius="xl" color="gray.2" variant="filled">
              <IconMailOff size={28} stroke={1.5} color="#3D4147" />
            </ThemeIcon>
            <Stack gap={4} align="center">
              <Text size="sm" fw={500} c="#111827">
                {emptyMessage}
              </Text>
            </Stack>
          </Stack>
        </Center>
      ) : (
        <>
          <StatusSelect items={items} value={filter} onChange={onFilterChange} icon={icon} />
          {filtered.length === 0 ? (
            <Text size="sm" c="dimmed" ta="center" py="md">
              No requests match the selected filter.
            </Text>
          ) : (
            <Stack gap="xs">
              {visibleItems.map((item) => (
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
              {!expanded && hiddenCount > 0 && (
                <UnstyledButton onClick={() => setExpanded(true)} style={{ width: "100%", textAlign: "center" }} py="sm">
                  <Text size="sm" c="dimmed">See More</Text>
                </UnstyledButton>
              )}
              {expanded && filtered.length > PREVIEW_SIZE && (
                <UnstyledButton onClick={() => setExpanded(false)} style={{ width: "100%", textAlign: "center" }} py="sm">
                  <Text size="sm" c="dimmed">See Less</Text>
                </UnstyledButton>
              )}
            </Stack>
          )}
        </>
      )}
    </Box>
  );
}

// ─── Notifications Panel ──────────────────────────────────────────────────────

function NotificationsSkeleton() {
  return (
    <Stack gap="xs">
      {[0, 1].map((i) => (
        <Paper key={i} withBorder p="sm" radius="md">
          <Group gap="sm" align="flex-start">
            <Skeleton height={10} width={10} radius="xl" mt={4} style={{ flexShrink: 0 }} />
            <Stack gap={4} style={{ flex: 1 }}>
              <Skeleton height={14} width="55%" radius="sm" />
              <Skeleton height={12} width="80%" radius="sm" />
            </Stack>
            <Skeleton height={12} width={40} radius="sm" style={{ flexShrink: 0 }} />
          </Group>
        </Paper>
      ))}
    </Stack>
  );
}

function NotificationsPanel({
  notifs,
  loading,
  onMarkRead,
  onMarkAllRead,
}: {
  notifs: NotificationItem[];
  loading: boolean;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const unreadCount = notifs.filter((n) => !n.read_at).length;
  const hasUnread = unreadCount > 0;

  const sorted = [...notifs].sort((a, b) => {
    if (!a.read_at && b.read_at) return -1;
    if (a.read_at && !b.read_at) return 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const visibleNotifs = expanded ? sorted : sorted.slice(0, PREVIEW_SIZE);
  const hiddenCount = sorted.length - PREVIEW_SIZE;

  useEffect(() => {
    setExpanded(false);
  }, [notifs.length]);

  return (
    <Box mb="lg">
      <Accordion
        multiple
        defaultValue={[]}
        variant="separated"
        styles={{
          item: { border: "1px solid var(--mantine-color-default-border)" },
        }}
      >
        <Accordion.Item value="notifications">
          <Accordion.Control>
            <Group justify="space-between" align="center" pr="xs">
              <Group gap="xs">
                <Text fw={700} size="md">
                  Notifications
                </Text>
                {hasUnread && (
                  <Badge size="xs" color="red" variant="filled">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </Badge>
                )}
              </Group>
              {hasUnread && (
                <Button
                  variant="default"
                  size="xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMarkAllRead();
                  }}
                >
                  Mark all as read
                </Button>
              )}
            </Group>
          </Accordion.Control>
          <Accordion.Panel>
            <Text size="xs" c="dimmed" mb="sm">
              Notifications relevant to your classes and transfer requests.
            </Text>

            {loading ? (
              <NotificationsSkeleton />
            ) : (
              <Stack gap="xs">
                {visibleNotifs.map((n) => {
                  const isUnread = !n.read_at;
                  return (
                    <Paper
                      key={n.notification_id}
                      withBorder
                      p="sm"
                      radius="md"
                      style={{
                        opacity: isUnread ? 1 : 0.6,
                        cursor: isUnread ? "pointer" : "default",
                      }}
                      onClick={() => isUnread && onMarkRead(n.notification_id)}
                    >
                      <Group gap="sm" align="flex-start" wrap="nowrap">
                        <div
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: "50%",
                            backgroundColor: isUnread ? "#4EAE4A" : "#ccc",
                            flexShrink: 0,
                            marginTop: 4,
                          }}
                        />
                        <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                          <Text fw={500} size="sm" style={{ wordBreak: "break-word" }}>
                            {n.title}
                          </Text>
                          {n.body && (
                            <Text size="xs" c="dimmed" style={{ wordBreak: "break-word" }}>
                              {n.body}
                            </Text>
                          )}
                        </Stack>
                        <Text size="xs" c="dimmed" style={{ flexShrink: 0, whiteSpace: "nowrap" }}>
                          {formatRelativeTime(n.created_at)}
                        </Text>
                      </Group>
                    </Paper>
                  );
                })}
                {!expanded && hiddenCount > 0 && (
                  <UnstyledButton onClick={() => setExpanded(true)} style={{ width: "100%", textAlign: "center" }} py="sm">
                    <Text size="sm" c="dimmed">See More</Text>
                  </UnstyledButton>
                )}
                {expanded && sorted.length > PREVIEW_SIZE && (
                  <UnstyledButton onClick={() => setExpanded(false)} style={{ width: "100%", textAlign: "center" }} py="sm">
                    <Text size="sm" c="dimmed">See Less</Text>
                  </UnstyledButton>
                )}
              </Stack>
            )}
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>

      <Divider mt="lg" />
    </Box>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TransferRequestsClient() {
  const { user, permissions } = useAuth();

  const canSeeIncoming = permissions.includes("students.full_access");
  const canSeeOutgoing = permissions.includes("students.limited_access");
  const isMobile = useMediaQuery("(max-width: 768px)");
  const confirmModalProps = isMobile
    ? {
        styles: {
          inner: { alignItems: "flex-end", paddingBottom: "20px" },
          content: { width: "100%", maxWidth: "100%", borderRadius: "12px 12px 0 0" },
        },
      }
    : {};

  const [incoming, setIncoming] = useState<TransferRequestItem[]>([]);
  const [outgoing, setOutgoing] = useState<TransferRequestItem[]>([]);
  const [loadingIncoming, setLoadingIncoming] = useState(canSeeIncoming);
  const [loadingOutgoing, setLoadingOutgoing] = useState(canSeeOutgoing);
  const [errorIncoming, setErrorIncoming] = useState<string | null>(null);
  const [errorOutgoing, setErrorOutgoing] = useState<string | null>(null);

  const [notifs, setNotifs] = useState<NotificationItem[]>([]);
  const [loadingNotifs, setLoadingNotifs] = useState(true);
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
    setLoadingNotifs(true);
    fetchNotifications()
      .then(setNotifs)
      .catch(() => {})
      .finally(() => setLoadingNotifs(false));
  }, [canSeeIncoming, canSeeOutgoing]);

  const handleMarkRead = useCallback((id: string) => {
    setNotifs((prev) =>
      prev.map((n) =>
        n.notification_id === id ? { ...n, read_at: new Date().toISOString() } : n,
      ),
    );
    markNotificationsRead([id]).catch(() => {});
  }, []);

  const handleMarkAllRead = useCallback(() => {
    const now = new Date().toISOString();
    setNotifs((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? now })));
    markAllNotificationsRead().catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    refresh();
  }, [user, refresh]);

  // ── Approve ────────────────────────────────────────────────────────────────

  function handleApprove(item: TransferRequestItem) {
    modals.openConfirmModal({
      title: "Approve transfer?",
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
      ...confirmModalProps,
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
      notify({
        type: "success",
        title: "Transfer Approved",
        message: `${item.student_full_name.toUpperCase()} has been moved to ${item.to_grade_level_display} – ${item.to_section_name}.`,
      });
    } catch (e) {
      setIncoming((prev) =>
        prev.map((r) => (r.request_id === item.request_id ? item : r)),
      );
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("REQUEST_NOT_PENDING")) {
        notify({
          type: "warning",
          title: "Already actioned",
          message: "This request was already approved or rejected. Refreshing…",
        });
        refresh();
      } else {
        notify({
          type: "error",
          title: "Approval failed",
          message: "Could not approve the transfer. Please try again.",
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
      notify({
        type: "warning",
        title: "Transfer Rejected",
        message: `The transfer request for ${item.student_full_name.toUpperCase()} has been rejected.`,
      });
    } catch (e) {
      setIncoming((prev) =>
        prev.map((r) => (r.request_id === item.request_id ? item : r)),
      );
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("REQUEST_NOT_PENDING")) {
        notify({
          type: "warning",
          title: "Already actioned",
          message: "This request is no longer pending. Refreshing…",
        });
        refresh();
      } else {
        notify({
          type: "error",
          title: "Rejection failed",
          message: "Could not reject the transfer. Please try again.",
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
      ...confirmModalProps,
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
      notify({
        type: "info",
        title: "Request Cancelled",
        message: `Transfer request for ${item.student_full_name.toUpperCase()} has been cancelled.`,
      });
    } catch (e) {
      setOutgoing((prev) =>
        prev.map((r) => (r.request_id === item.request_id ? item : r)),
      );
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("REQUEST_NOT_PENDING")) {
        notify({
          type: "warning",
          title: "Already actioned",
          message: "This request is no longer pending. Refreshing…",
        });
        refresh();
      } else {
        notify({
          type: "error",
          title: "Cancellation failed",
          message: "Could not cancel the request. Please try again.",
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

  return (
    <>
      {/* Page header */}
      <BackButton href="/school/classes" mb="md" size="sm">Back to Classes</BackButton>
      <Text size="xl" fw={700} mb="xs">
        Transfer Requests
      </Text>
      <p className="mb-6 text-sm text-[#808898]">
        Track and manage student section transfer requests, and view
        notifications relevant to your classes.
      </p>

      {(loadingNotifs || notifs.length > 0) && (
        <NotificationsPanel
          notifs={notifs}
          loading={loadingNotifs}
          onMarkRead={handleMarkRead}
          onMarkAllRead={handleMarkAllRead}
        />
      )}

      <Stack gap="xl">
        {canSeeIncoming && (
          <RequestSection
            title="Incoming Requests"
            description="All section transfer requests submitted by advisers, pending administrator review."
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
            icon={<IconMailDown size={16} />}
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
            icon={<IconMailUp size={16} />}
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
