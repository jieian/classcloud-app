"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Divider,
  Group,
  Pagination,
  Select,
  Stack,
  Text,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import "@mantine/dates/styles.css";
import { IconCalendar } from "@tabler/icons-react";
import { IconMoodPuzzled } from "@tabler/icons-react";
import type { AuditLogRow, AuditLogsParams } from "@/lib/services/auditLogsService";
import { fetchAuditLogs } from "@/lib/services/auditLogsService";
import EmptySearchState from "@/components/EmptySearchState";
import AuditLogsTable from "./AuditLogsTable";
import AuditLogsTableSkeleton from "./AuditLogsTableSkeleton";
import AuditLogDetailDrawer from "./AuditLogDetailDrawer";

const LIMIT = 10;
type DatePreset = "" | "today" | "week" | "month" | "custom";

function toISO(d: Date | string | null | undefined): string {
  if (!d) return new Date().toISOString().split("T")[0];
  if (typeof d === "string") return d.split("T")[0];
  return d.toISOString().split("T")[0];
}

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

function resolveDateParams(
  preset: DatePreset,
  dateFrom: string | null,
  dateTo: string | null,
): Pick<AuditLogsParams, "date_from" | "date_to"> {
  switch (preset) {
    case "today":
      return { date_from: todayISO(), date_to: todayISO() };
    case "week": {
      const start = new Date();
      start.setDate(start.getDate() - 6);
      return { date_from: toISO(start), date_to: todayISO() };
    }
    case "month": {
      const now = new Date();
      return { date_from: toISO(new Date(now.getFullYear(), now.getMonth(), 1)), date_to: todayISO() };
    }
    case "custom":
      return {
        ...(dateFrom ? { date_from: toISO(dateFrom) } : {}),
        ...(dateTo ? { date_to: toISO(dateTo) } : {}),
      };
    default:
      return {};
  }
}

type Props = {
  initialLogs: AuditLogRow[];
  initialTotal: number;
  hasViewAll: boolean;
};

export default function AuditLogsClient({ initialLogs, initialTotal, hasViewAll }: Props) {
  const [logs, setLogs] = useState<AuditLogRow[]>(initialLogs);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const [category, setCategory] = useState<string>("");
  const [datePreset, setDatePreset] = useState<DatePreset>("");
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);
  const [selectedLog, setSelectedLog] = useState<AuditLogRow | null>(null);

  const totalPages = Math.ceil(total / LIMIT);
  const firstItem = total === 0 ? 0 : (page - 1) * LIMIT + 1;
  const lastItem = Math.min(page * LIMIT, total);

  const fetchIdRef = useRef(0);
  const isFirstRender = useRef(true);

  const load = useCallback(async (params: AuditLogsParams) => {
    const id = ++fetchIdRef.current;
    setLoading(true);
    try {
      const res = await fetchAuditLogs(params);
      if (id !== fetchIdRef.current) return;
      setLogs(res.logs);
      setTotal(res.total);
    } catch (err) {
      console.error("[AuditLogsClient]", err);
    } finally {
      if (id === fetchIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const dateParams = resolveDateParams(datePreset, dateFrom, dateTo);
    load({
      page,
      ...(category ? { category } : {}),
      ...dateParams,
    });
  }, [page, category, datePreset, dateFrom, dateTo, load]);

  function handleCategoryChange(val: string) {
    setCategory(val);
    setPage(1);
  }

  function handlePresetChange(val: string | null) {
    const v = (val ?? "") as DatePreset;
    setDatePreset(v);
    if (v !== "custom") {
      setDateFrom(null);
      setDateTo(null);
    }
    setPage(1);
  }

  return (
    <>
      <h1 className="text-2xl md:text-3xl font-bold mb-2 text-[#597D37]">{hasViewAll ? "Audit Logs" : "My Activity"}</h1>
      <p className="mb-3 text-sm text-[#808898]">
        {hasViewAll
          ? "System-wide history of all events, activities, and changes."
          : "History of your own actions and sign-in activity."}
      </p>
      {/* Filter bar */}
      <Stack gap="sm" mb="md">
        <Group gap="sm" align="flex-end" wrap="wrap">
          <Select
            label="Category"
            size="sm"
            w={160}
            value={category || ""}
            onChange={(val) => handleCategoryChange(val ?? "")}
            data={[
              { value: "", label: "All" },
              { value: "ACCESS", label: "Access" },
              { value: "SECURITY", label: "Security" },
              { value: "ACADEMIC", label: "Academic" },
              ...(hasViewAll ? [
                { value: "ADMIN", label: "Admin" },
                { value: "SYSTEM", label: "System" },
              ] : []),
            ]}
          />
          <Select
            label="Date range"
            size="sm"
            w={160}
            placeholder="All time"
            clearable
            value={datePreset || null}
            onChange={handlePresetChange}
            data={[
              { value: "today", label: "Today" },
              { value: "week", label: "This Week" },
              { value: "month", label: "This Month" },
              { value: "custom", label: "Custom" },
            ]}
          />
          {datePreset === "custom" && (
            <>
              <DatePickerInput
                size="sm"
                label="From"
                placeholder="Start date"
                leftSection={<IconCalendar size={16} />}
                valueFormat="MMM D, YYYY"
                w={160}
                value={dateFrom}
                onChange={(val) => { setDateFrom(val as string | null); setPage(1); }}
                maxDate={dateTo ? new Date(dateTo) : new Date()}
                clearable
              />
              <DatePickerInput
                size="sm"
                label="To"
                placeholder="End date"
                leftSection={<IconCalendar size={16} />}
                valueFormat="MMM D, YYYY"
                w={160}
                value={dateTo}
                onChange={(val) => { setDateTo(val as string | null); setPage(1); }}
                minDate={dateFrom ? new Date(dateFrom) : undefined}
                maxDate={new Date()}
                clearable
              />
            </>
          )}
        </Group>
      </Stack>

      {/* Table / skeleton */}
      {loading ? (
        <AuditLogsTableSkeleton hasViewAll={hasViewAll} />
      ) : (
        <>
          {logs.length === 0 ? (
            <EmptySearchState
              icon={IconMoodPuzzled}
              title="No entries found."
              description="Try adjusting your filters or date range."
            />
          ) : (
            <AuditLogsTable logs={logs} hasViewAll={hasViewAll} onDetail={setSelectedLog} />
          )}
        </>
      )}

      {/* Pagination + count */}
      {!loading && total > 0 && (
        <Stack align="center" mt="md" gap="xs">
          {totalPages > 1 && (
            <Pagination
              value={page}
              onChange={setPage}
              total={totalPages}
              color="#4EAE4A"
              size="sm"
            />
          )}
          <Text c="dimmed" fz="sm">
            Showing {firstItem}–{lastItem} of {total} {total === 1 ? "entry" : "entries"}
          </Text>
        </Stack>
      )}

      <AuditLogDetailDrawer
        log={selectedLog}
        hasViewAll={hasViewAll}
        onClose={() => setSelectedLog(null)}
      />
    </>
  );
}
