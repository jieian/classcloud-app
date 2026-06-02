"use client";

import {
  IconChevronLeft,
  IconChevronRight,
  IconArrowsMaximize,
  IconPin,
  IconPinFilled,
  IconDotsVertical,
  IconPencil,
  IconTrash,
} from "@tabler/icons-react";
import { ActionIcon, Menu, Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMediaQuery } from "@mantine/hooks";
import type { AnnouncementItem } from "@/lib/services/announcementsService";
import { deleteAnnouncement, getAttachmentUrl } from "@/lib/services/announcementsService";
import { notify } from "@/components/notificationIcon/notificationIcon";
import styles from "./AnnouncementCard.module.css";

function formatDate(iso: string): string {
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${mm}.${dd}.${yyyy}`;
}

interface Props {
  announcement: AnnouncementItem;
  isFullAccess: boolean;
  onMarkRead: (id: number) => void;
  onTogglePin: (id: number) => void;
  onDelete: (id: number) => void;
}

const BODY_LIMIT = 280;

export default function AnnouncementCard({
  announcement,
  isFullAccess,
  onMarkRead,
  onTogglePin,
  onDelete,
}: Props) {
  const router = useRouter();
  const [imgIndex, setImgIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isMobile = useMediaQuery("(max-width: 768px)");
  const confirmModalProps = isMobile
    ? {
        styles: {
          inner: { alignItems: "flex-end", paddingBottom: "20px" },
          content: { width: "100%", maxWidth: "100%", borderRadius: "12px 12px 0 0" },
        },
      }
    : {};
  const { attachments } = announcement;
  const hasImages = attachments.length > 0;
  const hasMultiple = attachments.length > 1;
  const currentAttachment = hasImages ? attachments[imgIndex] : null;

  const handlePrev = () =>
    setImgIndex((i) => (i - 1 + attachments.length) % attachments.length);
  const handleNext = () =>
    setImgIndex((i) => (i + 1) % attachments.length);

  const handleZoom = () => {
    if (!currentAttachment) return;
    const url = getAttachmentUrl(currentAttachment.storage_path);
    modals.open({
      title: announcement.title,
      size: "xl",
      padding: "xs",
      centered: true,
      // On mobile the navbar is a fixed 56px bar at the top; offset the modal
      // inner container so "centered" means centered in the visible area below it.
      styles: isMobile
        ? { inner: { paddingTop: 56 } }
        : undefined,
      children: (
        <img
          src={url}
          alt={announcement.title}
          style={{ width: "100%", height: "auto", display: "block", borderRadius: 4 }}
        />
      ),
    });
  };

  const isPinned = announcement.is_pinned;

  function handleDeleteClick() {
    modals.openConfirmModal({
      title: "Delete announcement?",
      children: (
        <Text size="sm">
          This will permanently delete &ldquo;{announcement.title}&rdquo;. This action cannot be undone.
        </Text>
      ),
      labels: { confirm: "Delete", cancel: "Cancel" },
      confirmProps: { color: "red", loading: deleting },
      onConfirm: async () => {
        setDeleting(true);
        try {
          await deleteAnnouncement(announcement.announcement_id);
          onDelete(announcement.announcement_id);
          notify({ type: "success", title: "Deleted", message: "Announcement deleted." });
        } catch {
          notify({ type: "error", title: "Error", message: "Failed to delete. Please try again." });
        } finally {
          setDeleting(false);
        }
      },
      ...confirmModalProps,
    });
  }

  return (
    <div className={styles.card}>
      {/* ── Image Panel ─────────────────────────────── */}
      {hasImages && currentAttachment && (
        <div className={styles.imagePanel}>
          <img
            src={getAttachmentUrl(currentAttachment.storage_path)}
            alt={currentAttachment.file_name}
            className={styles.image}
          />

          {hasMultiple && (
            <>
              <button
                className={`${styles.arrowBtn} ${styles.arrowLeft}`}
                onClick={handlePrev}
                aria-label="Previous image"
                type="button"
              >
                <IconChevronLeft size={13} stroke={2.5} />
              </button>
              <button
                className={`${styles.arrowBtn} ${styles.arrowRight}`}
                onClick={handleNext}
                aria-label="Next image"
                type="button"
              >
                <IconChevronRight size={13} stroke={2.5} />
              </button>

              <div className={styles.dotsRow} aria-hidden="true">
                {attachments.map((_, i) => (
                  <span
                    key={i}
                    className={i === imgIndex ? `${styles.dot} ${styles.dotActive}` : styles.dot}
                  />
                ))}
              </div>
            </>
          )}

          <button
            className={styles.zoomBtn}
            onClick={handleZoom}
            aria-label="Enlarge image"
            type="button"
          >
            <IconArrowsMaximize size={12} stroke={2} />
          </button>
        </div>
      )}

      {/* ── Content Panel ───────────────────────────── */}
      <div className={styles.contentPanel}>
        <div className={styles.titleRow}>
          <div className={styles.titleGroup}>
            <p className={styles.title}>{announcement.title}</p>
            {!announcement.is_read && (
              <span
                className={styles.unreadDot}
                role="button"
                aria-label="Mark as read"
                onClick={() => onMarkRead(announcement.announcement_id)}
              />
            )}
          </div>

          {/* Pin + actions — right side of title row */}
          <div className={styles.titleActions}>
            {isFullAccess ? (
              <button
                type="button"
                className={isPinned ? `${styles.pinBtn} ${styles.pinBtnActive}` : styles.pinBtn}
                onClick={() => onTogglePin(announcement.announcement_id)}
                aria-label={isPinned ? "Unpin announcement" : "Pin announcement"}
              >
                {isPinned ? <IconPinFilled size={15} /> : <IconPin size={15} />}
              </button>
            ) : isPinned ? (
              <span className={styles.pinBtnReadOnly} aria-label="Pinned">
                <IconPinFilled size={15} />
              </span>
            ) : null}

            {isFullAccess && (
              <Menu position="bottom-end" shadow="sm" withinPortal>
                <Menu.Target>
                  <ActionIcon variant="subtle" color="gray" size="sm">
                    <IconDotsVertical size={15} stroke={1.8} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item
                    leftSection={<IconPencil size={14} />}
                    onClick={() => router.push(`/announcements/${announcement.announcement_id}/edit`)}
                  >
                    Edit
                  </Menu.Item>
                  <Menu.Item leftSection={<IconTrash size={14} />} color="red" onClick={handleDeleteClick}>
                    Delete
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            )}
          </div>
        </div>

        <p className={styles.body}>
          {announcement.body.length > BODY_LIMIT && !expanded
            ? (
              <>
                {announcement.body.slice(0, BODY_LIMIT)}…
                <button
                  type="button"
                  className={styles.readMoreBtn}
                  onClick={() => setExpanded(true)}
                >
                  Read more
                </button>
              </>
            )
            : (
              <>
                {announcement.body}
                {announcement.body.length > BODY_LIMIT && (
                  <button
                    type="button"
                    className={styles.readMoreBtn}
                    onClick={() => setExpanded(false)}
                  >
                    Show less
                  </button>
                )}
              </>
            )
          }
        </p>

        <div className={styles.footer}>
          <span>By: {announcement.author_first_name} {announcement.author_last_name}</span>
          <span>{formatDate(announcement.published_at)}</span>
        </div>
      </div>
    </div>
  );
}
