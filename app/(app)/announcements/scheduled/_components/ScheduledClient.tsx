"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@mantine/core";
import { IconCalendarOff } from "@tabler/icons-react";
import BackButton from "@/components/BackButton";
import EmptySearchState from "@/components/EmptySearchState";
import {
  fetchScheduledAnnouncements,
  type ScheduledAnnouncementItem,
} from "@/lib/services/announcementsService";
import ScheduledAnnouncementCard from "./ScheduledAnnouncementCard";

export default function ScheduledClient() {
  const [items, setItems] = useState<ScheduledAnnouncementItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    fetchScheduledAnnouncements()
      .then((rows) => {
        if (mounted) setItems(rows);
      })
      .catch(() => {
        if (mounted) setItems([]);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  function handleDelete(id: number) {
    setItems((prev) => prev.filter((a) => a.announcement_id !== id));
  }

  return (
    <div>
      <BackButton href="/" size="sm">
        Back to Home
      </BackButton>

      <div style={{ marginTop: 24 }}>
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Skeleton height={160} radius={8} />
            <Skeleton height={160} radius={8} />
            <Skeleton height={160} radius={8} />
          </div>
        ) : items.length === 0 ? (
          <EmptySearchState
            icon={IconCalendarOff}
            title="No scheduled announcements."
            description="Announcements set to auto-post will appear here."
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {items.map((item) => (
              <ScheduledAnnouncementCard
                key={item.announcement_id}
                item={item}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
