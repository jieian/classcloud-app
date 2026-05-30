"use client";

import React, { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ActionIcon,
  Box,
  Divider,
  Group,
  Popover,
  Text,
  Tooltip,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import type {
  ReportMonitoringCoordinatorGroup,
  ReportMonitoringRow,
  ReportMonitoringSubjectGroup,
} from "@/lib/services/reportsAnalysisService";

// ─── Constants ────────────────────────────────────────────────────────────────

export const STATUS_COLORS = {
  done: "#4EAE4A",
  ongoing: "#fdba74",
  notStarted: "#d1d5db",
};

/** Single-slot registry — only one popover/tooltip open at a time on touch */
export const activePopover = { close: null as (() => void) | null };

// ─── Types ────────────────────────────────────────────────────────────────────

export type StatusCounts = {
  done: number;
  ongoing: number;
  notStarted: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function statusCountsTotal(counts: StatusCounts) {
  return counts.done + counts.ongoing + counts.notStarted;
}

export function getRowStatusCounts(rows: ReportMonitoringRow[]): StatusCounts {
  const done = rows.filter((row) => row.status === "Finalized").length;
  const ongoing = rows.filter((row) => row.status === "Not Finalized").length;
  return { done, ongoing, notStarted: Math.max(rows.length - done - ongoing, 0) };
}

export function getSubjectSubgroupStatusCounts(
  subjects: ReportMonitoringSubjectGroup[],
): StatusCounts {
  return subjects.reduce<StatusCounts>(
    (counts, subject) => {
      if (subject.rows.length === 0) { counts.notStarted += 1; return counts; }
      if (subject.rows.every((r) => r.status === "Finalized")) counts.done += 1;
      else if (subject.rows.every((r) => r.status === "No exam yet")) counts.notStarted += 1;
      else counts.ongoing += 1;
      return counts;
    },
    { done: 0, ongoing: 0, notStarted: 0 },
  );
}

export function classifySubgroupFromCounts(counts: StatusCounts): keyof StatusCounts {
  const total = statusCountsTotal(counts);
  if (total === 0) return "notStarted";
  if (counts.done === total) return "done";
  if (counts.notStarted === total) return "notStarted";
  return "ongoing";
}

export function getCoordinatorGroupStatusCounts(
  groups: ReportMonitoringCoordinatorGroup[],
): StatusCounts {
  return groups.reduce<StatusCounts>(
    (counts, group) => {
      counts[classifySubgroupFromCounts(getSubjectSubgroupStatusCounts(group.subjects))] += 1;
      return counts;
    },
    { done: 0, ongoing: 0, notStarted: 0 },
  );
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useClickTooltip() {
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    if (!opened) return;
    function handleOutside() {
      setOpened(false);
      activePopover.close = null;
    }
    const id = setTimeout(() => {
      document.addEventListener("pointerdown", handleOutside, { once: true });
    }, 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener("pointerdown", handleOutside);
    };
  }, [opened]);

  function toggle(e: React.MouseEvent | React.TouchEvent) {
    e.stopPropagation();
    if (opened) {
      setOpened(false);
      activePopover.close = null;
    } else {
      activePopover.close?.();
      setOpened(true);
      activePopover.close = () => setOpened(false);
    }
  }

  return { opened, toggle };
}

// ─── Components ───────────────────────────────────────────────────────────────

export function EllipsisTooltip({
  label,
  children,
  ...props
}: { label: string; children: React.ReactElement } & Omit<
  React.ComponentProps<typeof Tooltip>,
  "label" | "children" | "disabled"
>) {
  const ref = useRef<HTMLElement>(null);
  const [truncated, setTruncated] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setTruncated(el.scrollWidth > el.clientWidth);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [label]);
  return (
    <Tooltip
      label={label}
      disabled={!truncated}
      events={{ hover: true, focus: true, touch: true }}
      {...props}
    >
      {React.cloneElement(
        children as React.ReactElement<{ ref?: React.Ref<HTMLElement> }>,
        { ref },
      )}
    </Tooltip>
  );
}

export function StatusCircle({ counts, label }: { counts: StatusCounts; label: string }) {
  const [opened, setOpened] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const total = statusCountsTotal(counts);
  const doneDeg = total === 0 ? 0 : (counts.done / total) * 360;
  const ongoingDeg = total === 0 ? 0 : (counts.ongoing / total) * 360;
  const doneEnd = doneDeg;
  const ongoingEnd = doneDeg + ongoingDeg;
  const ringBackground =
    total === 0
      ? "#e5e7eb"
      : `conic-gradient(${STATUS_COLORS.done} 0deg ${doneEnd}deg, ${STATUS_COLORS.ongoing} ${doneEnd}deg ${ongoingEnd}deg, ${STATUS_COLORS.notStarted} ${ongoingEnd}deg 360deg)`;

  const isTouchDevice =
    typeof window !== "undefined" && window.matchMedia("(hover: none)").matches;

  useEffect(() => {
    if (!opened || !isTouchDevice) return;
    const id = setTimeout(() => {
      function handleOutside() {
        setOpened(false);
        activePopover.close = null;
      }
      document.addEventListener("pointerdown", handleOutside, { once: true });
    }, 0);
    return () => clearTimeout(id);
  }, [opened, isTouchDevice]);

  function handleMouseEnter() {
    if (isTouchDevice) return;
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpened(true);
  }
  function handleMouseLeave() {
    if (isTouchDevice) return;
    closeTimer.current = setTimeout(() => setOpened(false), 80);
  }
  function handleClick(event: React.MouseEvent) {
    if (!isTouchDevice) return;
    event.stopPropagation();
    if (opened) {
      setOpened(false);
      activePopover.close = null;
    } else {
      activePopover.close?.();
      setOpened(true);
      activePopover.close = () => setOpened(false);
    }
  }

  const statusItems = [
    { label: "Done", count: counts.done, color: STATUS_COLORS.done },
    { label: "Ongoing", count: counts.ongoing, color: STATUS_COLORS.ongoing },
    { label: "Not Started", count: counts.notStarted, color: STATUS_COLORS.notStarted },
  ];

  return (
    <Popover
      opened={opened}
      onClose={() => { setOpened(false); activePopover.close = null; }}
      width={220}
      shadow="sm"
      withinPortal
      position="right"
      closeOnClickOutside={isTouchDevice}
    >
      <Popover.Target>
        <Box
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onClick={handleClick}
          style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            display: "grid",
            placeItems: "center",
            flex: "0 0 auto",
            background: ringBackground,
            cursor: isTouchDevice ? "pointer" : "default",
          }}
        >
          <Box
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              backgroundColor: "#ffffff",
            }}
          >
            <Text size="11px" fw={700} c="#4b5563">
              {counts.done}/{total}
            </Text>
          </Box>
        </Box>
      </Popover.Target>

      <Popover.Dropdown
        style={{ border: "1px solid #d3e9d0", borderRadius: 10, padding: "12px 14px" }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={(event) => event.stopPropagation()}
      >
        <Text size="10px" fw={700} tt="uppercase" c="#4EAE4A" style={{ letterSpacing: "0.06em" }}>
          {label}
        </Text>
        <Divider my={8} color="#e8f0e8" />
        <Box style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {statusItems.map((item) => (
            <Group key={item.label} gap={8} wrap="nowrap" align="center">
              <Box style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: item.color, flexShrink: 0 }} />
              <Text size="sm" c="dimmed" style={{ lineHeight: 1.4, flex: 1 }}>{item.label}</Text>
              <Text size="sm" fw={700} c="#4b5563">{item.count}</Text>
            </Group>
          ))}
        </Box>
      </Popover.Dropdown>
    </Popover>
  );
}

export function RoleIconButton({
  personName,
  roleLabel,
  roleIcon,
}: {
  personName?: string | null;
  roleLabel?: string;
  roleIcon?: ReactNode;
}) {
  const { opened, toggle } = useClickTooltip();
  const isMobile = useMediaQuery("(max-width: 600px)");

  if (roleIcon === undefined) return null;

  if (isMobile) {
    return (
      <Tooltip label={personName ?? "Unassigned"} withArrow position="top" opened={opened}>
        <ActionIcon variant="subtle" color="gray" size="sm" onClick={toggle}>
          {roleIcon}
        </ActionIcon>
      </Tooltip>
    );
  }

  return (
    <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
      <Tooltip label={roleLabel ?? ""} withArrow position="top">
        <span style={{ display: "flex", alignItems: "center", color: "#6b7280" }}>
          {roleIcon}
        </span>
      </Tooltip>
      <Text size="sm" c={personName ? undefined : "dimmed"} style={{ whiteSpace: "nowrap" }}>
        {personName ?? "Unassigned"}
      </Text>
    </Group>
  );
}
