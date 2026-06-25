"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Center,
  Group,
  Modal,
  Paper,
  Select,
  Skeleton,
  Stack,
  Text,
  Textarea,
  ThemeIcon,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { useMediaQuery } from "@mantine/hooks";
import { IconInfoCircle, IconUserOff } from "@tabler/icons-react";
import BackButton from "@/components/BackButton";
import { notify } from "@/components/notificationIcon/notificationIcon";

interface DeletionRequest {
  request_id: string;
  uid: string;
  requester_name: string;
  requester_email: string | null;
  reason: string | null;
  requested_at: string;
}

const DENIAL_CATEGORIES = [
  { value: "legal_retention", label: "Required by law / records retention" },
  { value: "active_legal_claim", label: "Needed for a legal claim" },
  { value: "still_necessary", label: "Still necessary for a legitimate purpose" },
  { value: "other", label: "Other" },
];

function daysPending(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "1 day pending";
  return `${days} days pending`;
}

export default function DeletionRequestsClient() {
  const isMobile = useMediaQuery("(max-width: 768px)");
  const [requests, setRequests] = useState<DeletionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [overLimit, setOverLimit] = useState(false);

  // Deny modal state
  const [denyTarget, setDenyTarget] = useState<DeletionRequest | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [denying, setDenying] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const confirmModalProps = isMobile
    ? {
        styles: {
          inner: { alignItems: "flex-end", paddingBottom: "20px" },
          content: { width: "100%", maxWidth: "100%", borderRadius: "12px 12px 0 0" },
        },
      }
    : {};

  const load = async () => {
    try {
      const res = await fetch("/api/users/deletion-requests");
      if (!res.ok) throw new Error("Failed to load requests.");
      const json = (await res.json()) as {
        requests: DeletionRequest[];
        over_limit: boolean;
      };
      setRequests(json.requests ?? []);
      setOverLimit(json.over_limit ?? false);
    } catch {
      notify({ type: "error", title: "Error", message: "Failed to load deletion requests." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const removeFromList = (id: string) =>
    setRequests((prev) => prev.filter((r) => r.request_id !== id));

  const handleApprove = (req: DeletionRequest) => {
    modals.openConfirmModal({
      title: "Approve account deletion?",
      children: (
        <Text size="sm">
          This permanently erases <strong>{req.requester_name}</strong>&apos;s account and
          personal data. This <strong>cannot be undone</strong>.
        </Text>
      ),
      labels: { confirm: "Approve & Delete", cancel: "Cancel" },
      confirmProps: { color: "red" },
      ...confirmModalProps,
      onConfirm: async () => {
        try {
          setApprovingId(req.request_id);
          const res = await fetch(
            `/api/users/deletion-requests/${req.request_id}/approve`,
            { method: "POST" },
          );
          if (!res.ok) {
            const body = (await res.json().catch(() => null)) as { error?: string } | null;
            throw new Error(body?.error ?? "Failed to approve.");
          }
          removeFromList(req.request_id);
          notify({
            type: "success",
            title: "Account deleted",
            message: `${req.requester_name}'s account has been permanently deleted.`,
          });
        } catch (e) {
          notify({
            type: "error",
            title: "Could not approve",
            message: e instanceof Error ? e.message : "Failed to approve.",
          });
        } finally {
          setApprovingId(null);
        }
      },
    });
  };

  const openDeny = (req: DeletionRequest) => {
    setDenyTarget(req);
    setCategory(null);
    setNote("");
    setInternalNote("");
  };

  const noteTrimmed = note.trim();
  const denyValid =
    !!category &&
    noteTrimmed.length >= 10 &&
    noteTrimmed.length <= 1000 &&
    (category !== "other" || noteTrimmed.length >= 30) &&
    internalNote.length <= 2000;

  const handleDeny = async () => {
    if (!denyTarget || !category || !denyValid) return;
    try {
      setDenying(true);
      const res = await fetch(`/api/users/deletion-requests/${denyTarget.request_id}/deny`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          decision_note: noteTrimmed,
          internal_note: internalNote.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Failed to deny.");
      }
      removeFromList(denyTarget.request_id);
      notify({
        type: "success",
        title: "Request denied",
        message: "The requester has been notified of the decision.",
      });
      setDenyTarget(null);
    } catch (e) {
      notify({
        type: "error",
        title: "Could not deny",
        message: e instanceof Error ? e.message : "Failed to deny.",
      });
    } finally {
      setDenying(false);
    }
  };

  return (
    <>
      {/* Page header */}
      <BackButton href="/user-roles/users" mb="md" size="sm">
        Back to Users Management
      </BackButton>
      <Text size="xl" fw={700} mb="xs">
        Account Deletion Requests
      </Text>
      <p className="mb-6 text-sm text-[#808898]">
        Review data-subject requests to delete their accounts (RA 10173). Approving a
        request permanently erases the account; denying requires a reason that is sent to
        the requester.
      </p>

      {loading ? (
        <Stack gap="md" maw={760}>
          <Skeleton height={120} radius="md" />
          <Skeleton height={120} radius="md" />
        </Stack>
      ) : requests.length === 0 ? (
        <Center
          py={48}
          px="md"
          w="100%"
          style={{
            border: "1px solid var(--mantine-color-gray-3)",
            borderRadius: "8px",
            backgroundColor: "#FFFFFF",
          }}
        >
          <Stack gap={10} align="center">
            <ThemeIcon size={48} radius="xl" color="gray.2" variant="filled">
              <IconUserOff size={28} stroke={1.5} color="#3D4147" />
            </ThemeIcon>
            <Stack gap={2} align="center">
              <Text size="sm" fw={500} c="#111827">
                No pending deletion requests
              </Text>
              <Text size="xs" c="#808898">
                You&apos;re all caught up.
              </Text>
            </Stack>
          </Stack>
        </Center>
      ) : (
        <Stack gap="md" maw={760}>
          {overLimit && (
            <Alert
              variant="light"
              color="yellow"
              icon={<IconInfoCircle size={16} />}
              radius="md"
            >
              Showing the first 100 pending requests. There are more — act on these first.
            </Alert>
          )}
          {requests.map((req) => (
            <Paper key={req.request_id} withBorder p="md" radius="md">
              <Group justify="space-between" align="flex-start" wrap="nowrap">
                <Stack gap={2} style={{ minWidth: 0 }}>
                  <Text fw={600} style={{ overflowWrap: "anywhere" }}>
                    {req.requester_name}
                  </Text>
                  {req.requester_email && (
                    <Text size="sm" c="#808898" style={{ overflowWrap: "anywhere" }}>
                      {req.requester_email}
                    </Text>
                  )}
                  {req.reason && (
                    <Text size="sm" c="#3a3f4a" mt={4}>
                      “{req.reason}”
                    </Text>
                  )}
                </Stack>
                <Badge color="gray" variant="light" style={{ flexShrink: 0 }}>
                  {daysPending(req.requested_at)}
                </Badge>
              </Group>
              <Group justify="flex-end" mt="md" gap="sm">
                <Button variant="default" size="sm" onClick={() => openDeny(req)}>
                  Deny
                </Button>
                <Button
                  color="red"
                  size="sm"
                  loading={approvingId === req.request_id}
                  onClick={() => handleApprove(req)}
                >
                  Approve & Delete
                </Button>
              </Group>
            </Paper>
          ))}
        </Stack>
      )}

      {/* Deny modal */}
      <Modal
        opened={!!denyTarget}
        onClose={() => !denying && setDenyTarget(null)}
        title="Deny deletion request"
        centered
        size="md"
        closeOnClickOutside={!denying}
        closeOnEscape={!denying}
        withCloseButton={!denying}
        {...confirmModalProps}
      >
        <Stack gap="md">
          <Text size="sm" c="#3a3f4a">
            Denying {denyTarget?.requester_name}&apos;s request. The reason below is emailed to
            them.
          </Text>
          <Select
            label="Lawful basis"
            placeholder="Select a basis"
            data={DENIAL_CATEGORIES}
            value={category}
            onChange={setCategory}
            withAsterisk
          />
          <Textarea
            label="Reason (sent to the requester)"
            description="This message will be emailed to the user."
            placeholder="Explain why the request is declined…"
            autosize
            minRows={3}
            maxRows={6}
            maxLength={1000}
            withAsterisk
            value={note}
            onChange={(e) => setNote(e.currentTarget.value)}
            error={
              note.length > 0 && noteTrimmed.length < 10
                ? "At least 10 characters"
                : category === "other" && noteTrimmed.length > 0 && noteTrimmed.length < 30
                  ? "For 'Other', provide at least 30 characters"
                  : undefined
            }
          />
          <Textarea
            label="Internal note (optional)"
            description="Internal only; never shown to the user. Record a factual basis: retention-policy citation, case/ticket reference, or the lawful ground — not legal analysis."
            autosize
            minRows={2}
            maxRows={5}
            maxLength={2000}
            value={internalNote}
            onChange={(e) => setInternalNote(e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setDenyTarget(null)} disabled={denying}>
              Cancel
            </Button>
            <Button color="red" loading={denying} disabled={!denyValid} onClick={() => void handleDeny()}>
              Deny Request
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
