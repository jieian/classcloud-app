"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  Group,
  List,
  Modal,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCheck, IconChevronRight } from "@tabler/icons-react";
import type { SubjectRow } from "../../_lib/subjectService";

// ─────────────────────────────────────────────────────────────
// Slide-to-delete component
// ─────────────────────────────────────────────────────────────

interface SlideToDeleteProps {
  onConfirm: () => void;
  disabled?: boolean;
}

function SlideToDelete({ onConfirm, disabled = false }: SlideToDeleteProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const startXRef = useRef(0);
  const maxOffsetRef = useRef(0);
  const firedRef = useRef(false);

  const THUMB = 40;
  const PAD = 4;

  const onDragStart = (clientX: number) => {
    if (disabled || confirmed) return;
    if (trackRef.current) {
      maxOffsetRef.current = trackRef.current.offsetWidth - THUMB - PAD * 2;
    }
    startXRef.current = clientX;
    setIsDragging(true);
  };

  const onDragMove = useCallback(
    (clientX: number) => {
      const max = maxOffsetRef.current;
      const next = Math.max(0, Math.min(clientX - startXRef.current, max));
      setOffset(next);
      if (max > 0 && next >= max * 0.99 && !firedRef.current) {
        firedRef.current = true;
        setConfirmed(true);
        setIsDragging(false);
        onConfirm();
      }
    },
    [onConfirm],
  );

  const onDragEnd = useCallback(() => {
    if (confirmed) return;
    setIsDragging(false);
    setOffset(0);
  }, [confirmed]);

  useEffect(() => {
    if (!isDragging) return;
    const mm = (e: MouseEvent) => onDragMove(e.clientX);
    const mu = () => onDragEnd();
    window.addEventListener("mousemove", mm);
    window.addEventListener("mouseup", mu);
    return () => {
      window.removeEventListener("mousemove", mm);
      window.removeEventListener("mouseup", mu);
    };
  }, [isDragging, onDragMove, onDragEnd]);

  const progress =
    maxOffsetRef.current > 0
      ? Math.min(1, offset / maxOffsetRef.current)
      : 0;

  return (
    <div
      ref={trackRef}
      style={{
        position: "relative",
        height: THUMB + PAD * 2,
        borderRadius: 999,
        border: `2px solid ${confirmed ? "#4EAE4A" : "#e53935"}`,
        background: confirmed
          ? "rgba(78,174,74,0.1)"
          : `rgba(229,57,53,${0.06 + progress * 0.14})`,
        userSelect: "none",
        overflow: "hidden",
        transition: "border-color 0.3s, background 0.3s",
      }}
    >
      {/* Fill bar */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          height: "100%",
          width: THUMB + PAD + offset,
          background: confirmed
            ? "rgba(78,174,74,0.15)"
            : `rgba(229,57,53,${0.08 + progress * 0.12})`,
          borderRadius: 999,
          pointerEvents: "none",
          transition: isDragging ? "none" : "width 0.2s ease",
        }}
      />

      {/* Label */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "0.82rem",
          fontWeight: 600,
          letterSpacing: "0.03em",
          color: confirmed ? "#4EAE4A" : "#e53935",
          pointerEvents: "none",
          opacity: confirmed ? 1 : Math.max(0, 1 - progress * 2),
        }}
      >
        {confirmed ? "Deleting…" : "Slide to delete →"}
      </div>

      {/* Thumb */}
      <div
        style={{
          position: "absolute",
          top: PAD,
          left: PAD + offset,
          width: THUMB,
          height: THUMB,
          borderRadius: "50%",
          background: confirmed ? "#4EAE4A" : "#e53935",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          cursor:
            disabled || confirmed
              ? "default"
              : isDragging
                ? "grabbing"
                : "grab",
          transition: isDragging ? "none" : "left 0.2s ease, background 0.3s",
          boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
          zIndex: 1,
        }}
        onMouseDown={(e) => {
          onDragStart(e.clientX);
          e.preventDefault();
        }}
        onTouchStart={(e) => onDragStart(e.touches[0].clientX)}
        onTouchMove={(e) => onDragMove(e.touches[0].clientX)}
        onTouchEnd={onDragEnd}
      >
        {confirmed ? <IconCheck size={18} /> : <IconChevronRight size={20} />}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// DeleteSubjectModal
// ─────────────────────────────────────────────────────────────

interface DeleteSubjectModalProps {
  opened: boolean;
  onClose: () => void;
  subject: SubjectRow | null;
  onSuccess: () => void;
}

export default function DeleteSubjectModal({
  opened,
  onClose,
  subject,
  onSuccess,
}: DeleteSubjectModalProps) {
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [sliderKey, setSliderKey] = useState(0);

  const isAssigned = (subject?.teachers?.length ?? 0) > 0;

  // Reset state on open
  useEffect(() => {
    if (opened) {
      setConfirmText("");
      setDeleting(false);
      setSliderKey((k) => k + 1);
    }
  }, [opened]);

  async function handleDelete() {
    if (!subject) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/subjects/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject_id: subject.subject_id }),
      });
      const data = await res.json();

      if (!res.ok) {
        notifications.show({
          title: "Error",
          message: data.error ?? "Something went wrong. Please try again.",
          color: "red",
        });
        setSliderKey((k) => k + 1); // reset slider on error
        return;
      }

      notifications.show({
        title: "Subject Deleted",
        message: `${subject.name} has been deleted successfully.`,
        color: "green",
      });
      onSuccess();
      onClose();
    } catch {
      notifications.show({
        title: "Error",
        message: "Network error. Please try again.",
        color: "red",
      });
      setSliderKey((k) => k + 1);
    } finally {
      setDeleting(false);
    }
  }

  // ── Not assigned: type-to-confirm modal ───────────────────
  if (!isAssigned) {
    return (
      <Modal
        opened={opened}
        onClose={onClose}
        title="Delete Subject"
        centered
        closeOnClickOutside={!deleting}
        closeOnEscape={!deleting}
        withCloseButton={!deleting}
      >
        <Text size="sm" mb="md">
          Are you sure you want to delete{" "}
          <strong>{subject?.code}</strong>? This action cannot be undone.
        </Text>
        <Text size="sm" mb="md" c="dimmed">
          Type{" "}
          <Text span fw={700} c="var(--mantine-color-text)">
            delete
          </Text>{" "}
          to confirm.
        </Text>
        <TextInput
          placeholder="Type delete to confirm"
          value={confirmText}
          onChange={(e) => setConfirmText(e.currentTarget.value)}
          mb="lg"
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose} disabled={deleting}>
            Cancel
          </Button>
          <Button
            color="red"
            disabled={confirmText.toLowerCase() !== "delete"}
            loading={deleting}
            onClick={handleDelete}
          >
            Delete
          </Button>
        </Group>
      </Modal>
    );
  }

  // ── Assigned: slide-to-confirm modal ──────────────────────
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Delete Subject"
      centered
      closeOnClickOutside={!deleting}
      closeOnEscape={!deleting}
      withCloseButton={!deleting}
    >
      <Text size="sm" mb="xs">
        <strong>{subject?.name}</strong> is currently assigned to:
      </Text>
      <List size="sm" mb="md" c="dimmed" withPadding>
        {subject?.teachers.map((t) => (
          <List.Item key={t}>{t}</List.Item>
        ))}
      </List>
      <Text size="sm" mb="lg">
        Deleting this subject will remove it from all teacher assignments.
        This action cannot be undone.
      </Text>

      <SlideToDelete
        key={sliderKey}
        onConfirm={handleDelete}
        disabled={deleting}
      />

      <Group justify="flex-end" mt="md">
        <Button variant="default" onClick={onClose} disabled={deleting}>
          Cancel
        </Button>
      </Group>
    </Modal>
  );
}
