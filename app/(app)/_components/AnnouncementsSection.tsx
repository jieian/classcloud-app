"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@mantine/core";
import { notify } from "@/components/notificationIcon/notificationIcon";
import { IconSpeakerphone, IconCalendarTime, IconPlus } from "@tabler/icons-react";
import Link from "next/link";
import {
  fetchAnnouncements,
  markAnnouncementRead,
  toggleAnnouncementPin,
  type AnnouncementItem,
} from "@/lib/services/announcementsService";
import { useAuth } from "@/context/AuthContext";
import AnnouncementCard from "./AnnouncementCard";
import EmptySearchState from "@/components/EmptySearchState";
import styles from "./AnnouncementsSection.module.css";

function sortAnnouncements(list: AnnouncementItem[]): AnnouncementItem[] {
  return [...list].sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
    return new Date(b.published_at).getTime() - new Date(a.published_at).getTime();
  });
}

export default function AnnouncementsSection() {
  const { permissions } = useAuth();
  const isFullAccess = permissions.includes("announcements.full_access");

  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    fetchAnnouncements()
      .then((rows) => {
        if (!mounted) return;
        setAnnouncements(rows);
      })
      .catch(() => {
        if (!mounted) return;
        setAnnouncements([]);
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handleDelete = (id: number) => {
    setAnnouncements((prev) => prev.filter((a) => a.announcement_id !== id));
  };

  const handleMarkRead = (id: number) => {
    setAnnouncements((prev) =>
      prev.map((a) =>
        a.announcement_id === id ? { ...a, is_read: true } : a,
      ),
    );
    markAnnouncementRead(id);
  };

  const handleTogglePin = async (id: number) => {
    const prev = announcements;
    // Optimistic update
    setAnnouncements((list) =>
      sortAnnouncements(
        list.map((a) =>
          a.announcement_id === id ? { ...a, is_pinned: !a.is_pinned } : a,
        ),
      ),
    );

    try {
      const nowPinned = !prev.find((a) => a.announcement_id === id)?.is_pinned;
      await toggleAnnouncementPin(id);
      notify({
        type: "success",
        title: nowPinned ? "Pinned" : "Unpinned",
        message: nowPinned ? "Announcement pinned." : "Announcement unpinned.",
      });
    } catch (err: unknown) {
      // Revert on failure
      setAnnouncements(prev);

      const message = err instanceof Error ? err.message : "";
      const isPinLimitError = message === "PIN_LIMIT" || message.includes("PIN_LIMIT");

      notify({
        type: "error",
        title: isPinLimitError ? "Pin limit reached" : "Failed to update pin",
        message: isPinLimitError
          ? "You can only pin up to 3 announcements at a time."
          : "Something went wrong. Please try again.",
      });
    }
  };

  return (
    <section className={styles.section} aria-labelledby="announcements-title">
      <div className={styles.header}>
        <h2 id="announcements-title" className={styles.sectionTitle}>
          Announcements
        </h2>

        {isFullAccess && (
          <div className={styles.headerActions}>
            <Link href="/announcements/scheduled" className={styles.btnOutline}>
              <IconCalendarTime size={15} stroke={1.8} />
              <span className={styles.btnText}>Scheduled</span>
            </Link>
            <Link href="/announcements/create" className={styles.btnFilled}>
              <IconPlus size={15} stroke={2.2} />
              <span className={styles.btnText}>Create Announcement</span>
            </Link>
          </div>
        )}
      </div>

      <div className={styles.body}>
        {loading ? (
          <>
            <Skeleton className={styles.skeletonCard} height={200} radius={8} />
            <Skeleton className={styles.skeletonCard} height={200} radius={8} />
            <Skeleton className={styles.skeletonCard} height={200} radius={8} />
          </>
        ) : announcements.length === 0 ? (
          <EmptySearchState
            icon={IconSpeakerphone}
            title="No announcements yet"
            description="Check back later for school-wide updates and notices."
          />
        ) : (
          announcements.map((a) => (
            <AnnouncementCard
              key={a.announcement_id}
              announcement={a}
              isFullAccess={isFullAccess}
              onMarkRead={handleMarkRead}
              onTogglePin={handleTogglePin}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>
    </section>
  );
}
