"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Divider,
  Group,
  Modal,
  Skeleton,
  Stack,
  Text,
  Textarea,
  ThemeIcon,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { useMediaQuery } from "@mantine/hooks";
import { IconInfoCircle } from "@tabler/icons-react";
import { notify } from "@/components/notificationIcon/notificationIcon";
import {
  fetchMyDeletionRequest,
  submitDeletionRequest,
  withdrawDeletionRequest,
  SessionEndedError,
  type MyDeletionRequest,
} from "../_lib/deletionRequestService";

/**
 * Data & Privacy → account deletion request (RA 10173). The user requests deletion,
 * which an admin reviews. The user can withdraw a pending request and is shown the
 * reason if a request was declined.
 */
export default function AccountDeletionRequest() {
  const isMobile = useMediaQuery("(max-width: 768px)");
  const [request, setRequest] = useState<MyDeletionRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  // Confirm dialogs (withdraw) slide up from the bottom on mobile (app convention).
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

  // The request form modal stays centered; on mobile, pad the top so the centered
  // modal clears the 56px sticky NavBar instead of sitting under it.
  const requestModalStyles = isMobile
    ? { styles: { inner: { paddingTop: 72 } } }
    : {};

  const load = async () => {
    try {
      const data = await fetchMyDeletionRequest();
      setRequest(data);
    } catch (e) {
      if (e instanceof SessionEndedError) {
        window.location.href = "/login";
        return;
      }
      // Non-fatal: leave as "no active request" if status can't be read.
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleSubmit = async () => {
    try {
      setSubmitting(true);
      await submitDeletionRequest(reason.trim() || undefined);
      notify({
        type: "success",
        title: "Request submitted",
        message: "Your account deletion request has been sent for review.",
      });
      setModalOpen(false);
      setReason("");
      await load();
    } catch (e) {
      notify({
        type: "error",
        title: "Could not submit",
        message:
          e instanceof Error ? e.message : "Failed to submit your request.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleWithdraw = () => {
    modals.openConfirmModal({
      title: "Withdraw deletion request?",
      children: (
        <Text size="sm">
          Your pending account deletion request will be cancelled.
        </Text>
      ),
      labels: { confirm: "Withdraw", cancel: "Keep request" },
      confirmProps: { color: "red" },
      ...confirmModalProps,
      onConfirm: async () => {
        try {
          setWithdrawing(true);
          await withdrawDeletionRequest();
          notify({
            type: "success",
            title: "Request withdrawn",
            message: "Your account deletion request has been cancelled.",
          });
          await load();
        } catch (e) {
          notify({
            type: "error",
            title: "Could not withdraw",
            message:
              e instanceof Error
                ? e.message
                : "Failed to withdraw your request.",
          });
        } finally {
          setWithdrawing(false);
        }
      },
    });
  };

  if (loading) return <Skeleton height={64} radius="md" mt="md" />;

  const status = request?.status;
  const isActiveRequest = status === "PENDING" || status === "APPROVING";

  return (
    <>
      <Divider my="md" />

      <Text fw={700} c="#298925" mb="sm">
        Account deletion
      </Text>

      {status === "PENDING" && (
        <Stack gap="xs">
          <Alert
            variant="filled"
            color="blue"
            radius="md"
            styles={{ icon: { alignSelf: "center", marginTop: 0 } }}
            icon={
              <ThemeIcon color="white" variant="transparent" size="md">
                <IconInfoCircle size={20} />
              </ThemeIcon>
            }
          >
            <Text fw={700} size="sm">
              Deletion Request Pending
            </Text>
            <Text size="sm" fs="italic">
              Your request is pending review by an administrator.
            </Text>
          </Alert>
          <Group justify="flex-start">
            <Button
              variant="outline"
              color="red"
              size="sm"
              loading={withdrawing}
              onClick={handleWithdraw}
            >
              Withdraw Request
            </Button>
          </Group>
        </Stack>
      )}

      {status === "APPROVING" && (
        <Alert
          variant="light"
          color="blue"
          icon={<IconInfoCircle size={16} />}
          radius="md"
        >
          Your request is being processed.
        </Alert>
      )}

      {!isActiveRequest && (
        <Stack gap="xs">
          {status === "DENIED" && request?.decision_note && (
            <Alert variant="light" color="gray" radius="md">
              <Text size="sm" fw={600} mb={2}>
                Your last request was declined
              </Text>
              <Text size="sm" c="#3a3f4a">
                {request.decision_note}
              </Text>
            </Alert>
          )}
          <Text size="sm" c="#808898">
            Request permanent deletion of your account and personal data. An
            administrator reviews each request; once approved, this cannot be
            undone.
          </Text>
          <Group justify="flex-start">
            <Button
              variant="outline"
              color="red"
              size="sm"
              onClick={() => setModalOpen(true)}
            >
              Request Account Deletion
            </Button>
          </Group>
        </Stack>
      )}

      <Modal
        opened={modalOpen}
        onClose={() => !submitting && setModalOpen(false)}
        title="Request account deletion"
        centered
        size="md"
        closeOnClickOutside={!submitting}
        closeOnEscape={!submitting}
        withCloseButton={!submitting}
        {...requestModalStyles}
      >
        <Stack gap="md">
          <Text size="sm" c="#3a3f4a">
            This sends a request to an administrator to permanently delete your
            account and personal data (RA 10173). Once approved, it{" "}
            <strong>cannot be undone</strong>.
          </Text>
          <Textarea
            label="Reason (optional)"
            placeholder="Tell the administrator why you'd like your account deleted…"
            autosize
            minRows={3}
            maxRows={6}
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => setModalOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              color="red"
              loading={submitting}
              onClick={() => void handleSubmit()}
            >
              Submit Request
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
