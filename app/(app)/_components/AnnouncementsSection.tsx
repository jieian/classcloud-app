"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@mantine/core";
import { notifications } from "@mantine/notifications";
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
      await toggleAnnouncementPin(id);
    } catch (err: unknown) {
      // Revert on failure
      setAnnouncements(prev);

      const message = err instanceof Error ? err.message : "";
      const isPinLimitError = message === "PIN_LIMIT" || message.includes("PIN_LIMIT");

      notifications.show({
        color: "red",
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
            <button type="button" className={styles.btnOutline} disabled>
              <IconCalendarTime size={15} stroke={1.8} />
              <span className={styles.btnText}>Scheduled</span>
            </button>
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
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon} aria-hidden="true">
              <IconSpeakerphone size={28} stroke={1.4} />
            </div>
            <p className={styles.emptyTitle}>No announcements yet</p>
            <p className={styles.emptySubtitle}>
              Check back later for school-wide updates and notices.
            </p>
          </div>
        ) : (
          announcements.map((a) => (
            <AnnouncementCard
              key={a.announcement_id}
              announcement={a}
              isFullAccess={isFullAccess}
              onMarkRead={handleMarkRead}
              onTogglePin={handleTogglePin}
            />
          ))
        )}
      </div>
    </section>
  );
}
