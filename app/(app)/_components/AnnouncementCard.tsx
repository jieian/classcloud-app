"use client";

import {
  IconChevronLeft,
  IconChevronRight,
  IconArrowsMaximize,
  IconPin,
  IconPinFilled,
} from "@tabler/icons-react";
import { modals } from "@mantine/modals";
import { useState } from "react";
import { useMediaQuery } from "@mantine/hooks";
import type { AnnouncementItem } from "@/lib/services/announcementsService";
import { getAttachmentUrl } from "@/lib/services/announcementsService";
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
}

export default function AnnouncementCard({
  announcement,
  isFullAccess,
  onMarkRead,
  onTogglePin,
}: Props) {
  const [imgIndex, setImgIndex] = useState(0);
  const isMobile = useMediaQuery("(max-width: 768px)");
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

          {/* Pin icon: full_access users can toggle; pinned items show to all as read-only */}
          {isFullAccess ? (
            <button
              type="button"
              className={
                isPinned
                  ? `${styles.pinBtn} ${styles.pinBtnActive}`
                  : styles.pinBtn
              }
              onClick={() => onTogglePin(announcement.announcement_id)}
              aria-label={isPinned ? "Unpin announcement" : "Pin announcement"}
            >
              {isPinned ? (
                <IconPinFilled size={15} />
              ) : (
                <IconPin size={15} />
              )}
            </button>
          ) : isPinned ? (
            <span className={styles.pinBtnReadOnly} aria-label="Pinned">
              <IconPinFilled size={15} />
            </span>
          ) : null}
        </div>

        <p className={styles.body}>{announcement.body}</p>

        <div className={styles.footer}>
          <span>By: {announcement.author_first_name} {announcement.author_last_name}</span>
          <span>{formatDate(announcement.published_at)}</span>
        </div>
      </div>
    </div>
  );
}
