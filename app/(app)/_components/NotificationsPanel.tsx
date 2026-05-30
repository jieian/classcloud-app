"use client";

import { useEffect, useState } from "react";
import { IconBellOff } from "@tabler/icons-react";
import {
  fetchNotifications,
  markNotificationsRead,
  type NotificationItem,
} from "@/lib/services/classService";
import styles from "./NotificationsPanel.module.css";

interface Props {
  /** Called each time an unread notification is marked read (e.g. to decrement a badge). */
  onMarkRead?: () => void;
}

export default function NotificationsPanel({ onMarkRead }: Props) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    fetchNotifications()
      .then((rows) => { if (mounted) setNotifications(rows); })
      .catch(() => { if (mounted) setNotifications([]); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  const handleClick = (notif: NotificationItem) => {
    if (notif.read_at) return;
    // Optimistic update — don't reorder, just flip the dot
    setNotifications((prev) =>
      prev.map((n) =>
        n.notification_id === notif.notification_id
          ? { ...n, read_at: new Date().toISOString() }
          : n,
      ),
    );
    onMarkRead?.();
    markNotificationsRead([notif.notification_id]).catch(() => {});
  };

  if (loading) {
    return (
      <ul className={styles.list}>
        {Array.from({ length: 4 }).map((_, i) => (
          <li key={i} className={styles.skeletonItem}>
            <span className={`${styles.dot} ${styles.dotRead}`} aria-hidden="true" />
            <span className={styles.skeleton} style={{ width: `${65 + (i % 3) * 12}%` }} />
          </li>
        ))}
      </ul>
    );
  }

  if (notifications.length === 0) {
    return (
      <div className={styles.empty}>
        <IconBellOff size={26} stroke={1.5} color="#3D4147" />
        <p className={styles.emptyTitle}>You&apos;re all caught up</p>
        <p className={styles.emptySubtitle}>
          Check back later for new updates and alerts.
        </p>
      </div>
    );
  }

  return (
    <ul className={styles.list}>
      {notifications.map((notif) => (
        <li
          key={notif.notification_id}
          className={styles.item}
          onClick={() => handleClick(notif)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && handleClick(notif)}
          aria-label={notif.read_at ? notif.title : `${notif.title} (unread)`}
        >
          <span
            className={`${styles.dot} ${notif.read_at ? styles.dotRead : ""}`}
            aria-hidden="true"
          />
          <span className={styles.title}>{notif.title}</span>
        </li>
      ))}
    </ul>
  );
}
