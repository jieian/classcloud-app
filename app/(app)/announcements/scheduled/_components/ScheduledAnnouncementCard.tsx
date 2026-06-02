"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ActionIcon, Badge, Menu, Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import { useMediaQuery } from "@mantine/hooks";
import {
  IconSettings,
  IconPencil,
  IconTrash,
  IconSend,
} from "@tabler/icons-react";
import { notify } from "@/components/notificationIcon/notificationIcon";
import {
  deleteAnnouncement,
  publishAnnouncement,
  getAttachmentUrl,
  type ScheduledAnnouncementItem,
} from "@/lib/services/announcementsService";
import styles from "./ScheduledAnnouncementCard.module.css";

function getTimeLeftLabel(publishedAt: string): string {
  const now = Date.now();
  const target = new Date(publishedAt).getTime();
  const diffMs = target - now;

  if (diffMs <= 0) return "Overdue";

  const diffHours = diffMs / (1000 * 60 * 60);
  if (diffHours < 24) return `${Math.ceil(diffHours)}h left`;

  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (diffDays < 30) return `${Math.round(diffDays)} days left`;

  const diffMonths = diffDays / 30;
  return `${Math.round(diffMonths)} months left`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  }).replace(/\//g, ".");
}

interface Props {
  item: ScheduledAnnouncementItem;
  onDelete: (id: number) => void;
}

export default function ScheduledAnnouncementCard({ item, onDelete }: Props) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [publishing, setPublishing] = useState(false);

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

  const firstAttachment = item.attachments[0];
  const thumbnailUrl = firstAttachment
    ? getAttachmentUrl(firstAttachment.storage_path)
    : null;

  const authorName = [item.author_first_name, item.author_last_name]
    .filter(Boolean)
    .join(" ");

  const timeLabel = getTimeLeftLabel(item.published_at);

  function handlePublishClick() {
    modals.openConfirmModal({
      title: "Publish now?",
      children: (
        <Text size="sm">
          &ldquo;{item.title}&rdquo; will be published immediately and visible to recipients.
        </Text>
      ),
      labels: { confirm: "Publish", cancel: "Cancel" },
      confirmProps: { color: "green", loading: publishing },
      onConfirm: async () => {
        setPublishing(true);
        try {
          await publishAnnouncement(item.announcement_id);
          onDelete(item.announcement_id);
          notify({ type: "success", title: "Published", message: "Announcement published." });
        } catch {
          notify({ type: "error", title: "Error", message: "Failed to publish. Please try again." });
        } finally {
          setPublishing(false);
        }
      },
      ...confirmModalProps,
    });
  }

  function handleEdit() {
    router.push(`/announcements/${item.announcement_id}/edit`);
  }

  function handleDeleteClick() {
    modals.openConfirmModal({
      title: "Delete announcement?",
      children: (
        <Text size="sm">
          This will permanently delete &ldquo;{item.title}&rdquo;. This action
          cannot be undone.
        </Text>
      ),
      labels: { confirm: "Delete", cancel: "Cancel" },
      confirmProps: { color: "red", loading: deleting },
      onConfirm: async () => {
        setDeleting(true);
        try {
          await deleteAnnouncement(item.announcement_id);
          onDelete(item.announcement_id);
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
      {/* Left: thumbnail */}
      <div className={styles.thumbnail}>
        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt="" className={styles.thumbnailImg} />
        ) : (
          <div className={styles.thumbnailPlaceholder} />
        )}
      </div>

      {/* Right: content */}
      <div className={styles.content}>
        <div className={styles.contentTop}>
          <p className={styles.title}>{item.title}</p>

          <div className={styles.topRight}>
            <Badge
              variant="outline"
              color="#4EAE4A"
              size="sm"
              style={{ borderColor: "#4EAE4A", color: "#4EAE4A", flexShrink: 0 }}
            >
              {timeLabel}
            </Badge>

            <Menu position="bottom-end" shadow="sm" withinPortal>
              <Menu.Target>
                <ActionIcon variant="subtle" color="gray" size="sm">
                  <IconSettings size={16} stroke={1.6} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  leftSection={<IconPencil size={14} />}
                  onClick={handleEdit}
                >
                  Edit
                </Menu.Item>
                <Menu.Item
                  leftSection={<IconTrash size={14} />}
                  color="red"
                  onClick={handleDeleteClick}
                >
                  Delete
                </Menu.Item>
                <Menu.Divider />
                <Menu.Item
                  leftSection={<IconSend size={14} />}
                  onClick={handlePublishClick}
                >
                  Publish Now
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </div>
        </div>

        <p className={styles.body}>{item.body}</p>

        <div className={styles.footer}>
          <span className={styles.author}>By: {authorName}</span>
          <span className={styles.date}>{formatDate(item.published_at)}</span>
        </div>
      </div>
    </div>
  );
}
