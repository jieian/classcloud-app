"use client";

import { useState } from "react";
import {
  Badge,
  Box,
  Collapse,
  Divider,
  Drawer,
  Group,
  ScrollArea,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { IconChevronDown } from "@tabler/icons-react";
import type { AuditLogRow } from "@/lib/services/auditLogsService";
import { CATEGORY_COLORS } from "./categoryColors";
import PRESENTERS, { type FieldDef } from "./actionPresenters";

const MASTERLIST_CAP = 50;

function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

type MasterlistChange = {
  section_id?: number;
  adviser_id?: string | null;
  teacher_id?: string | null;
  curriculum_subject_id?: number;
};

// ── Raw KV block (fallback for RPC-backed actions with unstable shapes) ────────

function KVBlock({
  data,
  changedKeys,
  highlight,
}: {
  data: Record<string, unknown>;
  changedKeys?: Set<string>;
  highlight?: boolean;
}) {
  return (
    <Stack gap={6}>
      {Object.entries(data).map(([k, v]) => {
        const isChanged = highlight && changedKeys?.has(k);
        return (
          <Box
            key={k}
            px={8}
            py={4}
            style={{
              borderRadius: 4,
              background: isChanged ? "#fffbcc" : undefined,
            }}
          >
            <Text fz="xs" c="dimmed" fw={600} tt="uppercase" style={{ letterSpacing: "0.04em" }}>
              {k}
            </Text>
            <Text fz="sm" style={{ wordBreak: "break-all" }}>
              {v === null || v === undefined
                ? <em style={{ color: "#aaa" }}>null</em>
                : typeof v === "object"
                ? JSON.stringify(v)
                : String(v)}
            </Text>
          </Box>
        );
      })}
    </Stack>
  );
}

// ── Humanized single-section block ─────────────────────────────────────────────

function resolveFieldValue(
  field: FieldDef,
  log: AuditLogRow,
): unknown {
  if (field.getValue) return field.getValue(log);
  const source = field.source ?? "new";
  const obj =
    source === "new"
      ? log.new_values
      : source === "old"
      ? log.old_values
      : (log.metadata as Record<string, unknown> | null);
  return (obj as Record<string, unknown> | null)?.[field.key] ?? null;
}

function HumanizedKVBlock({
  fields,
  log,
}: {
  fields: FieldDef[];
  log: AuditLogRow;
}) {
  const rows = fields
    .map((field) => {
      const raw = resolveFieldValue(field, log);
      if (field.omitIfNull && (raw === null || raw === undefined)) return null;
      const display = raw === null || raw === undefined
        ? "(none)"
        : field.format
        ? field.format(raw)
        : String(raw);
      return { label: field.label, display };
    })
    .filter(Boolean) as { label: string; display: string }[];

  if (rows.length === 0) return null;

  return (
    <Stack gap={6}>
      {rows.map(({ label, display }) => (
        <Box key={label} px={8} py={4}>
          <Text fz="xs" c="dimmed" fw={600} tt="uppercase" style={{ letterSpacing: "0.04em" }}>
            {label}
          </Text>
          <Text fz="sm" style={{ wordBreak: "break-all" }}>
            {display}
          </Text>
        </Box>
      ))}
    </Stack>
  );
}

// ── Humanized diff block (before / after) ──────────────────────────────────────

function HumanizedDiffBlock({
  fields,
  data,
  log,
  changedKeys,
}: {
  fields: FieldDef[];
  data: Record<string, unknown> | null;
  log: AuditLogRow;
  changedKeys?: Set<string>;
}) {
  const rows = fields
    .map((field) => {
      const raw = data?.[field.key] ?? null;
      if (field.omitIfNull && raw === null) return null;
      const display = raw === null
        ? "(none)"
        : field.format
        ? field.format(raw)
        : String(raw);
      const isChanged = !!changedKeys?.has(field.key);
      return { label: field.label, display, isChanged };
    })
    .filter(Boolean) as { label: string; display: string; isChanged: boolean }[];

  if (rows.length === 0) return null;

  return (
    <Stack gap={6}>
      {rows.map(({ label, display, isChanged }) => (
        <Box
          key={label}
          px={8}
          py={4}
          style={{
            borderRadius: 4,
            background: isChanged ? "#fffbcc" : undefined,
          }}
        >
          <Text fz="xs" c="dimmed" fw={600} tt="uppercase" style={{ letterSpacing: "0.04em" }}>
            {label}
          </Text>
          <Text fz="sm" style={{ wordBreak: "break-all" }}>
            {display}
          </Text>
        </Box>
      ))}
    </Stack>
  );
}

// ── Masterlist renderer (unchanged) ───────────────────────────────────────────

function MasterlistSection({ new_values }: { new_values: Record<string, unknown> }) {
  const [adviserOpen, setAdviserOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);

  const adviserChanges = Array.isArray(new_values.adviser_changes)
    ? (new_values.adviser_changes as MasterlistChange[])
    : [];
  const assignmentChanges = Array.isArray(new_values.assignment_changes)
    ? (new_values.assignment_changes as MasterlistChange[])
    : [];

  const adviserCapped = adviserChanges.slice(0, MASTERLIST_CAP);
  const assignCapped = assignmentChanges.slice(0, MASTERLIST_CAP);
  const adviserOverflow = adviserChanges.length - MASTERLIST_CAP;
  const assignOverflow = assignmentChanges.length - MASTERLIST_CAP;

  return (
    <Stack gap="sm">
      <Text fz="sm" c="dimmed">
        {adviserChanges.length} adviser change{adviserChanges.length !== 1 ? "s" : ""},
        {" "}{assignmentChanges.length} assignment change{assignmentChanges.length !== 1 ? "s" : ""}
      </Text>

      {adviserChanges.length > 0 && (
        <Box>
          <UnstyledButton
            onClick={() => setAdviserOpen((o) => !o)}
            style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}
          >
            <Text fz="sm" fw={500}>Adviser Changes</Text>
            <IconChevronDown
              size={14}
              style={{ transform: adviserOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 200ms" }}
            />
          </UnstyledButton>
          <Collapse in={adviserOpen}>
            <Stack gap={4} mt={6}>
              {adviserCapped.map((c, i) => (
                <Text key={i} fz="xs" c="dimmed">
                  Section {c.section_id}: adviser → {c.adviser_id ?? "removed"}
                </Text>
              ))}
              {adviserOverflow > 0 && (
                <Text fz="xs" c="dimmed" fs="italic">…and {adviserOverflow} more</Text>
              )}
            </Stack>
          </Collapse>
        </Box>
      )}

      {assignmentChanges.length > 0 && (
        <Box>
          <UnstyledButton
            onClick={() => setAssignOpen((o) => !o)}
            style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}
          >
            <Text fz="sm" fw={500}>Assignment Changes</Text>
            <IconChevronDown
              size={14}
              style={{ transform: assignOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 200ms" }}
            />
          </UnstyledButton>
          <Collapse in={assignOpen}>
            <Stack gap={4} mt={6}>
              {assignCapped.map((c, i) => (
                <Text key={i} fz="xs" c="dimmed">
                  Section {c.section_id} / Subject {c.curriculum_subject_id}: teacher → {c.teacher_id ?? "removed"}
                </Text>
              ))}
              {assignOverflow > 0 && (
                <Text fz="xs" c="dimmed" fs="italic">…and {assignOverflow} more</Text>
              )}
            </Stack>
          </Collapse>
        </Box>
      )}
    </Stack>
  );
}

// ── Main drawer ───────────────────────────────────────────────────────────────

type Props = {
  log: AuditLogRow | null;
  hasViewAll: boolean;
  onClose: () => void;
};

export default function AuditLogDetailDrawer({ log, hasViewAll, onClose }: Props) {
  if (!log) return null;

  const presenter = PRESENTERS[log.action];
  const isMasterlist = log.action === "Teaching Load Masterlist Saved";

  const changedKeys: Set<string> = (() => {
    if (!log.old_values || !log.new_values) return new Set();
    return new Set(
      Object.keys(log.new_values).filter(
        (k) => JSON.stringify(log.new_values![k]) !== JSON.stringify(log.old_values![k]),
      ),
    );
  })();

  const hasDiff = !!(log.old_values && log.new_values);
  const hasNewOnly = !!(log.new_values && !log.old_values);
  const hasOldOnly = !!(log.old_values && !log.new_values);

  return (
    <Drawer
      opened={!!log}
      onClose={onClose}
      position="bottom"
      size="lg"
      title={
        <Group gap="xs" align="center">
          <Badge color={CATEGORY_COLORS[log.category] ?? "gray"} variant="filled" size="md">
            {log.category}
          </Badge>
          <Text fw={600} fz="sm">{log.action}</Text>
        </Group>
      }
      overlayProps={{ backgroundOpacity: 0.5, blur: 4 }}
    >
      <ScrollArea.Autosize mah="60vh">
        <Stack gap="md" pb="md">
          <Text fz="xs" c="dimmed">{formatTimestamp(log.created_at)}</Text>

          {/* Summary sentence */}
          {presenter && (
            <Text fz="sm" c="dimmed" fs="italic">
              {presenter.getSummary(log)}
            </Text>
          )}

          <Divider />

          {/* Actor */}
          {hasViewAll && (
            <Box>
              <Text fz="xs" c="dimmed" fw={600} tt="uppercase" mb={2} style={{ letterSpacing: "0.04em" }}>
                Actor
              </Text>
              <Text fz="sm">
                {log.actor_name ?? <em style={{ color: "#808898" }}>System</em>}
              </Text>
            </Box>
          )}

          {/* Entity */}
          <Box>
            <Text fz="xs" c="dimmed" fw={600} tt="uppercase" mb={2} style={{ letterSpacing: "0.04em" }}>
              Entity
            </Text>
            <Text fz="sm" fw={500}>{log.entity_label ?? log.entity_id}</Text>
            <Text fz="xs" c="dimmed">{log.entity_type} · {log.entity_id}</Text>
          </Box>

          <Divider />

          {/* Masterlist */}
          {isMasterlist && log.new_values && (
            <Box>
              <Text fz="xs" c="dimmed" fw={600} tt="uppercase" mb={6} style={{ letterSpacing: "0.04em" }}>
                Changes
              </Text>
              <MasterlistSection new_values={log.new_values} />
            </Box>
          )}

          {/* Humanized: fields (single section) */}
          {!isMasterlist && presenter?.fields && (
            <Box>
              <Text fz="xs" c="dimmed" fw={600} tt="uppercase" mb={6} style={{ letterSpacing: "0.04em" }}>
                Details
              </Text>
              <HumanizedKVBlock fields={presenter.fields} log={log} />
            </Box>
          )}

          {/* Humanized: diffFields (before / after) */}
          {!isMasterlist && presenter?.diffFields && hasDiff && (
            <Group align="flex-start" grow gap="md">
              <Box>
                <Text fz="xs" c="dimmed" fw={600} tt="uppercase" mb={6} style={{ letterSpacing: "0.04em" }}>
                  Before
                </Text>
                <HumanizedDiffBlock
                  fields={presenter.diffFields}
                  data={log.old_values}
                  log={log}
                />
              </Box>
              <Box>
                <Text fz="xs" c="dimmed" fw={600} tt="uppercase" mb={6} style={{ letterSpacing: "0.04em" }}>
                  After
                </Text>
                <HumanizedDiffBlock
                  fields={presenter.diffFields}
                  data={log.new_values}
                  log={log}
                  changedKeys={changedKeys}
                />
              </Box>
            </Group>
          )}

          {/* Raw KVBlock fallback — no field mapping defined (unknown actions or RPC-backed shapes) */}
          {!isMasterlist && !presenter?.fields && !presenter?.diffFields && (
            <>
              {hasDiff && (
                <Group align="flex-start" grow gap="md">
                  <Box>
                    <Text fz="xs" c="dimmed" fw={600} tt="uppercase" mb={6} style={{ letterSpacing: "0.04em" }}>
                      Before
                    </Text>
                    <KVBlock data={log.old_values!} changedKeys={changedKeys} highlight={false} />
                  </Box>
                  <Box>
                    <Text fz="xs" c="dimmed" fw={600} tt="uppercase" mb={6} style={{ letterSpacing: "0.04em" }}>
                      After
                    </Text>
                    <KVBlock data={log.new_values!} changedKeys={changedKeys} highlight />
                  </Box>
                </Group>
              )}
              {hasNewOnly && (
                <Box>
                  <Text fz="xs" c="dimmed" fw={600} tt="uppercase" mb={6} style={{ letterSpacing: "0.04em" }}>
                    Details
                  </Text>
                  <KVBlock data={log.new_values!} />
                </Box>
              )}
              {hasOldOnly && (
                <Box>
                  <Text fz="xs" c="dimmed" fw={600} tt="uppercase" mb={6} style={{ letterSpacing: "0.04em" }}>
                    Removed
                  </Text>
                  <KVBlock data={log.old_values!} />
                </Box>
              )}
            </>
          )}
        </Stack>
      </ScrollArea.Autosize>
    </Drawer>
  );
}
