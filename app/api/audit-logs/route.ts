import { getServerUser, getPermissionsFromUser } from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-error";
import { adminClient as admin } from "@/lib/supabase/admin";
import type { AuditLogRow } from "@/lib/services/auditLogsService";

const LIMIT = 10;
const VALID_CATEGORIES = new Set(["ACCESS", "SECURITY", "ACADEMIC", "ADMIN", "SYSTEM"]);

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

const _GET = async function (request: Request) {
  const user = await getServerUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const permissions = getPermissionsFromUser(user);
  const hasViewAll = permissions.includes("audit_logs.view_all");
  const hasViewOwn = permissions.includes("audit_logs.view_own");

  if (!hasViewAll && !hasViewOwn) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const category = searchParams.get("category") ?? null;
  const date_from = searchParams.get("date_from") ?? null;
  const date_to = searchParams.get("date_to") ?? null;

  const offset = (page - 1) * LIMIT;

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
    .range(offset, offset + LIMIT - 1);

  if (!hasViewAll) {
    query = query.eq("actor_id", user.id);
  }

  if (category && VALID_CATEGORIES.has(category)) {
    query = query.eq("category", category);
  }

  if (date_from) {
    query = query.gte("created_at", date_from);
  }

  if (date_to) {
    query = query.lte("created_at", `${date_to}T23:59:59`);
  }

  const { data, count, error } = await query;

  if (error) {
    console.error("[api/audit-logs] query error:", error.message);
    return Response.json({ error: "Internal server error" }, { status: 500 });
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

  return Response.json({ logs, total: count ?? 0, page, limit: LIMIT });
};

export const GET = withErrorHandler(_GET);
