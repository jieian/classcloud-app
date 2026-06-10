"use client";

import { useState } from "react";
import { useClickOutside, useDisclosure } from "@mantine/hooks";
import {
  ActionIcon,
  Badge,
  Box,
  Collapse,
  Divider,
  Group,
  Table,
  TableScrollContainer,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
  Text,
  VisuallyHidden,
} from "@mantine/core";
import { IconChevronRight, IconEye } from "@tabler/icons-react";
import type { AuditLogRow } from "@/lib/services/auditLogsService";
import { CATEGORY_COLORS } from "./categoryColors";

function formatTimestamp(ts: string): string {
  const date = new Date(ts);
  const diffMs = Date.now() - date.getTime();
  const diffH = diffMs / 3_600_000;
  if (diffH < 24) {
    const diffM = Math.floor(diffMs / 60_000);
    if (diffM < 1) return "Just now";
    if (diffM < 60) return `${diffM}m ago`;
    return `${Math.floor(diffH)}h ago`;
  }
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function MobileRow({
  log,
  hasViewAll,
  onDetail,
}: {
  log: AuditLogRow;
  hasViewAll: boolean;
  onDetail: (log: AuditLogRow) => void;
}) {
  const [opened, { toggle }] = useDisclosure(false);

  return (
    <>
      <div onClick={toggle} style={{ cursor: "pointer", padding: "12px 4px" }}>
        <Group justify="space-between" wrap="nowrap" align="center">
          <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
            <IconChevronRight
              size={16}
              style={{
                transform: opened ? "rotate(90deg)" : "rotate(0deg)",
                transition: "transform 200ms ease",
                flexShrink: 0,
                color: "#808898",
              }}
            />
            <Box style={{ minWidth: 0 }}>
              <Text
                fz="sm"
                fw={500}
                style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              >
                {log.action}
              </Text>
              <Text fz="xs" c="dimmed">{formatTimestamp(log.created_at)}</Text>
            </Box>
          </Group>
          <div onClick={(e) => e.stopPropagation()}>
            <ActionIcon
              variant="subtle"
              size="sm"
              color="gray"
              onClick={() => onDetail(log)}
              aria-label="View details"
            >
              <IconEye size={16} />
            </ActionIcon>
          </div>
        </Group>
      </div>

      <Collapse in={opened}>
        <Box pb="md" pl={28} pr={4}>
          <Badge
            color={CATEGORY_COLORS[log.category] ?? "gray"}
            variant="filled"
            size="sm"
            mb="xs"
          >
            {log.category}
          </Badge>

          {hasViewAll && (
            <>
              <Text size="xs" c="dimmed" fw={600} tt="uppercase" mb={2} style={{ letterSpacing: "0.04em" }}>
                Actor
              </Text>
              <Text fz="sm" mb="xs">
                {log.actor_name ?? <em style={{ color: "#808898" }}>System</em>}
              </Text>
            </>
          )}

          <Text size="xs" c="dimmed" fw={600} tt="uppercase" mb={2} style={{ letterSpacing: "0.04em" }}>
            Entity
          </Text>
          <Text fz="sm" fw={500}>{log.entity_label ?? log.entity_id}</Text>
          <Text fz="xs" c="dimmed">{log.entity_type}</Text>
        </Box>
      </Collapse>
      <Divider />
    </>
  );
}

type Props = {
  logs: AuditLogRow[];
  hasViewAll: boolean;
  onDetail: (log: AuditLogRow) => void;
};

export default function AuditLogsTable({ logs, hasViewAll, onDetail }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const tableRef = useClickOutside(() => setSelectedId(null));

  function handleRowClick(log: AuditLogRow) {
    if (selectedId === log.audit_id) {
      onDetail(log);
    } else {
      setSelectedId(log.audit_id);
    }
  }

  if (logs.length === 0) return null;

  const rows = logs.map((log) => {
    const isSelected = selectedId === log.audit_id;

    return (
      <TableTr
        key={log.audit_id}
        onClick={(e) => { e.stopPropagation(); handleRowClick(log); }}
        style={{
          cursor: "pointer",
          backgroundColor: isSelected ? "#f0f7ee" : undefined,
          transition: "background-color 0.15s ease",
        }}
      >
        <TableTd>
          <Text fz="sm" style={{ whiteSpace: "nowrap" }}>{formatTimestamp(log.created_at)}</Text>
        </TableTd>
        {hasViewAll && (
          <TableTd>
            {log.actor_name ? (
              <Text fz="sm">{log.actor_name}</Text>
            ) : (
              <Text fz="sm" c="dimmed" fs="italic">System</Text>
            )}
          </TableTd>
        )}
        <TableTd>
          <Text fz="sm">{log.action}</Text>
        </TableTd>
        <TableTd>
          <Badge
            color={CATEGORY_COLORS[log.category] ?? "gray"}
            variant="filled"
            size="md"
          >
            {log.category}
          </Badge>
        </TableTd>
        <TableTd>
          <Text fz="sm" fw={500}>{log.entity_label ?? log.entity_id}</Text>
          <Text fz="xs" c="dimmed">{log.entity_type}</Text>
        </TableTd>
        <TableTd onClick={(e) => e.stopPropagation()}>
          <ActionIcon
            variant="subtle"
            size="sm"
            color="gray"
            onClick={() => onDetail(log)}
            aria-label="View details"
          >
            <IconEye size={16} />
          </ActionIcon>
        </TableTd>
      </TableTr>
    );
  });

  return (
    <>
      {/* Desktop table */}
      <div className="hidden sm:block">
        <TableScrollContainer minWidth={600} ref={tableRef}>
          <Table verticalSpacing="sm" highlightOnHover>
            <TableThead>
              <TableTr>
                <TableTh>Timestamp</TableTh>
                {hasViewAll && <TableTh>Actor</TableTh>}
                <TableTh>Action</TableTh>
                <TableTh>Category</TableTh>
                <TableTh>Entity</TableTh>
                <TableTh>
                  <VisuallyHidden>Details</VisuallyHidden>
                </TableTh>
              </TableTr>
            </TableThead>
            <TableTbody>{rows}</TableTbody>
          </Table>
        </TableScrollContainer>
      </div>

      {/* Mobile accordion list */}
      <div className="sm:hidden">
        <Divider />
        {logs.map((log) => (
          <MobileRow
            key={log.audit_id}
            log={log}
            hasViewAll={hasViewAll}
            onDetail={onDetail}
          />
        ))}
      </div>
    </>
  );
}
