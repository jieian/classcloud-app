import { adminClient as admin } from "@/lib/supabase/admin";
import type { AuditLogRow } from "@/lib/services/auditLogsService";

const LIMIT = 10;

type RawUserJoin =
  | { first_name: string; last_name: string }
  | { first_name: string; last_name: string }[]
  | null;

type RawRow = {
  audit_id: string;
  actor_id: string | null;
  category: string;
  action: string;
  entity_type: string;
  entity_id: string;
  entity_label: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  users: RawUserJoin;
};

function toActorName(users: RawUserJoin): string | null {
  const u = Array.isArray(users) ? users[0] : users;
  if (!u) return null;
  return `${u.first_name} ${u.last_name}`.trim() || null;
}

export async function fetchInitialAuditLogs(
  userId: string,
  hasViewAll: boolean,
): Promise<{ logs: AuditLogRow[]; total: number }> {
  let query = admin
    .from("audit_logs")
    .select(
      `audit_id, actor_id, category, action,
       entity_type, entity_id, entity_label,
       old_values, new_values, metadata, created_at,
       users!actor_id(first_name, last_name)`,
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(0, LIMIT - 1);

  if (!hasViewAll) {
    query = query.eq("actor_id", userId);
  }

  const { data, count, error } = await query;

  if (error) {
    console.error("[auditLogsServerService] query error:", error.message);
    return { logs: [], total: 0 };
  }

  const logs: AuditLogRow[] = (data ?? []).map((row: RawRow) => ({
    audit_id: row.audit_id,
    actor_id: row.actor_id,
    actor_name: toActorName(row.users),
    category: row.category,
    action: row.action,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    entity_label: row.entity_label,
    old_values: row.old_values,
    new_values: row.new_values,
    metadata: row.metadata,
    created_at: row.created_at,
  }));

  return { logs, total: count ?? 0 };
}
